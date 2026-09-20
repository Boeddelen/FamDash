<script lang="ts">
	import { api } from '$lib/api';
	import { invalidateAll } from '$app/navigation';
	import { getI18n, localeTag } from '$lib/i18n';
	import { expiryLabel } from '$lib/duration';
	import Avatar from './Avatar.svelte';
	import type { AgendaChore, AgendaPlanItem } from '$lib/server/agenda';
	import type { PointsSummary } from '$lib/server/chores/points';

	type M = { id: string; name: string; emoji: string; color: string; hasAvatar?: boolean };
	type ActiveItem = { id: string; title: string; emoji: string; expiresAt: number };
	type Profile = {
		member: M & { role: string };
		points: PointsSummary;
		streak: number;
		todayChores: AgendaChore[];
		upcomingPlans: AgendaPlanItem[];
		activeConsequences: ActiveItem[];
		activeRewards: ActiveItem[];
	};

	let {
		member,
		isOperator,
		onBecomeOperator,
		onSignOut,
		onClose
	}: {
		member: M;
		isOperator: boolean;
		onBecomeOperator: () => void;
		onSignOut: () => void;
		onClose: () => void;
	} = $props();

	const { t, locale } = getI18n();

	let profile = $state<Profile | null>(null);
	let busy = $state(false);

	async function load() {
		profile = await api<Profile>(`/api/members/${member.id}/profile`, { quiet: true });
	}
	load();

	// Consequences and rewards currently in effect, merged into one "what's going on
	// right now" row sorted by whichever ends soonest — a parent glancing at this
	// modal cares about the combined picture, not which bandit dealt which.
	const activeStatus = $derived.by(() => {
		if (!profile) return [];
		return [
			...profile.activeConsequences.map((c) => ({ ...c, kind: 'consequence' as const })),
			...profile.activeRewards.map((r) => ({ ...r, kind: 'reward' as const }))
		].sort((a, b) => a.expiresAt - b.expiresAt);
	});

	function fmtDate(iso: string): string {
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(localeTag(locale), { weekday: 'short', day: 'numeric' });
	}

	async function toggleChore(c: AgendaChore) {
		busy = true;
		try {
			await api(`/api/chore-instances/${c.id}`, {
				method: 'POST',
				body: JSON.stringify({ status: c.status === 'done' ? 'todo' : 'done' }),
				quiet: true
			});
			await Promise.all([invalidateAll(), load()]);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="backdrop" role="presentation" onclick={onClose}>
	<div class="card modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
		<button class="closex" onclick={onClose} aria-label={t('profile.close')}>✕</button>
		<div class="phead">
			<Avatar {member} size={64} />
			<h2>{member.name}</h2>
			{#if profile}
				<span class="streak">🔥 {profile.streak} {t('profile.streak')}</span>
			{/if}
		</div>

		{#if !profile}
			<p class="muted">{t('profile.loading')}</p>
		{:else}
			{#if activeStatus.length > 0}
				<div class="status">
					{#each activeStatus as s (s.kind + s.id)}
						<span class="statuspill" class:cons={s.kind === 'consequence'} class:reward={s.kind === 'reward'}>
							{s.emoji} {s.title} · {expiryLabel(s.expiresAt, t, localeTag(locale))}
						</span>
					{/each}
				</div>
			{/if}

			<div class="statgrid">
				<div class="stat">
					<span>{t('chores.points.today')}</span><strong>{profile.points.today}</strong>
				</div>
				<div class="stat">
					<span>{t('chores.points.week')}</span><strong>{profile.points.week}</strong>
				</div>
				<div class="stat">
					<span>{t('chores.points.month')}</span><strong>{profile.points.month}</strong>
				</div>
				<div class="stat">
					<span>{t('chores.points.year')}</span><strong>{profile.points.year}</strong>
				</div>
				<div class="stat statbalance">
					<span>{t('chores.points.balance')}</span><strong>{profile.points.balance}</strong>
				</div>
			</div>

			<h4>{t('profile.today')}</h4>
			{#if profile.todayChores.length === 0}
				<p class="muted">{t('profile.noneToday')}</p>
			{:else}
				<ul class="clist">
					{#each profile.todayChores as c (c.id)}
						{@const hasChecklist = (c.checklist?.length ?? 0) > 0}
						<li>
							{#if hasChecklist}
								<span class="cbox" title={t('profile.viewChecklist')}>{c.status === 'done' ? '✓' : ''}</span>
							{:else}
								<button class="cbox btn" disabled={busy} onclick={() => toggleChore(c)}>
									{c.status === 'done' ? '✓' : ''}
								</button>
							{/if}
							<span class="ctxt" class:done={c.status === 'done'}>
								{c.title}
								{#if c.time}<span class="muted"> · 🕒 {c.time}</span>{/if}
								{#if hasChecklist}<span class="muted"> · {(c.checklistDone?.length ?? 0)}/{c.checklist!.length}</span>{/if}
							</span>
							{#each c.tags as tg (tg.id)}<span class="chip" style="--c:{tg.color}">{tg.label}</span>{/each}
						</li>
					{/each}
				</ul>
			{/if}

			<h4>{t('profile.upcoming')}</h4>
			{#if profile.upcomingPlans.length === 0}
				<p class="muted">{t('profile.noneUpcoming')}</p>
			{:else}
				<ul class="clist">
					{#each profile.upcomingPlans as p (p.id)}
						<li>
							<span class="dot muted">{fmtDate(p.date)}</span>
							<span class="ctxt">{p.title}</span>
							{#each p.tags as tg (tg.id)}<span class="chip" style="--c:{tg.color}">{tg.label}</span>{/each}
						</li>
					{/each}
				</ul>
			{/if}
		{/if}

		<div class="row spread foot">
			{#if isOperator}
				<button class="btn-ghost" onclick={onSignOut}>{t('profile.signOut')}</button>
			{:else}
				<button class="btn-primary" onclick={onBecomeOperator}>{t('profile.becomeOperator')}</button>
			{/if}
		</div>
	</div>
</div>

<style>
	/* .backdrop / .modal come from app.css — the backdrop does the scrolling. */
	.modal {
		position: relative;
	}
	.closex {
		position: absolute;
		top: 0.35rem;
		right: 0.35rem;
		display: grid;
		place-items: center;
		border: none;
		background: none;
		min-height: 44px;
		min-width: 44px;
		padding: 0;
		font-size: var(--t-4);
		color: var(--text-dim);
	}
	.phead {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-2);
		margin-bottom: var(--s-5);
	}
	.phead h2 {
		margin: 0;
	}
	.streak {
		font-size: var(--t-2);
		color: var(--text-dim);
	}
	.status {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
		justify-content: center;
		margin-bottom: var(--s-5);
	}
	.statuspill {
		font-size: var(--t-2);
		font-weight: 600;
		padding: var(--s-2) var(--s-4);
		border-radius: 999px;
		border: 1px solid transparent;
	}
	.statuspill.cons {
		background: color-mix(in srgb, var(--danger) 14%, transparent);
		color: var(--danger);
		border-color: color-mix(in srgb, var(--danger) 35%, transparent);
	}
	.statuspill.reward {
		background: color-mix(in srgb, var(--primary) 14%, transparent);
		color: var(--primary);
		border-color: color-mix(in srgb, var(--primary) 35%, transparent);
	}
	.statgrid {
		display: grid;
		/* Five across on a roomy modal, folding to three or two on a small phone. */
		grid-template-columns: repeat(auto-fit, minmax(min(3.6rem, 100%), 1fr));
		gap: var(--s-2);
		margin-bottom: var(--s-6);
	}
	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-1);
		background: var(--surface-2);
		border-radius: 8px;
		padding: var(--s-3) var(--s-1);
		font-size: var(--t-2);
	}
	.stat span {
		color: var(--text-dim);
		font-size: var(--t-1);
		text-transform: uppercase;
	}
	.stat.statbalance {
		background: color-mix(in srgb, var(--primary) 14%, var(--surface-2));
	}
	.stat.statbalance strong {
		color: var(--primary);
	}
	h4 {
		margin: var(--s-5) 0 var(--s-3);
		font-size: var(--t-3);
	}
	.clist {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.clist li {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		flex-wrap: wrap;
		font-size: var(--t-3);
	}
	.cbox {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		min-width: 22px;
		min-height: 22px;
		border-radius: 50%;
		border: 2px solid var(--border);
		font-size: var(--t-2);
		font-weight: 700;
		color: var(--ok);
		padding: 0;
	}
	.cbox.btn {
		cursor: pointer;
	}
	.ctxt {
		flex: 1;
		min-width: 0;
	}
	.ctxt.done {
		text-decoration: line-through;
		color: var(--text-dim);
	}
	.dot {
		font-size: var(--t-1);
		background: var(--surface-2);
		border-radius: 999px;
		padding: 0.05rem var(--s-3);
	}
	.chip {
		font-size: var(--t-1);
		padding: 0.02rem var(--s-3);
		border-radius: 999px;
		background: color-mix(in srgb, var(--c) 20%, transparent);
		color: var(--c);
	}
	.foot {
		margin-top: var(--s-6);
		justify-content: center;
	}
</style>
