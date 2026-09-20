import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { db } from './index';

let done = false;

/** Idempotently apply bundled migrations. Called once from hooks.server.ts on boot. */
export function runMigrations(): void {
	if (done) return;
	// In dev: repo-root/drizzle. In the adapter-node build: bundled alongside via files.
	const candidates = [
		join(process.cwd(), 'drizzle'),
		join(import.meta.dirname, '..', '..', '..', '..', 'drizzle')
	];
	const folder = candidates.find((c) => existsSync(join(c, 'meta', '_journal.json')));
	if (!folder) {
		console.warn('[migrate] no migrations folder found; skipping');
		done = true;
		return;
	}
	migrate(db, { migrationsFolder: folder });
	done = true;
}
