<script lang="ts">
	import { getI18n, localeTag } from '$lib/i18n';
	import { api, ApiError } from '$lib/api';
	import { apiAdmin } from '$lib/adminGate';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/toast';
	import { page } from '$app/state';
	import { shrinkThumbnail } from '$lib/image';
	import {
		clampFraming,
		DEFAULT_FRAMING,
		framingStyle,
		ZOOM_MAX,
		ZOOM_MIN,
		type Framing
	} from '$lib/bonusImage';
	import Avatar from './Avatar.svelte';

	type M = { id: string; name: string; emoji: string; color: string; role: string; hasAvatar?: boolean };
	type BonusT = Framing & {
		id: string;
		title: string;
		notes: string | null;
		points: number;
		emoji: string;
		active: boolean;
		hasImage: boolean;
	};
	type ClaimT = {
		id: string;
		title: string;
		emoji: string;
		points: number;
		note: string | null;
		claimedAt: number;
		memberName: string;
		memberEmoji: string;
	};

	let {
		members,
		tasks,
		recentClaims
	}: { members: M[]; tasks: BonusT[]; recentClaims: ClaimT[] } = $props();

	const { t, locale } = getI18n();
	const isAdmin = $derived(!!page.data.admin);

	function fmtDate(ts: number) {
		return new Date(ts * 1000).toLocaleDateString(localeTag(locale), { day: 'numeric', month: 'short' });
	}

	// A paused card still shows to an admin (so it can be un-paused) but is out of the
	// deck everyone else browses.
	const visible = $derived(isAdmin ? tasks : tasks.filter((b) => b.active));

	// --- who's claiming ---
	// Same convention as both bandits: default to the first child so the common case
	// needs no extra tap, and `.pre` so it wins over the <select>'s native default.
	let forMember = $state<string | undefined>(undefined);
	$effect.pre(() => {
		if (forMember !== undefined) return;
		const fallback = members.find((m) => m.role === 'child')?.id ?? members[0]?.id;
		if (fallback) forMember = fallback;
	});

	let claiming = $state<string | null>(null);
	let result = $state<{ title: string; emoji: string; points: number; balance: number; member: M } | null>(
		null
	);

	async function claim(task: BonusT) {
		const member = members.find((m) => m.id === forMember);
		if (!member || claiming) return;
		claiming = task.id;
		try {
			const res = await api<{ claim: { title: string }; balance: number }>(
				`/api/bonus-tasks/${task.id}/claim`,
				{ method: 'POST', body: JSON.stringify({ memberId: member.id }) }
			);
			result = {
				title: res.claim.title,
				emoji: task.emoji,
				points: task.points,
				balance: res.balance,
				member
			};
			await invalidateAll();
		} catch {
			/* handled — api() toasts */
		} finally {
			claiming = null;
		}
	}

	/** Admin undo: deleting the claim row hands the points straight back. */
	async function undoClaim(c: ClaimT) {
		if (!confirm(t('bonus.undoConfirm', { title: c.title, points: c.points }))) return;
		try {
			await apiAdmin(`/api/bonus-claims/${c.id}`, { method: 'DELETE' });
			result = null;
			await invalidateAll();
			toast(t('bonus.undone'), 'ok');
		} catch {
			/* handled */
		}
	}

	// --- browsing the deck ---
	let rail = $state<HTMLDivElement>();
	let atStart = $state(true);
	let atEnd = $state(false);

	function measure() {
		if (!rail) return;
		atStart = rail.scrollLeft <= 4;
		// 4px of slack: sub-pixel widths mean scrollLeft rarely hits the exact maximum.
		atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4;
	}
	// Re-measure when cards are added or removed, not just when the rail is scrolled —
	// deleting the last card can leave the arrows stuck in a state that no longer fits.
	$effect(() => {
		visible.length;
		measure();
	});

	function browse(dir: 1 | -1) {
		if (!rail) return;
		// One card plus its gap, so a nudge always lands a whole card in view.
		const card = rail.querySelector('.bcard');
		const step = card ? card.getBoundingClientRect().width + 12 : rail.clientWidth * 0.8;
		rail.scrollBy({ left: dir * step, behavior: 'smooth' });
	}

	// --- catalog management (admin) ---
	let showForm = $state(false);
	let editing = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement>();
	let uploading = $state(false);
	// Cache-buster for the <img>, so a replaced thumbnail is actually refetched.
	let bust = $state(0);
	let form = $state({ title: '', notes: '', points: 5, emoji: '⭐', active: true });

	function startNew() {
		form = { title: '', notes: '', points: 5, emoji: '⭐', active: true };
		editing = null;
		showForm = true;
	}
	function startEdit(b: BonusT) {
		form = { title: b.title, notes: b.notes ?? '', points: b.points, emoji: b.emoji, active: b.active };
		editing = b.id;
		showForm = true;
	}

	async function save() {
		if (!form.title.trim() || form.points < 1) return;
		const payload = { ...form, notes: form.notes.trim() || null };
		try {
			if (editing) {
				await apiAdmin(`/api/bonus-tasks/${editing}`, { method: 'PATCH', body: JSON.stringify(payload) });
				showForm = false;
			} else {
				const created = await apiAdmin<{ id: string }>('/api/bonus-tasks', {
					method: 'POST',
					body: JSON.stringify(payload)
				});
				// Stay in the dialog, now editing the card that was just created: the
				// obvious next step is giving it a picture, and the image endpoint needs
				// an id to upload against. Closing here would mean finding the new card
				// in the deck and reopening it first.
				editing = created.id;
			}
			await invalidateAll();
			toast(t('common.saved'), 'ok');
		} catch {
			/* handled */
		}
	}

	async function del(id: string) {
		if (!confirm(t('bonus.deleteConfirm'))) return;
		try {
			await apiAdmin(`/api/bonus-tasks/${id}`, { method: 'DELETE' });
			showForm = false;
			await invalidateAll();
		} catch {
			/* handled */
		}
	}

	async function uploadImage() {
		const picked = fileInput?.files?.[0];
		if (!picked || !editing) return;
		uploading = true;
		// Downscaled in the browser first — a phone photo is megabytes, the card is ~200px.
		const file = await shrinkThumbnail(picked);
		const fd = new FormData();
		fd.append('file', file);
		try {
			const res = await fetch(`/api/bonus-tasks/${editing}/image`, { method: 'POST', body: fd });
			if (res.status === 401) {
				toast(t('bonus.adminNeeded'), 'error');
				return;
			}
			if (!res.ok) throw new ApiError(res.status, (await res.json()).message ?? 'Upload failed');
			bust = Date.now();
			await invalidateAll();
		} catch (e) {
			toast(e instanceof ApiError ? e.message : 'Upload failed', 'error');
		} finally {
			uploading = false;
			if (fileInput) fileInput.value = '';
		}
	}

	async function removeImage() {
		if (!editing) return;
		uploading = true;
		try {
			await apiAdmin(`/api/bonus-tasks/${editing}/image`, { method: 'DELETE' });
			bust = Date.now();
			await invalidateAll();
		} catch {
			/* handled */
		} finally {
			uploading = false;
		}
	}

	const editingTask = $derived(editing ? tasks.find((b) => b.id === editing) : undefined);

	// --- framing the picture inside the card's window ---
	// A photo taken for something else never crops well by luck: the dog's head ends up
	// half out of frame, or a wide shot loses its subject to the sides. So the framing
	// is dragged into place here against a preview that *is* the card's window, and
	// saved per card.
	let framing = $state<Framing>({ ...DEFAULT_FRAMING });
	// The picture is only reframed while the dialog is open, and only a whole new pick
	// (a different card) should reset it — not every keystroke elsewhere in the form.
	let framingFor = $state<string | null>(null);
	let frame = $state<HTMLDivElement>();
	let dragging = $state(false);

	$effect(() => {
		if (!showForm || !editingTask) return;
		if (framingFor === editingTask.id) return;
		framing = clampFraming(editingTask);
		framingFor = editingTask.id;
	});

	/** Persist the framing on its own — the title/points fields are saved separately. */
	async function saveFraming() {
		if (!editing) return;
		try {
			await apiAdmin(`/api/bonus-tasks/${editing}`, {
				method: 'PATCH',
				body: JSON.stringify(framing)
			});
			await invalidateAll();
		} catch {
			/* handled */
		}
	}

	/** Point the frame at wherever the finger/cursor is, in per cent of the window. */
	function aimAt(e: PointerEvent) {
		if (!frame) return;
		const r = frame.getBoundingClientRect();
		framing.imageX = Math.min(100, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * 100)));
		framing.imageY = Math.min(100, Math.max(0, Math.round(((e.clientY - r.top) / r.height) * 100)));
	}

	function startDrag(e: PointerEvent) {
		if (!editingTask?.hasImage) return;
		dragging = true;
		// Capture, so a finger that slides off the little preview keeps dragging
		// instead of dropping the picture mid-adjustment. It throws if the pointer is
		// already gone, which is not a reason to lose the drag.
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			/* capture is a nicety, not a requirement */
		}
		aimAt(e);
	}
	function moveDrag(e: PointerEvent) {
		if (dragging) aimAt(e);
	}
	function endDrag(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			/* already released */
		}
		saveFraming();
	}

	/** Arrow keys nudge the focal point — the drag target is tiny on a tablet. */
	function nudge(e: KeyboardEvent) {
		const step = e.shiftKey ? 10 : 2;
		const by: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step]
		};
		const delta = by[e.key];
		if (!delta) return;
		e.preventDefault();
		framing.imageX = Math.min(100, Math.max(0, framing.imageX + delta[0]));
		framing.imageY = Math.min(100, Math.max(0, framing.imageY + delta[1]));
		saveFraming();
	}

	function resetFraming() {
		framing = { ...DEFAULT_FRAMING };
		saveFraming();
	}
	function setFit(fit: 'cover' | 'contain') {
		framing.imageFit = fit;
		saveFraming();
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && showForm && (showForm = false)} />

