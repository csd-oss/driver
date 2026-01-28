import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

// Open database connection
const database = SQLite.openDatabaseSync('driver.db');

// Create Drizzle instance
export const db = drizzle(database, { schema });

// Export database instance for migrations if needed
export { database };
