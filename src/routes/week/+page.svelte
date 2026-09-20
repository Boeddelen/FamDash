<script lang="ts">
	import { api } from '$lib/api';
	import { invalidateAll, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { addDaysIso, fmtRange, spanDays } from '$lib/format';
	import { toast } from '$lib/toast';
	import { getI18n, localeTag } from '$lib/i18n';

	let { data } = $props();
	const { t, locale } = getI18n();
	const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions) => {
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(localeTag(locale), opts);
	};

	const operator = $derived(page.data.operator as { id: string; name: string } | null);
	let mineOnly = $state(false);
	let activeTags = $state<Set<string>>(new Set());

	function toggleTagFilter(id: string) {
		const next = new Set(activeTags);
		next.has(id) ? next.delete(id) : next.add(id);
		activeTags = next;
	}
	function matchesTagFilter(tags: { id: string }[]) {
		return activeTags.size === 0 || tags.some((tg) => activeTags.has(tg.id));
	}

	let draft = $state<Record<string, string>>({});
	let busy = $state(false);

	function plansFor(day: string) {
		return data.plans
			.filter((p) => p.date <= day && (p.endDate ?? p.date) >= day)
			.filter((p) => !mineOnly || !operator || p.members.some((m) => m.id === operator.id))
			.filter((p) => matchesTagFilter(p.tags));
	}
	function eventsFor(day: string) {
		return data.events.filter((e) => e.date === day || (e.endDate && e.date <= day && e.endDate >= day));
	}
	function choresFor(day: string) {
		return data.chores.filter((c) => c.dueDate === day).filter((c) => matchesTagFilter(c.tags));
	}

	// --- tag assignment popover for a single plan item ---
	let tagEditFor = $state<string | null>(null);
	let tagEditIds = $state<Set<string>>(new Set());
	function openTagEdit(p: (typeof data.plans)[number]) {
		tagEditFor = p.id;
		tagEditIds = new Set(p.tags.map((tg) => tg.id));
	}
	function toggleTagEdit(id: string) {
		const next = new Set(tagEditIds);
		next.has(id) ? next.delete(id) : next.add(id);
		tagEditIds = next;
	}
	async function saveTagEdit() {
		if (!tagEditFor) return;
		await api(`/api/plan-items/${tagEditFor}`, {
			method: 'PATCH',
			body: JSON.stringify({ tagIds: [...tagEditIds] }),
			quiet: true
		});
		tagEditFor = null;
		await invalidateAll();
	}

	async function add(day: string) {
		const title = (draft[day] ?? '').trim();
		if (!title) return;
		busy = true;
		try {
			await api('/api/plan-items', {
				method: 'POST',
				body: JSON.stringify({ title, date: day, memberIds: operator ? [operator.id] : [] }),
				quiet: true
			});
			draft[day] = '';
			await invalidateAll();
		} catch {
			toast('Could not add', 'error');
		} finally {
			busy = false;
		}
	}

	async function toggle(id: string, done: boolean) {
		await api(`/api/plan-items/${id}`, { method: 'PATCH', body: JSON.stringify({ done }), quiet: true });
		await invalidateAll();
	}
	async function remove(id: string) {
		await api(`/api/plan-items/${id}`, { method: 'DELETE', quiet: true });
		await invalidateAll();
	}
	async function removeSeries(seriesId: string) {
		if (!confirm(t('week.deleteSeriesConfirm'))) return;
		await api(`/api/plan-series/${seriesId}`, { method: 'DELETE', quiet: true });
		await invalidateAll();
	}
	/** Moving a multi-day item preserves its span length; a series occurrence detaches
	 *  server-side so it isn't regenerated back at its old slot. */
	async function move(p: (typeof data.plans)[number], date: string) {
		const patch: { date: string; endDate?: string } = { date };
		if (p.endDate) patch.endDate = addDaysIso(date, spanDays(p.date, p.endDate) - 1);
		await api(`/api/plan-items/${p.id}`, { method: 'PATCH', body: JSON.stringify(patch), quiet: true });
		await invalidateAll();
	}
	function go(delta: number) {
		goto(`/week?w=${data.offset + delta}`);
	}
	/** Back to the window that starts today. (`go(0)` would just reload the offset
	 *  you're already on, which is what this button used to do.) */
	function goToday() {
		goto('/week');
	}

	// --- richer "new notation" form: multi-day, timed, multi-member, recurring ---
	const WD_NB = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
	let showNewForm = $state(false);
	type NewForm = {
		title: string;
		date: string;
		endDate: string;
		allDay: boolean;
		time: string;
		memberIds: string[];
		tagIds: string[];
		recurrence: 'none' | 'daily' | 'weekly' | 'weekdays' | 'custom';
		weekdayMask: number;
	};
	function blankForm(): NewForm {
		return {
			title: '',
			date: data.today,
			endDate: '',
			allDay: true,
			time: '',
			memberIds: operator ? [operator.id] : [],
			tagIds: [],
			recurrence: 'none',
			weekdayMask: 0
		};
	}
	let newForm = $state<NewForm>(blankForm());
	function openNewForm(day?: string) {
		newForm = { ...blankForm(), date: day ?? data.today };
		showNewForm = true;
	}
	function toggleFormMember(id: string) {
		newForm.memberIds = newForm.memberIds.includes(id)
			? newForm.memberIds.filter((x) => x !== id)
			: [...newForm.memberIds, id];
	}
	function toggleFormTag(id: string) {
		newForm.tagIds = newForm.tagIds.includes(id) ? newForm.tagIds.filter((x) => x !== id) : [...newForm.tagIds, id];
	}
	function toggleFormDay(bit: number) {
		newForm.weekdayMask ^= 1 << bit;
	}
	async function createNotation() {
		if (!newForm.title.trim()) return;
		const span = newForm.endDate && newForm.endDate > newForm.date ? spanDays(newForm.date, newForm.endDate) : 1;
		const payload: Record<string, unknown> = {
			title: newForm.title,
			date: newForm.date,
			time: newForm.allDay ? null : newForm.time || null,
			memberIds: newForm.memberIds,
			tagIds: newForm.tagIds,
			recurrence: newForm.recurrence,
			weekdayMask: newForm.weekdayMask
		};
		if (newForm.recurrence === 'none') payload.endDate = span > 1 ? newForm.endDate : null;
		else payload.durationDays = span;

		try {
			await api('/api/plan-items', { method: 'POST', body: JSON.stringify(payload), quiet: true });
			showNewForm = false;
			await invalidateAll();
			toast(t('common.saved'), 'ok');
		} catch {
			toast('Could not add', 'error');
		}
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key !== 'Escape') return;
		if (showNewForm) showNewForm = false;
		else if (tagEditFor) tagEditFor = null;
	}}
