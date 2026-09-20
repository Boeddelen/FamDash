<script lang="ts">
	import type { WeatherSnapshot } from '$lib/server/weather';
	import { getI18n, localeTag } from '$lib/i18n';

	let { weather }: { weather: WeatherSnapshot | null } = $props();
	const { t, locale } = getI18n();
	const tag = localeTag(locale);

	// WMO code → localized short label (falls back to the snapshot's English label).
	const NB: Record<number, string> = {
		0: 'Klarvær', 1: 'Lettskyet', 2: 'Delvis skyet', 3: 'Skyet',
		45: 'Tåke', 48: 'Rimtåke', 51: 'Lett yr', 53: 'Yr', 55: 'Kraftig yr',
		56: 'Underkjølt yr', 57: 'Underkjølt yr', 61: 'Lett regn', 63: 'Regn', 65: 'Kraftig regn',
		66: 'Underkjølt regn', 67: 'Underkjølt regn', 71: 'Lett snø', 73: 'Snø', 75: 'Kraftig snø',
		77: 'Snøkorn', 80: 'Regnbyger', 81: 'Regnbyger', 82: 'Kraftige regnbyger',
		85: 'Snøbyger', 86: 'Snøbyger', 95: 'Tordenvær', 96: 'Torden m/hagl', 99: 'Torden m/hagl'
	};
	const label = (code: number, fallback: string) => (locale === 'nb' ? (NB[code] ?? fallback) : fallback);

	function hourLabel(iso: string): string {
		return new Date(iso).toLocaleTimeString(tag, { hour: 'numeric' });
	}
	const round = (n: number) => Math.round(n);
	/* `daily[0]` is today. The rest of the week is deliberately not rendered: this card
	   sits at the top of the Today page, where a seven-day grid was the tallest thing on
	   screen and the least looked at. The snapshot still carries the full forecast, so
	   bringing it back — on /week, or behind a tap — needs no server change. */
	const today = $derived(weather?.daily?.[0] ?? null);
	const feels = $derived(locale === 'nb' ? 'føles som' : 'feels');
</script>

{#if !weather}
	<a class="card weather empty muted" href="/settings">{t('dash.weatherEmpty')}</a>
{:else}
	<div class="card weather">
		<div class="now">
			<span class="big-emoji">{weather.now.emoji}</span>
			<div class="reading">
				<div class="line">
					<span class="temp">{round(weather.now.temperature)}°</span>
					{#if today}
						<!-- Today's high and low, which is the part of the daily forecast that's
						     actually about today — it replaces the seven-day grid rather than
						     simply being dropped with it. -->
						<span class="hilo muted">
							<span class="hi">{round(today.tempMax)}°</span>/{round(today.tempMin)}°
						</span>
					{/if}
				</div>
				<div class="muted meta">
					{label(weather.now.code, weather.now.label)} · {feels} {round(weather.now.apparent)}°
				</div>
				<div class="muted place">{weather.label}</div>
			</div>
		</div>

		{#if weather.hourly.length}
			<div class="strip">
				{#each weather.hourly.slice(0, 8) as h}
					<div class="hour">
						<span class="muted">{hourLabel(h.time)}</span>
						<span class="e">{h.emoji}</span>
						<span>{round(h.temperature)}°</span>
						{#if h.precipProb >= 20}<span class="rain">{h.precipProb}%</span>{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.weather {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
	.now {
		display: flex;
		align-items: center;
		gap: var(--s-4);
	}
	/* Down a step from --t-8, which is the clock's size: the time is the one thing on
	   this page meant to be read from the doorway, and two display-sized numbers stacked
	   above each other were competing for that job. */
	.big-emoji {
		font-size: var(--t-7);
		line-height: 1;
		flex: none;
	}
	.reading {
		min-width: 0;
	}
	.line {
		display: flex;
		align-items: baseline;
		gap: var(--s-3);
		flex-wrap: wrap;
	}
	.temp {
		font-size: var(--t-7);
		font-weight: 700;
		line-height: 1.1;
	}
	.hilo {
		font-size: var(--t-3);
		white-space: nowrap;
	}
	.hilo .hi {
		color: var(--text);
		font-weight: 600;
	}
	.meta,
	.place {
		font-size: var(--t-2);
	}
	.strip {
		display: flex;
		gap: var(--s-3);
		overflow-x: auto;
		padding-bottom: var(--s-2);
	}
	.hour {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-1);
		min-width: 46px;
		font-size: var(--t-2);
	}
	.hour .e {
		font-size: var(--t-4);
	}
	.rain {
		color: var(--primary);
		font-size: var(--t-1);
	}
</style>
