import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";

export interface ClaimRecord {
  claimId: string;
  status: "pending" | "confirmed" | "failed";
  txHash?: string;
  network?: string;
  moduleId?: string;
  recipient?: string;
  createdAt: number;
}

export class ClaimStore {
  private db: Database;
  private stmtInsert: ReturnType<Database["prepare"]>;
  private stmtGet: ReturnType<Database["prepare"]>;
  private stmtUpdateStatus: ReturnType<Database["prepare"]>;

  constructor(db: Database);
  constructor(dbPath: string);
  constructor(dbOrPath: Database | string) {
    if (typeof dbOrPath === "string") {
      if (dbOrPath !== ":memory:") {
        mkdirSync(dirname(dbOrPath), { recursive: true });
      }
      this.db = new Database(dbOrPath, { create: true });
      this.db.exec("PRAGMA journal_mode=WAL");
      this.db.exec("PRAGMA busy_timeout=5000");
    } else {
      this.db = dbOrPath;
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS claims (
        claim_id   TEXT PRIMARY KEY,
        status     TEXT    NOT NULL,
        tx_hash    TEXT,
        network    TEXT,
        module_id  TEXT,
        recipient  TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);

    this.stmtInsert = this.db.prepare(
      "INSERT OR REPLACE INTO claims (claim_id, status, tx_hash, network, module_id, recipient, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );

    this.stmtGet = this.db.prepare("SELECT * FROM claims WHERE claim_id = ?");

    this.stmtUpdateStatus = this.db.prepare(
      "UPDATE claims SET status = ?, tx_hash = COALESCE(?, tx_hash) WHERE claim_id = ?",
    );
  }

  insert(record: ClaimRecord): void {
    this.stmtInsert.run(
      record.claimId,
      record.status,
      record.txHash ?? null,
      record.network ?? null,
      record.moduleId ?? null,
      record.recipient ?? null,
      record.createdAt,
    );
  }

  get(claimId: string): ClaimRecord | null {
    const row = this.stmtGet.get(claimId) as any;
    if (!row) return null;
    return {
      claimId: row.claim_id,
      status: row.status,
      txHash: row.tx_hash ?? undefined,
      network: row.network ?? undefined,
      moduleId: row.module_id ?? undefined,
      recipient: row.recipient ?? undefined,
      createdAt: row.created_at,
    };
  }

  updateStatus(claimId: string, status: ClaimRecord["status"], txHash?: string): void {
    this.stmtUpdateStatus.run(status, txHash ?? null, claimId);
  }

  close(): void {
    this.db.close();
  }
}
