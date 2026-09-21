<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/toast';
	import { getI18n, localeTag } from '$lib/i18n';
	import { categoryEmoji } from '$lib/categories';
	import type { AgendaChore } from '$lib/server/agenda';

	let { chore, today }: { chore: AgendaChore; today: string } = $props();
	const { t, locale } = getI18n();

	let busy = $state(false);
	/**
	 * A chore is only tickable on the day it's due — yesterday's would backdate points
	 * and tomorrow's would claim them early. An admin can still do either; the server
	 * enforces it, this just stops the card offering something that would 401.
	 */
	const locked = $derived(chore.dueDate !== today && !page.data.admin);
	// Steps default open while there's work left to do, and stay wherever the user
	// left them across a refresh-triggering toggle (state only re-inits on remount).
	let expanded = $state(chore.status !== 'done');

	const hasChecklist = $derived((chore.checklist?.length ?? 0) > 0);
	const doneSteps = $derived(chore.checklistDone?.length ?? 0);
	const totalSteps = $derived(chore.checklist?.length ?? 0);

	const status = $derived(
		chore.status === 'done'
			? 'done'
			: chore.status === 'skipped'
				? 'skipped'
				: chore.dueDate < today
					? 'overdue'
					: 'todo'
	);

	async function toggle() {
		if (locked) return;
		busy = true;
		const next = chore.status === 'done' ? 'todo' : 'done';
		try {
			await api(`/api/chore-instances/${chore.id}`, {
				method: 'POST',
				body: JSON.stringify({ status: next }),
				quiet: true
			});
			await invalidateAll();
		} catch (e) {
			await refused(e);
		} finally {
			busy = false;
		}
	}

	/**
	 * A tablet parked on this page overnight still holds yesterday's `today`, so its
	 * cards look tickable until the next load — and the server, rightly, refuses. Say
	 * why and reload, rather than the bare "!" that left it looking broken.
	 */
	async function refused(e: unknown) {
		if (e instanceof ApiError && e.status === 401) {
			toast(t('chores.otherDay'), 'error');
			await invalidateAll();
		} else {
			toast('!', 'error');
		}
	}

	async function toggleStep(index: number) {
		if (locked) return;
		busy = true;
		try {
			await api(`/api/chore-instances/${chore.id}/checklist`, {
				method: 'POST',
				body: JSON.stringify({ index }),
				quiet: true
			});
			await invalidateAll();
		} catch (e) {
			await refused(e);
		} finally {
			busy = false;
		}
	}

	function dueLabel(iso: string): string {
		if (iso === today) return '';
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(localeTag(locale), {
			weekday: 'short',
			day: 'numeric'
		});
	}
</script>

