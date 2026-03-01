import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";

export class NullifierStore {
  readonly database: Database;
  private stmtSpend: ReturnType<Database["prepare"]>;
  private stmtIsSpent: ReturnType<Database["prepare"]>;
  private stmtUnspend: ReturnType<Database["prepare"]>;
  private stmtPrune: ReturnType<Database["prepare"]>;

  constructor(dbPath: string = ":memory:") {
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.database = new Database(dbPath, { create: true });
    this.database.exec("PRAGMA journal_mode=WAL");
    this.database.exec("PRAGMA busy_timeout=5000");

    this.database.exec(`
      CREATE TABLE IF NOT EXISTS nullifiers (
        module_id  TEXT    NOT NULL,
        nullifier  TEXT    NOT NULL,
        epoch      INTEGER NOT NULL,
        recipient  TEXT    NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (module_id, nullifier)
      )
    `);

    this.stmtSpend = this.database.prepare(
      "INSERT OR IGNORE INTO nullifiers (module_id, nullifier, epoch, recipient) VALUES (?, ?, ?, ?)",
    );

    this.stmtIsSpent = this.database.prepare(
      "SELECT 1 FROM nullifiers WHERE module_id = ? AND nullifier = ?",
    );

    this.stmtUnspend = this.database.prepare(
      "DELETE FROM nullifiers WHERE module_id = ? AND nullifier = ?",
    );

    this.stmtPrune = this.database.prepare(
      "DELETE FROM nullifiers WHERE epoch < ?",
    );
  }

  /**
   * Attempt to record a nullifier spend. Returns true if the nullifier
   * was successfully recorded (i.e., it was not already spent).
   * Returns false if the nullifier was already present.
   *
   * @param nullifierGroup — shared group key (e.g. "eth-balance") used for
   *   cross-module dedup. Stored in the `module_id` DB column.
   */
  spend(nullifierGroup: string, nullifier: string, epoch: number, recipient: string): boolean {
    const result = this.stmtSpend.run(nullifierGroup, nullifier, epoch, recipient);
    return result.changes > 0;
  }

  /**
   * Check whether a nullifier has been spent for the given group.
   */
  isSpent(nullifierGroup: string, nullifier: string): boolean {
    const row = this.stmtIsSpent.get(nullifierGroup, nullifier);
    return row !== null;
  }

  /**
   * Remove a previously recorded nullifier. Used to roll back
   * when fund dispatch fails after the nullifier was recorded.
   */
  unspend(nullifierGroup: string, nullifier: string): boolean {
    const result = this.stmtUnspend.run(nullifierGroup, nullifier);
    return result.changes > 0;
  }

  /**
   * Delete nullifiers from epochs older than the given epoch.
   * Returns the number of deleted rows.
   */
  prune(beforeEpoch: number): number {
    const result = this.stmtPrune.run(beforeEpoch);
    return result.changes;
  }

  close(): void {
    this.database.close();
  }
}
