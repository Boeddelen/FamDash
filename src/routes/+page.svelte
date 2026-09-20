<script lang="ts">
	import WeatherCard from '$lib/components/WeatherCard.svelte';
	import ChoreCard from '$lib/components/ChoreCard.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import OnThisDayCard from '$lib/components/OnThisDayCard.svelte';
	import { fmtRange } from '$lib/format';
	import { getI18n, localeTag } from '$lib/i18n';
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();
	const { t, locale } = getI18n();
	const tag = localeTag(locale);

	let clock = $state(new Date());
	onMount(() => {
		const a = setInterval(() => (clock = new Date()), 30_000);
		const b = setInterval(() => invalidate(() => true), 5 * 60_000);
		return () => {
			clearInterval(a);
			clearInterval(b);
		};
	});

	const members = $derived(page.data.members as { id: string; name: string; emoji: string; color: string; hasAvatar?: boolean }[]);
	function relDay(iso: string): string {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const [y, m, d] = iso.split('-').map(Number);
		const diff = Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86400000);
		if (diff === 0) return t('dash.today');
		if (diff === 1) return locale === 'nb' ? 'i morgen' : 'tomorrow';
		return new Date(y, m - 1, d).toLocaleDateString(tag, { weekday: 'long' });
	}

	const allTodayChoresDone = $derived(
		data.todayChores.length > 0 && data.todayChores.every((c) => c.status === 'done')
	);
	// today's chores grouped by member id
	const choreGroups = $derived.by(() => {
		const g = new Map<string, typeof data.todayChores>();
		for (const c of data.todayChores) {
			const k = c.memberId ?? '_any';
			if (!g.has(k)) g.set(k, []);
			g.get(k)!.push(c);
		}
		return [...g.entries()];
	});
</script>

