export interface SnapshotTransaction {
  runAsync(sql: string, value: string): Promise<unknown>;
}
export interface SnapshotDatabase {
  execAsync(sql: string): Promise<void>;
  getFirstAsync<T>(sql: string): Promise<T | null>;
  withExclusiveTransactionAsync(
    task: (transaction: SnapshotTransaction) => Promise<void>,
  ): Promise<void>;
}
export interface SnapshotStorage {
  read(): Promise<string | null>;
  write(data: string): Promise<void>;
}

/** Small adapter shared by the native SQLite bridge and SQL-backed contract tests. */
export function createSnapshotStorage(
  open: () => Promise<SnapshotDatabase>,
): SnapshotStorage {
  let opening: Promise<SnapshotDatabase> | null = null;
  function database() {
    if (!opening) {
      opening = (async () => {
        const db = await open();
        await db.execAsync(
          "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);",
        );
        return db;
      })().catch((error) => {
        opening = null;
        throw error;
      });
    }
    return opening;
  }
  return {
    async read() {
      const row = await (
        await database()
      ).getFirstAsync<{ data: string }>(
        "SELECT data FROM app_state WHERE id = 1",
      );
      if (!row) return null;
      if (typeof row.data !== "string")
        throw new Error("Stored data is not readable text.");
      return row.data;
    },
    async write(data: string) {
      const db = await database();
      await db.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          "INSERT INTO app_state (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
          data,
        );
      });
    },
  };
}
