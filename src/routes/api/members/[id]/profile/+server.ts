import { error } from '@sveltejs/kit';
import { and, asc, eq, gt, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { consequenceDraws, members, rewardRedemptions, rewards } from '$lib/server/db/schema';
import { choresInRange, planItemsInRange } from '$lib/server/agenda';
import { getPointsSummaryFor } from '$lib/server/chores/points';
import { getStreaks } from '$lib/server/chores/streaks';
import { addDays, isoDate, todayIso } from '$lib/server/date';
import { json } from '$lib/server/http';
import type { RequestHandler } from './$types';

/** Everything a member profile popup needs, gathered in one call. Read-only, no admin gate. */
export const GET: RequestHandler = async ({ params }) => {
	const member = await db.select().from(members).where(eq(members.id, params.id)).get();
	if (!member) throw error(404, 'Member not found');

	const today = todayIso();
	const weekAhead = isoDate(addDays(new Date(), 7));
	const nowSec = Math.floor(Date.now() / 1000);

	const [points, streaks, todayAgenda, upcomingAgenda, activeConsequenceRows, activeRewardRows] = await Promise.all([
		getPointsSummaryFor(member.id),
		getStreaks([member.id]),
		choresInRange(today, today),
		planItemsInRange(today, weekAhead),
		// "Currently in effect" for the profile popup — only draws/redemptions that were
		// dealt with a duration and haven't timed out yet, soonest-to-end first.
		db
			.select()
			.from(consequenceDraws)
			.where(
				and(
					eq(consequenceDraws.memberId, member.id),
					isNotNull(consequenceDraws.expiresAt),
					gt(consequenceDraws.expiresAt, nowSec)
				)
			)
			.orderBy(asc(consequenceDraws.expiresAt)),
		db
			.select({ redemption: rewardRedemptions, emoji: rewards.emoji })
			.from(rewardRedemptions)
			.leftJoin(rewards, eq(rewards.id, rewardRedemptions.rewardId))
			.where(
				and(
					eq(rewardRedemptions.memberId, member.id),
					isNotNull(rewardRedemptions.expiresAt),
					gt(rewardRedemptions.expiresAt, nowSec)
				)
			)
			.orderBy(asc(rewardRedemptions.expiresAt))
	]);

	return json({
		member: {
			id: member.id,
			name: member.name,
			emoji: member.emoji,
			color: member.color,
			role: member.role,
			hasAvatar: Boolean(member.avatarPath)
		},
		points,
		streak: streaks[member.id] ?? 0,
		todayChores: todayAgenda.filter((c) => c.memberId === member.id),
		upcomingPlans: upcomingAgenda
			.filter((p) => p.memberId === member.id && !p.done)
			.sort((a, b) => a.date.localeCompare(b.date))
			.slice(0, 10),
		activeConsequences: activeConsequenceRows.map((d) => ({
			id: d.id,
			title: d.title,
			emoji: d.emoji,
			expiresAt: d.expiresAt
		})),
		// A deleted reward leaves rewardId null (set null on delete) — no catalog emoji
		// left to join against, so fall back to the generic gift emoji.
		activeRewards: activeRewardRows.map(({ redemption, emoji }) => ({
			id: redemption.id,
			title: redemption.title,
			emoji: emoji ?? '🎁',
			expiresAt: redemption.expiresAt
		}))
	});
};
