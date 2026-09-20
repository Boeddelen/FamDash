<script lang="ts">
	import { api } from '$lib/api';
	import { getI18n } from '$lib/i18n';

	const { t } = getI18n();
	let {
		onpick
	}: { onpick: (p: { label: string; lat: number; lon: number; timezone: string }) => void } =
		$props();

	let q = $state('');
	let results = $state<{ label: string; lat: number; lon: number; timezone: string }[]>([]);
	let searching = $state(false);

	async function search() {
		if (q.trim().length < 2) return;
		searching = true;
		try {
			results = await api(`/api/weather/geocode?q=${encodeURIComponent(q)}`, { quiet: true });
		} catch {
			results = [];
		} finally {
			searching = false;
		}
	}
</script>

<div class="row">
	<input placeholder={t('settings.searchPlace')} bind:value={q} onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), search())} />
	<button onclick={search} disabled={searching}>{t('setup.search')}</button>
</div>
{#if results.length}
	<ul class="res">
		{#each results as r}
			<li>
				<button
					class="btn-ghost"
					onclick={() => {
						onpick(r);
						results = [];
						q = r.label;
					}}>{r.label}</button
				>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.res {
		list-style: none;
		padding: 0;
		margin: var(--s-3) 0 0;
	}
	.res li button {
		width: 100%;
		text-align: left;
	}
</style>
