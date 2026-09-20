import { eq } from 'drizzle-orm';
import { db } from './db';
import { shoppingProducts } from './db/schema';
import { ensureUploadDir, readUpload, removeUpload, writeUpload } from './images';

ensureUploadDir('shopping');

/**
 * Pictures belong to the *product*, not to a row on the list — so cutting a photo out
 * once keeps paying off every time that product is bought again.
 */
function currentPath(productId: string) {
	return (
		db
			.select({ p: shoppingProducts.imagePath })
			.from(shoppingProducts)
			.where(eq(shoppingProducts.id, productId))
			.get()?.p ?? null
	);
}

export async function saveShoppingImage(productId: string, file: File): Promise<void> {
	const rel = await writeUpload('shopping', productId, file, currentPath(productId));
	await db.update(shoppingProducts).set({ imagePath: rel }).where(eq(shoppingProducts.id, productId));
}

export async function deleteShoppingImage(productId: string): Promise<void> {
	await removeUpload(currentPath(productId));
	await db.update(shoppingProducts).set({ imagePath: null }).where(eq(shoppingProducts.id, productId));
}

export function readShoppingImage(
	productId: string
): Promise<{ bytes: Buffer; contentType: string; etag: string } | null> {
	return readUpload(currentPath(productId));
}
