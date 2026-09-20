<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { apiAdmin } from '$lib/adminGate';
	import { toast } from '$lib/toast';
	import { getI18n } from '$lib/i18n';
	import { page } from '$app/state';
	import { CHORE_CATEGORIES, categoryEmoji, type ChoreCategory } from '$lib/categories';
	import ChoreDeck from './ChoreDeck.svelte';
	import Leaderboard from './Leaderboard.svelte';
	import type { AgendaChore } from '$lib/server/agenda';
	import type { TagRef } from '$lib/server/tags';

	type Member = { id: string; name: string; emoji: string; color: string; role: string; hasAvatar?: boolean };
	type ChoreDef = {
		id: string;
		title: string;
		notes: string | null;
		assignedMemberId: string | null;
		recurrence: string;
		weekdayMask: number;
		startDate: string | null;
		time: string | null;
		category: string | null;
		checklist: string[] | null;
		points: number;
		active: boolean;
		tags: TagRef[];
	};

	let {
		data
	}: {
		data: {
			choreDefs: ChoreDef[];
			members: Member[];
			weekInstances: AgendaChore[];
			today: string;
			leaderboard: {
				member: Member;
				points: number;
				done: number;
				total: number;
				streak: number;
			}[];
			allTags: TagRef[];
		};
	} = $props();
	const { t } = getI18n();
	// Standard users (not currently elevated as admin) can only tick chores off —
	// they get no access to creating, editing (including the time) or deleting chores.
	const isAdmin = $derived(!!page.data.admin);

	const WD_NB = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];

	// Build one deck per child, adults only if they have chores, plus "Anyone".
	const decks = $derived.by(() => {
		const byMember = new Map<string, AgendaChore[]>();
		for (const c of data.weekInstances) {
			const k = c.memberId ?? '_any';
			if (!byMember.has(k)) byMember.set(k, []);
			byMember.get(k)!.push(c);
		}
		const out: { member: Member | null; chores: AgendaChore[] }[] = [];
		for (const m of data.members) {
			const list = byMember.get(m.id) ?? [];
			if (m.role === 'child' || list.length) out.push({ member: m, chores: list });
		}
		if (byMember.has('_any')) out.push({ member: null, chores: byMember.get('_any')! });
		return out;
	});

	// ---- admin management ----
	let showForm = $state(false);
	let editing = $state<string | null>(null);
	type Form = {
		title: string;
		notes: string;
		assignedMemberId: string | null;
		recurrence: 'none' | 'daily' | 'weekly' | 'weekdays' | 'custom';
		weekdayMask: number;
		startDate: string;
		time: string;
		category: ChoreCategory | '';
		checklistText: string;
		points: number;
		active: boolean;
		tagIds: string[];
	};
	let form = $state<Form>(blank());
	function blank(): Form {
		return {
			title: '',
			notes: '',
			assignedMemberId: null,
			recurrence: 'weekly',
			weekdayMask: 0,
			startDate: '',
			time: '',
			category: '',
			checklistText: '',
			points: 1,
			active: true,
			tagIds: []
		};
	}
	function startNew() {
		form = blank();
		editing = null;
		showForm = true;
	}
	function startEdit(c: ChoreDef) {
		form = {
			title: c.title,
			notes: c.notes ?? '',
			assignedMemberId: c.assignedMemberId,
			recurrence: c.recurrence as Form['recurrence'],
			weekdayMask: c.weekdayMask,
			startDate: c.startDate ?? '',
			time: c.time ?? '',
			category: (c.category as ChoreCategory) ?? '',
			checklistText: c.checklist?.join('\n') ?? '',
			points: c.points,
			active: c.active,
			tagIds: c.tags.map((tg) => tg.id)
		};
		editing = c.id;
		showForm = true;
	}
	function toggleTag(id: string) {
		form.tagIds = form.tagIds.includes(id) ? form.tagIds.filter((x) => x !== id) : [...form.tagIds, id];
	}
	function toggleDay(bit: number) {
		form.weekdayMask ^= 1 << bit;
	}
	async function save() {
		if (!form.title.trim()) return;
		const checklist = form.checklistText
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean);
		const payload = {
			...form,
			notes: form.notes || null,
			startDate: form.startDate || null,
			time: form.time || null,
			category: form.category || null,
			checklist: checklist.length ? checklist : null
		};
		try {
			if (editing) {
				await apiAdmin(`/api/chores/${editing}`, { method: 'PATCH', body: JSON.stringify(payload) });
			} else {
				await apiAdmin('/api/chores', { method: 'POST', body: JSON.stringify(payload) });
			}
			showForm = false;
			await invalidateAll();
			toast(t('common.saved'), 'ok');
		} catch {
			/* toast handled */
		}
	}
	async function del(id: string) {
		if (!confirm(t('chores.deleteConfirm'))) return;
		try {
			await apiAdmin(`/api/chores/${id}`, { method: 'DELETE' });
			await invalidateAll();
		} catch {
			/* handled */
		}
	}
	function recurrenceText(c: ChoreDef): string {
		if (c.recurrence === 'none') return c.startDate ?? t('chores.rep.none');
		if (c.recurrence === 'daily') return t('chores.rep.daily');
		if (c.recurrence === 'weekdays') return t('chores.rep.weekdays');
		const days = WD_NB.filter((_, i) => c.weekdayMask & (1 << i));
		return days.length ? days.join(', ') : t('chores.rep.weekly');
	}

	// ---- search/filter for the admin list (handy once there are a lot of chores) ----
	let query = $state('');
	const filteredDefs = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.choreDefs;
		return data.choreDefs.filter(
			(c) =>
				c.title.toLowerCase().includes(q) ||
				data.members.find((m) => m.id === c.assignedMemberId)?.name.toLowerCase().includes(q) ||
				c.tags.some((tg) => tg.label.toLowerCase().includes(q))
		);
	});
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && showForm && (showForm = false)} />

