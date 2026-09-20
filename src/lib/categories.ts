/** Small fixed set of chore categories — purely cosmetic (an icon + grouping label). */
export const CHORE_CATEGORY_KEYS = [
	'cleaning',
	'kitchen',
	'pets',
	'outdoor',
	'homework',
	'personal',
	'other'
] as const;
export type ChoreCategory = (typeof CHORE_CATEGORY_KEYS)[number];

export const CHORE_CATEGORIES: { key: ChoreCategory; emoji: string }[] = [
	{ key: 'cleaning', emoji: '🧹' },
	{ key: 'kitchen', emoji: '🍽️' },
	{ key: 'pets', emoji: '🐶' },
	{ key: 'outdoor', emoji: '🌳' },
	{ key: 'homework', emoji: '📚' },
	{ key: 'personal', emoji: '🧴' },
	{ key: 'other', emoji: '✨' }
];

const DEFAULT_EMOJI = '🧹';

export function categoryEmoji(key: string | null | undefined): string {
	return CHORE_CATEGORIES.find((c) => c.key === key)?.emoji ?? DEFAULT_EMOJI;
}
