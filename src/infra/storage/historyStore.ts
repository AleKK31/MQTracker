import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { HistoryEntry } from '../../core/models/historyEntry';

export class HistoryStore {
  private readonly db: Database.Database;

  constructor(globalStoragePath: string) {
    fs.mkdirSync(globalStoragePath, { recursive: true });
    this.db = new Database(path.join(globalStoragePath, 'history.db'));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id           TEXT NOT NULL,
        connectionId TEXT NOT NULL,
        queueName    TEXT NOT NULL,
        exchange     TEXT NOT NULL,
        routingKey   TEXT NOT NULL,
        body         TEXT NOT NULL,
        contentType  TEXT NOT NULL DEFAULT 'application/json',
        deliveryMode INTEGER NOT NULL DEFAULT 2,
        action       TEXT NOT NULL,
        actedAt      TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_history_queue
        ON history (connectionId, queueName, actedAt DESC);
    `);
    this.migrate();
  }

  private migrate(): void {
    const cols = (this.db.prepare(`PRAGMA table_info(history)`).all() as { name: string }[]).map(
      (c) => c.name,
    );
    if (!cols.includes('contentType')) {
      this.db.exec(`ALTER TABLE history ADD COLUMN contentType TEXT NOT NULL DEFAULT 'application/json'`);
    }
    if (!cols.includes('deliveryMode')) {
      this.db.exec(`ALTER TABLE history ADD COLUMN deliveryMode INTEGER NOT NULL DEFAULT 2`);
    }
  }

  record(entry: Omit<HistoryEntry, 'actedAt'>): void {
    this.db
      .prepare(
        `INSERT INTO history (id, connectionId, queueName, exchange, routingKey, body, contentType, deliveryMode, action, actedAt)
         VALUES (@id, @connectionId, @queueName, @exchange, @routingKey, @body, @contentType, @deliveryMode, @action, @actedAt)`,
      )
      .run({ ...entry, actedAt: new Date().toISOString() });
  }

  getByQueue(connectionId: string, queueName: string, limit = 200): HistoryEntry[] {
    return this.db
      .prepare(
        `SELECT * FROM history
         WHERE connectionId = ? AND queueName = ?
         ORDER BY actedAt DESC LIMIT ?`,
      )
      .all(connectionId, queueName, limit) as HistoryEntry[];
  }

  close(): void {
    this.db.close();
  }
}
