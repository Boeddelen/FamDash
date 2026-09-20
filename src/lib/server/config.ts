import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

/**
 * Runtime configuration. Everything the dashboard needs to persist lives under a
 * single data directory so that "backup" == "copy that folder".
 */
export const DATA_DIR = resolve(process.env.DATA_DIR ?? join(process.cwd(), 'data'));
export const DB_PATH = process.env.DB_PATH ?? join(DATA_DIR, 'dashboard.db');
export const SECRET_KEY_PATH = join(DATA_DIR, 'secret.key');
export const LOG_DIR = join(DATA_DIR, 'logs');
export const BACKUP_DIR = join(DATA_DIR, 'backups');
export const UPLOAD_DIR = join(DATA_DIR, 'uploads');

for (const dir of [DATA_DIR, LOG_DIR, BACKUP_DIR, UPLOAD_DIR]) {
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Minutes an admin elevation survives without activity before dropping to standard mode. */
export const ADMIN_IDLE_TIMEOUT_MIN = Number(process.env.ADMIN_IDLE_TIMEOUT_MIN ?? 5);

export const PORT = Number(process.env.PORT ?? 4174);

/**
 * Load (or generate on first run) the 32-byte key used to encrypt calendar
 * credentials at rest. Stored 0600 in the data dir. Override with SECRET_KEY
 * (base64, 32 bytes) for containerised / env-driven deployments.
 */
export function loadSecretKey(): Buffer {
	if (process.env.SECRET_KEY) {
		const key = Buffer.from(process.env.SECRET_KEY, 'base64');
		if (key.length !== 32) throw new Error('SECRET_KEY must be 32 bytes, base64-encoded');
		return key;
	}
	if (existsSync(SECRET_KEY_PATH)) {
		return Buffer.from(readFileSync(SECRET_KEY_PATH, 'utf8').trim(), 'base64');
	}
	const key = randomBytes(32);
	mkdirSync(dirname(SECRET_KEY_PATH), { recursive: true });
	writeFileSync(SECRET_KEY_PATH, key.toString('base64'), { mode: 0o600 });
	chmodSync(SECRET_KEY_PATH, 0o600);
	return key;
}
