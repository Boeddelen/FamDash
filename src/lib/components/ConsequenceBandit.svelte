<script lang="ts">
	import { getI18n, localeTag } from '$lib/i18n';
	import { api } from '$lib/api';
	import { apiAdmin } from '$lib/adminGate';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/toast';
	import { page } from '$app/state';
	import Avatar from './Avatar.svelte';
	import { DURATION_UNITS, expiryLabel, formatDuration, type DurationUnit } from '$lib/duration';

	type M = { id: string; name: string; emoji: string; color: string; role: string };
	type ConsequenceT = {
		id: string;
		title: string;
		emoji: string;
		weight: number;
		durationValue: number | null;
		durationUnit: string | null;
		active: boolean;
	};
	type DrawT = {
		id: string;
		title: string;
		emoji: string;
		note: string | null;
		expiresAt: number | null;
		dealtAt: number;
		memberName: string;
		memberEmoji: string;
	};

	let {
		members,
		consequences,
		recentDraws
	}: {
		members: M[];
		consequences: ConsequenceT[];
		recentDraws: DrawT[];
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
		emoji: '⚡',
		weight: 1,
		durationValue: 1,
		durationUnit: null as DurationUnit | null,
		active: true
	});

	function startNew() {
		form = { title: '', emoji: '⚡', weight: 1, durationValue: 1, durationUnit: null, active: true };
		editing = null;
		showForm = true;
	}
	function startEdit(c: ConsequenceT) {
		form = {
			title: c.title,
			emoji: c.emoji,
			weight: c.weight,
			durationValue: c.durationValue ?? 1,
			durationUnit: c.durationUnit as DurationUnit | null,
			active: c.active
		};
		editing = c.id;
		showForm = true;
	}
	async function saveConsequence() {
		if (!form.title.trim()) return;
		// "No duration" (unit = null) always sends a null value too, regardless of
		// whatever number is still sitting in the (disabled) input.
		const payload = { ...form, durationValue: form.durationUnit ? Math.max(1, form.durationValue) : null };
		try {
			if (editing) {
				await apiAdmin(`/api/consequences/${editing}`, { method: 'PATCH', body: JSON.stringify(payload) });
			} else {
				await apiAdmin('/api/consequences', { method: 'POST', body: JSON.stringify(payload) });
			}
			showForm = false;
			await invalidateAll();
			toast(t('common.saved'), 'ok');
		} catch {
			/* handled */
		}
	}
	async function delConsequence(id: string) {
		if (!confirm(t('consequences.deleteConfirm'))) return;
		try {
			await apiAdmin(`/api/consequences/${id}`, { method: 'DELETE' });
			await invalidateAll();
		} catch {
			/* handled */
		}
	}

	// --- the bandit itself ---
	const ITEM_H = 72;
	const CENTER_ROW = 1; // 3 visible rows; index 1 is the one behind the pointer marker
	const LOOPS = 6; // how many full copies of the pool make up the spin strip
	const LAND_LOOP = 4; // which copy (0-based) the reel lands inside — leaves spin-up + wind-down room

	const pool = $derived(consequences.filter((c) => c.active));
	const strip = $derived.by(() => {
		const out: ConsequenceT[] = [];
		for (let i = 0; i < LOOPS; i++) out.push(...pool);
		return out;
	});

	let forMember = $state<string | undefined>(undefined);
	// Defaults to the first child so the common case (dealing with a kid) needs no
	// extra tap; `.pre` so it wins over the <select>'s own "first option" default —
	// same race as RewardBandit's redeem-for picker.
	$effect.pre(() => {
		if (forMember !== undefined) return;
		const fallback = members.find((m) => m.role === 'child')?.id ?? members[0]?.id;
		if (fallback) forMember = fallback;
	});

	let note = $state('');
	let spinning = $state(false);
	let translateY = $state(0);
	let transitionMs = $state(0);
	let result = $state<{ title: string; emoji: string; expiresAt: number | null; member: M } | null>(null);

	async function pull() {
		if (spinning || pool.length === 0 || !forMember) return;
		const member = members.find((m) => m.id === forMember);
		if (!member) return;
		spinning = true;
		result = null;
		try {
			const res = await api<{
				draw: { title: string; emoji: string; expiresAt: number | null };
				consequenceId: string;
			}>('/api/consequences/draw', {
				method: 'POST',
				body: JSON.stringify({ memberId: forMember, note: note.trim() || undefined })
			});
			const landIdx = Math.max(0, pool.findIndex((c) => c.id === res.consequenceId));
			const targetIndex = LAND_LOOP * pool.length + landIdx;

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
				result = { title: res.draw.title, emoji: res.draw.emoji, expiresAt: res.draw.expiresAt, member };
				note = '';
				invalidateAll();
			}, 2300);
		} catch {
			spinning = false;
		}
	}

	/**
	 * Undo a dealt consequence — the twin of rolling a reward redemption back, and
	 * admin-only for the same reason: the lever is open to everyone, rewriting what it
	 * did isn't. No points are involved on this side; the row just stops existing.
	 */
	async function rollBack(d: DrawT) {
		if (!confirm(t('consequences.rollBackConfirm', { title: d.title }))) return;
		try {
			await apiAdmin(`/api/consequence-draws/${d.id}`, { method: 'DELETE' });
			result = null;
			await invalidateAll();
			toast(t('consequences.rolledBack'), 'ok');
		} catch {
			/* handled */
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && showForm && (showForm = false)} />

<section class="card bandit consequence">
	<div class="row spread">
		<h3>⚡ {t('consequences.bandit.title')}</h3>
		{#if isAdmin}
			<button
				class="btn-add"
				onclick={startNew}
				aria-label={t('consequences.new')}
				title={t('consequences.new')}
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

	{#if pool.length === 0}
		<p class="muted">{t('consequences.none')}</p>
	{:else}
		<div class="machine">
			<div class="reel-window" style="height:{ITEM_H * 3}px">
				<div
					class="strip"
					style="transform:translateY({translateY}px); transition:transform {transitionMs}ms cubic-bezier(0.1,0.7,0.15,1)"
				>
					{#each strip as c, i (i)}
						<div class="reel-item" style="height:{ITEM_H}px">
							<span class="remoji">{c.emoji}</span>
							<span class="rtitle">{c.title}</span>
						</div>
					{/each}
				</div>
				<div class="pointer" style="height:{ITEM_H}px; top:{ITEM_H}px" aria-hidden="true"></div>
			</div>

			<div class="controls">
				<div class="field">
					<label for="cfmember">{t('consequences.for')}</label>
					<select id="cfmember" bind:value={forMember} disabled={spinning}>
						{#each members as m}<option value={m.id}>{m.emoji} {m.name}</option>{/each}
					</select>
				</div>
				<div class="field">
					<label for="cfnote">{t('consequences.note')}</label>
					<input id="cfnote" bind:value={note} disabled={spinning} placeholder={t('consequences.notePlaceholder')} />
				</div>
				<button class="btn-primary lever" onclick={pull} disabled={spinning || !forMember}>
					🎰 {spinning ? t('consequences.spinning') : t('consequences.pull')}
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
				{#if result.expiresAt}
					<span class="muted">· {expiryLabel(result.expiresAt, t, localeTag(locale))}</span>
				{/if}
			</div>
		{/if}
	{/if}

	{#if consequences.length > 0}
		<h4>{t('consequences.catalog')}</h4>
		<ul class="catalog">
			{#each consequences as c (c.id)}
				<li class:inactive={!c.active}>
					<span class="remoji">{c.emoji}</span>
					<span class="cmain">
						<strong>{c.title}</strong>
						<span class="meta muted">
							{#if c.weight !== 1}{t('consequences.weight')} {c.weight}{/if}
							{#if c.durationValue && c.durationUnit}
								{#if c.weight !== 1}· {/if}{formatDuration(c.durationValue, c.durationUnit as DurationUnit, t)}
							{/if}
							{#if !c.active}· {t('consequences.paused')}{/if}
						</span>
					</span>
					{#if isAdmin}
						<button class="btn-ghost" onclick={() => startEdit(c)}>{t('common.edit')}</button>
						<button class="btn-ghost" onclick={() => delConsequence(c.id)}>🗑</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if recentDraws.length > 0}
		<h4>{t('consequences.recent')}</h4>
		<ul class="recent muted">
			{#each recentDraws as d (d.id)}
				<li>
					<span class="rtext">
						{d.memberEmoji} {d.memberName} — {d.emoji} {d.title}
						{#if d.note}<span class="dnote">"{d.note}"</span>{/if}
						· {fmtDate(d.dealtAt)}
						{#if d.expiresAt}· {expiryLabel(d.expiresAt, t, localeTag(locale))}{/if}
					</span>
					{#if isAdmin}
						<!-- The glyph is the whole button, so the accessible name has to be
						     spelled out rather than left as "↩". -->
						<button
							class="undo"
							onclick={() => rollBack(d)}
							aria-label={t('consequences.rollBack')}
							title={t('consequences.rollBack')}>↩</button
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
			<h3>{editing ? t('consequences.editConsequence') : t('consequences.new')}</h3>
			<div class="row formrow">
				<div class="field emojifield">
					<label for="cemoji">Emoji</label>
					<input id="cemoji" bind:value={form.emoji} />
				</div>
				<div class="field grow">
					<label for="cname">{t('common.name')}</label>
					<input id="cname" bind:value={form.title} />
				</div>
			</div>
			<div class="field">
				<label for="cweight">{t('consequences.weight')}</label>
				<input id="cweight" type="number" min="1" max="100" bind:value={form.weight} />
				<p class="small muted">{t('consequences.weightHint')}</p>
			</div>
			<div class="field">
				<label for="cdurunit">{t('duration.label')}</label>
				<div class="row durationrow">
					<input
						id="cdurvalue"
						type="number"
						min="1"
						max="1000"
						bind:value={form.durationValue}
						disabled={!form.durationUnit}
						aria-label={t('duration.label')}
					/>
					<select id="cdurunit" bind:value={form.durationUnit}>
						<option value={null}>{t('duration.none')}</option>
						{#each DURATION_UNITS as u}<option value={u}>{t(`duration.unit.${u}`)}</option>{/each}
					</select>
				</div>
				<p class="small muted">{t('duration.hint')}</p>
			</div>
			<label class="inline"><input type="checkbox" bind:checked={form.active} /> {t('consequences.active')}</label>
			<div class="row spread" style="margin-top:1rem">
				<button class="btn-ghost" onclick={() => (showForm = false)}>{t('common.cancel')}</button>
				<button class="btn-primary" onclick={saveConsequence}>{t('common.save')}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Anatomy is deliberately identical to RewardBandit — only --accent and the emoji
	   differ, so the two read as twins you can still tell apart at a glance. */
	.bandit {
		container-type: inline-size;
		border-top: 4px solid var(--accent);
	}
	.consequence {
		--accent: var(--danger);
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
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.reel-item .rtitle {
		overflow: hidden;
		text-overflow: ellipsis;
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
	.cmain {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 100px;
	}
	.meta {
		font-size: var(--t-2);
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
	/* Admin-only "undo this" — the twin of RewardBandit's roll-back button, same size
	   and same quiet treatment. */
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
		.undo {
			min-height: 44px;
		}
	}
</style>
