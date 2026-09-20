<script lang="ts">
	import Avatar from './Avatar.svelte';
	import type { PointsSummary } from '$lib/server/chores/points';

	type M = { id: string; name: string; emoji: string; color: string; role: string; hasAvatar?: boolean };

	let { members, points }: { members: M[]; points: Record<string, PointsSummary> } = $props();

	// Same rule the old points table used: every child, plus any adult who has actually
	// earned or spent something — a parent who joins the chore economy keeps their row,
	// one who never touched it doesn't take up space.
	const scored = $derived(
		members.filter(
			(m) => m.role === 'child' || (points[m.id]?.allTimeEarned ?? 0) > 0 || (points[m.id]?.redeemed ?? 0) > 0
		)
	);
</script>

<!-- Deliberately not a card: this sits above the tabs on every one of them, so it has to
     cost as little vertical space as it can. One pill per child — never a household
     total. -->
{#if scored.length}
	<div class="strip">
		{#each scored as m (m.id)}
			<span class="pill" style="--c:{m.color}">
				<Avatar member={m} size={32} />
				<span class="who">{m.name}</span>
				<strong class="bal">{points[m.id]?.balance ?? 0}p</strong>
			</span>
		{/each}
	</div>
{/if}

<style>
	.strip {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-3) var(--s-4);
		margin: 0 0 var(--s-5);
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: var(--s-3);
		min-width: 0;
		padding: var(--s-2) var(--s-4) var(--s-2) var(--s-2);
		border-radius: 999px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.who {
		min-width: 0;
		font-size: var(--t-3);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bal {
		font-size: var(--t-3);
		color: var(--c);
		white-space: nowrap;
	}
</style>
