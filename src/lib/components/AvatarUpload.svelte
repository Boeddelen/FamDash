<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { apiAdmin } from '$lib/adminGate';
	import { ApiError } from '$lib/api';
	import { shrinkAvatar } from '$lib/image';
	import { toast } from '$lib/toast';
	import Avatar from './Avatar.svelte';

	let {
		member
	}: { member: { id: string; name: string; emoji: string; color: string; hasAvatar?: boolean } } =
		$props();

	let input = $state<HTMLInputElement>();
	let busy = $state(false);
	// Cache-bust the <img> after an upload.
	let bust = $state(0);

	async function upload() {
		const picked = input?.files?.[0];
		if (!picked) return;
		busy = true;
		// Downscale before sending: a phone photo is megabytes, the avatar is 80px.
		const file = await shrinkAvatar(picked);
		const fd = new FormData();
		fd.append('file', file);
		try {
			const res = await fetch(`/api/members/${member.id}/avatar`, { method: 'POST', body: fd });
			if (res.status === 401) {
				toast('Admin', 'error');
				return;
			}
			if (!res.ok) throw new ApiError(res.status, (await res.json()).message ?? 'Upload failed');
			bust = Date.now();
			await invalidateAll();
		} catch (e) {
			toast(e instanceof ApiError ? e.message : 'Upload failed', 'error');
		} finally {
			busy = false;
			if (input) input.value = '';
		}
	}

	async function remove() {
		busy = true;
		try {
			await apiAdmin(`/api/members/${member.id}/avatar`, { method: 'DELETE' });
			bust = Date.now();
			await invalidateAll();
		} finally {
			busy = false;
		}
	}
</script>

<div class="wrap">
	<button class="pic" onclick={() => input?.click()} disabled={busy} title="Bytt bilde">
		{#if member.hasAvatar}
			{#key bust}
				<img src="/api/members/{member.id}/avatar?v={bust}" alt={member.name} />
			{/key}
		{:else}
			<!-- No progress ring while you're editing the picture — it's noise here. -->
			<Avatar {member} size={80} progress={false} />
		{/if}
		<span class="edit">📷</span>
	</button>
	{#if member.hasAvatar}
		<button class="btn-ghost tiny" onclick={remove} disabled={busy}>✕</button>
	{/if}
	<input
		type="file"
		accept="image/png,image/jpeg,image/webp,image/gif"
		bind:this={input}
		onchange={upload}
		hidden
	/>
</div>

<style>
	.wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-2);
	}
	.pic {
		position: relative;
		width: 80px;
		height: 80px;
		border-radius: 50%;
		padding: 0;
		border: none;
		background: none;
		overflow: visible;
	}
	.pic img {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		object-fit: cover;
	}
	.edit {
		position: absolute;
		right: -2px;
		bottom: -2px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 50%;
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		font-size: var(--t-2);
	}
	.tiny {
		min-height: 24px;
		padding: 0 var(--s-3);
		font-size: var(--t-2);
	}
</style>
