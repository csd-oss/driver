import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as SQLite from 'expo-sqlite';
import * as schema from './schema';

// The web sync bridge can truncate large replies and time out while busy
// waiting for its worker. Keep opening and every ORM query asynchronous.
export let database: SQLite.SQLiteDatabase;
export const databaseReady = SQLite.openDatabaseAsync('driver.db').then(connection => {
  database = connection;
  return connection;
});

export const db = drizzle(async (sql, params, method) => {
  const connection = await databaseReady;
  const statement = await connection.prepareAsync(sql);
  try {
    // Drizzle maps columns by position; raw arrays preserve duplicate column
    // names in joins, unlike converting object rows with Object.values().
    const result = await statement.executeForRawResultAsync(params);
    if (method === 'run') return { rows: [], changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    const rows = method === 'get' ? await result.getFirstAsync() : await result.getAllAsync();
    return { rows: rows ?? [] };
  } finally {
    await statement.finalizeAsync();
  }
}, { schema });
