<script lang="ts">
	import { getI18n } from '$lib/i18n';
	import Avatar from './Avatar.svelte';
	import ChoreCard from './ChoreCard.svelte';
	import type { AgendaChore } from '$lib/server/agenda';

	type M = { id: string; name: string; emoji: string; color: string; hasAvatar?: boolean };
	let {
		member,
		chores,
		today
	}: { member: M | null; chores: AgendaChore[]; today: string } = $props();

	const { t } = getI18n();

	const sorted = $derived(
		[...chores].sort((a, b) => {
			const rank = (c: AgendaChore) => (c.status === 'done' ? 2 : c.dueDate < today ? 0 : 1);
			return (
				rank(a) - rank(b) ||
				a.dueDate.localeCompare(b.dueDate) ||
				(a.time ?? '99:99').localeCompare(b.time ?? '99:99')
			);
		})
	);
	// A daily chore lands in this rolling-7-day deck seven times over, which buries every
	// other chore under copies of the same row. Show each chore's soonest card (plus
	// anything overdue, due today, or already done) and fold the later repeats of that
	// same chore behind a toggle — so a distinct upcoming chore is still always visible,
	// which is the whole point of the 7-day window.
	let showRepeats = $state(false);
	const split = $derived.by(() => {
		const visible: AgendaChore[] = [];
		const repeats: AgendaChore[] = [];
		const seen = new Set<string>();
		for (const c of sorted) {
			const isFuture = c.status !== 'done' && c.dueDate > today;
			if (isFuture && seen.has(c.choreId)) repeats.push(c);
			else visible.push(c);
			seen.add(c.choreId);
		}
		return { visible, repeats };
	});

	const doneCount = $derived(chores.filter((c) => c.status === 'done').length);
	const points = $derived(
		chores.filter((c) => c.status === 'done').reduce((s, c) => s + c.points, 0)
	);
	const accent = $derived(member?.color ?? 'var(--text-dim)');
</script>

<section class="deck" style="--accent:{accent}">
	<header>
		{#if member}
			<Avatar {member} size={40} />
		{:else}
			<span class="anyemoji">📋</span>
		{/if}
		<div class="who">
			<strong>{member?.name ?? t('chores.anyone')}</strong>
			<span class="muted">{doneCount}/{chores.length}{#if points} · {points}p{/if}</span>
		</div>
	</header>

	<div class="cards">
		{#if sorted.length === 0}
			<p class="empty muted">{t('chores.nothing')}</p>
		{:else}
			{#each split.visible as c (c.id)}
				<ChoreCard chore={c} {today} />
			{/each}
			{#if split.repeats.length > 0}
				{#if showRepeats}
					{#each split.repeats as c (c.id)}
						<ChoreCard chore={c} {today} />
					{/each}
				{/if}
				<button class="repeats" onclick={() => (showRepeats = !showRepeats)}>
					{showRepeats ? t('chores.repeats.hide') : t('chores.repeats.show', { count: split.repeats.length })}
				</button>
			{/if}
		{/if}
	</div>
</section>

<style>
	.deck {
		background: var(--surface);
		border: 1px solid var(--border);
		border-top: 4px solid var(--accent);
		border-radius: 14px;
		padding: var(--s-5);
		box-shadow: var(--shadow);
		position: relative;
	}
	/* stacked-paper hint */
	.deck::after {
		content: '';
		position: absolute;
		left: 8px;
		right: 8px;
		bottom: -5px;
		height: 8px;
		border-radius: 0 0 12px 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-top: none;
		z-index: -1;
	}
	header {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		margin-bottom: var(--s-4);
	}
	.anyemoji {
		font-size: var(--t-7);
	}
	.who {
		display: flex;
		flex-direction: column;
		line-height: 1.25;
	}
	.who .muted {
		font-size: var(--t-2);
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.empty {
		padding: var(--s-4) 0;
		font-size: var(--t-3);
	}
	.repeats {
		align-self: flex-start;
		min-height: 36px;
		padding: var(--s-1) var(--s-3);
		border: none;
		background: none;
		color: var(--text-dim);
		font-size: var(--t-2);
	}
	@media (pointer: coarse) {
		.repeats {
			min-height: 44px;
		}
	}
</style>
