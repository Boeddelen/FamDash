<script lang="ts">
	import { getI18n } from '$lib/i18n';
	import Avatar from './Avatar.svelte';

	type Entry = {
		member: { id: string; name: string; emoji: string; color: string; hasAvatar?: boolean };
		points: number;
		done: number;
		total: number;
		streak: number;
	};
	let { entries }: { entries: Entry[] } = $props();

	const { t } = getI18n();
	const medals = ['🥇', '🥈', '🥉'];
	const maxPoints = $derived(Math.max(1, ...entries.map((e) => e.points)));
</script>

<section class="card leaderboard">
	<h3>{t('chores.leaderboard')}</h3>
	{#if entries.length === 0}
		<p class="muted">{t('chores.none')}</p>
	{:else}
		<ul>
			{#each entries as e, i (e.member.id)}
				<li>
					<span class="rank">{medals[i] ?? i + 1}</span>
					<Avatar member={e.member} size={34} />
					<span class="who">
						<span class="name">
							{e.member.name}
							{#if e.streak > 1}<span class="streak">🔥 {e.streak}</span>{/if}
						</span>
						<span class="bar"><span class="fill" style="width:{(e.points / maxPoints) * 100}%; background:{e.member.color}"></span></span>
					</span>
					<span class="score">{e.points}p</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.leaderboard ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
	.leaderboard li {
		display: flex;
		align-items: center;
		gap: var(--s-4);
	}
	.rank {
		width: 1.6rem;
		text-align: center;
		font-size: var(--t-5);
		flex: none;
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
	}
	.name {
		font-size: var(--t-3);
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: var(--s-2);
	}
	.streak {
		font-size: var(--t-2);
		font-weight: 400;
		color: var(--warn);
	}
	.bar {
		display: block;
		height: 6px;
		border-radius: 999px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		border-radius: 999px;
		transition: width 0.3s ease;
	}
	.score {
		font-size: var(--t-3);
		font-weight: 600;
		flex: none;
	}
</style>
