<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import Nav from '$lib/components/Nav.svelte';
	import OperatorBar from '$lib/components/OperatorBar.svelte';
	import AdminGate from '$lib/components/AdminGate.svelte';
	import { toasts } from '$lib/toast';
	import { provideI18n } from '$lib/i18n';

	let { children, data } = $props();
	const bare = $derived(page.url.pathname === '/setup');

	// Locale is fixed per page load; a change triggers invalidateAll → full reload.
	provideI18n(data.household?.locale ?? 'nb');

	$effect(() => {
		const t = data.household?.theme;
		const el = document.documentElement;
		if (t === 'light' || t === 'dark') el.dataset.theme = t;
		else delete el.dataset.theme;
		el.lang = data.household?.locale ?? 'nb';
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

{#if bare}
	{@render children()}
{:else}
	<div class="app-shell">
		<Nav admin={data.admin} />
		<div class="body" class:railed={data.members.length > 0}>
			{#if data.members.length}
				<div class="opwrap">
					<OperatorBar members={data.members} operator={data.operator} />
				</div>
			{/if}
			<!-- One wrapper, because a page renders several top-level elements and they
			     would otherwise be dealt into the rail grid as separate items — landing
			     half the page in the narrow rail track. -->
			<div class="content">{@render children()}</div>
		</div>
	</div>
{/if}

<AdminGate />

<div class="toasts">
	{#each $toasts as t (t.id)}
		<div class="toast" data-kind={t.kind}>{t.message}</div>
	{/each}
</div>

<style>
	.opwrap {
		margin-bottom: var(--s-5);
	}
	/* Without this the content column refuses to shrink below its widest unbreakable
	   child and pushes the page sideways instead of giving way. */
	.content {
		min-width: 0;
	}
	/* From tablet width up, the member picker stops being a band across the top and
	   becomes a standing rail down the side, with the page's content beside it. The
	   rail is `auto`, so it's exactly as wide as the faces need and every remaining
	   pixel goes to the content column — the vertical band it replaces was costing
	   ~110px of height on the screen that has the least of it to spare.

	   `align-items: start` keeps the rail from stretching to the full page height,
	   which is what lets `position: sticky` on the rail itself do anything. */
	@media (min-width: 768px) {
		.body.railed {
			display: grid;
			grid-template-columns: auto minmax(0, 1fr);
			gap: var(--s-6);
			align-items: start;
		}
		.opwrap {
			margin-bottom: 0;
			position: sticky;
			top: var(--s-4);
		}
	}
	.toasts {
		position: fixed;
		bottom: 16px;
		left: 0;
		right: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-3);
		pointer-events: none;
		z-index: 300;
	}
	.toast[data-kind='error'] {
		background: var(--danger);
		color: #fff;
	}
	.toast[data-kind='ok'] {
		background: var(--ok);
		color: #fff;
	}
</style>
