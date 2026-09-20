<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getI18n } from '$lib/i18n';
	import PointsStrip from '$lib/components/PointsStrip.svelte';
	import ChoresTab from '$lib/components/ChoresTab.svelte';
	import RewardBandit from '$lib/components/RewardBandit.svelte';
	import ConsequenceBandit from '$lib/components/ConsequenceBandit.svelte';
	import BonusDeck from '$lib/components/BonusDeck.svelte';

	let { data } = $props();
	const { t } = getI18n();

	// Slugs are stable strings in the URL — they don't change with the locale, only the
	// labels do. 'plikter' is the default and stays out of the URL entirely.
	const TABS = ['plikter', 'premier', 'konsekvenser', 'bonus'] as const;
	type Tab = (typeof TABS)[number];

	const EMOJI: Record<Tab, string> = {
		plikter: '🧹',
		premier: '🎁',
		konsekvenser: '⚡',
		bonus: '🎯'
	};

	// The tab lives in the URL, so a reload, a bookmark, or coming back from another page
	// all land on the tab you left — the wall tablet can be parked on one.
	const tab = $derived.by<Tab>(() => {
		const q = page.url.searchParams.get('tab');
		return TABS.includes(q as Tab) ? (q as Tab) : 'plikter';
	});

	function select(next: Tab) {
		const url = new URL(page.url);
		if (next === 'plikter') url.searchParams.delete('tab');
		else url.searchParams.set('tab', next);
		// replaceState, not push: switching tabs shouldn't stack up history entries that
		// take four taps of Back to escape.
		goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	// Left/right arrows move between tabs, the standard tablist keyboard contract.
	function onKey(e: KeyboardEvent) {
		const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
		if (!dir) return;
		e.preventDefault();
		select(TABS[(TABS.indexOf(tab) + dir + TABS.length) % TABS.length]);
	}
</script>

<div class="page-head">
	<h1>{t('tasks.title')}</h1>
</div>

<!-- Above the tabs, not inside one: points are the thread tying chores, rewards,
     consequences and bonuses together, so they stay on screen whichever tab is open. -->
<PointsStrip members={data.members} points={data.points} />

<div class="tabs" role="tablist" aria-label={t('tasks.title')}>
	{#each TABS as id (id)}
		<!-- Roving tabindex + the arrow handler live on the tabs themselves, which is both
		     the WAI-ARIA tablist pattern and what keeps the keyboard focus somewhere real. -->
		<button
			role="tab"
			id="tab-{id}"
			aria-selected={tab === id}
			aria-controls="panel-{id}"
			tabindex={tab === id ? 0 : -1}
			class:on={tab === id}
			onclick={() => select(id)}
			onkeydown={onKey}
		>
			<span class="e" aria-hidden="true">{EMOJI[id]}</span>
			<span class="l">{t(`tasks.tab.${id}`)}</span>
		</button>
	{/each}
</div>

<div class="panel" role="tabpanel" id="panel-{tab}" aria-labelledby="tab-{tab}" tabindex="-1">
	{#if tab === 'plikter'}
		<ChoresTab {data} />
	{:else if tab === 'premier'}
		<p class="muted intro">{t('tasks.intro.premier')}</p>
		<RewardBandit
			members={data.members}
			rewards={data.rewards}
			points={data.points}
			recentRedemptions={data.recentRedemptions}
			allTags={data.allTags}
		/>
	{:else if tab === 'konsekvenser'}
		<p class="muted intro">{t('tasks.intro.konsekvenser')}</p>
		<ConsequenceBandit
			members={data.members}
			consequences={data.consequences}
			recentDraws={data.recentDraws}
		/>
	{:else}
		<p class="muted intro">{t('tasks.intro.bonus')}</p>
		<BonusDeck members={data.members} tasks={data.bonusTasks} recentClaims={data.recentClaims} />
	{/if}
</div>

<style>
	/* Scrolls sideways rather than wrapping to a second line: four tabs at a 44px tap
	   target don't fit a 360px phone, and a half-height second row reads as broken. */
	.tabs {
		display: flex;
		gap: var(--s-2);
		overflow-x: auto;
		scrollbar-width: none;
		padding-bottom: var(--s-3);
		margin-bottom: var(--s-6);
		border-bottom: 1px solid var(--border);
		/* "Konsekvenser" alone is wider than half a 360px phone, so on a narrow screen the
		   last tab sits off the right edge. Fading that edge is the only hint there's more
		   to swipe to; on a wide screen the fade lands on empty space and shows nothing. */
		-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 1.6rem), transparent);
		mask-image: linear-gradient(to right, #000 calc(100% - 1.6rem), transparent);
	}
	.tabs::-webkit-scrollbar {
		display: none;
	}
	.tabs button {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		flex: none;
		min-height: 44px;
		padding: var(--s-3) var(--s-5);
		border: 1px solid transparent;
		border-radius: 999px;
		background: none;
		color: var(--text-dim);
		font-size: var(--t-3);
		white-space: nowrap;
		touch-action: manipulation;
	}
	.tabs button.on {
		background: var(--surface-2);
		border-color: var(--border);
		color: var(--text);
		font-weight: 600;
	}
	.e {
		font-size: var(--t-4);
		line-height: 1;
	}
	.panel:focus {
		outline: none;
	}
	.intro {
		/* Same pull-up as BonusDeck's .intro — keep the two in step. */
		margin: calc(-1 * var(--s-2)) 0 var(--s-5);
	}
</style>
