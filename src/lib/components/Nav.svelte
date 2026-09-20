<script lang="ts">
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import { invalidateAll } from '$app/navigation';
	import { ensureAdmin } from '$lib/adminGate';
	import { toast } from '$lib/toast';
	import { getI18n } from '$lib/i18n';

	let { admin }: { admin: { name: string } | null } = $props();
	const { t } = getI18n();

	const links = $derived([
		{ href: '/', label: t('nav.today') },
		{ href: '/week', label: t('nav.week') },
		{ href: '/month', label: t('nav.month') },
		{ href: '/tasks', label: t('nav.tasks') },
		{ href: '/shopping', label: t('nav.shopping') },
		{ href: '/upload', label: t('nav.docs') }
	]);

	async function toggleAdmin() {
		if (admin) {
			await api('/api/admin/logout', { method: 'POST', quiet: true });
			await invalidateAll();
			toast(t('admin.off'), 'info');
		} else if (await ensureAdmin()) {
			await invalidateAll();
		}
	}
</script>

<nav>
	<a class="brand" href="/">{page.data.household?.name ?? 'Family'}</a>
	<div class="links">
		{#each links as l}
			<a href={l.href} class:active={page.url.pathname === l.href}>{l.label}</a>
		{/each}
	</div>
	<div class="right">
		<a
			href="/settings"
			class:active={page.url.pathname.startsWith('/settings')}
			title={t('nav.settings')}>⚙️</a
		>
		<button class="btn-ghost admin" onclick={toggleAdmin}>
			{admin ? `🔓 ${admin.name}` : `🔒 ${t('nav.admin')}`}
		</button>
	</div>
</nav>

<style>
	/* Two rows on a phone, one from tablet up. It used to take *three*: the brand
	   wrapped alone, the five links wrapped alone, and the gear + admin button wrapped
	   alone below them — about 150px of chrome before the first real pixel of the page.
	   `order` puts the brand and the admin controls on the same line and pushes the
	   links to their own full-width row, which the min-width rule below then pulls back
	   up once there's room for all three side by side. */
	nav {
		display: flex;
		align-items: center;
		gap: var(--s-2) var(--s-5);
		flex-wrap: wrap;
		padding: var(--s-3) 0 var(--s-4);
		border-bottom: 1px solid var(--border);
		margin-bottom: var(--s-5);
	}
	.brand {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		font-weight: 700;
		font-size: var(--t-5);
		color: var(--text);
	}
	/* Never a second row of links: below the width where they all fit, the strip
	   scrolls sideways like the /tasks tabs rather than growing the header. */
	.links {
		display: flex;
		gap: var(--s-2);
		flex-wrap: nowrap;
		order: 2;
		flex: 1 0 100%;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.links::-webkit-scrollbar {
		display: none;
	}
	.links a {
		flex: none;
	}
	/* Tab-sized targets — this is the primary navigation on a wall tablet. */
	.links a,
	.right a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: var(--s-3) var(--s-4);
		border-radius: 8px;
		color: var(--text-dim);
		touch-action: manipulation;
	}
	.links a.active,
	.right a.active {
		background: var(--surface-2);
		color: var(--text);
		text-decoration: none;
	}
	.right {
		margin-left: auto;
		order: 1;
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}
	@media (min-width: 768px) {
		.links {
			order: 0;
			flex: 0 1 auto;
		}
	}
	.admin {
		min-height: 44px;
		font-size: var(--t-3);
		white-space: nowrap;
	}
</style>
