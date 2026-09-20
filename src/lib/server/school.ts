import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, asc, desc, eq, isNull, lt } from 'drizzle-orm';
import { DATA_DIR } from './config';
import { db } from './db';
import { documentGroups, schoolDocuments } from './db/schema';

const DIR = join(DATA_DIR, 'uploads', 'school');
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

const safe = (name: string) =>
	name.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-80) || 'document.pdf';

export async function saveSchoolDocument(
	file: File,
	adminId: string | null,
	title?: string,
	groupId?: string | null
): Promise<{ id: string }> {
	const bytes = Buffer.from(await file.arrayBuffer());
	const contentHash = createHash('sha256').update(bytes).digest('hex');
	const id = crypto.randomUUID();
	const filename = safe(file.name);
	const rel = join('uploads', 'school', `${id}-${filename}`);
	await writeFile(join(DATA_DIR, rel), bytes);

	await db.insert(schoolDocuments).values({
		id,
		groupId: groupId ?? null,
		title: (title || file.name.replace(/\.pdf$/i, '')).slice(0, 160),
		filename: file.name.slice(0, 160),
		storedPath: rel,
		mimeType: file.type || 'application/pdf',
		sizeBytes: bytes.length,
		contentHash,
		uploadedByAdminId: adminId
	});
	return { id };
}

export function listSchoolDocuments() {
	return db
		.select({
			id: schoolDocuments.id,
			title: schoolDocuments.title,
			filename: schoolDocuments.filename,
			sizeBytes: schoolDocuments.sizeBytes,
			mimeType: schoolDocuments.mimeType,
			uploadedAt: schoolDocuments.uploadedAt,
			groupId: schoolDocuments.groupId,
			archivedAt: schoolDocuments.archivedAt
		})
		.from(schoolDocuments)
		.orderBy(desc(schoolDocuments.uploadedAt));
}

/**
 * Midnight at the start of the most recent Saturday — today, if today is Saturday.
 * Local time, like every other date boundary in the app (see ./date.ts).
 */
export function lastSaturdayStart(now = new Date()): Date {
	const d = new Date(now);
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() - ((d.getDay() - 6 + 7) % 7)); // Sat = 6
	return d;
}

/**
 * Archive every still-active document from a finished school week. Run on Saturdays,
 * and again on boot: because the cutoff is derived from the calendar rather than from
 * "did this job fire", a Saturday missed to downtime or a sleeping Mac is simply caught
 * up the next time the server starts, and running it twice changes nothing.
 */
export async function archiveDueDocuments(): Promise<number> {
	const cutoff = Math.floor(lastSaturdayStart().getTime() / 1000);
	const rows = await db
		.update(schoolDocuments)
		.set({ archivedAt: Math.floor(Date.now() / 1000) })
		.where(
			and(
				isNull(schoolDocuments.archivedAt),
				eq(schoolDocuments.archiveExempt, false),
				lt(schoolDocuments.uploadedAt, cutoff)
			)
		)
		.returning({ id: schoolDocuments.id });
	return rows.length;
}

export function listDocumentGroups() {
	return db
		.select()
		.from(documentGroups)
		.orderBy(asc(documentGroups.sortOrder), asc(documentGroups.createdAt));
}

export function getSchoolDocument(id: string) {
	return db.select().from(schoolDocuments).where(eq(schoolDocuments.id, id)).get();
}

export async function readSchoolDocumentFile(id: string): Promise<{ doc: NonNullable<Awaited<ReturnType<typeof getSchoolDocument>>>; bytes: Buffer } | null> {
	const doc = getSchoolDocument(id);
	if (!doc) return null;
	try {
		const bytes = await readFile(join(DATA_DIR, doc.storedPath));
		return { doc, bytes };
	} catch {
		return null;
	}
}

export async function deleteSchoolDocument(id: string): Promise<void> {
	const doc = getSchoolDocument(id);
	if (!doc) return;
	await unlink(join(DATA_DIR, doc.storedPath)).catch(() => {});
	await db.delete(schoolDocuments).where(eq(schoolDocuments.id, id));
}
