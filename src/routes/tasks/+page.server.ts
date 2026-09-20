import { asc, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	bonusClaims,
	bonusTasks,
	chores,
	consequenceDraws,
	consequences,
	members,
	rewardRedemptions,
	rewards
} from '$lib/server/db/schema';
import { choresInRange } from '$lib/server/agenda';
import { getStreaks } from '$lib/server/chores/streaks';
import { getPointsSummary } from '$lib/server/chores/points';
import { listTags, getTagsForEntities } from '$lib/server/tags';
import { addDays, isoDate, weekDates } from '$lib/server/date';
import type { PageServerLoad } from './$types';

/**
 * Everything the household *does* lives on this one page, behind four tabs: the chore
 * decks, the rewards bandit, the consequences bandit and the bonus deck. It all loads
 * together because the always-visible points strip spans every tab — switching tabs is
 * a client-side toggle, not a navigation, so there is nothing to lazy-load per tab.
 */
export const load: PageServerLoad = async () => {
	// A rolling 7-day window from today, so an upcoming weekly chore is always visible
	// in the decks. The leaderboard instead scores the calendar week (Mon–Sun), so it
	// resets predictably rather than always covering "today + 6 days".
	const from = isoDate(new Date());
	const to = isoDate(addDays(new Date(), 7));
	const week = weekDates(new Date());

	const [
		choreDefs,
		memberList,
		weekInstances,
		scoreInstances,
		allTags,
		consequenceList,
		rewardList,
		bonusList,
		drawRows,
		redemptionRows,
		claimRows
	] = await Promise.all([
		db.select().from(chores).orderBy(asc(chores.title)),
		db.select().from(members).orderBy(asc(members.sortOrder)),
		choresInRange(from, to),
		choresInRange(week[0], week[6]),
		listTags(),
		db.select().from(consequences).orderBy(asc(consequences.title)),
		db.select().from(rewards).orderBy(asc(rewards.pointsCost)),
		db.select().from(bonusTasks).orderBy(asc(bonusTasks.sortOrder)),
		db
			.select({ draw: consequenceDraws, memberName: members.name, memberEmoji: members.emoji })
			.from(consequenceDraws)
			.innerJoin(members, eq(members.id, consequenceDraws.memberId))
			.orderBy(desc(consequenceDraws.dealtAt))
			// Short on purpose: the lever gets pulled in bursts, and 15 rows of the same
			// afternoon buries everything else on the page.
			.limit(6),
		db
			.select({ redemption: rewardRedemptions, memberName: members.name, memberEmoji: members.emoji })
			.from(rewardRedemptions)
			.innerJoin(members, eq(members.id, rewardRedemptions.memberId))
			.orderBy(desc(rewardRedemptions.redeemedAt))
			.limit(6),
		db
			.select({ claim: bonusClaims, memberName: members.name, memberEmoji: members.emoji })
			.from(bonusClaims)
			.innerJoin(members, eq(members.id, bonusClaims.memberId))
			.orderBy(desc(bonusClaims.claimedAt))
			.limit(6)
	]);

	const membersOut = memberList.map((m) => ({
		id: m.id,
		name: m.name,
		emoji: m.emoji,
		color: m.color,
		role: m.role,
		hasAvatar: Boolean(m.avatarPath)
	}));

	// Weekly done/total counts per child (points come from the shared points module below,
	// so the two never drift out of sync with each other).
	const counts = new Map<string, { done: number; total: number }>();
	for (const c of scoreInstances) {
		if (!c.memberId) continue;
		const e = counts.get(c.memberId) ?? { done: 0, total: 0 };
		e.total++;
		if (c.status === 'done') e.done++;
		counts.set(c.memberId, e);
	}

	const [streaks, points, choreTags, rewardTags] = await Promise.all([
		getStreaks([...counts.keys()]),
		getPointsSummary(membersOut.map((m) => m.id)),
		getTagsForEntities(
			'chore',
			choreDefs.map((c) => c.id)
		),
		getTagsForEntities(
			'reward',
			rewardList.map((r) => r.id)
		)
	]);

	// Points are always per child — never summed across the family — both here and
	// wherever this leaderboard/points data is rendered.
	const leaderboard = [...counts.entries()]
		.map(([id, c]) => {
			const m = membersOut.find((x) => x.id === id)!;
			return { member: m, points: points[id]?.week ?? 0, ...c, streak: streaks[id] ?? 0 };
		})
		.sort((a, b) => b.points - a.points || b.done - a.done);

	return {
		members: membersOut,
		points,
		allTags,
		today: from,

		// --- chores tab ---
		choreDefs: choreDefs.map((c) => ({ ...c, tags: choreTags[c.id] ?? [] })),
		weekInstances,
		leaderboard,

		// --- rewards / consequences / bonus tabs ---
		consequences: consequenceList,
		rewards: rewardList.map((r) => ({ ...r, tags: rewardTags[r.id] ?? [] })),
		// `imagePath` is a server-side disk path — the browser only needs to know
		// whether there *is* a thumbnail; it fetches it from the image endpoint. The
		// framing fields (imageFit/X/Y/Zoom) do go out: the card renders with them.
		bonusTasks: bonusList.map(({ imagePath, ...b }) => ({ ...b, hasImage: Boolean(imagePath) })),
		recentDraws: drawRows.map(({ draw, memberName, memberEmoji }) => ({
			id: draw.id,
			title: draw.title,
			emoji: draw.emoji,
			note: draw.note,
			expiresAt: draw.expiresAt,
			dealtAt: draw.dealtAt,
			memberName,
			memberEmoji
		})),
		recentRedemptions: redemptionRows.map(({ redemption, memberName, memberEmoji }) => ({
			id: redemption.id,
			title: redemption.title,
			pointsCost: redemption.pointsCost,
			note: redemption.note,
			expiresAt: redemption.expiresAt,
			redeemedAt: redemption.redeemedAt,
			memberName,
			memberEmoji
		})),
		recentClaims: claimRows.map(({ claim, memberName, memberEmoji }) => ({
			id: claim.id,
			title: claim.title,
			emoji: claim.emoji,
			points: claim.points,
			note: claim.note,
			claimedAt: claim.claimedAt,
			memberName,
			memberEmoji
		}))
	};
};
