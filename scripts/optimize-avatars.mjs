/**
 * One-off maintenance: re-encode existing member avatars down to a sensible size.
 *
 * Photos uploaded before the client-side downscaling existed are stored at full camera
 * resolution (megabytes each) even though an avatar is never drawn bigger than ~80px.
 * This re-encodes them in place — square centre crop, max 320px, WebP — and keeps the
 * originals under data/backups/avatars-original/.
 *
 * There's no image library on the server on purpose, so the decoding is done by the
 * Chromium that already ships with Playwright (a devDependency).
 *
 *   node scripts/optimize-avatars.mjs            # against ./data
 *   DATA_DIR=/path/to/data node scripts/optimize-avatars.mjs
 */
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import { readdir, readFile, writeFile, mkdir, copyFile, unlink, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const DATA_DIR = resolve(process.env.DATA_DIR ?? join(process.cwd(), 'data'));
const DB_PATH = process.env.DB_PATH ?? join(DATA_DIR, 'dashboard.db');
const AVATARS = join(DATA_DIR, 'uploads', 'avatars');
const BACKUP = join(DATA_DIR, 'backups', 'avatars-original');
const MAX_EDGE = 320;
const QUALITY = 0.85;

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

if (!existsSync(AVATARS)) {
	console.log(`No avatars directory at ${AVATARS} — nothing to do.`);
	process.exit(0);
}

const files = (await readdir(AVATARS)).filter((f) => !f.startsWith('.'));
if (files.length === 0) {
	console.log('No avatars stored — nothing to do.');
	process.exit(0);
}

await mkdir(BACKUP, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const db = new Database(DB_PATH);

let savedTotal = 0;
try {
	for (const name of files) {
		const path = join(AVATARS, name);
		const before = (await stat(path)).size;
		const bytes = await readFile(path);

		const out = await page.evaluate(
			async ({ b64, type, maxEdge, quality }) => {
				const res = await fetch(`data:${type};base64,${b64}`);
				const blob = await res.blob();
				const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
				const edge = Math.min(bmp.width, bmp.height);
				const size = Math.min(edge, maxEdge);
				const canvas = document.createElement('canvas');
				canvas.width = size;
				canvas.height = size;
				const ctx = canvas.getContext('2d');
				ctx.imageSmoothingQuality = 'high';
				ctx.drawImage(bmp, (bmp.width - edge) / 2, (bmp.height - edge) / 2, edge, edge, 0, 0, size, size);
				bmp.close();
				const encoded = await new Promise((r) => canvas.toBlob(r, 'image/webp', quality));
				const buf = new Uint8Array(await encoded.arrayBuffer());
				let s = '';
				for (const byte of buf) s += String.fromCharCode(byte);
				return { b64: btoa(s), width: size };
			},
			{
				b64: bytes.toString('base64'),
				type: extname(name) === '.png' ? 'image/png' : 'image/jpeg',
				maxEdge: MAX_EDGE,
				quality: QUALITY
			}
		);

		const optimised = Buffer.from(out.b64, 'base64');
		if (optimised.length >= before) {
			console.log(`· ${name}: already small (${kb(before)}), left alone`);
			continue;
		}

		await copyFile(path, join(BACKUP, name));

		// Store as .webp and repoint the member row, then drop the old file.
		const base = name.replace(/\.[^.]+$/, '');
		const newName = `${base}.webp`;
		const rel = join('uploads', 'avatars', newName);
		await writeFile(join(DATA_DIR, rel), optimised);

		const updated = db
			.prepare('UPDATE members SET avatar_path = ? WHERE avatar_path = ?')
			.run(rel, join('uploads', 'avatars', name));
		if (updated.changes === 0) {
			console.log(`· ${name}: no member row points at it; wrote ${newName} but left the row alone`);
		}
		if (newName !== name) await unlink(path);

		savedTotal += before - optimised.length;
		console.log(`✓ ${name} → ${newName}: ${kb(before)} → ${kb(optimised.length)} (${out.width}px)`);
	}
} finally {
	db.close();
	await browser.close();
}

console.log(`\nSaved ${kb(savedTotal)} in total. Originals kept in ${BACKUP}`);
