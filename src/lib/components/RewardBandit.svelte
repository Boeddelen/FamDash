<script lang="ts">
	import { getI18n, localeTag } from '$lib/i18n';
	import { api } from '$lib/api';
	import { apiAdmin } from '$lib/adminGate';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/toast';
	import { page } from '$app/state';
	import Avatar from './Avatar.svelte';
	import { DURATION_UNITS, expiryLabel, formatDuration, type DurationUnit } from '$lib/duration';
	import type { PointsSummary } from '$lib/server/chores/points';
	import type { TagRef } from '$lib/server/tags';

	type M = { id: string; name: string; emoji: string; color: string; role: string; hasAvatar?: boolean };
	type RewardT = {
		id: string;
		title: string;
		pointsCost: number;
		emoji: string;
		weight: number;
		durationValue: number | null;
		durationUnit: string | null;
		active: boolean;
		tags: TagRef[];
	};
	type Redemption = {
		id: string;
		title: string;
		pointsCost: number;
		note: string | null;
		expiresAt: number | null;
		redeemedAt: number;
		memberName: string;
		memberEmoji: string;
	};

	let {
		members,
		rewards,
		points,
		recentRedemptions,
		allTags
	}: {
		members: M[];
		rewards: RewardT[];
		points: Record<string, PointsSummary>;
		recentRedemptions: Redemption[];
		allTags: TagRef[];
	} = $props();

	const { t, locale } = getI18n();
	const isAdmin = $derived(!!page.data.admin);

	function fmtDate(ts: number) {
		return new Date(ts * 1000).toLocaleDateString(localeTag(locale), { day: 'numeric', month: 'short' });
	}

	// --- catalog management (admin) ---
	let showForm = $state(false);
	let editing = $state<string | null>(null);
	let form = $state({
		title: '',
		pointsCost: 10,
		emoji: '🎁',
		weight: 1,
		durationValue: 1,
		durationUnit: null as DurationUnit | null,
		active: true,
		tagIds: [] as string[]
	});

	function startNew() {
		form = {
			title: '',
			pointsCost: 10,
			emoji: '🎁',
			weight: 1,
			durationValue: 1,
			durationUnit: null,
			active: true,
			tagIds: []
		};
		editing = null;
		showForm = true;
	}
	function startEdit(r: RewardT) {
		form = {
			title: r.title,
			pointsCost: r.pointsCost,
			emoji: r.emoji,
			weight: r.weight,
			durationValue: r.durationValue ?? 1,
			durationUnit: r.durationUnit as DurationUnit | null,
			active: r.active,
			tagIds: r.tags.map((tg) => tg.id)
		};
		editing = r.id;
		showForm = true;
	}
	function toggleFormTag(id: string) {
		form.tagIds = form.tagIds.includes(id) ? form.tagIds.filter((x) => x !== id) : [...form.tagIds, id];
	}
	async function saveReward() {
		if (!form.title.trim() || form.pointsCost < 1) return;
		// "No duration" (unit = null) always sends a null value too, regardless of
		// whatever number is still sitting in the (disabled) input.
		const payload = { ...form, durationValue: form.durationUnit ? Math.max(1, form.durationValue) : null };
		try {
			if (editing) {
				await apiAdmin(`/api/rewards/${editing}`, { method: 'PATCH', body: JSON.stringify(payload) });
			} else {
				await apiAdmin('/api/rewards', { method: 'POST', body: JSON.stringify(payload) });
			}
			showForm = false;
			await invalidateAll();
			toast(t('common.saved'), 'ok');
		} catch {
			/* handled */
		}
	}
	async function delReward(id: string) {
		if (!confirm(t('chores.rewards.deleteConfirm'))) return;
		try {
			await apiAdmin(`/api/rewards/${id}`, { method: 'DELETE' });
			await invalidateAll();
		} catch {
			/* handled */
		}
	}

	// --- manual redemption (pick a specific reward rather than spinning for one) ---
	let redeemFor = $state<Record<string, string>>({});

	// A reward tagged with a member's name (e.g. "Robin") pre-selects that member as
	// who it's for — a lightweight way to "connect" a reward to the right person using
	// the same free-form tags used everywhere else, without hard-restricting who can
	// actually redeem it. Never overwrites a choice the person already made.
	// `.pre` matters here: it runs before the DOM (and the <select>'s own bind:value)
	// updates, so a freshly-added reward's <select> mounts with this default already
	// in place — a plain `$effect` runs after, by which point the browser has already
	// synced its native "first option" default back into `redeemFor`, and this would
	// never win.
	$effect.pre(() => {
		for (const r of rewards) {
			if (redeemFor[r.id] !== undefined) continue;
			const match = members.find((m) =>
				r.tags.some((tg) => tg.label.trim().toLowerCase() === m.name.trim().toLowerCase())
			);
			const fallback = match?.id ?? members[0]?.id;
			if (fallback) redeemFor[r.id] = fallback;
		}
	});

	async function redeem(reward: RewardT) {
		const memberId = redeemFor[reward.id] ?? members[0]?.id;
		if (!memberId) return;
		try {
			await api(`/api/rewards/${reward.id}/redeem`, {
				method: 'POST',
				body: JSON.stringify({ memberId })
			});
			await invalidateAll();
			toast(t('common.saved'), 'ok');
		} catch {
			/* handled — api() already toasts errors, e.g. "not enough points" */
		}
	}

	// --- the bandit itself ---
	const ITEM_H = 72;
	const CENTER_ROW = 1; // 3 visible rows; index 1 is the one behind the pointer marker
	const LOOPS = 6; // how many full copies of the pool make up the spin strip
	const LAND_LOOP = 4; // which copy (0-based) the reel lands inside — leaves spin-up + wind-down room

	let forMember = $state<string | undefined>(undefined);
	// Defaults to the first child so the common case needs no extra tap; `.pre` so it
	// wins over the <select>'s own "first option" default.
	$effect.pre(() => {
		if (forMember !== undefined) return;
		const fallback = members.find((m) => m.role === 'child')?.id ?? members[0]?.id;
		if (fallback) forMember = fallback;
	});

	const activeRewards = $derived(rewards.filter((r) => r.active));
	const balance = $derived(forMember ? (points[forMember]?.balance ?? 0) : 0);
	// Only rewards this specific child can actually afford right now go in the pool —
	// points are never summed or borrowed across members, so the pool is recomputed
	// per selected child, not once for the whole catalog.
	const pool = $derived(activeRewards.filter((r) => r.pointsCost <= balance));
	const strip = $derived.by(() => {
		const out: RewardT[] = [];
		for (let i = 0; i < LOOPS; i++) out.push(...pool);
		return out;
	});

	let note = $state('');
	let spinning = $state(false);
	let translateY = $state(0);
	let transitionMs = $state(0);
	let result = $state<{
		title: string;
		emoji: string;
		pointsCost: number;
		expiresAt: number | null;
		balance: number;
		member: M;
	} | null>(null);

	async function pull() {
		if (spinning || pool.length === 0 || !forMember) return;
		const member = members.find((m) => m.id === forMember);
		if (!member) return;
		spinning = true;
		result = null;
		try {
			const res = await api<{
				redemption: { title: string; expiresAt: number | null };
				rewardId: string;
				balance: number;
			}>('/api/rewards/draw', {
				method: 'POST',
				body: JSON.stringify({ memberId: forMember, note: note.trim() || undefined })
			});
			const landIdx = Math.max(0, pool.findIndex((r) => r.id === res.rewardId));
			const targetIndex = LAND_LOOP * pool.length + landIdx;
			const won = pool[landIdx];

			transitionMs = 0;
			translateY = 0;
			// Two rAFs: the first lets the browser paint the instant reset above, the
			// second then starts the animated transition — collapsing them into one
			// frame would let the browser skip straight to the end state.
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					transitionMs = 2200;
					translateY = -(targetIndex - CENTER_ROW) * ITEM_H;
				})
			);
			setTimeout(() => {
				spinning = false;
				result = {
					title: res.redemption.title,
					emoji: won?.emoji ?? '🎁',
					pointsCost: won?.pointsCost ?? 0,
					expiresAt: res.redemption.expiresAt,
					balance: res.balance,
					member
				};
				note = '';
				invalidateAll();
			}, 2300);
		} catch {
			spinning = false;
		}
	}

	/**
	 * Roll a redemption back: the points go straight back into the bank ("saldo"),
	 * spendable again right away. Admin-only — spending is open to everyone (the
	 * balance check is what guards it), but un-spending is a parent's call. Nothing
	 * stores a running total, so deleting the row *is* the refund; see
	 * chores/points.ts, where balance = earned − sum(redemptions).
	 */
	async function rollBack(r: Redemption) {
		if (!confirm(t('rewards.rollBackConfirm', { title: r.title, points: r.pointsCost }))) return;
		try {
			await apiAdmin(`/api/reward-redemptions/${r.id}`, { method: 'DELETE' });
			// The result banner still quotes the old post-redemption balance — now wrong.
			result = null;
			await invalidateAll();
			toast(t('rewards.rolledBack', { points: r.pointsCost }), 'ok');
		} catch {
			/* handled */
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && showForm && (showForm = false)} />

<section class="card bandit reward">
	<div class="row spread">
		<h3>🎁 {t('rewards.bandit.title')}</h3>
		{#if isAdmin}
			<button
				class="btn-add"
				onclick={startNew}
				aria-label={t('chores.rewards.new')}
				title={t('chores.rewards.new')}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
					<path
						d="M12 5v14M5 12h14"
						stroke="currentColor"
						stroke-width="2.6"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		{/if}
	</div>

	{#if activeRewards.length === 0}
		<p class="muted">{t('chores.rewards.none')}</p>
	{:else}
		<div class="machine">
			{#if pool.length === 0}
				<p class="muted">{t('rewards.bandit.tooFew', { balance })}</p>
			{:else}
				<div class="reel-window" style="height:{ITEM_H * 3}px">
					<div
						class="strip"
						style="transform:translateY({translateY}px); transition:transform {transitionMs}ms cubic-bezier(0.1,0.7,0.15,1)"
					>
						{#each strip as r, i (i)}
							<div class="reel-item" style="height:{ITEM_H}px">
								<span class="remoji">{r.emoji}</span>
								<span class="rtitle">{r.title}</span>
								<span class="rcost muted">{r.pointsCost}p</span>
							</div>
						{/each}
					</div>
					<div class="pointer" style="height:{ITEM_H}px; top:{ITEM_H}px" aria-hidden="true"></div>
				</div>
			{/if}

			<div class="controls">
				<div class="field">
					<label for="rfmember">{t('consequences.for')}</label>
					<select id="rfmember" bind:value={forMember} disabled={spinning}>
						{#each members as m}<option value={m.id}>{m.emoji} {m.name}</option>{/each}
					</select>
				</div>
				<div class="field">
					<label for="rfnote">{t('consequences.note')}</label>
					<input id="rfnote" bind:value={note} disabled={spinning} placeholder={t('rewards.notePlaceholder')} />
				</div>
				<button class="btn-primary lever" onclick={pull} disabled={spinning || !forMember || pool.length === 0}>
					🎰 {spinning ? t('consequences.spinning') : t('rewards.bandit.pull')}
				</button>
			</div>
		</div>

		{#if result}
			<div class="result">
				<Avatar member={result.member} size={30} />
				<strong>{result.member.name}</strong>
				<span class="rarrow">→</span>
				<span class="remoji">{result.emoji}</span>
				<strong>{result.title}</strong>
				<span class="muted">−{result.pointsCost}p · {t('chores.points.balance')} {result.balance}p</span>
				{#if result.expiresAt}
					<span class="muted">· {expiryLabel(result.expiresAt, t, localeTag(locale))}</span>
				{/if}
			</div>
		{/if}
	{/if}

	{#if rewards.length > 0}
		<h4>{t('rewards.catalog')}</h4>
		<ul class="catalog">
			{#each rewards as r (r.id)}
				<li class:inactive={!r.active}>
					<span class="remoji">{r.emoji}</span>
					<span class="cmain">
						<strong>{r.title}</strong>
						<span class="meta muted">
							{r.pointsCost}p
							{#if r.weight !== 1}· {t('consequences.weight')} {r.weight}{/if}
							{#if r.durationValue && r.durationUnit}
								· {formatDuration(r.durationValue, r.durationUnit as DurationUnit, t)}
							{/if}
							{#if !r.active}· {t('consequences.paused')}{/if}
						</span>
						{#if r.tags.length}
							<span class="ctags">
								{#each r.tags as tg (tg.id)}<span class="chip" style="--c:{tg.color}">{tg.label}</span>{/each}
							</span>
						{/if}
					</span>
					<select bind:value={redeemFor[r.id]} aria-label={t('chores.rewards.redeemedFor')}>
						{#each members as m}<option value={m.id}>{m.emoji} {m.name}</option>{/each}
					</select>
					<button class="btn-ghost" onclick={() => redeem(r)}>{t('chores.rewards.redeem')}</button>
					{#if isAdmin}
						<button class="btn-ghost" onclick={() => startEdit(r)}>{t('common.edit')}</button>
						<button class="btn-ghost" onclick={() => delReward(r.id)}>🗑</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if recentRedemptions.length > 0}
		<h4>{t('chores.rewards.recent')}</h4>
		<ul class="recent muted">
			{#each recentRedemptions as r (r.id)}
				<li>
					<span class="rtext">
						{r.memberEmoji} {r.memberName} — {r.title} ({r.pointsCost}p)
						{#if r.note}<span class="dnote">"{r.note}"</span>{/if}
						· {fmtDate(r.redeemedAt)}
						{#if r.expiresAt}· {expiryLabel(r.expiresAt, t, localeTag(locale))}{/if}
					</span>
					{#if isAdmin}
						<!-- The glyph is the whole button, so the accessible name has to be
						     spelled out rather than left as "↩". -->
						<button
							class="undo"
							onclick={() => rollBack(r)}
							aria-label={t('rewards.rollBack')}
							title={t('rewards.rollBack')}>↩</button
						>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

{#if showForm}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="backdrop" role="presentation" onclick={() => (showForm = false)}>
		<div class="card modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
			<h3>{editing ? t('chores.rewards.editReward') : t('chores.rewards.new')}</h3>
			<div class="row formrow">
				<div class="field emojifield">
					<label for="remoji">Emoji</label>
					<input id="remoji" bind:value={form.emoji} />
				</div>
				<div class="field grow">
					<label for="rname">{t('chores.rewards.name')}</label>
					<input id="rname" bind:value={form.title} />
				</div>
			</div>
			<div class="field">
				<label for="rcost">{t('chores.rewards.cost')}</label>
				<input id="rcost" type="number" min="1" max="100000" bind:value={form.pointsCost} />
			</div>
			<div class="field">
				<label for="rweight">{t('consequences.weight')}</label>
				<input id="rweight" type="number" min="1" max="100" bind:value={form.weight} />
				<p class="small muted">{t('rewards.bandit.weightHint')}</p>
			</div>
			<div class="field">
				<label for="rdurunit">{t('duration.label')}</label>
				<div class="row durationrow">
					<input
						id="rdurvalue"
						type="number"
						min="1"
						max="1000"
						bind:value={form.durationValue}
						disabled={!form.durationUnit}
						aria-label={t('duration.label')}
					/>
					<select id="rdurunit" bind:value={form.durationUnit}>
						<option value={null}>{t('duration.none')}</option>
						{#each DURATION_UNITS as u}<option value={u}>{t(`duration.unit.${u}`)}</option>{/each}
					</select>
				</div>
				<p class="small muted">{t('duration.hint')}</p>
			</div>
			{#if allTags.length}
				<div class="field">
					<label>{t('chores.field.tags')}</label>
					<div class="tagpicker">
						{#each allTags as tg (tg.id)}
							<button
								type="button"
								class="tagopt"
								class:on={form.tagIds.includes(tg.id)}
								style="--c:{tg.color}"
								onclick={() => toggleFormTag(tg.id)}
							>
								{tg.label}
							</button>
						{/each}
					</div>
					<p class="muted small">{t('chores.rewards.tagHint')}</p>
				</div>
			{/if}
			<label class="inline"><input type="checkbox" bind:checked={form.active} /> {t('consequences.active')}</label>
			<div class="row spread" style="margin-top:1rem">
				<button class="btn-ghost" onclick={() => (showForm = false)}>{t('common.cancel')}</button>
				<button class="btn-primary" onclick={saveReward}>{t('common.save')}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Anatomy is deliberately identical to ConsequenceBandit — only --accent and the
	   emoji differ, so the two read as twins you can still tell apart at a glance. */
	.bandit {
		container-type: inline-size;
		border-top: 4px solid var(--accent);
	}
	.reward {
		--accent: var(--ok);
	}
	.machine {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
		max-width: 420px;
	}
	.reel-window {
		position: relative;
		overflow: hidden;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--border);
	}
	.strip {
		display: flex;
		flex-direction: column;
	}
	.reel-item {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: 0 var(--s-5);
		font-weight: 600;
		white-space: nowrap;
	}
	.reel-item .rtitle {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rcost {
		font-weight: 400;
		font-size: var(--t-2);
	}
	.pointer {
		position: absolute;
		left: 0;
		right: 0;
		border-top: 2px solid var(--accent);
		border-bottom: 2px solid var(--accent);
		pointer-events: none;
	}
	.controls {
		display: flex;
		align-items: flex-end;
		gap: var(--s-4);
		flex-wrap: wrap;
	}
	.controls .field {
		margin-bottom: 0;
		flex: 1 1 9rem;
		min-width: 0;
	}
	.lever {
		min-height: 44px;
		white-space: nowrap;
		background: var(--accent);
		border-color: transparent;
	}
	.result {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		flex-wrap: wrap;
		margin-top: var(--s-4);
		padding: var(--s-4) var(--s-5);
		border-radius: 10px;
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}
	.rarrow {
		color: var(--text-dim);
	}
	.catalog {
		list-style: none;
		margin: 0 0 var(--s-5);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.catalog li {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		flex-wrap: wrap;
		padding-bottom: var(--s-3);
		border-bottom: 1px solid var(--border);
	}
	.catalog li.inactive {
		opacity: 0.55;
	}
	.catalog select {
		width: auto;
		min-height: 38px;
		padding: var(--s-1) var(--s-3);
	}
	.cmain {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 100px;
	}
	.meta {
		font-size: var(--t-2);
	}
	.ctags {
		display: flex;
		gap: var(--s-2);
		flex-wrap: wrap;
		margin-top: var(--s-1);
	}
	.chip {
		font-size: var(--t-1);
		padding: 0.05rem var(--s-3);
		border-radius: 999px;
		background: color-mix(in srgb, var(--c) 20%, transparent);
		color: var(--c);
		border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
	}
	.remoji {
		font-size: var(--t-5);
	}
	.recent {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: var(--t-2);
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
	}
	.recent li {
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}
	.rtext {
		min-width: 0;
		flex: 1;
	}
	/* Admin-only "roll this back" — deliberately small and quiet: it undoes history,
	   so it shouldn't compete with the lever for a child's attention. */
	.undo {
		flex: 0 0 auto;
		min-width: 36px;
		min-height: 36px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface-2);
		color: var(--text);
	}
	.dnote {
		font-style: italic;
	}
	.small {
		font-size: var(--t-2);
		margin: var(--s-2) 0 0;
	}
	.tagpicker {
		display: flex;
		gap: var(--s-2);
		flex-wrap: wrap;
	}
	.tagopt {
		min-height: 40px;
		padding: var(--s-1) var(--s-4);
		border-radius: 999px;
		font-size: var(--t-2);
		border: 1px solid color-mix(in srgb, var(--c) 45%, var(--border));
		background: var(--surface);
		color: var(--c);
	}
	.tagopt.on {
		background: var(--c);
		color: #fff;
		border-color: var(--c);
	}
	.formrow {
		flex-wrap: wrap;
	}
	.formrow .emojifield {
		flex: 0 0 4.5rem;
	}
	.formrow .grow {
		flex: 1 1 9rem;
		min-width: 0;
	}
	.durationrow {
		display: flex;
		gap: var(--s-3);
	}
	.durationrow input {
		flex: 0 0 5rem;
		min-width: 0;
	}
	.durationrow select {
		flex: 1;
		min-width: 0;
	}
	.inline {
		display: inline-flex;
		gap: var(--s-3);
		align-items: center;
		min-height: 44px;
		margin: var(--s-1) 0 0;
	}
	.inline input {
		min-height: auto;
	}
	/* .backdrop / .modal come from app.css */
	.modal {
		max-width: 380px;
	}
	@container (max-width: 26rem) {
		.controls {
			flex-direction: column;
			align-items: stretch;
		}
		/* flex-basis is axis-relative: once .controls flips to a column, the 9rem
		   basis from .controls .field above would apply to height instead of width,
		   stretching each field to a fixed 144px tall. Reset it here. */
		.controls .field {
			flex-basis: auto;
		}
		.lever {
			width: 100%;
		}
	}
	@media (pointer: coarse) {
		.tagopt,
		.undo {
			min-height: 44px;
		}
	}
</style>
