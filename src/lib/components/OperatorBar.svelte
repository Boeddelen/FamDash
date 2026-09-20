<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/toast';
	import { getI18n } from '$lib/i18n';
	import Avatar from './Avatar.svelte';
	import PinPad from './PinPad.svelte';
	import MemberProfileModal from './MemberProfileModal.svelte';

	type M = { id: string; name: string; emoji: string; color: string; hasPin: boolean; hasAvatar?: boolean };
	let {
		members,
		operator
	}: { members: M[]; operator: { id: string } | null } = $props();

	const { t } = getI18n();

	let pinFor = $state<M | null>(null);
	let pin = $state('');
	let busy = $state(false);
	let profileFor = $state<M | null>(null);

	async function becomeOperator(m: M) {
		if (m.hasPin) {
			profileFor = null;
			pinFor = m;
			pin = '';
			return;
		}
		await setOperator(m.id);
		profileFor = null;
	}

	async function signOutFromProfile() {
		await setOperator(null);
		profileFor = null;
	}

	async function setOperator(memberId: string | null, pinValue?: string) {
		busy = true;
		try {
			await api('/api/operator', {
				method: 'POST',
				body: JSON.stringify({ memberId, pin: pinValue }),
				quiet: true
			});
			pinFor = null;
			await invalidateAll();
		} catch (e) {
			toast(e instanceof ApiError ? e.message : t('op.wrongPin'), 'error');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && pinFor && (pinFor = null)} />

<div class="opbar" role="group" aria-label={t('op.who')}>
	<div class="people">
		{#each members as m (m.id)}
			<button
				class="choice"
				class:active={operator?.id === m.id}
				style="--c:{m.color}"
				onclick={() => (profileFor = m)}
				disabled={busy}
			>
				<Avatar member={m} size="clamp(52px, 15vw, 76px)" ring={operator?.id === m.id} />
				<span class="name">{m.name}</span>
			</button>
		{/each}
	</div>
	{#if operator}
		<button class="btn-ghost clear" onclick={() => setOperator(null)} disabled={busy}>
			{t('op.signOut')}
		</button>
	{/if}
</div>

{#if pinFor}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="backdrop" role="presentation" onclick={() => (pinFor = null)}>
		<div class="card pinpad" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
			<div class="pinhead">
				<Avatar member={pinFor} size={44} />
				<h3>{pinFor.name}</h3>
			</div>
			<p class="muted">{t('op.enterPin')}</p>
			<PinPad bind:pin />
			<div class="row spread">
				<button class="btn-ghost" onclick={() => (pinFor = null)}>{t('op.cancel')}</button>
				<button
					class="btn-primary"
					disabled={busy || pin.length < 3}
					onclick={() => setOperator(pinFor!.id, pin)}>{t('op.ok')}</button
				>
			</div>
		</div>
	</div>
{/if}

{#if profileFor}
	<MemberProfileModal
		member={profileFor}
		isOperator={operator?.id === profileFor.id}
		onBecomeOperator={() => becomeOperator(profileFor!)}
		onSignOut={signOutFromProfile}
		onClose={() => (profileFor = null)}
	/>
{/if}

<style>
	.opbar {
		display: flex;
		gap: var(--s-4) var(--s-6);
		flex-wrap: wrap;
		align-items: center;
	}
	/* Everyone on one row. This used to be `flex-wrap: wrap` over fixed 76px avatars,
	   which on a phone put three faces on one line and the fourth alone underneath —
	   the household stopped reading as a set, and the odd one out looked demoted.
	   Wrapping is off, and the avatar is sized in `vw` so four fit a 360px screen with
	   room over; a long name or an unusually large household scrolls sideways instead
	   of wrapping or pushing the page wide (same pattern as the /tasks tab strip).

	   `space-between` rather than centred: the faces reach both edges and use the whole
	   width the phone has, instead of huddling in the middle inside two dead margins. */
	.people {
		display: flex;
		flex-wrap: nowrap;
		gap: var(--s-3);
		overflow-x: auto;
		scrollbar-width: none;
		justify-content: space-between;
		flex: 1 1 auto;
		min-width: 0;
		padding-bottom: var(--s-1);
	}
	.people::-webkit-scrollbar {
		display: none;
	}
	.choice {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-2);
		border: none;
		background: none;
		padding: var(--s-2);
		min-height: auto;
		border-radius: 12px;
		flex: none;
		/* The name is allowed to be wider than the face, but not by so much that it
		   starts deciding the row's width. */
		max-width: 6.5rem;
	}
	.choice .name {
		font-size: var(--t-3);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}
	.choice.active .name {
		color: var(--c);
	}
	.clear {
		align-self: center;
		font-size: var(--t-3);
		min-height: 44px;
	}

	/* Tablet: the household stands up. A tablet has horizontal room to spare and far
	   less vertical, so the picker moves to a standing rail beside the content (the
	   shell turns this into a real column at the same width) instead of spending a
	   whole band across the top. It sticks, so whoever is using the tablet can switch
	   without scrolling back up a long page. */
	@media (min-width: 768px) {
		.opbar {
			flex-direction: column;
			align-items: stretch;
			gap: var(--s-4);
		}
		.people {
			flex-direction: column;
			justify-content: flex-start;
			gap: var(--s-4);
			overflow-x: visible;
			padding-bottom: 0;
		}
		.choice {
			max-width: none;
		}
	}
	/* .backdrop comes from app.css */
	.pinpad {
		width: 100%;
		max-width: 300px;
		text-align: center;
	}
	.pinhead {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-3);
	}
	.pinhead h3 {
		margin: 0;
	}
</style>
