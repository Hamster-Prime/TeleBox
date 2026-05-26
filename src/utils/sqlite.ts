import Database from "better-sqlite3";

const sharedDatabases = new Map<string, Database.Database>();

function openSharedDatabase(dbPath: string): Database.Database {
  let db = sharedDatabases.get(dbPath);
  if (!db) {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    sharedDatabases.set(dbPath, db);
  }
  return db;
}

function closeSharedDatabases(): void {
  for (const db of sharedDatabases.values()) {
    db.close();
  }
  sharedDatabases.clear();
}

export { closeSharedDatabases, openSharedDatabase };
