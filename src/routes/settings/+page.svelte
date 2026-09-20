<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { apiAdmin, ensureAdmin } from '$lib/adminGate';
	import { api } from '$lib/api';
	import { toast } from '$lib/toast';
	import PlacePicker from '$lib/components/PlacePicker.svelte';
	import AvatarUpload from '$lib/components/AvatarUpload.svelte';
	import { getI18n, LOCALES } from '$lib/i18n';

	let { data } = $props();
	const { t } = getI18n();

	async function elevate() {
		if (await ensureAdmin()) await invalidateAll();
	}

	// --- Household ---
	let hName = $state(data.household.name);
	let hTz = $state(data.household.timezone);
	let hTheme = $state(data.household.theme);
	let hLocale = $state(data.household.locale);
	let weather = $state(
		data.household.weatherLat != null
			? {
					label: data.household.weatherLabel ?? 'Home',
					lat: data.household.weatherLat,
					lon: data.household.weatherLon!
				}
			: null
	);
	async function saveHousehold() {
		await apiAdmin('/api/household', {
			method: 'PATCH',
			body: JSON.stringify({
				name: hName,
				timezone: hTz,
				theme: hTheme,
				locale: hLocale,
				weather: weather ? { lat: weather.lat, lon: weather.lon, label: weather.label } : null
			})
		});
		toast(t('common.saved'), 'ok');
		await invalidateAll();
	}

	// --- Members ---
	const emojis = ['🦊', '🐨', '🐼', '🐧', '🦁', '🐢', '🦉', '🐝', '🌟', '🚀', '🐰', '🐳'];
	let newMember = $state({ name: '', role: 'child' as 'adult' | 'child', emoji: '🦊', color: '#4f46e5' });
	async function addMember() {
		if (!newMember.name.trim()) return;
		await apiAdmin('/api/members', { method: 'POST', body: JSON.stringify(newMember) });
		newMember = { name: '', role: 'child', emoji: emojis[Math.floor(Math.random() * emojis.length)], color: '#4f46e5' };
		await invalidateAll();
	}
	async function updateMember(id: string, patch: Record<string, unknown>) {
		await apiAdmin(`/api/members/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
		await invalidateAll();
	}
	async function setPin(id: string) {
		const pin = prompt(t('settings.newPin'), '');
		if (pin === null) return;
		if (pin !== '' && !/^\d{4,8}$/.test(pin)) return toast('PIN 4–8', 'error');
		await updateMember(id, { pin });
		toast(t('common.saved'), 'ok');
	}
	async function delMember(id: string) {
		if (!confirm(t('settings.removeMember'))) return;
		await apiAdmin(`/api/members/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	// --- Tags ---
	let newTag = $state({ label: '', color: '#6b7280' });
	async function addTag() {
		if (!newTag.label.trim()) return;
		try {
			await apiAdmin('/api/tags', { method: 'POST', body: JSON.stringify(newTag) });
			newTag = { label: '', color: '#6b7280' };
			await invalidateAll();
		} catch {
			/* handled */
		}
	}
	async function updateTag(id: string, patch: Record<string, unknown>) {
		await apiAdmin(`/api/tags/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
		await invalidateAll();
	}
	async function delTag(id: string) {
		if (!confirm(t('tags.deleteConfirm'))) return;
		await apiAdmin(`/api/tags/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	// --- Admins ---
	let newAdmin = $state({ name: '', email: '', password: '' });
	async function addAdmin() {
		try {
			await apiAdmin('/api/admins', { method: 'POST', body: JSON.stringify(newAdmin) });
			newAdmin = { name: '', email: '', password: '' };
			await invalidateAll();
			toast(t('settings.adminAdded'), 'ok');
		} catch {
			/* handled */
		}
	}
	async function delAdmin(id: string) {
		if (!confirm(t('settings.removeAdmin'))) return;
		try {
			await apiAdmin(`/api/admins/${id}`, { method: 'DELETE' });
			await invalidateAll();
		} catch {
			/* handled */
		}
	}
	async function changePassword(id: string) {
		const password = prompt(t('settings.newPw'));
		if (!password) return;
		await apiAdmin(`/api/admins/${id}`, { method: 'PATCH', body: JSON.stringify({ password }) });
		toast(t('settings.pwChanged'), 'ok');
	}
	async function setAdminPin(id: string) {
		const pin = prompt(t('settings.newAdminPin'), '');
		if (pin === null) return;
		if (pin !== '' && !/^\d{6,10}$/.test(pin)) return toast('PIN 6–10', 'error');
		try {
			await apiAdmin(`/api/admins/${id}`, { method: 'PATCH', body: JSON.stringify({ pin }) });
			await invalidateAll();
			toast(t('common.saved'), 'ok');
		} catch {
			/* handled */
		}
	}

	// --- Calendars ---
	let addKind = $state<'caldav' | 'ics_sub' | 'google' | ''>('');
	let caldav = $state({ label: 'iCloud', serverUrl: 'https://caldav.icloud.com', username: '', password: '', color: '#0ea5e9' });
	let icssub = $state({ label: '', url: '', color: '#0ea5e9' });
	let google = $state({ label: 'Google Calendar', clientId: '', clientSecret: '', color: '#ef4444' });
	let remoteCals = $state<Record<string, { url: string; displayName: string }[]>>({});

	async function addCaldav() {
		await apiAdmin('/api/calendars', { method: 'POST', body: JSON.stringify({ kind: 'caldav', ...caldav }) });
		addKind = '';
		await invalidateAll();
		toast(t('settings.connected'), 'ok');
	}
	async function addIcs() {
		await apiAdmin('/api/calendars', { method: 'POST', body: JSON.stringify({ kind: 'ics_sub', ...icssub }) });
		addKind = '';
		await invalidateAll();
		toast(t('settings.subscribed'), 'ok');
	}
	async function startGoogle() {
		const res = await apiAdmin<{ authUrl: string }>('/api/calendars', {
			method: 'POST',
			body: JSON.stringify({ kind: 'google', ...google })
		});
		window.location.href = res.authUrl;
	}
	async function syncCal(id: string) {
		try {
			const r = await apiAdmin<{ events: number }>(`/api/calendars/${id}/sync`, { method: 'POST' });
			toast(`${t('settings.synced')} ${r.events}`, 'ok');
			await invalidateAll();
		} catch {
			/* handled */
		}
	}
	async function loadRemote(id: string) {
		remoteCals[id] = await apiAdmin(`/api/calendars/${id}/remote`);
	}
	async function patchCal(id: string, patch: Record<string, unknown>) {
		await apiAdmin(`/api/calendars/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
		await invalidateAll();
	}
	async function delCal(id: string) {
		if (!confirm(t('settings.removeCal'))) return;
		await apiAdmin(`/api/calendars/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	function copyFeed() {
		if (data.feedUrl) navigator.clipboard?.writeText(data.feedUrl).then(() => toast(t('settings.copied'), 'ok'));
	}
	async function regenerateFeed() {
		if (!confirm(t('settings.feedRegenConfirm'))) return;
		await apiAdmin('/api/household/feed-token', { method: 'POST' });
		await invalidateAll();
		toast(t('common.saved'), 'ok');
	}

	$effect(() => {
		if (data.calendarNotice === 'google_ok') toast(t('settings.connected'), 'ok');
		else if (data.calendarNotice?.startsWith('google_')) toast('Google: feil / error', 'error');
	});
</script>

<div class="page-head">
	<h1>{t('settings.title')}</h1>
</div>

{#if data.needsAdmin}
	<div class="card">
		<p>{t('settings.needAdmin')}</p>
		<button class="btn-primary" onclick={elevate}>{t('docs.signIn')}</button>
	</div>
{:else}
	<section class="card">
		<h3>{t('setup.household')}</h3>
		<div class="grid two">
			<div class="field"><label for="hn">{t('common.name')}</label><input id="hn" bind:value={hName} /></div>
			<div class="field"><label for="tz">{t('setup.timezone')}</label><input id="tz" bind:value={hTz} /></div>
		</div>
		<div class="grid two">
			<div class="field">
				<label for="lc">{t('setup.language')}</label>
				<select id="lc" bind:value={hLocale}>
					{#each LOCALES as l}<option value={l.code}>{l.label}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="th">{t('settings.theme')}</label>
				<select id="th" bind:value={hTheme}>
					<option value="auto">Auto</option>
					<option value="light">Light</option>
					<option value="dark">Dark</option>
				</select>
			</div>
		</div>
		<div class="field">
			<label>{t('settings.weatherLoc')}</label>
			{#if weather}<p class="pill">📍 {weather.label} <button class="btn-ghost x" onclick={() => (weather = null)}>✕</button></p>{/if}
			<PlacePicker onpick={(p) => { weather = { label: p.label, lat: p.lat, lon: p.lon }; hTz = p.timezone || hTz; }} />
		</div>
		<button class="btn-primary" onclick={saveHousehold}>{t('common.save')}</button>
	</section>

	<section class="card">
		<h3>{t('setup.members')}</h3>
		<ul class="mlist">
			{#each data.members as m (m.id)}
				<li class="mrow">
					<AvatarUpload member={m} />
					<div class="mfields">
						<div class="row">
							<input class="mname" value={m.name} onchange={(e) => updateMember(m.id, { name: e.currentTarget.value })} placeholder={t('common.name')} />
							<select value={m.role} onchange={(e) => updateMember(m.id, { role: e.currentTarget.value })}>
								<option value="adult">{t('setup.adult')}</option>
								<option value="child">{t('setup.child')}</option>
							</select>
						</div>
						<div class="row wrap">
							<label class="emojilbl">
								<span class="muted">Emoji</span>
								<input class="emoji" value={m.emoji} onchange={(e) => updateMember(m.id, { emoji: e.currentTarget.value })} />
							</label>
							<input type="color" value={m.color} onchange={(e) => updateMember(m.id, { color: e.currentTarget.value })} />
							<button class="btn-ghost" onclick={() => setPin(m.id)}>{m.hasPin ? '🔑 PIN' : 'PIN'}</button>
							<button class="btn-ghost" onclick={() => delMember(m.id)}>🗑</button>
						</div>
					</div>
				</li>
			{/each}
		</ul>
		<div class="row addrow">
			<input class="emoji" bind:value={newMember.emoji} />
			<input placeholder={t('common.name')} bind:value={newMember.name} style="flex:1" />
			<select bind:value={newMember.role}><option value="adult">{t('setup.adult')}</option><option value="child">{t('setup.child')}</option></select>
			<input type="color" bind:value={newMember.color} />
			<button class="btn-primary" onclick={addMember}>{t('common.add')}</button>
		</div>
	</section>

	<section class="card">
		<h3>{t('tags.title')}</h3>
		{#if data.allTags.length === 0}<p class="muted">{t('tags.none')}</p>{/if}
		<ul class="list">
			{#each data.allTags as tg (tg.id)}
				<li>
					<input type="color" value={tg.color} onchange={(e) => updateTag(tg.id, { color: e.currentTarget.value })} />
					<input
						class="mname"
						value={tg.label}
						onchange={(e) => updateTag(tg.id, { label: e.currentTarget.value })}
					/>
					<button class="btn-ghost" onclick={() => delTag(tg.id)}>🗑</button>
				</li>
			{/each}
		</ul>
		<div class="row addrow">
			<input type="color" bind:value={newTag.color} />
			<input placeholder={t('tags.label')} bind:value={newTag.label} style="flex:1" />
			<button class="btn-primary" onclick={addTag}>{t('tags.add')}</button>
		</div>
	</section>

	<section class="card">
		<h3>{t('settings.admins')}</h3>
		<ul class="list">
			{#each data.admins as a (a.id)}
				<li>
					<span style="flex:1">{a.name} <span class="muted">· {a.email}</span></span>
					<button class="btn-ghost" onclick={() => changePassword(a.id)}>{t('settings.changePw')}</button>
					<button class="btn-ghost" onclick={() => setAdminPin(a.id)}>{a.hasPin ? '🔑 PIN' : t('settings.setAdminPin')}</button>
					{#if data.admins.length > 1}<button class="btn-ghost" onclick={() => delAdmin(a.id)}>🗑</button>{/if}
				</li>
			{/each}
		</ul>
		<div class="grid three addrow">
			<input placeholder={t('common.name')} bind:value={newAdmin.name} />
			<input placeholder={t('settings.email')} type="email" bind:value={newAdmin.email} />
			<input placeholder={t('settings.password')} type="password" bind:value={newAdmin.password} />
		</div>
		<button class="btn-primary" onclick={addAdmin}>{t('settings.addAdmin')}</button>
	</section>

	<section class="card">
		<h3>{t('settings.calendars')}</h3>
		<ul class="list">
			{#each data.calendars as c (c.id)}
				<li class="cal">
					<div class="cal-main">
						<span class="swatch" style="background:{c.color}"></span>
						<strong>{c.label}</strong>
						<span class="muted">· {c.kind}
							{#if c.lastError}· <span class="error">{t('settings.syncError')}</span>
							{:else if c.lastSyncAt}· {t('settings.synced')} {new Date(c.lastSyncAt * 1000).toLocaleTimeString()}{/if}
						</span>
					</div>
					<div class="row">
						<label class="inline"><input type="checkbox" checked={c.enabled} onchange={(e) => patchCal(c.id, { enabled: e.currentTarget.checked })} /> {t('settings.show')}</label>
						<button class="btn-ghost" onclick={() => syncCal(c.id)}>{t('settings.syncNow')}</button>
						{#if c.kind !== 'ics_sub'}
							<button class="btn-ghost" onclick={() => loadRemote(c.id)}>{t('settings.calendarsList')}</button>
						{/if}
						<button class="btn-ghost" onclick={() => delCal(c.id)}>🗑</button>
					</div>
					{#if c.lastError}<p class="error small">{c.lastError}</p>{/if}
					{#if remoteCals[c.id]}
						<div class="remote">
							<p class="muted small">{t('settings.calendarsList')}</p>
							{#each remoteCals[c.id] as rc}
								{@const cfg = (c.config ?? {}) as { calendars?: string[]; writeTarget?: string }}
								<label class="inline">
									<input
										type="checkbox"
										checked={!cfg.calendars?.length || cfg.calendars.includes(rc.url)}
										onchange={(e) => {
											const cur = new Set(cfg.calendars ?? remoteCals[c.id].map((x) => x.url));
											e.currentTarget.checked ? cur.add(rc.url) : cur.delete(rc.url);
											patchCal(c.id, { config: { ...cfg, calendars: [...cur] } });
										}}
									/>
									{rc.displayName}
									<button class="btn-ghost tiny" class:on={cfg.writeTarget === rc.url}
										onclick={() => patchCal(c.id, { config: { ...cfg, writeTarget: rc.url }, writable: true })}>✍️</button>
								</label>
							{/each}
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		{#if addKind === ''}
			<div class="row">
				<button onclick={() => (addKind = 'caldav')}>{t('settings.calAdd.caldav')}</button>
				<button onclick={() => (addKind = 'google')}>{t('settings.calAdd.google')}</button>
				<button onclick={() => (addKind = 'ics_sub')}>{t('settings.calAdd.ics')}</button>
			</div>
		{:else if addKind === 'caldav'}
			<div class="addbox">
				<div class="field"><label>{t('settings.label')}</label><input bind:value={caldav.label} /></div>
				<div class="field"><label>{t('settings.serverUrl')}</label><input bind:value={caldav.serverUrl} /></div>
				<div class="field"><label>{t('settings.appleId')}</label><input bind:value={caldav.username} /></div>
				<div class="field"><label>{t('settings.appPassword')}</label><input type="password" bind:value={caldav.password} /></div>
				<div class="row"><button class="btn-primary" onclick={addCaldav}>{t('settings.connect')}</button><button class="btn-ghost" onclick={() => (addKind = '')}>{t('chores.cancel')}</button></div>
			</div>
		{:else if addKind === 'google'}
			<div class="addbox">
				<p class="muted small">Create an OAuth client (type “Web application”) in Google Cloud Console with redirect URI <code>{data.feedUrl?.replace(/\/feed\/.*/, '')}/api/calendars/google/callback</code>, then paste its credentials.</p>
				<div class="field"><label>{t('settings.label')}</label><input bind:value={google.label} /></div>
				<div class="field"><label>{t('settings.clientId')}</label><input bind:value={google.clientId} /></div>
				<div class="field"><label>{t('settings.clientSecret')}</label><input type="password" bind:value={google.clientSecret} /></div>
				<div class="row"><button class="btn-primary" onclick={startGoogle}>{t('settings.toGoogle')}</button><button class="btn-ghost" onclick={() => (addKind = '')}>{t('chores.cancel')}</button></div>
			</div>
		{:else}
			<div class="addbox">
				<div class="field"><label>{t('settings.label')}</label><input bind:value={icssub.label} /></div>
				<div class="field"><label>{t('settings.icsUrl')}</label><input bind:value={icssub.url} placeholder="https://…" /></div>
				<div class="row"><button class="btn-primary" onclick={addIcs}>{t('settings.subscribe')}</button><button class="btn-ghost" onclick={() => (addKind = '')}>{t('chores.cancel')}</button></div>
			</div>
		{/if}
	</section>

	<section class="card">
		<h3>{t('settings.feed')}</h3>
		<p class="muted">{t('settings.feedBlurb')}</p>
		{#if data.feedUrl}
			<div class="row">
				<code class="feed">{data.feedUrl}</code>
				<button onclick={copyFeed}>{t('settings.copy')}</button>
				<button class="btn-ghost" onclick={regenerateFeed}>{t('settings.feedRegen')}</button>
			</div>
		{/if}
	</section>
{/if}

<style>
	section {
		margin-bottom: var(--s-6);
	}
	/* `minmax(0, 1fr)`, not a bare `1fr`: `1fr` is shorthand for `minmax(auto, 1fr)`, and
	   that `auto` floor stops a track shrinking below its content's min-content width —
	   so a field with a long label or an unbreakable value quietly pushes the whole page
	   sideways instead of the track giving way. Same trap as a `minmax(320px, 1fr)` track
	   without the inner `min()`. */
	.grid.two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.grid.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--s-6);
	}
	.list li {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-3) 0;
		border-bottom: 1px solid var(--border);
		flex-wrap: wrap;
	}
	.list li.cal {
		flex-direction: column;
		align-items: stretch;
	}
	.cal-main {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		flex-wrap: wrap;
	}
	.emoji {
		width: 52px;
		text-align: center;
	}
	.mname {
		flex: 1;
		min-width: 120px;
	}
	.mlist {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--s-6);
	}
	.mrow {
		display: flex;
		gap: var(--s-5);
		align-items: flex-start;
		padding: var(--s-4) 0;
		border-bottom: 1px solid var(--border);
	}
	.mfields {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.row.wrap {
		flex-wrap: wrap;
	}
	.emojilbl {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		font-size: var(--t-2);
		margin: 0;
	}
	.addrow {
		flex-wrap: wrap;
		gap: var(--s-3);
		margin-bottom: var(--s-4);
	}
	.addbox {
		background: var(--surface-2);
		padding: var(--s-5);
		border-radius: 10px;
		margin-top: var(--s-4);
	}
	.swatch {
		width: 12px;
		height: 12px;
		border-radius: 3px;
		display: inline-block;
	}
	.inline {
		display: inline-flex;
		gap: var(--s-3);
		align-items: center;
		min-height: 44px;
		margin: 0;
		font-size: var(--t-3);
	}
	.inline input[type='checkbox'] {
		/* Sizing comes from app.css (22px box). */
		min-height: auto;
	}
	.remote {
		margin-top: var(--s-3);
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.small {
		font-size: var(--t-2);
	}
	.tiny {
		min-height: 26px;
		padding: 0 var(--s-2);
	}
	.tiny.on {
		background: var(--primary);
	}
	.x {
		min-height: auto;
		padding: 0 var(--s-2);
	}
	.feed {
		flex: 1;
		overflow-x: auto;
		white-space: nowrap;
		background: var(--surface-2);
		padding: var(--s-3);
		border-radius: 8px;
		font-size: var(--t-2);
	}
	code {
		background: var(--surface-2);
		padding: var(--s-1) var(--s-2);
		border-radius: 4px;
		font-size: 0.85em;
	}
	@media (max-width: 640px) {
		.grid.two,
		.grid.three {
			grid-template-columns: 1fr;
		}
	}
</style>
