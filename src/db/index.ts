import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from './schema';

// Open database connection
const database = SQLite.openDatabaseSync('driver.db');

// Create Drizzle instance
export const db = drizzle(database, { schema });
export const databaseReady = Promise.resolve(database);

// Export database instance for migrations if needed
export { database };