{#snippet meta()}
	<span class="sub">
		{#if dueLabel(chore.dueDate)}<span class="due">{dueLabel(chore.dueDate)}</span>{/if}
		{#if chore.time}<span class="time">🕒 {chore.time}</span>{/if}
		{#if hasChecklist}<span class="steps">{doneSteps}/{totalSteps}</span>{/if}
		{#if chore.points > 1}<span class="pts">{chore.points}p</span>{/if}
		{#if status === 'overdue'}<span class="tag">{t('chores.status.overdue')}</span>{/if}
		{#if status === 'done' && chore.completedByName}<span class="by">{chore.completedByName}</span>{/if}
		{#each chore.tags as tg (tg.id)}<span class="tagchip" style="--c:{tg.color}">{tg.label}</span>{/each}
	</span>
{/snippet}

{#if hasChecklist}
	<div class="chorecard has-checklist" class:locked data-status={status} data-id={chore.id}>
		<button class="chead" disabled={busy} onclick={() => (expanded = !expanded)}>
			<span class="check" aria-hidden="true">{status === 'done' ? '✓' : ''}</span>
			<span class="body">
				<span class="title">{categoryEmoji(chore.category)} {chore.title}</span>
				{@render meta()}
			</span>
			<span class="chev" class:open={expanded} aria-hidden="true">▾</span>
		</button>
		{#if expanded}
			<ul class="steps-list">
				{#each chore.checklist ?? [] as step, i}
					{@const stepDone = chore.checklistDone?.includes(i) ?? false}
					<li>
						<button class="step" class:done={stepDone} disabled={busy} onclick={() => toggleStep(i)}>
							<span class="stepbox" aria-hidden="true">{stepDone ? '✓' : ''}</span>
							{step}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{:else}
	<button
		class="chorecard"
		class:locked
		data-status={status}
		data-id={chore.id}
		disabled={busy || locked}
		title={locked ? t('chores.otherDay') : undefined}
		onclick={toggle}
	>
		<span class="check" aria-hidden="true">{status === 'done' ? '✓' : ''}</span>
		<span class="body">
			<span class="title">{categoryEmoji(chore.category)} {chore.title}</span>
			{@render meta()}
		</span>
	</button>
{/if}

<style>
	/* Locked cards stay readable — you can still see what's due and when — they just
	   don't offer a tap that the server would refuse. */
	.chorecard.locked {
		opacity: 0.72;
	}
	.chorecard.locked .check {
		border-style: dashed;
	}
	.chorecard {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		width: 100%;
		text-align: left;
		padding: var(--s-4) var(--s-4);
		border-radius: var(--radius-inner) var(--radius-inner) var(--radius-inner)
			var(--radius-inner-tight);
		border: 2px solid var(--cc-border, var(--border));
		background: var(--cc-bg, var(--surface));
		min-height: 52px;
		transition: transform 0.1s ease, background 0.15s ease, border-color 0.15s ease;
	}
	.chorecard:not(.has-checklist):active {
		transform: scale(0.98);
	}
	.chorecard[data-status='todo'] {
		--cc-border: var(--border);
		--cc-bg: var(--surface-2);
	}
	.chorecard[data-status='overdue'] {
		--cc-border: var(--danger);
		--cc-bg: color-mix(in srgb, var(--danger) 10%, var(--surface));
	}
	.chorecard[data-status='done'] {
		--cc-border: var(--ok);
		--cc-bg: color-mix(in srgb, var(--ok) 14%, var(--surface));
	}
	.chorecard[data-status='skipped'] {
		opacity: 0.5;
	}
	.chorecard.has-checklist {
		flex-direction: column;
		align-items: stretch;
		padding: 0;
		overflow: hidden;
	}
	.chead {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		width: 100%;
		text-align: left;
		border: none;
		background: none;
		padding: var(--s-4) var(--s-4);
		min-height: 52px;
	}
	.chev {
		color: var(--text-dim);
		transition: transform 0.15s ease;
		flex: none;
	}
	.chev.open {
		transform: rotate(180deg);
	}
	.steps-list {
		list-style: none;
		margin: 0;
		padding: 0 var(--s-3) var(--s-3);
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
	}
	.step {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		width: 100%;
		text-align: left;
		border: none;
		background: none;
		padding: var(--s-2) var(--s-3) var(--s-2) var(--s-7);
		font-size: var(--t-3);
		border-radius: var(--radius-control);
		/* Each step is tapped individually by a child — keep it thumb-sized. */
		min-height: 40px;
	}
	@media (pointer: coarse) {
		.step {
			min-height: 44px;
		}
	}
	.step:hover {
		background: var(--surface);
	}
	.step.done {
		color: var(--text-dim);
		text-decoration: line-through;
	}
	.stepbox {
		display: grid;
		place-items: center;
		width: 16px;
		height: 16px;
		min-width: 16px;
		border-radius: var(--radius-inner-tight);
		border: 2px solid var(--text-dim);
		font-size: var(--t-1);
		color: #fff;
	}
	.step.done .stepbox {
		background: var(--ok);
		border-color: var(--ok);
	}
	.check {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		min-width: 22px;
		border-radius: 50%;
		border: 2px solid var(--cc-border);
		color: #fff;
		font-size: var(--t-2);
		font-weight: 700;
	}
	.chorecard[data-status='done'] .check {
		background: var(--ok);
		border-color: var(--ok);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		min-width: 0;
	}
	.title {
		font-weight: 500;
	}
	.chorecard[data-status='done'] .title {
		text-decoration: line-through;
		color: var(--text-dim);
	}
	.sub {
		display: flex;
		gap: var(--s-3);
		align-items: center;
		font-size: var(--t-2);
		color: var(--text-dim);
		flex-wrap: wrap;
	}
	.time,
	.steps,
	.pts,
	.tag,
	.by,
	.tagchip {
		background: var(--surface);
		border-radius: var(--radius-pill);
		padding: 0.05rem var(--s-3);
	}
	.tag {
		color: var(--danger);
		background: color-mix(in srgb, var(--danger) 15%, transparent);
	}
	.tagchip {
		background: color-mix(in srgb, var(--c) 20%, transparent);
		color: var(--c);
	}
</style>
