/**
 * How a bonus-task photo is framed inside the card's fixed 4:3 window.
 *
 * The card and the editor's preview both render from `framingStyle()`, so what a
 * parent drags into place in the dialog is pixel-for-pixel what the deck shows —
 * the two can't drift apart.
 */

export const IMAGE_FITS = ['cover', 'contain'] as const;
export type ImageFit = (typeof IMAGE_FITS)[number];

export type Framing = {
	imageFit: string;
	imageX: number;
	imageY: number;
	imageZoom: number;
};

/** Plain `object-fit: cover`, centred — what every card looked like before framing existed. */
export const DEFAULT_FRAMING: Framing = { imageFit: 'cover', imageX: 50, imageY: 50, imageZoom: 100 };

export const ZOOM_MIN = 100;
export const ZOOM_MAX = 300;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

/** Force a framing back into range — a stored row, or a drag, can't put it outside. */
export function clampFraming(f: Partial<Framing>): Framing {
	return {
		imageFit: f.imageFit === 'contain' ? 'contain' : 'cover',
		imageX: clamp(f.imageX ?? 50, 0, 100),
		imageY: clamp(f.imageY ?? 50, 0, 100),
		imageZoom: clamp(f.imageZoom ?? 100, ZOOM_MIN, ZOOM_MAX)
	};
}

/**
 * The inline style for the `<img>` inside a framed window.
 *
 * `object-position` decides which part survives the crop; the scale is anchored to
 * that same point, so zooming in pulls the picture in *towards whatever was chosen*
 * rather than towards the middle. The window itself clips (overflow: hidden).
 */
export function framingStyle(f: Partial<Framing>): string {
	const { imageFit, imageX, imageY, imageZoom } = clampFraming(f);
	const pos = `${imageX}% ${imageY}%`;
	return `object-fit:${imageFit};object-position:${pos};transform:scale(${imageZoom / 100});transform-origin:${pos}`;
}