<!-- No heading of its own: the tab bar above already says which tab this is, and a
     second "Plikter" under it just eats the screen the decks want. -->
{#if isAdmin}
	<div class="row head">
		<button class="btn-primary" onclick={startNew}>+ {t('chores.new')}</button>
	</div>
{/if}

<div class="decks">
	{#each decks as d (d.member?.id ?? '_any')}
		<ChoreDeck member={d.member} chores={d.chores} today={data.today} />
	{/each}
	{#if decks.length === 0}
		<p class="muted">{t('chores.none')}</p>
	{/if}
</div>

<Leaderboard entries={data.leaderboard} />

<section class="card defs">
	<div class="row spread defs-head">
		<h3>{t('chores.allChores')}</h3>
		{#if data.choreDefs.length > 4}
			<input class="search" placeholder={t('chores.search')} bind:value={query} />
		{/if}
	</div>
	{#if data.choreDefs.length === 0}<p class="muted">{t('chores.none')}</p>{/if}
	<ul class="deflist">
		{#each filteredDefs as c (c.id)}
			<li class:inactive={!c.active}>
				<div class="d-main">
					<strong>{categoryEmoji(c.category)} {c.title}</strong>
					<span class="muted">
						· {recurrenceText(c)}
						{#if c.time} · 🕒 {c.time}{/if}
						{#if c.checklist?.length} · ☑️ {c.checklist.length}{/if}
						· {data.members.find((m) => m.id === c.assignedMemberId)?.name ?? t('chores.anyone')}
						{#if c.points !== 1} · {c.points}p{/if}
						{#if !c.active} · {t('chores.paused')}{/if}
					</span>
					{#if c.tags.length}
						<span class="chips">
							{#each c.tags as tg (tg.id)}
								<span class="chip" style="--c:{tg.color}">{tg.label}</span>
							{/each}
						</span>
					{/if}
				</div>
				{#if isAdmin}
					<div class="row">
						<button class="btn-ghost" onclick={() => startEdit(c)}>{t('chores.edit')}</button>
						<button class="btn-ghost" onclick={() => del(c.id)}>🗑</button>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</section>

{#if showForm}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="backdrop" role="presentation" onclick={() => (showForm = false)}>
		<div class="card modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
			<h3>{editing ? t('chores.editChore') : t('chores.newChore')}</h3>
			<div class="field">
				<label for="ct">{t('chores.field.title')}</label>
				<input id="ct" bind:value={form.title} />
			</div>
			<div class="field">
				<label for="cn">{t('chores.field.notes')}</label>
				<input id="cn" bind:value={form.notes} />
			</div>
			<div class="row formrow">
				<div class="field grow">
					<label for="ca">{t('chores.field.assigned')}</label>
					<select id="ca" bind:value={form.assignedMemberId}>
						<option value={null}>{t('chores.anyone')}</option>
						{#each data.members as m}<option value={m.id}>{m.emoji} {m.name}</option>{/each}
					</select>
				</div>
				<div class="field narrow">
					<label for="cp">{t('chores.field.points')}</label>
					<input id="cp" type="number" min="0" max="100" bind:value={form.points} />
				</div>
			</div>
			<div class="field">
				<label for="ccat">{t('chores.field.category')}</label>
				<select id="ccat" bind:value={form.category}>
					<option value="">{t('chores.cat.none')}</option>
					{#each CHORE_CATEGORIES as cat}
						<option value={cat.key}>{cat.emoji} {t(`chores.cat.${cat.key}`)}</option>
					{/each}
				</select>
			</div>
			<div class="row formrow">
				<div class="field grow">
					<label for="cr">{t('chores.field.repeats')}</label>
					<select id="cr" bind:value={form.recurrence}>
						<option value="none">{t('chores.rep.none')}</option>
						<option value="daily">{t('chores.rep.daily')}</option>
						<option value="weekdays">{t('chores.rep.weekdays')}</option>
						<option value="weekly">{t('chores.rep.weekly')}</option>
					</select>
				</div>
				<div class="field narrow">
					<label for="ctm">{t('chores.field.time')}</label>
					<input id="ctm" type="time" bind:value={form.time} />
				</div>
			</div>
			{#if form.recurrence === 'weekly' || form.recurrence === 'custom'}
				<div class="days">
					{#each WD_NB as d, i}
						<button type="button" class:on={form.weekdayMask & (1 << i)} onclick={() => toggleDay(i)}>
							{d}
						</button>
					{/each}
				</div>
			{/if}
			{#if form.recurrence === 'none'}
				<div class="field">
					<label for="cd">{t('chores.field.date')}</label>
					<input id="cd" type="date" bind:value={form.startDate} />
				</div>
			{:else}
				<div class="field">
					<label for="cd2">{t('chores.field.startsFrom')}</label>
					<input id="cd2" type="date" bind:value={form.startDate} />
				</div>
			{/if}
			<div class="field">
				<label for="ccl">{t('chores.field.checklist')}</label>
				<textarea id="ccl" rows="3" bind:value={form.checklistText}></textarea>
			</div>
			{#if data.allTags.length}
				<div class="field">
					<label>{t('chores.field.tags')}</label>
					<div class="tagpicker">
						{#each data.allTags as tg (tg.id)}
							<button
								type="button"
								class="tagopt"
								class:on={form.tagIds.includes(tg.id)}
								style="--c:{tg.color}"
								onclick={() => toggleTag(tg.id)}
							>
								{tg.label}
							</button>
						{/each}
					</div>
				</div>
			{/if}
			<label class="inline"><input type="checkbox" bind:checked={form.active} /> {t('chores.field.active')}</label>
			<div class="row spread" style="margin-top:1rem">
				<button class="btn-ghost" onclick={() => (showForm = false)}>{t('chores.cancel')}</button>
				<button class="btn-primary" onclick={save}>{t('chores.save')}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.head {
		flex-wrap: wrap;
		gap: var(--s-4);
		justify-content: flex-end;
	}
	.decks {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr));
		gap: var(--s-6);
		margin: var(--s-5) 0 var(--s-7);
		align-items: start;
	}
	.defs {
		margin-top: var(--s-6);
	}
	.defs-head {
		flex-wrap: wrap;
		gap: var(--s-3);
		margin-bottom: var(--s-3);
	}
	.search {
		max-width: 220px;
		min-height: 38px;
		padding: var(--s-2) var(--s-4);
	}
	.deflist {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.deflist li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-3) 0;
		border-bottom: 1px solid var(--border);
		flex-wrap: wrap;
	}
	.deflist li.inactive {
		opacity: 0.55;
	}
	.chips {
		display: flex;
		gap: var(--s-2);
		flex-wrap: wrap;
		margin-top: var(--s-2);
	}
	.chip {
		font-size: var(--t-1);
		padding: 0.05rem var(--s-3);
		border-radius: 999px;
		background: color-mix(in srgb, var(--c) 20%, transparent);
		color: var(--c);
		border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
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
	/* .backdrop / .modal come from app.css */
	.modal {
		max-width: 440px;
	}
	/* Paired fields sit side by side when there's room and stack when there isn't. */
	.formrow {
		flex-wrap: wrap;
	}
	.formrow .grow {
		flex: 1 1 10rem;
		min-width: 0;
	}
	.formrow .narrow {
		flex: 0 1 7rem;
		min-width: 0;
	}
	.days {
		display: flex;
		gap: var(--s-2);
		margin-bottom: var(--s-5);
		flex-wrap: wrap;
	}
	.days button {
		min-height: 40px;
		padding: var(--s-2) var(--s-3);
		text-transform: capitalize;
	}
	.days button.on {
		background: var(--primary);
		color: #fff;
		border-color: transparent;
	}
	.inline {
		display: inline-flex;
		gap: var(--s-3);
		align-items: center;
		min-height: 44px;
		margin: 0;
	}
	.inline input {
		/* Sizing comes from app.css (22px box). */
		min-height: auto;
	}
	@media (pointer: coarse) {
		.days button,
		.tagopt {
			min-height: 44px;
		}
	}
</style>
