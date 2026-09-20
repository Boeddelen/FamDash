import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DB_PATH } from '../config';
import * as schema from './schema';

mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export { sqlite };
export * from './schema';

/** True once migrations have created the core tables. */
export function dbInitialised(): boolean {
	const row = sqlite
		.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='household'")
		.get();
	return Boolean(row);
}
