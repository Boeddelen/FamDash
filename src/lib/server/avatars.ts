import { eq } from 'drizzle-orm';
import { db } from './db';
import { members } from './db/schema';
import {
	ensureUploadDir,
	isAllowedImageType,
	MAX_IMAGE_BYTES,
	readUpload,
	removeUpload,
	writeUpload
} from './images';

ensureUploadDir('avatars');

export const MAX_AVATAR_BYTES = MAX_IMAGE_BYTES;

export function isAllowedAvatarType(type: string): boolean {
	return isAllowedImageType(type);
}

function currentPath(memberId: string) {
	return db
		.select({ p: members.avatarPath })
		.from(members)
		.where(eq(members.id, memberId))
		.get()?.p ?? null;
}

export async function saveAvatar(memberId: string, file: File): Promise<void> {
	const rel = await writeUpload('avatars', memberId, file, currentPath(memberId));
	await db.update(members).set({ avatarPath: rel }).where(eq(members.id, memberId));
}

export async function deleteAvatar(memberId: string): Promise<void> {
	await removeUpload(currentPath(memberId));
	await db.update(members).set({ avatarPath: null }).where(eq(members.id, memberId));
}

export function readAvatar(
	memberId: string
): Promise<{ bytes: Buffer; contentType: string; etag: string } | null> {
	return readUpload(currentPath(memberId));
}
