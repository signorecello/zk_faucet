import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";

export class NullifierStore {
  readonly database: Database;
  private stmtSpend: ReturnType<Database["prepare"]>;
  private stmtIsSpent: ReturnType<Database["prepare"]>;
  private stmtUnspend: ReturnType<Database["prepare"]>;

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
  }

  /**
   * Attempt to record a nullifier spend. Returns true if the nullifier
   * was successfully recorded (i.e., it was not already spent).
   * Returns false if the nullifier was already present.
   */
  spend(moduleId: string, nullifier: string, epoch: number, recipient: string): boolean {
    const result = this.stmtSpend.run(moduleId, nullifier, epoch, recipient);
    return result.changes > 0;
  }

  /**
   * Check whether a nullifier has been spent for the given module.
   */
  isSpent(moduleId: string, nullifier: string): boolean {
    const row = this.stmtIsSpent.get(moduleId, nullifier);
    return row !== null;
  }

  /**
   * Remove a previously recorded nullifier. Used to roll back
   * when fund dispatch fails after the nullifier was recorded.
   */
  unspend(moduleId: string, nullifier: string): boolean {
    const result = this.stmtUnspend.run(moduleId, nullifier);
    return result.changes > 0;
  }

  close(): void {
    this.database.close();
  }
}
