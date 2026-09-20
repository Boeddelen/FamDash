<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import { apiAdmin } from '$lib/adminGate';
	import { toast } from '$lib/toast';
	import { getI18n, localeTag } from '$lib/i18n';
	import PdfViewer from '$lib/components/PdfViewer.svelte';

	let { data } = $props();
	const { t, locale } = getI18n();

	type Doc = {
		id: string;
		title: string;
		sizeBytes: number;
		uploadedAt: number;
		groupId: string | null;
		archivedAt: number | null;
	};

	let fileInput = $state<HTMLInputElement>();
	/** Which box the pending file picker is filing into — null means the unfiled pile. */
	let uploadTarget = $state<string | null>(null);
	let busy = $state<string | null>(null);
	let viewing = $state<{ id: string; title: string } | null>(null);
	let showArchive = $state(false);

	// One pass over the documents instead of a .filter() per box, so a term's worth of
	// PDFs across half a dozen boxes stays one walk rather than boxes × documents.
	const all = $derived(data.documents as Doc[]);
	const archivedCount = $derived(all.filter((d) => d.archivedAt !== null).length);
	const byGroup = $derived.by(() => {
		const m = new Map<string, Doc[]>();
		for (const d of all) {
			// The archive is out of sight unless asked for: after a term the boxes would
			// otherwise be a wall of old plans with this week's buried at the top.
			if (d.archivedAt !== null && !showArchive) continue;
			const k = d.groupId ?? '_none';
			if (!m.has(k)) m.set(k, []);
			m.get(k)!.push(d);
		}
		return m;
	});
	const unfiled = $derived(byGroup.get('_none') ?? []);

	function pick(groupId: string | null) {
		uploadTarget = groupId;
		fileInput?.click();
	}

	async function upload() {
		const file = fileInput?.files?.[0];
		if (!file) return;
		const target = uploadTarget;
		busy = target ?? '_none';
		const fd = new FormData();
		fd.append('file', file);
		if (target) fd.append('groupId', target);
		try {
			// Not apiAdmin(): this is a multipart POST, and apiAdmin sets a JSON content
			// type. The 401 path does the same prompt-and-retry by hand.
			const res = await fetch('/api/school-documents', { method: 'POST', body: fd });
			if (res.status === 401) {
				const { ensureAdmin } = await import('$lib/adminGate');
				if (await ensureAdmin()) return upload();
				return;
			}
			const b = await res.json();
			if (!res.ok) throw new ApiError(res.status, b.message ?? 'Upload failed');
			await invalidateAll();
			toast(t('common.saved'), 'ok');
		} catch (e) {
			toast(e instanceof ApiError ? e.message : 'Upload failed', 'error');
		} finally {
			busy = null;
			// Cleared last: re-picking the same file must still fire `change`.
			if (fileInput) fileInput.value = '';
		}
	}

	async function newBox() {
		const name = prompt(t('docs.boxNamePrompt'));
		if (!name?.trim()) return;
		await apiAdmin('/api/document-groups', {
			method: 'POST',
			body: JSON.stringify({ name: name.trim() })
		});
		await invalidateAll();
	}

	async function renameBox(id: string, name: string) {
		const trimmed = name.trim();
		if (!trimmed) return;
		await apiAdmin(`/api/document-groups/${id}`, {
			method: 'PATCH',
			body: JSON.stringify({ name: trimmed })
		});
		await invalidateAll();
	}

	async function deleteBox(id: string, name: string) {
		if (!confirm(t('docs.deleteBoxConfirm', { name }))) return;
		await apiAdmin(`/api/document-groups/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	async function rename(id: string, current: string) {
		const title = prompt(t('docs.rename'), current);
		if (!title || title === current) return;
		await api(`/api/school-documents/${id}`, {
			method: 'PATCH',
			body: JSON.stringify({ title })
		});
		await invalidateAll();
	}

	async function setArchived(id: string, archived: boolean) {
		await apiAdmin(`/api/school-documents/${id}`, {
			method: 'PATCH',
			body: JSON.stringify({ archived })
		});
		await invalidateAll();
	}

	async function del(id: string) {
		if (!confirm(t('docs.deleteConfirm'))) return;
		await apiAdmin(`/api/school-documents/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	function fmtSize(b: number) {
		return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} kB`;
	}
	function fmtDate(ts: number) {
		return new Date(ts * 1000).toLocaleDateString(localeTag(locale), {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<div class="page-head">
	<div class="headings">
		<h1>{t('docs.title')}</h1>
		<p class="muted blurb">{t('docs.blurb')} {t('docs.archiveNote')}</p>
	</div>
	{#if archivedCount > 0}
		<button class="btn-ghost arch" onclick={() => (showArchive = !showArchive)}>
			{showArchive ? t('docs.hideArchive') : t('docs.showArchive', { n: archivedCount })}
		</button>
	{/if}
	{#if data.isAdmin}
		<button class="btn-add" onclick={newBox} aria-label={t('docs.newBox')} title={t('docs.newBox')}>
			<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
				<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
			</svg>
		</button>
	{/if}
</div>

<!-- One picker for the whole page; `uploadTarget` decides which box receives the file. -->
<input type="file" accept="application/pdf,.pdf" bind:this={fileInput} onchange={upload} hidden />

{#snippet docRow(d: Doc)}
	<li class="doc" class:archived={d.archivedAt !== null}>
		<button class="open" onclick={() => (viewing = { id: d.id, title: d.title })}>
			<span class="ic" aria-hidden="true">📄</span>
			<span class="meta">
				<span class="name">{d.title}</span>
				<span class="muted sub">
					{fmtSize(d.sizeBytes)} · {fmtDate(d.uploadedAt)}{d.archivedAt !== null
						? ` · ${t('docs.archived')}`
						: ''}
				</span>
			</span>
		</button>
		<!-- Icon-only controls: the glyph is aria-hidden and the name lives in aria-label.
		     A button whose text content is an emoji takes *that* as its accessible name —
		     `title` is only a fallback when there is no content — so a screen reader would
		     otherwise announce "wastebasket". -->
		<div class="acts">
			<a
				class="btn-ghost"
				href="/api/school-documents/{d.id}/file?dl=1"
				download
				aria-label={t('docs.download')}
				title={t('docs.download')}><span aria-hidden="true">⬇</span></a
			>
			<!-- Renaming is everyone's; deleting is not. -->
			<button
				class="btn-ghost"
				onclick={() => rename(d.id, d.title)}
				aria-label={t('docs.rename')}
				title={t('docs.rename')}><span aria-hidden="true">✏️</span></button
			>
			{#if data.isAdmin}
				{#if d.archivedAt !== null}
					<button
						class="btn-ghost"
						onclick={() => setArchived(d.id, false)}
						aria-label={t('docs.unarchive')}
						title={t('docs.unarchive')}><span aria-hidden="true">↩️</span></button
					>
				{/if}
				<button
					class="btn-ghost"
					onclick={() => del(d.id)}
					aria-label={t('docs.delete')}
					title={t('docs.delete')}><span aria-hidden="true">🗑</span></button
				>
			{/if}
		</div>
	</li>
{/snippet}

<div class="boxes">
	{#each data.groups as g (g.id)}
		{@const docs = byGroup.get(g.id) ?? []}
		<section class="card box">
			<header class="boxhead">
				{#if data.isAdmin}
					<!-- Inline-editable, like the tag and member rows elsewhere: the name is an
					     <input value=…>, not a text node. -->
					<input
						class="boxname"
						value={g.name}
						aria-label={t('docs.boxName')}
						onchange={(e) => renameBox(g.id, e.currentTarget.value)}
					/>
				{:else}
					<h2 class="boxname static">{g.name}</h2>
				{/if}
				<span class="count muted">{docs.length}</span>
				<button
					class="btn-add sm"
					onclick={() => pick(g.id)}
					disabled={busy === g.id}
					aria-label={t('docs.addTo', { name: g.name })}
					title={t('docs.addTo', { name: g.name })}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
						<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
					</svg>
				</button>
				{#if data.isAdmin}
					<button
						class="btn-ghost rm"
						onclick={() => deleteBox(g.id, g.name)}
						aria-label={t('docs.deleteBox')}
						title={t('docs.deleteBox')}><span aria-hidden="true">🗑</span></button
					>
				{/if}
			</header>

			{#if docs.length === 0}
				<p class="muted empty">{busy === g.id ? t('docs.uploading') : t('docs.boxEmpty')}</p>
			{:else}
				<ul class="docs">
					{#each docs as d (d.id)}{@render docRow(d)}{/each}
				</ul>
			{/if}
		</section>
	{/each}

	<!-- The unfiled pile only appears when something is actually in it, so a tidy
	     household never sees an empty box it didn't make. -->
	{#if unfiled.length > 0}
		<section class="card box">
			<header class="boxhead">
				<h2 class="boxname static">{t('docs.unfiled')}</h2>
				<span class="count muted">{unfiled.length}</span>
				<button
					class="btn-add sm"
					onclick={() => pick(null)}
					disabled={busy === '_none'}
					aria-label={t('docs.addTo', { name: t('docs.unfiled') })}
					title={t('docs.addTo', { name: t('docs.unfiled') })}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
						<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
					</svg>
				</button>
			</header>
			<ul class="docs">
				{#each unfiled as d (d.id)}{@render docRow(d)}{/each}
			</ul>
		</section>
	{/if}
</div>

{#if data.groups.length === 0 && unfiled.length === 0}
	<p class="muted">{t('docs.none')}</p>
{/if}

{#if viewing}
	<PdfViewer
		src="/api/school-documents/{viewing.id}/file"
		title={viewing.title}
		onclose={() => (viewing = null)}
	/>
{/if}

<style>
	.headings {
		flex: 1;
		min-width: 0;
	}
	.headings h1 {
		margin-bottom: var(--s-1);
	}
	.blurb {
		margin: 0;
		font-size: var(--t-3);
	}
	.page-head .btn-add {
		margin-top: var(--s-1);
	}

	/* Boxes tile and stay aligned: equal-width tracks that shrink honestly on a phone,
	   and `align-items: start` so a box with six documents doesn't stretch its empty
	   neighbour to match. */
	.boxes {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
		gap: var(--s-6);
		align-items: start;
	}
	.box {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
		padding: var(--s-5);
	}
	.boxhead {
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}
	.boxname {
		flex: 1;
		min-width: 0;
		font-size: var(--t-5);
		font-weight: 700;
	}
	/* The editable name is an <input> but shouldn't look like a form field until it's
	   touched — otherwise a page of boxes reads as a settings screen. */
	input.boxname {
		border-color: transparent;
		background: none;
		padding: var(--s-1) var(--s-2);
		min-height: 40px;
	}
	input.boxname:hover {
		border-color: var(--border);
	}
	input.boxname:focus {
		border-color: var(--primary);
		background: var(--surface);
	}
	.boxname.static {
		margin: 0;
	}
	.count {
		font-size: var(--t-2);
		flex: none;
	}
	.btn-add.sm {
		width: 32px;
		height: 32px;
	}
	@media (pointer: coarse) {
		.btn-add.sm {
			width: 40px;
			height: 40px;
		}
	}
	.rm {
		min-height: 36px;
		padding: var(--s-1) var(--s-2);
		flex: none;
	}
	.empty {
		margin: 0;
		font-size: var(--t-3);
	}
	.arch {
		flex: none;
		min-height: 40px;
		font-size: var(--t-3);
		white-space: nowrap;
	}
	/* Archived rows stay legible but visibly out of play, so a box showing the archive
	   doesn't read as though six weekly plans are all still current. */
	.doc.archived {
		background: none;
		border: 1px dashed var(--border);
	}
	.doc.archived .name {
		color: var(--text-dim);
		font-weight: 500;
	}

	.docs {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	/* One compact row per document rather than a card each: the title and its size/date
	   line up down the box, which is what makes two boxes side by side readable. */
	.doc {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-2);
		border-radius: 10px;
		background: var(--surface-2);
	}
	.open {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		border: none;
		background: none;
		padding: 0;
		text-align: left;
		min-height: 40px;
		flex: 1;
		min-width: 0;
	}
	.ic {
		font-size: var(--t-5);
		flex: none;
	}
	.meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.name {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub {
		font-size: var(--t-1);
	}
	.acts {
		display: flex;
		gap: var(--s-1);
		flex: none;
	}
	.acts .btn-ghost {
		min-height: 36px;
		padding: var(--s-1) var(--s-2);
		font-size: var(--t-3);
	}
	@media (pointer: coarse) {
		.acts .btn-ghost {
			min-height: 44px;
		}
	}
</style>
