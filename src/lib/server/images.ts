/**
 * Shared plumbing for the two kinds of picture this dashboard stores on disk: member
 * avatars and bonus-task thumbnails. Both are re-encoded and downscaled *in the
 * browser* before they ever reach us (see $lib/image.ts), which is why there's no
 * image library on the server — this module only writes bytes and hands them back.
 *
 * Every stored path is relative to DATA_DIR, so "back up the dashboard" stays "copy
 * that one folder".
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from './config';

const EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif'
};

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function isAllowedImageType(type: string): boolean {
	return type in EXT;
}

export function extensionFor(type: string): string | undefined {
	return EXT[type];
}

/** Make sure `uploads/<sub>/` exists, and answer with its absolute path. */
export function ensureUploadDir(sub: string): string {
	const dir = join(DATA_DIR, 'uploads', sub);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	return dir;
}

/**
 * Write `file` to `uploads/<sub>/<key>.<ext>` and return that DATA_DIR-relative path.
 * `previous` (the path currently recorded for this owner) is removed when the new file
 * lands under a different name — otherwise a JPG replaced by a WebP would leave the
 * old one orphaned on disk forever.
 */
export async function writeUpload(
	sub: string,
	key: string,
	file: File,
	previous: string | null
): Promise<string> {
	const ext = extensionFor(file.type);
	if (!ext) throw new Error('Unsupported image type');
	ensureUploadDir(sub);
	const rel = join('uploads', sub, `${key}.${ext}`);
	if (previous && previous !== rel) await unlink(join(DATA_DIR, previous)).catch(() => {});
	await writeFile(join(DATA_DIR, rel), Buffer.from(await file.arrayBuffer()));
	return rel;
}

export async function removeUpload(rel: string | null | undefined): Promise<void> {
	if (rel) await unlink(join(DATA_DIR, rel)).catch(() => {});
}

/**
 * Read a stored picture back, with a content-derived ETag so replacing it makes every
 * browser refetch exactly once and repeat views cost nothing. Null if it's gone.
 */
export async function readUpload(
	rel: string | null | undefined
): Promise<{ bytes: Buffer; contentType: string; etag: string } | null> {
	if (!rel) return null;
	try {
		const bytes = await readFile(join(DATA_DIR, rel));
		const ext = rel.split('.').pop() ?? 'jpg';
		const contentType =
			Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
		const etag = `"${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}"`;
		return { bytes, contentType, etag };
	} catch {
		return null;
	}
}

/** The response every image GET route returns — same caching rules for all of them. */
export function imageResponse(
	found: { bytes: Buffer; contentType: string; etag: string },
	request: Request
): Response {
	if (request.headers.get('if-none-match') === found.etag) {
		return new Response(null, { status: 304, headers: { etag: found.etag } });
	}
	return new Response(new Uint8Array(found.bytes), {
		headers: {
			'content-type': found.contentType,
			etag: found.etag,
			'cache-control': 'private, max-age=86400, stale-while-revalidate=604800'
		}
	});
}