<header class="hero">
	<div class="time">{clock.toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' })}</div>
	<div class="muted big">
		{clock.toLocaleDateString(tag, { weekday: 'long', day: 'numeric', month: 'long' })}
	</div>
</header>

<div class="dash">
	<section class="col">
		<WeatherCard weather={data.weather} />

		<div class="card">
			<h3>{t('dash.today')}</h3>
			{#if data.todayEvents.length === 0 && data.todayPlans.length === 0}
				<p class="muted">{t('dash.nothingToday')}</p>
			{/if}
			<ul class="agenda">
				{#each data.todayEvents as e}
					<li>
						<span class="dot" style="background:{e.color}"></span>
						<span class="tx">{e.title}</span>
						<span class="muted when">{fmtRange(e.start, e.end, e.allDay)}</span>
					</li>
				{/each}
				{#each data.todayPlans as p}
					<li class:done={p.done}>
						{#if p.members.length}
							{#each p.members as m (m.id)}
								<span class="dot" style="background:{m.color}" title={m.name}></span>
							{/each}
						{:else}
							<span class="dot" style="background:var(--primary)"></span>
						{/if}
						<span class="tx">{p.members[0]?.emoji ?? '•'} {p.title}</span>
					</li>
				{/each}
			</ul>
			<a class="more" href="/week">{t('dash.planWeek')} →</a>
		</div>

		<a class="card doclink" href="/upload">
			<span class="dl-icon">📄</span>
			<span class="dl-body">
				<h3>{t('nav.docs')}</h3>
				{#if data.latestDoc}
					<p class="muted">{t('docs.latest')}: {data.latestDoc.title} · {t('docs.count', { n: data.docCount })}</p>
				{:else}
					<p class="muted">{t('docs.countEmpty')}</p>
				{/if}
			</span>
			<span class="dl-arrow">→</span>
		</a>

		<OnThisDayCard items={data.onThisDay} />
	</section>

	<section class="col">
		<div class="card">
			<div class="row spread">
				<h3>{t('dash.choresToday')}</h3>
				<span class="pill">{data.todayChores.filter((c) => c.status === 'done').length}/{data.todayChores.length} {t('dash.done')}</span>
			</div>
			{#if data.todayChores.length === 0}
				<p class="muted">{t('chores.nothing')}</p>
			{:else if allTodayChoresDone}
				<p class="celebrate">🎉 {t('chores.allDoneToday')} 🎉</p>
			{/if}
			{#each choreGroups as [mid, list]}
				{@const m = members.find((x) => x.id === mid)}
				<div class="cg">
					<div class="cghead">
						{#if m}<Avatar member={m} size={28} />{:else}<span>📋</span>{/if}
						<span>{m?.name ?? t('chores.anyone')}</span>
					</div>
					{#each list as c (c.id)}<ChoreCard chore={c} today={data.today} />{/each}
				</div>
			{/each}
			<a class="more" href="/tasks">{t('dash.allChores')} →</a>
		</div>

		<div class="card">
			<h3>{t('dash.comingUp')}</h3>
			{#if data.upcoming.length === 0}<p class="muted">{t('dash.nothingWeek')}</p>{/if}
			<ul class="agenda">
				{#each data.upcoming as u}
					<li>
						<span class="dot" style="background:{u.kind === 'event' ? u.color : 'var(--primary)'}"></span>
						<span class="tx">{u.kind === 'plan' && u.emoji ? `${u.emoji} ` : ''}{u.title}</span>
						<span class="muted when">{relDay(u.date)}</span>
					</li>
				{/each}
			</ul>
			<a class="more" href="/week">{t('dash.planWeek')} →</a>
		</div>

		<div class="card">
			<h3>{t('dash.thisWeek')}</h3>
			{#if data.weekByMember.length === 0}
				<p class="muted">{t('chores.nothing')}</p>
			{:else}
				<ul class="weekpoints">
					{#each data.weekByMember as w (w.member.id)}
						<li>
							<Avatar member={w.member} size={26} />
							<span class="tx">{w.member.name}</span>
							<span class="muted">{w.done}/{w.total}</span>
							<span class="pts">{w.points}p</span>
						</li>
					{/each}
				</ul>
			{/if}
			<a class="more" href="/tasks">{t('dash.allChores')} →</a>
		</div>
	</section>
</div>

<style>
	/* The date sits beside the clock on the same baseline rather than under it. Stacked,
	   it cost a line and left the entire right half of the row empty; alongside, it fills
	   the width the row already occupied. It still wraps under on a very narrow screen. */
	.hero {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: var(--s-2) var(--s-4);
		margin-bottom: var(--s-5);
	}
	.time {
		font-size: var(--t-8);
		font-weight: 700;
		line-height: 1;
	}
	.big {
		font-size: var(--t-5);
		text-transform: capitalize;
	}
	.dash {
		display: grid;
		/* `min(320px, 100%)` is what keeps this honest: a plain minmax(320px, 1fr) track
		   refuses to shrink below 320px and pushes the whole page wide on a small phone.
		   With auto-fit the dashboard goes 2-up on a tablet and 1-up on a phone by itself,
		   with no breakpoint to keep in sync. */
		grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
		gap: var(--s-6);
		align-items: start;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: var(--s-6);
	}
	.agenda {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.agenda li {
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}
	.agenda li.done .tx {
		text-decoration: line-through;
		color: var(--text-dim);
	}
	.dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		flex: none;
	}
	.agenda .tx {
		flex: 1;
		/* Without this a flex item refuses to shrink past its longest word. */
		min-width: 0;
	}
	.when {
		font-size: var(--t-3);
		white-space: nowrap;
		flex: none;
	}
	.celebrate {
		margin: var(--s-1) 0 var(--s-5);
		padding: var(--s-3) var(--s-4);
		border-radius: 10px;
		background: color-mix(in srgb, var(--ok) 16%, var(--surface));
		font-weight: 600;
		text-align: center;
		animation: bounce 0.5s ease;
	}
	@keyframes bounce {
		0% {
			transform: scale(0.9);
			opacity: 0;
		}
		60% {
			transform: scale(1.04);
			opacity: 1;
		}
		100% {
			transform: scale(1);
		}
	}
	.cg {
		margin-bottom: var(--s-4);
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.cghead {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		font-weight: 600;
		font-size: var(--t-3);
	}
	.more {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin-top: var(--s-1);
		font-size: var(--t-3);
	}
	.weekpoints {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.weekpoints li {
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}
	.weekpoints .tx {
		flex: 1;
		min-width: 0;
		font-weight: 500;
	}
	.weekpoints .pts {
		background: var(--surface-2);
		border-radius: 999px;
		padding: var(--s-1) var(--s-3);
		font-size: var(--t-3);
		font-weight: 600;
	}
	.doclink {
		display: flex;
		align-items: center;
		gap: var(--s-5);
		text-decoration: none;
		color: inherit;
		transition: transform 0.1s ease, background 0.15s ease;
	}
	.doclink:hover {
		text-decoration: none;
		filter: brightness(0.98);
	}
	.doclink:active {
		transform: scale(0.99);
	}
	.dl-icon {
		font-size: var(--t-7);
	}
	.dl-body {
		flex: 1;
		min-width: 0;
	}
	.dl-body h3 {
		margin: 0 0 var(--s-1);
	}
	.dl-body p {
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dl-arrow {
		color: var(--text-dim);
		font-size: var(--t-5);
	}
	/* .dash reflows on its own (auto-fit above), and the clock now rides --t-8, which
	   already interpolates 32px→54px across exactly the range the old 820px step was
	   approximating — so there's nothing left here to tweak. */
</style>
