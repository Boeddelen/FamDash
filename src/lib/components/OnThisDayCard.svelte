<script lang="ts">
	import { getI18n } from '$lib/i18n';
	import type { OnThisDayItem } from '$lib/server/onthisday';

	let { items }: { items: OnThisDayItem[] } = $props();
	const { t } = getI18n();

	const KIND_EMOJI: Record<OnThisDayItem['kind'], string> = {
		event: '📜',
		birth: '🎂',
		death: '🕯️'
	};

	function shuffled(n: number): number[] {
		const arr = Array.from({ length: n }, (_, i) => i);
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
		return arr;
	}

	// A fresh shuffle each time the card mounts; "Another fact" then just steps
	// through it, so kids can browse a few without repeats until it wraps around.
	let order = $state(shuffled(items.length));
	let pos = $state(0);
	const current = $derived(items[order[pos]] ?? null);

	function next() {
		if (order.length === 0) return;
		pos = (pos + 1) % order.length;
	}

	function headline(item: OnThisDayItem): string {
		const year = item.year ?? '?';
		if (item.kind === 'birth') return t('dash.onThisDayBorn', { title: item.title, year });
		if (item.kind === 'death') return t('dash.onThisDayDied', { title: item.title, year });
		return t('dash.onThisDayEvent', { title: item.title, year });
	}
</script>

<div class="card onthisday">
	<div class="row spread">
		<h3>🤔 {t('dash.onThisDay')}</h3>
		{#if items.length > 1}
			<button class="btn-ghost next" onclick={next} title={t('dash.onThisDayNext')}>🔀</button>
		{/if}
	</div>
	{#if current}
		<div class="fact">
			<span class="kind" aria-hidden="true">{KIND_EMOJI[current.kind]}</span>
			<div class="body">
				<p class="headline">{headline(current)}</p>
				{#if current.text}<p class="muted text">{current.text}</p>{/if}
			</div>
		</div>
		<a class="source muted" href="https://dayinhistory.dev" target="_blank" rel="noopener noreferrer">
			{t('dash.onThisDaySource')}: dayinhistory.dev
		</a>
	{:else}
		<p class="muted">{t('dash.onThisDayEmpty')}</p>
	{/if}
</div>

<style>
	.onthisday .next {
		font-size: var(--t-5);
		min-height: 44px;
		min-width: 44px;
		padding: 0 var(--s-3);
	}
	.fact {
		display: flex;
		gap: var(--s-4);
		align-items: flex-start;
		margin-top: var(--s-1);
	}
	.kind {
		font-size: var(--t-6);
		line-height: 1.3;
		flex: none;
	}
	.body {
		min-width: 0;
	}
	.headline {
		margin: 0 0 var(--s-2);
		font-weight: 500;
	}
	.text {
		margin: 0;
		font-size: var(--t-3);
	}
	.source {
		display: inline-flex;
		align-items: center;
		min-height: 40px;
		margin-top: var(--s-1);
		font-size: var(--t-1);
	}
</style>
