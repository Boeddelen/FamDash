/**
 * Apply pending Drizzle migrations to the SQLite database. Run automatically by the
 * server on boot (src/lib/server/db/migrate.ts) and available as `npm run db:migrate`.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dbPath = process.env.DB_PATH ?? join(process.cwd(), 'data', 'dashboard.db');
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
const db = drizzle(sqlite);

const migrationsFolder = join(import.meta.dirname, '..', 'drizzle');
if (!existsSync(migrationsFolder)) {
	console.error(`No migrations folder at ${migrationsFolder}. Run "npm run db:generate" first.`);
	process.exit(1);
}

migrate(db, { migrationsFolder });
sqlite.close();
console.log('Migrations applied.');
