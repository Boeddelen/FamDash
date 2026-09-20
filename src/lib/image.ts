/**
 * Shrink a picked photo in the browser before it's uploaded.
 *
 * Phone cameras hand us 2–5 MB images; an avatar is never drawn larger than ~80 CSS px
 * and a bonus-task thumbnail not much bigger, so sending the original wastes the
 * upload, the disk and — every time the dashboard loads — the download. Re-encoding
 * here keeps the server free of an image library.
 */

const AVATAR_EDGE = 320; // 4x the largest place an avatar is drawn, so it stays crisp when zoomed
const THUMB_EDGE = 640; // bonus-task cards are ~160–220px wide; 640 survives a retina tablet
const QUALITY = 0.85;

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
	// `from-image` applies the EXIF orientation phones record instead of rotating faces.
	if ('createImageBitmap' in globalThis) {
		try {
			return await createImageBitmap(file, { imageOrientation: 'from-image' });
		} catch {
			/* fall through to the <img> path */
		}
	}
	const url = URL.createObjectURL(file);
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		return img;
	} finally {
		URL.revokeObjectURL(url);
	}
}

function pickType(): { type: string; ext: string } {
	const canWebp = document
		.createElement('canvas')
		.toDataURL('image/webp')
		.startsWith('data:image/webp');
	return canWebp ? { type: 'image/webp', ext: 'webp' } : { type: 'image/jpeg', ext: 'jpg' };
}

/**
 * Scale down to at most `maxEdge`, re-encoded as WebP (or JPEG where WebP isn't
 * available). `square` centre-crops first. Returns the original file untouched if
 * anything about the conversion fails, so a picky image can still be uploaded.
 */
async function shrink(
	file: File,
	{ maxEdge, square, name }: { maxEdge: number; square: boolean; name: string }
): Promise<File> {
	try {
		const src = await decode(file);
		const w = 'width' in src ? src.width : 0;
		const h = 'height' in src ? src.height : 0;
		if (!w || !h) return file;

		// Source rectangle to copy out of the original, and the size to draw it at.
		let sx = 0;
		let sy = 0;
		let sw = w;
		let sh = h;
		let dw: number;
		let dh: number;
		if (square) {
			// Avatars are always drawn as circles with object-fit: cover, so the edges
			// are thrown away by the browser anyway — crop them here instead.
			const edge = Math.min(w, h);
			sx = (w - edge) / 2;
			sy = (h - edge) / 2;
			sw = edge;
			sh = edge;
			dw = dh = Math.min(edge, maxEdge);
		} else {
			// A card keeps the photo's own shape — the card, not this canvas, decides
			// how it's framed (object-fit: cover on a fixed-ratio box).
			const scale = Math.min(1, maxEdge / Math.max(w, h));
			dw = Math.round(w * scale);
			dh = Math.round(h * scale);
		}

		const canvas = document.createElement('canvas');
		canvas.width = dw;
		canvas.height = dh;
		const ctx = canvas.getContext('2d');
		if (!ctx) return file;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(src as CanvasImageSource, sx, sy, sw, sh, 0, 0, dw, dh);
		if ('close' in src) src.close();

		const { type, ext } = pickType();
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, type, QUALITY)
		);
		if (!blob) return file;
		// A tiny source could conceivably re-encode larger; keep whichever is smaller.
		if (blob.size >= file.size) return file;

		return new File([blob], `${name}.${ext}`, { type });
	} catch {
		return file;
	}
}

/** Centre-cropped square, for a member's face photo. */
export function shrinkAvatar(file: File): Promise<File> {
	return shrink(file, { maxEdge: AVATAR_EDGE, square: true, name: 'avatar' });
}

/** Uncropped, for a bonus-task card thumbnail. */
export function shrinkThumbnail(file: File): Promise<File> {
	return shrink(file, { maxEdge: THUMB_EDGE, square: false, name: 'thumb' });
}
