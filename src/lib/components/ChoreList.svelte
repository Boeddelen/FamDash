<script lang="ts">
	import { api } from '$lib/api';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/toast';
	import type { AgendaChore } from '$lib/server/agenda';

	let {
		chores,
		groupByMember = false,
		groupByDate = false,
		showDate = false
	}: {
		chores: AgendaChore[];
		groupByMember?: boolean;
		groupByDate?: boolean;
		showDate?: boolean;
	} = $props();

	function dateLabel(iso: string): string {
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		});
	}

	let pending = $state<Record<string, boolean>>({});

	async function toggle(c: AgendaChore) {
		pending[c.id] = true;
		const next = c.status === 'done' ? 'todo' : 'done';
		try {
			await api(`/api/chore-instances/${c.id}`, {
				method: 'POST',
				body: JSON.stringify({ status: next }),
				quiet: true
			});
			await invalidateAll();
		} catch {
			toast('Could not update chore', 'error');
		} finally {
			pending[c.id] = false;
		}
	}

	function overdue(c: AgendaChore): boolean {
		return c.status === 'todo' && c.dueDate < new Date().toISOString().slice(0, 10);
	}

	const groups = $derived.by(() => {
		if (groupByDate) {
			const map = new Map<string, { name: string; emoji: string; items: AgendaChore[] }>();
			for (const c of chores) {
				if (!map.has(c.dueDate))
					map.set(c.dueDate, { name: dateLabel(c.dueDate), emoji: '📅', items: [] });
				map.get(c.dueDate)!.items.push(c);
			}
			return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g);
		}
		if (!groupByMember) return [{ name: '', emoji: '', items: chores }];
		const map = new Map<string, { name: string; emoji: string; items: AgendaChore[] }>();
		for (const c of chores) {
			const key = c.memberId ?? '_open';
			if (!map.has(key))
				map.set(key, {
					name: c.memberName ?? 'Anyone',
					emoji: c.memberEmoji ?? '📋',
					items: []
				});
			map.get(key)!.items.push(c);
		}
		return [...map.values()].sort((a, b) => (a.name === 'Anyone' ? 1 : 0) - (b.name === 'Anyone' ? 1 : 0));
	});
</script>

{#if chores.length === 0}
	<p class="muted">Nothing here 🎉</p>
{:else}
	{#each groups as g}
		{#if g.name}<h4 class="grouphead">{g.emoji} {g.name}</h4>{/if}
		<ul>
			{#each g.items as c (c.id)}
				<li class:done={c.status === 'done'} class:overdue={overdue(c)}>
					<button
						class="check"
						aria-label="Toggle {c.title}"
						disabled={pending[c.id]}
						onclick={() => toggle(c)}
					>
						{c.status === 'done' ? '✅' : '⬜'}
					</button>
					<span class="title">{c.title}</span>
					{#if showDate}<span class="pill">{c.dueDate.slice(5)}</span>{/if}
					{#if !groupByMember && c.memberEmoji}<span class="who" title={c.memberName}>{c.memberEmoji}</span>{/if}
					{#if c.status === 'done' && c.completedByName}<span class="by muted">{c.completedByName}</span>{/if}
					{#if c.points > 1}<span class="pts">{c.points}p</span>{/if}
				</li>
			{/each}
		</ul>
	{/each}
{/if}

<style>
	ul {
		list-style: none;
		margin: 0 0 var(--s-4);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
	}
	li {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-2) var(--s-1);
		border-radius: 8px;
	}
	li.overdue {
		background: color-mix(in srgb, var(--danger) 12%, transparent);
	}
	li.done .title {
		text-decoration: line-through;
		color: var(--text-dim);
	}
	.check {
		border: none;
		background: none;
		font-size: var(--t-5);
		padding: 0;
		min-height: auto;
		line-height: 1;
	}
	.title {
		flex: 1;
	}
	.who {
		font-size: var(--t-5);
	}
	.by {
		font-size: var(--t-2);
	}
	.pts {
		font-size: var(--t-2);
		background: var(--surface-2);
		border-radius: 999px;
		padding: var(--s-1) var(--s-3);
	}
	.grouphead {
		margin: var(--s-4) 0 var(--s-1);
	}
</style>