/>

<div class="page-head spread">
	<div class="title">
		<h1>{t('week.title')}</h1>
		<span class="muted range">
			{fmtDate(data.days[0], { day: 'numeric', month: 'short' })} – {fmtDate(data.days[6], {
				day: 'numeric',
				month: 'short'
			})}
		</span>
	</div>
	<div class="row">
		<label class="inline"><input type="checkbox" bind:checked={mineOnly} disabled={!operator} /> {t('week.mineOnly')}</label>
		<button class="btn-primary" onclick={() => openNewForm()}>+ {t('week.newNotation')}</button>
		<button onclick={() => go(-1)}>←</button>
		<button onclick={goToday} disabled={data.offset === 0}>{t('week.jumpToday')}</button>
		<button onclick={() => go(1)}>→</button>
	</div>
</div>

{#if data.allTags.length}
	<div class="tagfilter" role="group" aria-label={t('tags.filter')}>
		{#each data.allTags as tg (tg.id)}
			<button
				type="button"
				class="tagopt"
				class:on={activeTags.has(tg.id)}
				style="--c:{tg.color}"
				onclick={() => toggleTagFilter(tg.id)}
			>
				{tg.label}
			</button>
		{/each}
	</div>
{/if}

<div class="week">
	{#each data.days as day (day)}
		<div class="day card" class:today={day === data.today} data-date={day}>
			<div class="dayhead">
				{fmtDate(day, { weekday: 'short', day: 'numeric' })}
				{#if day === data.today}<span class="todaypill">{t('dash.today')}</span>{/if}
			</div>

			{#each eventsFor(day) as e}
				<div class="ev" style="--c:{e.color}" title={e.title}>
					<span>{e.title}</span>
					<small class="muted">{fmtRange(e.start, e.end, e.allDay)}</small>
				</div>
			{/each}

			{#each choresFor(day) as c}
				<div class="chore" class:done={c.status === 'done'}>
					🧹 {#if c.time}{c.time} {/if}{c.title}{c.memberEmoji ? ` ${c.memberEmoji}` : ''}
					{#each c.tags as tg (tg.id)}<span class="chip" style="--c:{tg.color}">{tg.label}</span>{/each}
				</div>
			{/each}

			{#each plansFor(day) as p (p.id)}
				<div class="item" class:done={p.done}>
					<button class="chk" onclick={() => toggle(p.id, !p.done)}>{p.done ? '✅' : '⬜'}</button>
					{#each p.members as m (m.id)}
						<span class="mdot" style="background:{m.color}" title={m.name}></span>
					{/each}
					<span class="txt">
						{#if p.time}<span class="muted">{p.time}</span>{/if}
						{p.title}
						{#if p.endDate && p.endDate !== p.date}
							<span class="span" title="{fmtDate(p.date, { day: 'numeric', month: 'short' })} – {fmtDate(
									p.endDate,
									{ day: 'numeric', month: 'short' }
								)}">↔</span>
						{/if}
						{#if p.seriesId}<span class="recur" title={t('week.recurring')}>🔁</span>{/if}
						{#each p.tags as tg (tg.id)}<span class="chip" style="--c:{tg.color}">{tg.label}</span>{/each}
					</span>
					<button class="tagbtn" onclick={() => openTagEdit(p)} aria-label={t('tags.edit')} title={t('tags.edit')}>🏷</button>
					<select class="mv" value={day} onchange={(e) => move(p, e.currentTarget.value)} aria-label={t('week.move')} title={t('week.move')}>
						{#each data.days as d}<option value={d}>{fmtDate(d, { weekday: 'short' })}</option>{/each}
					</select>
					<button class="x" onclick={() => remove(p.id)} aria-label={t('week.deleteOne')} title={t('week.deleteOne')}>✕</button>
					{#if p.seriesId}
						<button class="x" onclick={() => removeSeries(p.seriesId!)} aria-label={t('week.deleteSeries')} title={t('week.deleteSeries')}>🗑🔁</button>
					{/if}
				</div>
			{/each}

			<form class="addrow" onsubmit={(e) => (e.preventDefault(), add(day))}>
				<input placeholder={t('week.addTodo')} bind:value={draft[day]} disabled={busy} />
				<button type="button" class="more" onclick={() => openNewForm(day)} aria-label={t('week.newNotation')} title={t('week.newNotation')}>+</button>
			</form>
		</div>
	{/each}
</div>

{#if tagEditFor}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="backdrop" role="presentation" onclick={() => (tagEditFor = null)}>
		<div class="card modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
			<h3>{t('tags.edit')}</h3>
			{#if data.allTags.length === 0}
				<p class="muted">{t('tags.none')}</p>
			{:else}
				<div class="tagpicker">
					{#each data.allTags as tg (tg.id)}
						<button
							type="button"
							class="tagopt"
							class:on={tagEditIds.has(tg.id)}
							style="--c:{tg.color}"
							onclick={() => toggleTagEdit(tg.id)}
						>
							{tg.label}
						</button>
					{/each}
				</div>
			{/if}
			<div class="row spread" style="margin-top:1rem">
				<button class="btn-ghost" onclick={() => (tagEditFor = null)}>{t('chores.cancel')}</button>
				<button class="btn-primary" onclick={saveTagEdit}>{t('chores.save')}</button>
			</div>
		</div>
	</div>
{/if}

{#if showNewForm}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="backdrop" role="presentation" onclick={() => (showNewForm = false)}>
		<div class="card modal wide" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
			<h3>{t('week.newNotation')}</h3>
			<div class="field">
				<label for="nt">{t('chores.field.title')}</label>
				<input id="nt" bind:value={newForm.title} />
			</div>
			<div class="row formrow">
				<div class="field">
					<label for="nd">{t('week.startDate')}</label>
					<input id="nd" type="date" bind:value={newForm.date} />
				</div>
				<div class="field">
					<label for="nde">{t('week.endDate')}</label>
					<input id="nde" type="date" min={newForm.date} bind:value={newForm.endDate} />
				</div>
			</div>
			<label class="inline"><input type="checkbox" bind:checked={newForm.allDay} /> {t('week.allDay')}</label>
			{#if !newForm.allDay}
				<div class="field">
					<label for="ntm">{t('week.time')}</label>
					<input id="ntm" type="time" bind:value={newForm.time} />
				</div>
			{/if}

			{#if data.members.length}
				<div class="field">
					<label>{t('week.members')}</label>
					<div class="tagpicker">
						{#each data.members as m (m.id)}
							<button
								type="button"
								class="tagopt"
								class:on={newForm.memberIds.includes(m.id)}
								style="--c:{m.color}"
								onclick={() => toggleFormMember(m.id)}
							>
								{m.emoji} {m.name}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<div class="field">
				<label for="nr">{t('chores.field.repeats')}</label>
				<select id="nr" bind:value={newForm.recurrence}>
					<option value="none">{t('chores.rep.none')}</option>
					<option value="daily">{t('chores.rep.daily')}</option>
					<option value="weekdays">{t('chores.rep.weekdays')}</option>
					<option value="weekly">{t('chores.rep.weekly')}</option>
				</select>
			</div>
			{#if newForm.recurrence === 'weekly' || newForm.recurrence === 'custom'}
				<div class="days">
					{#each WD_NB as d, i}
						<button type="button" class:on={newForm.weekdayMask & (1 << i)} onclick={() => toggleFormDay(i)}>
							{d}
						</button>
					{/each}
				</div>
			{/if}

			{#if data.allTags.length}
				<div class="field">
					<label>{t('chores.field.tags')}</label>
					<div class="tagpicker">
						{#each data.allTags as tg (tg.id)}
							<button
								type="button"
								class="tagopt"
								class:on={newForm.tagIds.includes(tg.id)}
								style="--c:{tg.color}"
								onclick={() => toggleFormTag(tg.id)}
							>
								{tg.label}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<div class="row spread" style="margin-top:1rem">
				<button class="btn-ghost" onclick={() => (showNewForm = false)}>{t('chores.cancel')}</button>
				<button class="btn-primary" onclick={createNotation}>{t('chores.save')}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.title {
		display: flex;
		align-items: baseline;
		gap: var(--s-4);
		flex-wrap: wrap;
	}
	.title h1 {
		margin: 0;
	}
	/* The window starts on today rather than on a Monday, so spell out which days
	   are actually on screen. */
	.range {
		font-size: var(--t-3);
		white-space: nowrap;
	}
	/* The controls group has to wrap too, or the pager pushes off a 360px screen. */
	.page-head .row {
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.inline {
		display: inline-flex;
		gap: var(--s-3);
		align-items: center;
		min-height: 44px;
		margin: 0;
		white-space: nowrap;
	}
	.inline input {
		/* Sizing comes from app.css (22px box); don't shrink it back to the 13px default. */
		min-height: auto;
	}
	.tagfilter {
		display: flex;
		gap: var(--s-2);
		flex-wrap: wrap;
		margin-bottom: var(--s-4);
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
	.chip {
		font-size: var(--t-1);
		padding: 0.02rem var(--s-3);
		border-radius: 999px;
		background: color-mix(in srgb, var(--c) 20%, transparent);
		color: var(--c);
		margin-left: var(--s-2);
		white-space: nowrap;
	}
	.tagpicker {
		display: flex;
		gap: var(--s-2);
		flex-wrap: wrap;
	}
	/* .backdrop / .modal come from app.css */
	.modal {
		max-width: 380px;
	}
	/* Two date pickers sit side by side when they fit and stack when they don't — a
	   native date input has a wide minimum, which overflowed a 360px phone. */
	.formrow {
		flex-wrap: wrap;
	}
	.formrow .field {
		flex: 1 1 9rem;
		min-width: 0;
	}
	.modal.wide {
		max-width: 460px;
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
	.week {
		display: grid;
		/* Seven days when there's room, then 4 / 3 / 2 / 1 as the screen narrows — each
		   day keeps enough width for its to-do rows instead of being squeezed to ~95px
		   on an iPad in portrait. */
		grid-template-columns: repeat(auto-fit, minmax(min(190px, 100%), 1fr));
		gap: var(--s-4);
	}
	.day {
		padding: var(--s-4);
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		min-height: 220px;
	}
	.day.today {
		border-color: var(--primary);
	}
	.dayhead {
		display: flex;
		align-items: baseline;
		gap: var(--s-2);
		flex-wrap: wrap;
		font-weight: 600;
		font-size: var(--t-3);
	}
	.todaypill {
		padding: 0.05rem var(--s-3);
		border-radius: 999px;
		background: var(--primary);
		color: var(--primary-ink);
		font-size: var(--t-1);
		font-weight: 600;
		text-transform: lowercase;
	}
	.ev {
		border-left: 3px solid var(--c);
		padding: var(--s-1) var(--s-3);
		background: var(--surface-2);
		border-radius: 4px;
		font-size: var(--t-2);
		display: flex;
		flex-direction: column;
	}
	.chore {
		font-size: var(--t-2);
		color: var(--text-dim);
	}
	.chore.done {
		text-decoration: line-through;
	}
	.item {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		/* The title takes the first line and the controls drop below it when a day column
		   is narrow, rather than everything being squashed onto one unreadable row. */
		flex-wrap: wrap;
		font-size: var(--t-3);
	}
	.item.done .txt {
		text-decoration: line-through;
		color: var(--text-dim);
	}
	.item .txt {
		flex: 1 1 8rem;
		min-width: 0;
	}
	.mdot {
		width: 8px;
		height: 8px;
		min-width: 8px;
		border-radius: 50%;
	}
	.span,
	.recur {
		font-size: var(--t-2);
		opacity: 0.75;
		margin-left: var(--s-1);
	}
	/* Touch-sized hit areas without visually bulking up the dense day column: the box is
	   36px (44px on touch devices) while the glyph stays small. */
	.chk,
	.x,
	.tagbtn {
		display: inline-grid;
		place-items: center;
		border: none;
		background: none;
		padding: 0;
		min-height: 36px;
		min-width: 36px;
		font-size: var(--t-3);
		opacity: 0.85;
	}
	.mv {
		width: auto;
		min-height: 36px;
		padding: 2px 4px;
		font-size: var(--t-2);
		border: none;
		background: var(--surface-2);
	}
	.addrow {
		display: flex;
		gap: var(--s-2);
	}
	.addrow input {
		flex: 1;
		min-width: 0;
		font-size: var(--t-2);
		min-height: 40px;
		padding: var(--s-2) var(--s-3);
	}
	.addrow .more {
		min-height: 40px;
		min-width: 40px;
		padding: 0;
		font-size: var(--t-4);
		line-height: 1;
	}
	@media (pointer: coarse) {
		.chk,
		.x,
		.tagbtn,
		.mv,
		.addrow input,
		.addrow .more {
			min-height: 44px;
		}
		.chk,
		.x,
		.tagbtn,
		.addrow .more {
			min-width: 44px;
		}
	}
	@media (max-width: 900px) {
		.day {
			min-height: auto;
		}
	}
	@media (pointer: coarse) {
		.days button,
		.tagopt {
			min-height: 44px;
		}
	}
</style>
