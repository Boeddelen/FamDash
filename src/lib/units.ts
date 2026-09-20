/**
 * Units a shopping item can be measured in, and the money that goes with them.
 *
 * `other` is deliberately a real member of the list rather than a blank: picking it
 * stores the household's own word for the unit ("nett", "beger", "kasse") alongside it,
 * so the list can say "2 nett" without that free text leaking into every other item's
 * arithmetic.
 */
export const UNITS = ['stk', 'kg', 'g', 'l', 'dl', 'ml', 'pk', 'other'] as const;
export type Unit = (typeof UNITS)[number];
export const DEFAULT_UNIT: Unit = 'stk';

export function isUnit(u: string): u is Unit {
	return (UNITS as readonly string[]).includes(u);
}

/**
 * Money is stored as a whole number of øre, never as kroner in a float. 19.50 has no
 * exact binary representation, so a list of them drifts a few øre off the total — and a
 * shopping list that can't add up is worse than one with no prices at all.
 */
export function formatPrice(ore: number | null | undefined, tag: string): string {
	if (ore == null) return '';
	return new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
		ore / 100
	);
}

/** Parse "19,50" or "19.50" into øre. Null for anything that isn't a number. */
export function parsePrice(text: string): number | null {
	const cleaned = text.replace(/\s/g, '').replace(',', '.');
	if (!cleaned) return null;
	const n = Number(cleaned);
	if (!Number.isFinite(n) || n < 0) return null;
	return Math.round(n * 100);
}

/** "2", "2,5" — trailing zeroes dropped, because "2,0 kg" reads like a measurement. */
export function formatAmount(n: number | null | undefined, tag: string): string {
	if (n == null) return '';
	return new Intl.NumberFormat(tag, { maximumFractionDigits: 2 }).format(n);
}

export function parseAmount(text: string): number | null {
	const cleaned = text.replace(/\s/g, '').replace(',', '.');
	if (!cleaned) return null;
	const n = Number(cleaned);
	if (!Number.isFinite(n) || n <= 0) return null;
	return n;
}

/** What one line costs: the amount times the price for one of its unit. */
export function lineTotal(amount: number | null, priceOre: number | null): number | null {
	if (priceOre == null) return null;
	return Math.round((amount ?? 1) * priceOre);
}
