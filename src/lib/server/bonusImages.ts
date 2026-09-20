import { eq } from 'drizzle-orm';
import { db } from './db';
import { bonusTasks } from './db/schema';
import { ensureUploadDir, readUpload, removeUpload, writeUpload } from './images';

ensureUploadDir('bonus');

function currentPath(taskId: string) {
	return db
		.select({ p: bonusTasks.imagePath })
		.from(bonusTasks)
		.where(eq(bonusTasks.id, taskId))
		.get()?.p ?? null;
}

export async function saveBonusImage(taskId: string, file: File): Promise<void> {
	const rel = await writeUpload('bonus', taskId, file, currentPath(taskId));
	await db.update(bonusTasks).set({ imagePath: rel }).where(eq(bonusTasks.id, taskId));
}

export async function deleteBonusImage(taskId: string): Promise<void> {
	await removeUpload(currentPath(taskId));
	await db.update(bonusTasks).set({ imagePath: null }).where(eq(bonusTasks.id, taskId));
}

export function readBonusImage(
	taskId: string
): Promise<{ bytes: Buffer; contentType: string; etag: string } | null> {
	return readUpload(currentPath(taskId));
}