<section class="card bonus">
	<div class="row spread">
		<h3>⭐ {t('bonus.title')}</h3>
		{#if isAdmin}
			<button
				class="btn-add"
				onclick={startNew}
				aria-label={t('bonus.new')}
				title={t('bonus.new')}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
					<path
						d="M12 5v14M5 12h14"
						stroke="currentColor"
						stroke-width="2.6"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		{/if}
	</div>
	<p class="muted intro">{t('bonus.intro')}</p>

	{#if visible.length === 0}
		<p class="muted">{t('bonus.none')}</p>
	{:else}
		<div class="claimfor">
			<label for="bfmember">{t('consequences.for')}</label>
			<select id="bfmember" bind:value={forMember}>
				{#each members as m}<option value={m.id}>{m.emoji} {m.name}</option>{/each}
			</select>
		</div>

		<div class="browser">
			<button
				class="arrow"
				onclick={() => browse(-1)}
				disabled={atStart}
				aria-label={t('bonus.prev')}>◀</button
			>
			<div class="rail" bind:this={rail} onscroll={measure}>
				{#each visible as b (b.id)}
					<article class="bcard" class:inactive={!b.active}>
						<div class="thumb">
							{#if b.hasImage}
								{#key bust}
									<img
										src="/api/bonus-tasks/{b.id}/image?v={bust}"
										alt=""
										loading="lazy"
										style={framingStyle(b)}
									/>
								{/key}
							{:else}
								<span class="bemoji">{b.emoji}</span>
							{/if}
							<span class="pts">+{b.points}p</span>
						</div>
						<div class="btext">
							<strong>{b.title}</strong>
							{#if b.notes}<span class="muted bnotes">{b.notes}</span>{/if}
							{#if !b.active}<span class="muted">{t('consequences.paused')}</span>{/if}
						</div>
						<div class="bactions">
							<button
								class="btn-primary claim"
								onclick={() => claim(b)}
								disabled={!b.active || !forMember || claiming === b.id}
							>
								{claiming === b.id ? t('bonus.claiming') : t('bonus.claim')}
							</button>
							{#if isAdmin}
								<button class="btn-ghost icon" onclick={() => startEdit(b)} aria-label={t('common.edit')}>
									✏️
								</button>
							{/if}
						</div>
					</article>
				{/each}
			</div>
			<button class="arrow" onclick={() => browse(1)} disabled={atEnd} aria-label={t('bonus.next')}>▶</button>
		</div>
	{/if}

	{#if result}
		<div class="result">
			<Avatar member={result.member} size={30} />
			<strong>{result.member.name}</strong>
			<span class="rarrow">→</span>
			<span class="bemoji small">{result.emoji}</span>
			<strong>{result.title}</strong>
			<span class="muted">+{result.points}p · {t('chores.points.balance')} {result.balance}p</span>
		</div>
	{/if}

	{#if recentClaims.length > 0}
		<h4>{t('bonus.recent')}</h4>
		<ul class="recent muted">
			{#each recentClaims as c (c.id)}
				<li>
					<span class="rtext">
						{c.memberEmoji} {c.memberName} — {c.emoji} {c.title} (+{c.points}p)
						{#if c.note}<span class="dnote">"{c.note}"</span>{/if}
						· {fmtDate(c.claimedAt)}
					</span>
					{#if isAdmin}
						<!-- The glyph is the whole button, so the accessible name has to be
						     spelled out rather than left as "↩". -->
						<button
							class="undo"
							onclick={() => undoClaim(c)}
							aria-label={t('bonus.undo')}
							title={t('bonus.undo')}>↩</button
						>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

{#if showForm}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="backdrop" role="presentation" onclick={() => (showForm = false)}>
		<div class="card modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
			<h3>{editing ? t('bonus.edit') : t('bonus.new')}</h3>
			<div class="row formrow">
				<div class="field emojifield">
					<label for="bemoji">Emoji</label>
					<input id="bemoji" bind:value={form.emoji} />
				</div>
				<div class="field grow">
					<label for="btitle">{t('bonus.name')}</label>
					<input id="btitle" bind:value={form.title} />
				</div>
			</div>
			<div class="field">
				<label for="bnotes">{t('chores.field.notes')}</label>
				<input id="bnotes" bind:value={form.notes} />
			</div>
			<div class="field">
				<label for="bpoints">{t('bonus.points')}</label>
				<input id="bpoints" type="number" min="1" max="1000" bind:value={form.points} />
			</div>

			<div class="field">
				<span class="flabel">{t('bonus.image')}</span>
				{#if editing}
					<!-- The preview is the card's own window at the card's own aspect ratio,
					     rendered from the same framingStyle() — what you drag into place here
					     is exactly what the deck shows. -->
					{#if editingTask?.hasImage}
						<div
							class="frame"
							class:dragging
							bind:this={frame}
							role="slider"
							tabindex="0"
							aria-label={t('bonus.framing.aria')}
							aria-valuemin="0"
							aria-valuemax="100"
							aria-valuenow={framing.imageX}
							aria-valuetext={t('bonus.framing.at', { x: framing.imageX, y: framing.imageY })}
							onpointerdown={startDrag}
							onpointermove={moveDrag}
							onpointerup={endDrag}
							onpointercancel={endDrag}
							onkeydown={nudge}
						>
							{#key bust}
								<img src="/api/bonus-tasks/{editing}/image?v={bust}" alt="" style={framingStyle(framing)} />
							{/key}
							<span
								class="crosshair"
								style="left:{framing.imageX}%; top:{framing.imageY}%"
								aria-hidden="true"
							></span>
						</div>
					{:else}
						<!-- Nothing to frame yet — the same window, showing the emoji the card
						     falls back to, so the shape of what you're filling is still clear. -->
						<div class="frame empty"><span class="bemoji">{form.emoji}</span></div>
					{/if}

					<div class="imgtools">
						<button class="btn-ghost" onclick={() => fileInput?.click()} disabled={uploading}>
							📷 {editingTask?.hasImage ? t('bonus.replaceImage') : t('bonus.addImage')}
						</button>
						{#if editingTask?.hasImage}
							<button class="btn-ghost" onclick={removeImage} disabled={uploading}>
								{t('bonus.removeImage')}
							</button>
						{/if}
					</div>

					{#if editingTask?.hasImage}
						<p class="small muted">{t('bonus.framing.hint')}</p>
						<div class="fitpicker">
							<button class="fitopt" class:on={framing.imageFit === 'cover'} onclick={() => setFit('cover')}>
								{t('bonus.framing.fill')}
							</button>
							<button
								class="fitopt"
								class:on={framing.imageFit === 'contain'}
								onclick={() => setFit('contain')}
							>
								{t('bonus.framing.whole')}
							</button>
						</div>
						<div class="zoomrow">
							<label for="bzoom">{t('bonus.framing.zoom')}</label>
							<input
								id="bzoom"
								type="range"
								min={ZOOM_MIN}
								max={ZOOM_MAX}
								step="5"
								bind:value={framing.imageZoom}
								onchange={saveFraming}
							/>
							<span class="zoomval muted">{framing.imageZoom}%</span>
						</div>
						<button class="btn-ghost reset" onclick={resetFraming}>{t('bonus.framing.reset')}</button>
					{/if}

					<input
						type="file"
						accept="image/png,image/jpeg,image/webp,image/gif"
						bind:this={fileInput}
						onchange={uploadImage}
						hidden
					/>
				{:else}
					<p class="small muted">{t('bonus.imageAfterSave')}</p>
				{/if}
			</div>

			<label class="inline"><input type="checkbox" bind:checked={form.active} /> {t('consequences.active')}</label>
			<div class="row spread" style="margin-top:1rem">
				{#if editing}
					<button class="btn-ghost danger" onclick={() => del(editing!)}>🗑</button>
				{/if}
				<button class="btn-ghost" onclick={() => (showForm = false)}>{t('common.cancel')}</button>
				<button class="btn-primary" onclick={save}>{t('common.save')}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Third member of the /rewards family, so it keeps the bandits' anatomy: heading +
	   admin "new" button → the thing you interact with → result → history. Its accent
	   is the points colour rather than green/red: this is where points come *in*. */
	.bonus {
		container-type: inline-size;
		--accent: var(--primary);
		border-top: 4px solid var(--accent);
	}
	.intro {
		/* Pulled up under the heading, so the negative tracks the scale too — otherwise
		   the overlap it's correcting for grows on a tablet while this stays put. */
		margin: calc(-1 * var(--s-2)) 0 var(--s-5);
		font-size: var(--t-3);
	}
	.claimfor {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin-bottom: var(--s-4);
		flex-wrap: wrap;
	}
	.claimfor select {
		width: auto;
		min-width: 0;
		flex: 0 1 12rem;
	}

	.browser {
		display: flex;
		align-items: stretch;
		gap: var(--s-3);
		min-width: 0;
	}
	.arrow {
		flex: 0 0 auto;
		width: 36px;
		border-radius: 10px;
		border: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text);
		font-size: var(--t-3);
	}
	.arrow:disabled {
		opacity: 0.35;
	}
	/* The rail is the one deliberately horizontal-scrolling thing on this page — the
	   cards are meant to be browsed sideways, so it owns its own overflow and the page
	   body never scrolls with it. */
	.rail {
		display: flex;
		gap: var(--s-5);
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scroll-padding-left: 0.1rem;
		padding-bottom: var(--s-3);
		min-width: 0;
		flex: 1;
		-webkit-overflow-scrolling: touch;
	}
	.bcard {
		flex: 0 0 min(15rem, 78%);
		scroll-snap-align: start;
		min-width: 0;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--surface);
		box-shadow: var(--shadow);
		overflow: hidden;
	}
	.bcard.inactive {
		opacity: 0.55;
	}
	/* The card's picture window. Its children are absolutely positioned rather than
	   laid out in flow, and that is load-bearing: a `height: 100%` child of an
	   auto-sized grid/flex row has nothing definite to resolve against, so it silently
	   fell back to the image's *intrinsic* height — a 238px-wide window rendering a
	   317px-tall image and clipping the bottom third with no way to choose which third.
	   Against an absolutely-positioned box the 4:3 window is the containing block, so
	   `inset: 0` fills it exactly, every time. */
	.thumb {
		position: relative;
		aspect-ratio: 4 / 3;
		background: var(--surface-2);
		overflow: hidden;
	}
	.thumb img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		/* object-fit/position and the zoom come from framingStyle() per card. */
	}
	/* Emoji metrics are wild — Apple Color Emoji's `normal` line box is far taller than
	   the glyph, so a centred *span* still renders the glyph well above the middle of
	   the window. Fill the window and centre with line-height: 1 instead, so what's
	   centred is the glyph rather than a font's idea of a line. */
	.thumb .bemoji,
	.frame .bemoji {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
		font-size: var(--t-8);
	}
	.bemoji {
		font-size: var(--t-8);
		line-height: 1;
	}
	.bemoji.small {
		position: static;
		display: inline;
		font-size: var(--t-5);
	}
	.pts {
		position: absolute;
		right: 0.4rem;
		bottom: 0.4rem;
		padding: var(--s-1) var(--s-3);
		border-radius: 999px;
		font-size: var(--t-2);
		font-weight: 700;
		color: #fff;
		background: var(--accent);
	}
	.btext {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		padding: var(--s-4) var(--s-4) var(--s-2);
		min-width: 0;
		flex: 1;
	}
	.bnotes {
		font-size: var(--t-2);
	}
	.bactions {
		display: flex;
		gap: var(--s-3);
		padding: 0 var(--s-4) var(--s-4);
	}
	.claim {
		flex: 1;
		min-height: 44px;
		min-width: 0;
	}
	.icon {
		min-width: 36px;
		padding: 0 var(--s-3);
	}

	.result {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		flex-wrap: wrap;
		margin-top: var(--s-4);
		padding: var(--s-4) var(--s-5);
		border-radius: 10px;
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}
	.rarrow {
		color: var(--text-dim);
	}
	.recent {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: var(--t-2);
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
	}
	.recent li {
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}
	.rtext {
		min-width: 0;
		flex: 1;
	}
	.undo {
		flex: 0 0 auto;
		min-width: 36px;
		min-height: 36px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface-2);
		color: var(--text);
	}
	.dnote {
		font-style: italic;
	}
	.small {
		font-size: var(--t-2);
		margin: var(--s-2) 0 0;
	}

	.flabel {
		display: block;
		margin-bottom: var(--s-2);
		font-size: var(--t-3);
		color: var(--text-dim);
	}
	/* Same 4:3 window as the card, same framingStyle() — so this preview is the card,
	   not an approximation of it. */
	.frame {
		position: relative;
		width: 100%;
		aspect-ratio: 4 / 3;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface-2);
		overflow: hidden;
		cursor: grab;
		/* Without this the browser claims the gesture for scrolling and the picture
		   never moves under a finger. */
		touch-action: none;
	}
	.frame.empty {
		cursor: default;
	}
	.frame.dragging {
		cursor: grabbing;
	}
	.frame:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}
	.frame img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	/* Marks the point that survives the crop and that the zoom pulls towards. */
	.crosshair {
		position: absolute;
		width: 20px;
		height: 20px;
		margin: -10px 0 0 -10px;
		border: 2px solid #fff;
		border-radius: 50%;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55);
		pointer-events: none;
	}
	.imgtools {
		display: flex;
		gap: var(--s-3);
		flex-wrap: wrap;
		margin-top: var(--s-3);
	}
	.fitpicker {
		display: flex;
		gap: var(--s-2);
		margin: var(--s-2) 0;
		flex-wrap: wrap;
	}
	.fitopt {
		flex: 1 1 8rem;
		min-width: 0;
		min-height: 40px;
		border-radius: 999px;
		font-size: var(--t-2);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
	}
	.fitopt.on {
		background: var(--primary);
		border-color: transparent;
		color: #fff;
	}
	.zoomrow {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin: var(--s-1) 0;
	}
	.zoomrow label {
		flex: 0 0 auto;
		font-size: var(--t-2);
		color: var(--text-dim);
	}
	.zoomrow input {
		flex: 1;
		min-width: 0;
	}
	.zoomval {
		flex: 0 0 3rem;
		text-align: right;
		font-size: var(--t-2);
	}
	.reset {
		font-size: var(--t-2);
	}
	.danger {
		color: var(--danger);
	}
	.formrow {
		flex-wrap: wrap;
	}
	.formrow .emojifield {
		flex: 0 0 4.5rem;
	}
	.formrow .grow {
		flex: 1 1 9rem;
		min-width: 0;
	}
	.inline {
		display: inline-flex;
		gap: var(--s-3);
		align-items: center;
		min-height: 44px;
		margin: var(--s-1) 0 0;
	}
	.inline input {
		min-height: auto;
	}
	/* .backdrop / .modal come from app.css */
	.modal {
		max-width: 400px;
	}
	@media (pointer: coarse) {
		.arrow,
		.undo,
		.icon,
		.fitopt {
			min-height: 44px;
		}
	}
</style>
