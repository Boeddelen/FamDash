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

<!-- The clock and the weather are the two things read from the doorway, so they share one
     band across the top rather than sitting in the first column where the weather used to
     live. Below that, three columns of cards instead of two: the chores get a column to
     themselves, and nothing that used to need a scroll on the wall tablet does now. -->
<header class="hero">
	<div class="card now">
		<div class="time">{clock.toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' })}</div>
		<div class="muted big">
			{clock.toLocaleDateString(tag, { weekday: 'long', day: 'numeric', month: 'long' })}
		</div>
	</div>
	<div class="wx"><WeatherCard weather={data.weather} /></div>
</header>

<div class="dash">
	<section class="col">
		<div class="card">
			<div class="row spread chead">
				<h3>
					<svg class="cicon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5 9 17l10.5-10.5" /></svg>
					{t('dash.choresToday')}
				</h3>
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
						<span class="twig"></span>
					</div>
					{#each list as c (c.id)}<ChoreCard chore={c} today={data.today} />{/each}
				</div>
			{/each}
			<a class="more" href="/tasks">{t('dash.allChores')} →</a>
		</div>
	</section>

	<section class="col">
		<div class="card">
			<div class="chead">
				<h3>
					<svg class="cicon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="15" rx="3" /><path d="M8 3.5v4M16 3.5v4M4 10.5h16" /></svg>
					{t('dash.today')}
				</h3>
			</div>
			{#if data.todayEvents.length === 0 && data.todayPlans.length === 0}
				<p class="muted empty">{t('dash.nothingToday')}</p>
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

		<div class="card">
			<div class="chead">
				<h3>
					<svg class="cicon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.5c3-6 5.5-8.5 8-8.5s4.5 2 8-2.5" /><path d="M16 6h4v4" /></svg>
					{t('dash.comingUp')}
				</h3>
			</div>
			{#if data.upcoming.length === 0}<p class="muted empty">{t('dash.nothingWeek')}</p>{/if}
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
	</section>

	<section class="col">
		<div class="card">
			<div class="chead">
				<h3>
					<svg class="cicon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V11M12 20V5M19 20v-6" /></svg>
					{t('dash.thisWeek')}
				</h3>
			</div>
			{#if data.weekByMember.length === 0}
				<p class="muted empty">{t('chores.nothing')}</p>
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

		<OnThisDayCard items={data.onThisDay} />
	</section>
</div>

<style>
	/* The clock and the weather ride together across the top. They wrap onto separate
	   rows on a phone, where the clock no longer has width to spare beside anything. */
	.hero {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-4);
		align-items: stretch;
		margin-bottom: var(--s-4);
	}
	.now {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: var(--s-2);
		flex: 1 1 auto;
		min-width: 0;
	}
	/* The weather takes the rest of the band and is the part allowed to grow; below
	   ~340px of its own it drops under the clock instead of squeezing the hour strip. */
	.wx {
		flex: 999 1 20rem;
		min-width: 0;
	}
	.time {
		font-family: var(--font-display);
		font-size: var(--t-8);
		font-weight: 400;
		line-height: 0.95;
		letter-spacing: -0.02em;
		/* Otherwise every minute change nudges the date line sideways. */
		font-variant-numeric: tabular-nums;
	}
	.big {
		font-size: var(--t-5);
		text-transform: capitalize;
	}
	.dash {
		display: grid;
		/* `min(300px, 100%)` is what keeps this honest: a plain minmax(300px, 1fr) track
		   refuses to shrink below 300px and pushes the whole page wide on a small phone.
		   With auto-fit the dashboard goes 3-up on the wall tablet, 2-up on a small
		   tablet and 1-up on a phone by itself, with no breakpoint to keep in sync. */
		grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
		gap: var(--s-4);
		align-items: start;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
	/* A card heading: the leaf icon in the accent, then the title. The icon is inline
	   SVG taking currentColor rather than an emoji, so it sits on the type's baseline
	   and matches the stroke weight the rest of the theme uses. */
	.chead {
		margin-bottom: var(--s-3);
	}
	.chead h3 {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		margin: 0;
	}
	.cicon {
		width: 1em;
		height: 1em;
		flex: none;
		fill: none;
		stroke: var(--primary);
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
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
		padding: var(--s-3) var(--s-4);
		background: var(--surface-2);
		border-radius: var(--radius-inner) var(--radius-inner) var(--radius-inner) var(--radius-inner-tight);
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
	/* An empty state is a plain sentence beside a twig, not a boxed-in notice: there is
	   nothing to act on, so it should take no more weight than the line it occupies. */
	.empty {
		margin: 0;
		padding-left: var(--s-5);
		border-left: 1px dashed var(--border);
	}
	.celebrate {
		margin: var(--s-1) 0 var(--s-5);
		padding: var(--s-3) var(--s-4);
		border-radius: var(--radius-inner) var(--radius-inner) var(--radius-inner) var(--radius-inner-tight);
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
	/* The twig: a hairline running from the name to the edge of the card, so one
	   person's chores are told from the next without a heavy divider. */
	.twig {
		flex: 1;
		height: 1px;
		background: var(--border);
		min-width: var(--s-6);
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
	.weekpoints .muted {
		font-variant-numeric: tabular-nums;
	}
	.weekpoints .pts {
		background: var(--surface-2);
		border-radius: var(--radius-pill);
		padding: var(--s-1) var(--s-3);
		font-size: var(--t-3);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
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
</style>
