<script lang="ts">
	import { adminPrompt } from '$lib/adminGate';
	import { api, ApiError } from '$lib/api';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/toast';
	import { getI18n } from '$lib/i18n';
	import PinPad from './PinPad.svelte';

	const { t } = getI18n();

	let mode = $state<'password' | 'pin'>('password');
	let email = $state('');
	let password = $state('');
	let pin = $state('');
	let busy = $state(false);
	let err = $state('');

	function close(ok: boolean) {
		$adminPrompt?.resolve(ok);
		adminPrompt.set(null);
		mode = 'password';
		email = '';
		password = '';
		pin = '';
		err = '';
	}

	async function onSuccess() {
		await invalidateAll();
		toast(t('admin.on'), 'ok');
		close(true);
	}

	async function submitPassword(e: Event) {
		e.preventDefault();
		busy = true;
		err = '';
		try {
			await api('/api/admin/login', {
				method: 'POST',
				body: JSON.stringify({ email, password }),
				quiet: true
			});
			await onSuccess();
		} catch (e2) {
			err = e2 instanceof ApiError ? e2.message : t('admin.wrong');
		} finally {
			busy = false;
		}
	}

	async function submitPin(e: Event) {
		e.preventDefault();
		busy = true;
		err = '';
		try {
			await api('/api/admin/login-pin', {
				method: 'POST',
				body: JSON.stringify({ pin }),
				quiet: true
			});
			await onSuccess();
		} catch (e2) {
			err = e2 instanceof ApiError ? e2.message : t('admin.wrongPin');
			pin = '';
		} finally {
			busy = false;
		}
	}

	function switchMode(m: 'password' | 'pin') {
		mode = m;
		err = '';
		pin = '';
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && $adminPrompt && close(false)} />

{#if $adminPrompt}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="backdrop" onclick={() => close(false)} role="presentation">
		{#if mode === 'password'}
			<form
				class="card modal"
				onsubmit={submitPassword}
				onclick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label={t('admin.title')}
			>
				<h2>{t('admin.title')}</h2>
				<p class="muted">{t('admin.blurb')}</p>
				<div class="field">
					<label for="ag-email">{t('admin.email')}</label>
					<input id="ag-email" type="email" bind:value={email} autocomplete="username" required />
				</div>
				<div class="field">
					<label for="ag-pass">{t('admin.password')}</label>
					<input
						id="ag-pass"
						type="password"
						bind:value={password}
						autocomplete="current-password"
						required
					/>
				</div>
				{#if err}<p class="error">{err}</p>{/if}
				<div class="row spread">
					<button type="button" class="btn-ghost" onclick={() => close(false)}>{t('admin.cancel')}</button>
					<button type="submit" class="btn-primary" disabled={busy}>
						{busy ? t('admin.signingIn') : t('admin.signIn')}
					</button>
				</div>
				<button type="button" class="btn-ghost switch" onclick={() => switchMode('pin')}>
					{t('admin.usePin')}
				</button>
			</form>
		{:else}
			<form
				class="card modal"
				onsubmit={submitPin}
				onclick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label={t('admin.pinTitle')}
			>
				<h2>{t('admin.pinTitle')}</h2>
				<p class="muted">{t('admin.enterPin')}</p>
				<PinPad bind:pin max={10} />
				{#if err}<p class="error">{err}</p>{/if}
				<div class="row spread">
					<button type="button" class="btn-ghost" onclick={() => close(false)}>{t('admin.cancel')}</button>
					<!-- 4 digits is the floor: an adult family member can unlock with their own PIN. -->
					<button type="submit" class="btn-primary" disabled={busy || pin.length < 4}>
						{busy ? t('admin.signingIn') : t('admin.signIn')}
					</button>
				</div>
				<button type="button" class="btn-ghost switch" onclick={() => switchMode('password')}>
					{t('admin.usePassword')}
				</button>
			</form>
		{/if}
	</div>
{/if}

<style>
	/* .backdrop / .modal come from app.css */
	.modal {
		max-width: 380px;
		text-align: center;
	}
	.modal .field,
	.modal .error {
		text-align: left;
	}
	.switch {
		display: block;
		margin: var(--s-5) auto 0;
		font-size: var(--t-3);
	}
</style>
