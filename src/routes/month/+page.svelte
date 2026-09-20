<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import { fmtRange } from '$lib/format';
	import { getI18n, localeTag } from '$lib/i18n';

	let { data } = $props();
	const { t, locale } = getI18n();
	const tag = localeTag(locale);
	const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions) => {
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(tag, opts);
	};
	const dow =
		locale === 'nb'
			? ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn']
			: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const operator = $derived(page.data.operator as { id: string } | null);
	const monthLabel = $derived(
		new Date(data.year, data.month, 1).toLocaleDateString(tag, { month: 'long', year: 'numeric' })
	);

	let selected = $state<string | null>(null);
	let newTitle = $state('');

	const selectedCell = $derived(data.cells.find((c) => c.date === selected) ?? null);

	function nav(delta: number) {
		let m = data.month + delta;
		let y = data.year;
		if (m < 0) {
			m = 11;
			y--;
		} else if (m > 11) {
			m = 0;
			y++;
		}
		goto(`/month?y=${y}&m=${m}`);
	}

	async function quickAdd() {
		if (!newTitle.trim() || !selected) return;
		await api('/api/plan-items', {
			method: 'POST',
			body: JSON.stringify({ title: newTitle.trim(), date: selected, memberIds: operator ? [operator.id] : [] }),
			quiet: true
		});
		newTitle = '';
		await invalidateAll();
	}
	async function toggle(id: string, done: boolean) {
		await api(`/api/plan-items/${id}`, { method: 'PATCH', body: JSON.stringify({ done }), quiet: true });
		await invalidateAll();
	}
</script>

<div class="page-head spread">
	<h1>{monthLabel}</h1>
	<div class="row">
		<button onclick={() => nav(-1)}>←</button>
		<button onclick={() => goto('/month')}>{t('month.today')}</button>
		<button onclick={() => nav(1)}>→</button>
	</div>
</div>

<div class="grid-head">
	{#each dow as d}<span>{d}</span>{/each}
</div>
<div class="cal">
	{#each data.cells as c (c.date)}
		<button
			class="cell"
			class:dim={!c.inMonth}
			class:today={c.date === data.today}
			class:sel={c.date === selected}
			onclick={() => (selected = c.date)}
		>
			<span class="num">{Number(c.date.slice(-2))}</span>
			<span class="dots">
				{#each c.events.slice(0, 4) as e}<span class="dot" style="background:{e.color}"></span>{/each}
				{#if c.chores.length}<span class="dot" style="background:var(--warn)"></span>{/if}
				{#if c.plans.length}<span class="dot" style="background:var(--primary)"></span>{/if}
			</span>
			{#if c.events.length + c.chores.length + c.plans.length > 0}
				<span class="count muted">{c.events.length + c.chores.length + c.plans.length}</span>
			{/if}
		</button>
	{/each}
</div>

{#if selectedCell}
	<div class="card detail">
		<div class="row spread">
			<h3>{fmtDate(selectedCell.date, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
			<button class="btn-ghost" onclick={() => (selected = null)}>{t('month.close')}</button>
		</div>

		{#if selectedCell.events.length}
			<h4>{t('month.events')}</h4>
			<ul>
				{#each selectedCell.events as e}
					<li><span class="dot" style="background:{e.color}"></span> {e.title}
						<small class="muted">{fmtRange(e.start, e.end, e.allDay)}</small></li>
				{/each}
			</ul>
		{/if}
		{#if selectedCell.chores.length}
			<h4>{t('month.chores')}</h4>
			<ul>
				{#each selectedCell.chores as c}<li class:done={c.status === 'done'}>🧹 {#if c.time}{c.time} {/if}{c.title} {c.memberEmoji ?? ''}</li>{/each}
			</ul>
		{/if}
		<h4>{t('month.todos')}</h4>
		<ul>
			{#each selectedCell.plans as p (p.id)}
				<li class:done={p.done}>
					<button class="chk" onclick={() => toggle(p.id, !p.done)}>{p.done ? '✅' : '⬜'}</button>
					{#each p.members as m (m.id)}
						<span class="dot" style="background:{m.color}" title={m.name}></span>
					{/each}
					{#if p.time}<span class="muted">{p.time}</span>{/if}
					{p.title}
					{#if p.seriesId}<span class="muted" title={t('week.recurring')}>🔁</span>{/if}
				</li>
			{/each}
			{#if selectedCell.plans.length === 0}<li class="muted">{t('month.none')}</li>{/if}
		</ul>
		<form class="row" onsubmit={(e) => (e.preventDefault(), quickAdd())}>
			<input placeholder={t('month.quickAdd')} bind:value={newTitle} />
			<button class="btn-primary">{t('month.add')}</button>
		</form>
	</div>
{/if}

<style>
	/* A month grid is only a month grid with seven columns, so instead of reflowing it
	   the cells themselves scale: gaps, padding and type all shrink with the viewport. */
	.grid-head,
	.cal {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: clamp(2px, 0.5vw, 4px);
	}
	.grid-head {
		font-size: clamp(0.65rem, 0.5rem + 0.5vw, 0.8rem);
		color: var(--text-dim);
		margin: var(--s-3) 0;
		text-align: center;
	}
	.cell {
		aspect-ratio: 1 / 1;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: clamp(2px, 0.8vw, 6px);
		gap: 3px;
		min-height: auto;
		overflow: hidden;
	}
	.cell.dim {
		opacity: 0.4;
	}
	.cell.today {
		border-color: var(--primary);
		border-width: 2px;
	}
	.cell.sel {
		background: var(--surface-2);
	}
	.num {
		font-size: clamp(0.7rem, 0.55rem + 0.5vw, 0.85rem);
		font-weight: 600;
	}
	.dots {
		display: flex;
		gap: 2px;
		flex-wrap: wrap;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}
	.count {
		font-size: var(--t-1);
		margin-top: auto;
	}
	.detail {
		margin-top: var(--s-6);
	}
	.detail ul {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--s-4);
	}
	.detail li {
		padding: var(--s-1) 0;
		display: flex;
		align-items: center;
		gap: var(--s-2);
	}
	.detail li.done {
		text-decoration: line-through;
		color: var(--text-dim);
	}
	.chk {
		border: none;
		background: none;
		padding: 0;
		min-height: auto;
	}
	@media (max-width: 640px) {
		.cell {
			aspect-ratio: auto;
			min-height: 56px;
		}
	}
</style>
