<script lang="ts">
	import '../../app.css';
	import { api, ApiError } from '$lib/api';
	import { goto, invalidateAll } from '$app/navigation';
	import { createTranslator, LOCALES, type Locale } from '$lib/i18n';

	let { data } = $props();

	let step = $state(1);
	let locale = $state<Locale>('nb');
	const t = $derived(createTranslator(locale));
	let householdName = $state('');
	let timezone = $state(data.guessTimezone);
	let adminName = $state('');
	let email = $state('');
	let password = $state('');

	let placeQuery = $state('');
	let placeResults = $state<{ label: string; lat: number; lon: number; timezone: string }[]>([]);
	let place = $state<{ label: string; lat: number; lon: number } | null>(null);
	let searching = $state(false);

	type NewMember = { name: string; role: 'adult' | 'child'; emoji: string; color: string };
	let members = $state<NewMember[]>([]);
	const palette = ['#4f46e5', '#0ea5e9', '#16a34a', '#d97706', '#db2777', '#7c3aed'];
	const emojis = ['🦊', '🐨', '🐼', '🐧', '🦁', '🐢', '🦉', '🐝', '🌟', '🚀'];

	function addMember() {
		members.push({
			name: '',
			role: members.length === 0 ? 'adult' : 'child',
			emoji: emojis[members.length % emojis.length],
			color: palette[members.length % palette.length]
		});
	}

	let err = $state('');
	let busy = $state(false);

	async function searchPlace() {
		if (placeQuery.trim().length < 2) return;
		searching = true;
		try {
			placeResults = await api(`/api/weather/geocode?q=${encodeURIComponent(placeQuery)}`, {
				quiet: true
			});
		} catch {
			placeResults = [];
		} finally {
			searching = false;
		}
	}

	function pickPlace(r: (typeof placeResults)[number]) {
		place = { label: r.label, lat: r.lat, lon: r.lon };
		if (r.timezone) timezone = r.timezone;
		placeResults = [];
		placeQuery = r.label;
	}

	async function finish() {
		err = '';
		busy = true;
		try {
			await api('/api/setup', {
				method: 'POST',
				quiet: true,
				body: JSON.stringify({
					householdName,
					timezone,
					locale,
					admin: { name: adminName, email, password },
					weather: place ? { lat: place.lat, lon: place.lon, label: place.label } : null,
					members: members.filter((m) => m.name.trim())
				})
			});
			await invalidateAll();
			await goto('/');
		} catch (e) {
			err = e instanceof ApiError ? e.message : 'Something went wrong';
		} finally {
			busy = false;
		}
	}

	const canStep1 = $derived(householdName.trim() && timezone.trim());
	const canStep2 = $derived(adminName.trim() && /.+@.+\..+/.test(email) && password.length >= 8);
</script>

<div class="wrap">
	<div class="card">
		<h1>👋 {t('setup.title')}</h1>
		<p class="muted">{t('setup.step', { n: step })}</p>

		{#if step === 1}
			<h2>{t('setup.household')}</h2>
			<div class="field">
				<label for="lc">{t('setup.language')}</label>
				<select id="lc" bind:value={locale}>
					{#each LOCALES as l}<option value={l.code}>{l.label}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="hn">{t('setup.householdName')}</label>
				<input id="hn" bind:value={householdName} />
			</div>
			<div class="field">
				<label for="tz">{t('setup.timezone')}</label>
				<input id="tz" bind:value={timezone} placeholder="Europe/Oslo" />
			</div>
			<div class="row spread">
				<span></span>
				<button class="btn-primary" disabled={!canStep1} onclick={() => (step = 2)}>{t('setup.next')}</button>
			</div>
		{:else if step === 2}
			<h2>{t('setup.adminAccount')}</h2>
			<p class="muted">{t('setup.adminBlurb')}</p>
			<div class="field">
				<label for="an">{t('setup.yourName')}</label>
				<input id="an" bind:value={adminName} autocomplete="name" />
			</div>
			<div class="field">
				<label for="ae">{t('admin.email')}</label>
				<input id="ae" type="email" bind:value={email} autocomplete="username" />
			</div>
			<div class="field">
				<label for="ap">{t('setup.passwordHint')}</label>
				<input id="ap" type="password" bind:value={password} autocomplete="new-password" />
			</div>
			<div class="row spread">
				<button class="btn-ghost" onclick={() => (step = 1)}>{t('setup.back')}</button>
				<button class="btn-primary" disabled={!canStep2} onclick={() => (step = 3)}>{t('setup.next')}</button>
			</div>
		{:else if step === 3}
			<h2>{t('setup.weather')}</h2>
			<p class="muted">{t('setup.weatherOptional')}</p>
			<div class="field">
				<label for="pl">{t('setup.searchPlace')}</label>
				<div class="row">
					<input
						id="pl"
						bind:value={placeQuery}
						onkeydown={(e) => e.key === 'Enter' && searchPlace()}
						placeholder="Oslo"
					/>
					<button onclick={searchPlace} disabled={searching}>{t('setup.search')}</button>
				</div>
			</div>
			{#if placeResults.length}
				<ul class="results">
					{#each placeResults as r}
						<li><button class="btn-ghost" onclick={() => pickPlace(r)}>{r.label}</button></li>
					{/each}
				</ul>
			{/if}
			{#if place}<p class="pill">📍 {place.label}</p>{/if}
			<div class="row spread">
				<button class="btn-ghost" onclick={() => (step = 2)}>{t('setup.back')}</button>
				<button class="btn-primary" onclick={() => (step = 4)}>{t('setup.next')}</button>
			</div>
		{:else}
			<h2>{t('setup.members')}</h2>
			<p class="muted">{t('setup.membersBlurb')}</p>
			<div class="stack">
				{#each members as m, i}
					<div class="row row-wrap member">
						<button
							class="emoji-btn"
							onclick={() => (m.emoji = emojis[(emojis.indexOf(m.emoji) + 1) % emojis.length])}
							title="emoji">{m.emoji}</button
						>
						<input placeholder={t('setup.name')} bind:value={m.name} style="flex:1;min-width:120px" />
						<select bind:value={m.role} style="width:auto">
							<option value="adult">{t('setup.adult')}</option>
							<option value="child">{t('setup.child')}</option>
						</select>
						<input type="color" bind:value={m.color} style="width:52px;padding:2px" />
						<button class="btn-ghost" onclick={() => members.splice(i, 1)}>✕</button>
					</div>
				{/each}
			</div>
			<button class="add" onclick={addMember}>+ {t('setup.addMember')}</button>

			{#if err}<p class="error">{err}</p>{/if}
			<div class="row spread">
				<button class="btn-ghost" onclick={() => (step = 3)}>{t('setup.back')}</button>
				<button class="btn-primary" disabled={busy} onclick={finish}>
					{busy ? t('setup.creating') : t('setup.finish')}
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.wrap {
		/* dvh so the wizard isn't shoved under iOS Safari's toolbars on first run. */
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding-block: 40px max(40px, env(safe-area-inset-bottom));
		padding-inline: max(16px, env(safe-area-inset-left)) max(16px, env(safe-area-inset-right));
	}
	.card {
		width: 100%;
		max-width: 520px;
	}
	.results {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--s-5);
	}
	.results li button {
		width: 100%;
		text-align: left;
	}
	.member {
		background: var(--surface-2);
		padding: var(--s-3);
		border-radius: 10px;
	}
	.emoji-btn {
		font-size: var(--t-5);
		min-width: 48px;
	}
	.add {
		margin: var(--s-5) 0 var(--s-6);
	}
</style>
