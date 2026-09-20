import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { BACKUP_DIR } from './config';
import { sqlite } from './db';

const KEEP = 14;

/** Consistent online backup of the SQLite database into data/backups/. */
export async function backupDatabase(): Promise<string> {
	const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
	const target = join(BACKUP_DIR, `dashboard-${stamp}.db`);
	await sqlite.backup(target);

	const files = (await readdir(BACKUP_DIR))
		.filter((f) => f.startsWith('dashboard-') && f.endsWith('.db'))
		.sort();
	for (const stale of files.slice(0, Math.max(0, files.length - KEEP))) {
		await unlink(join(BACKUP_DIR, stale)).catch(() => {});
	}
	return target;
}
