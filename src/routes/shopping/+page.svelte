<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/toast';
	import { getI18n, localeTag } from '$lib/i18n';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import ShoppingRegister from '$lib/components/ShoppingRegister.svelte';
	import {
		DEFAULT_UNIT,
		formatAmount,
		formatPrice,
		lineTotal,
		parseAmount,
		parsePrice,
		UNITS,
		type Unit
	} from '$lib/units';
	import CutoutEditor from '$lib/components/CutoutEditor.svelte';
	import {
		clampFraming,
		DEFAULT_FRAMING,
		framingStyle,
		ZOOM_MAX,
		ZOOM_MIN,
		type Framing
	} from '$lib/bonusImage';

	type ShopList = { id: string; name: string; emoji: string };
	type Product = Framing & {
		id: string;
		name: string;
		listId: string | null;
		imagePath: string | null;
		unit: Unit;
		unitLabel: string | null;
		priceOre: number | null;
	};
	type Item = {
		id: string;
		productId: string | null;
		listId: string | null;
		title: string;
		amount: number | null;
		unit: Unit;
		unitLabel: string | null;
		note: string | null;
		done: boolean;
	};

	let { data } = $props();
	const { t, locale } = getI18n();
	const tag = localeTag(locale);
	/** The list is everyone's; the register behind it is curated. */
	const isAdmin = $derived(!!data.isAdmin);

	// Nothing on this page is admin-gated: a list only the parents can write to is a
	// list nobody keeps up to date.

	const lists = $derived(data.lists as ShopList[]);
	const items = $derived(data.items as Item[]);
	const products = $derived(data.products as Product[]);
	const productById = $derived(new Map(products.map((p) => [p.id, p])));
	/** The picture a row shows comes from its product, so it survives the list being
	 *  cleared and reappears the next time that product is bought. */
	const pictureFor = $derived((i: Item) => (i.productId ? productById.get(i.productId) : undefined));

	// One pass rather than a .filter() per list.
	const byList = $derived.by(() => {
		const m = new Map<string, Item[]>();
		// Every item belongs to a list, so there is no "_none" bucket to fall into.
		for (const i of items) {
			if (!i.listId) continue;
			if (!m.has(i.listId)) m.set(i.listId, []);
			m.get(i.listId)!.push(i);
		}
		return m;
	});
	const doneCount = $derived(items.filter((i) => i.done).length);

	/** A unit's label: the household's own word when it picked "other". */
	const unitText = $derived((u: Unit, own: string | null) =>
		u === 'other' ? (own ?? t('unit.other')) : t(`unit.${u}`)
	);
	/** What one line costs — the register's price for one unit, times the amount. */
	const costOf = $derived((i: Item) => lineTotal(i.amount, pictureFor(i)?.priceOre ?? null));
	/** Only what's left to buy: a total that included the basket would go down as you
	 *  shop, which is the opposite of what a budget is for. */
	const remaining = $derived(
		items.filter((i) => !i.done).reduce((sum, i) => sum + (costOf(i) ?? 0), 0)
	);
	const anyPrices = $derived(products.some((p) => p.priceOre != null));

	let busy = $state<string | null>(null);

	// Same shape as /tasks: the tab lives in the URL on a locale-independent slug, set
	// with replaceState so Back doesn't need a tap per tab, and the default stays out
	// of the URL entirely.
	const tab = $derived(page.url.searchParams.get('tab') === 'register' ? 'register' : 'liste');
	function selectTab(next: 'liste' | 'register') {
		const url = new URL(page.url);
		if (next === 'liste') url.searchParams.delete('tab');
		else url.searchParams.set('tab', next);
		goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	// --- lists ----------------------------------------------------------------
	async function newList() {
		const name = prompt(t('shop.listPrompt'));
		if (!name?.trim()) return;
		await api('/api/shopping-lists', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
		await invalidateAll();
	}

	async function renameList(id: string, name: string) {
		if (!name.trim()) return;
		await api(`/api/shopping-lists/${id}`, {
			method: 'PATCH',
			body: JSON.stringify({ name: name.trim() })
		});
		await invalidateAll();
	}

	async function deleteList(id: string, name: string) {
		const n = (byList.get(id) ?? []).length;
		if (!confirm(t('shop.deleteListConfirm', { name, n }))) return;
		await api(`/api/shopping-lists/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	// --- items ---------------------------------------------------------------
	async function toggle(item: Item) {
		busy = item.id;
		try {
			await api(`/api/shopping-items/${item.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ done: !item.done }),
				quiet: true
			});
			await invalidateAll();
		} catch (e) {
			toast(e instanceof ApiError ? e.message : '!', 'error');
		} finally {
			busy = null;
		}
	}

	async function clearDone() {
		if (!confirm(t('shop.clearDoneConfirm', { n: doneCount }))) return;
		// Sequential on purpose: a household list is a handful of rows, and firing a
		// dozen parallel DELETEs at a SQLite-backed server buys nothing.
		for (const i of items.filter((x) => x.done)) {
			await api(`/api/shopping-items/${i.id}`, { method: 'DELETE', quiet: true }).catch(() => {});
		}
		await invalidateAll();
	}

	// --- the item dialog -----------------------------------------------------
	let showForm = $state(false);
	let editing = $state<string | null>(null);
	let form = $state({
		title: '',
		amount: '',
		unit: DEFAULT_UNIT as Unit,
		unitLabel: '',
		note: '',
		listId: '' as string
	});
	/** The product the open dialog is about — set when a suggestion is picked, and
	 *  after saving, since that's when a typed-out name becomes a remembered product. */
	let productId = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement>();
	let uploading = $state(false);
	/** Cache-buster so a replaced picture is actually refetched. */
	let bust = $state(0);
	/** What the cut-out editor is working on: a freshly picked File, or the URL of the
	 *  picture already stored (so an old JPEG can be re-cut rather than re-taken). */
	let cutting = $state<File | string | null>(null);

	const editingItem = $derived(editing ? items.find((i) => i.id === editing) : undefined);
	const editingProduct = $derived(productId ? productById.get(productId) : undefined);

	// --- autofill ------------------------------------------------------------
	let suggestOpen = $state(false);
	const suggestions = $derived.by(() => {
		const q = form.title.trim().toLowerCase();
		if (!q) return [];
		// Prefix matches first — typing "ha" should offer "Havregryn" before "Hakket",
		// and both before something that merely contains "ha" in the middle.
		const hits = products.filter((p) => p.name.toLowerCase().includes(q));
		hits.sort((a, b) => {
			const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
			const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
			return ap - bp;
		});
		// An exact match is already "chosen" — offering it back is just noise.
		return hits.filter((p) => p.name.toLowerCase() !== q).slice(0, 6);
	});

	function choose(p: Product) {
		form.title = p.name;
		// The remembered list only fills an empty slot; an explicit choice wins.
		if (!form.listId && p.listId) form.listId = p.listId;
		// The unit, though, is what this product *is* measured in, so it comes across.
		form.unit = p.unit;
		form.unitLabel = p.unitLabel ?? '';
		productId = p.id;
		suggestOpen = false;
	}

	async function forgetProduct() {
		if (!editingProduct) return;
		if (!confirm(t('shop.forgetConfirm', { name: editingProduct.name }))) return;
		await api(`/api/shopping-products/${editingProduct.id}`, { method: 'DELETE' });
		productId = null;
		await invalidateAll();
	}

	function startNew(listId: string) {
		form = { title: '', amount: '', unit: DEFAULT_UNIT, unitLabel: '', note: '', listId };
		editing = null;
		productId = null;
		suggestOpen = false;
		showForm = true;
	}

	function startEdit(i: Item) {
		form = {
			title: i.title,
			amount: formatAmount(i.amount, tag),
			unit: i.unit,
			unitLabel: i.unitLabel ?? '',
			note: i.note ?? '',
			listId: i.listId ?? ''
		};
		editing = i.id;
		productId = i.productId;
		suggestOpen = false;
		showForm = true;
	}

	async function save() {
		if (!form.title.trim() || !form.listId) return;
		const payload = {
			title: form.title.trim(),
			amount: parseAmount(form.amount),
			unit: form.unit,
			unitLabel: form.unit === 'other' ? form.unitLabel.trim() || null : null,
			note: form.note.trim() || null,
			listId: form.listId
		};
		try {
			if (editing) {
				await api(`/api/shopping-items/${editing}`, { method: 'PATCH', body: JSON.stringify(payload) });
				showForm = false;
			} else {
				// Stay open on the item just created: the obvious next step is giving it a
				// picture, and the image endpoint needs an id to upload against.
				const created = await api<{ id: string; productId: string | null }>('/api/shopping-items', {
					method: 'POST',
					body: JSON.stringify(payload)
				});
				editing = created.id;
				// The server resolved (or started remembering) the product — that's the id
				// the picture hangs off, so adopt it rather than guessing.
				productId = created.productId;
			}
			await invalidateAll();
		} catch {
			/* api() toasts */
		}
	}

	async function del(id: string, title: string) {
		if (!confirm(t('shop.deleteItemConfirm', { title }))) return;
		await api(`/api/shopping-items/${id}`, { method: 'DELETE' });
		showForm = false;
		await invalidateAll();
	}

	/**
	 * Picking a photo opens the cut-out editor rather than uploading straight away —
	 * a product picture is meant to be the item on a transparent background, and asking
	 * for that as a separate step afterwards is a step nobody takes.
	 */
	function onPicked() {
		const picked = fileInput?.files?.[0];
		if (!picked || !productId) return;
		cutting = picked;
		// Cleared now rather than after: re-picking the *same* file must still fire
		// `change`, and the editor already holds its own reference to the File.
		if (fileInput) fileInput.value = '';
	}

	/** Re-cut what's already stored. */
	function recut() {
		if (!productId) return;
		cutting = imgSrc({ id: productId });
	}

	/** The editor hands back a small transparent PNG; this is the only thing that
	 *  actually uploads. */
	async function useCutout(file: File) {
		if (!productId) return;
		uploading = true;
		const fd = new FormData();
		fd.append('file', file);
		try {
			const res = await fetch(`/api/shopping-products/${productId}/image`, { method: 'POST', body: fd });
			if (!res.ok) throw new ApiError(res.status, (await res.json()).message ?? 'Upload failed');
			// A cut-out is meant to sit whole inside the tile, not be cropped to fill it.
			await api(`/api/shopping-products/${productId}`, {
				method: 'PATCH',
				body: JSON.stringify({ imageFit: 'contain', imageX: 50, imageY: 50, imageZoom: 100 }),
				quiet: true
			});
			cutting = null;
			bust = Date.now();
			framingFor = null; // re-seed the framing controls from the new values
			await invalidateAll();
		} catch (e) {
			toast(e instanceof ApiError ? e.message : 'Upload failed', 'error');
		} finally {
			uploading = false;
		}
	}

	async function removeImage() {
		if (!productId) return;
		uploading = true;
		try {
			await api(`/api/shopping-products/${productId}/image`, { method: 'DELETE' });
			bust = Date.now();
			await invalidateAll();
		} finally {
			uploading = false;
		}
	}

	// --- framing the picture -------------------------------------------------
	// Identical to the bonus deck's editor, and rendered through the same
	// `framingStyle()`, so what's dragged into place here is what the tile shows.
	let framing = $state<Framing>({ ...DEFAULT_FRAMING });
	let framingFor = $state<string | null>(null);
	let frame = $state<HTMLDivElement>();
	let dragging = $state(false);

	$effect(() => {
		if (!showForm || !editingProduct) return;
		if (framingFor === editingProduct.id) return;
		framing = clampFraming(editingProduct);
		framingFor = editingProduct.id;
	});

	async function saveFraming() {
		if (!productId) return;
		try {
			await api(`/api/shopping-products/${productId}`, { method: 'PATCH', body: JSON.stringify(framing), quiet: true });
			await invalidateAll();
		} catch {
			/* handled */
		}
	}

	function aimAt(e: PointerEvent) {
		if (!frame) return;
		const r = frame.getBoundingClientRect();
		framing.imageX = Math.min(100, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * 100)));
		framing.imageY = Math.min(100, Math.max(0, Math.round(((e.clientY - r.top) / r.height) * 100)));
	}
	function startDrag(e: PointerEvent) {
		if (!editingProduct?.imagePath) return;
		dragging = true;
		// Capture, so a finger sliding off the small preview keeps dragging instead of
		// dropping the picture mid-adjustment.
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			/* a nicety, not a requirement */
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
	/** Arrow keys nudge the focal point — the drag target is small on a tablet. */
	function nudge(e: KeyboardEvent) {
		const step = e.shiftKey ? 10 : 2;
		const by: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step]
		};
		const d = by[e.key];
		if (!d || !editingProduct?.imagePath) return;
		e.preventDefault();
		framing.imageX = Math.min(100, Math.max(0, framing.imageX + d[0]));
		framing.imageY = Math.min(100, Math.max(0, framing.imageY + d[1]));
		saveFraming();
	}

	const imgSrc = (p: { id: string }) => `/api/shopping-products/${p.id}/image${bust ? `?b=${bust}` : ''}`;
</script>

{#snippet plus()}
	<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
		<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
	</svg>
{/snippet}

<div class="page-head">
	<div class="headings">
		<h1>{t('shop.title')}</h1>
		<p class="muted blurb">{t('shop.blurb')}</p>
	</div>
	{#if tab === 'liste'}
		{#if anyPrices}
			<p class="total">
				<span class="muted">{t('shop.toBuy')}</span>
				<strong>{formatPrice(remaining, tag)}</strong>
			</p>
		{/if}
		{#if doneCount > 0}
			<button class="btn-ghost clear" onclick={clearDone}>{t('shop.clearDone', { n: doneCount })}</button>
		{/if}
		<!-- Rectangular and labelled, unlike the round "+" that adds an item to a list:
		     this one makes a whole list, which is a rarer and larger action, so it says
		     what it does rather than relying on an icon. -->
		<button class="btn-primary newlist" onclick={newList}>
			<span aria-hidden="true">+</span>
			{t('shop.newListLong')}
		</button>
	{/if}
</div>

<div class="tabs" role="tablist" aria-label={t('shop.title')}>
	<button
		role="tab"
		aria-selected={tab === 'liste'}
		class:on={tab === 'liste'}
		onclick={() => selectTab('liste')}>{t('shop.tabList')}</button
	>
	<button
		role="tab"
		aria-selected={tab === 'register'}
		class:on={tab === 'register'}
		onclick={() => selectTab('register')}>{t('shop.tabRegister')}</button
	>
</div>

{#snippet tile(i: Item)}
	{@const pic = pictureFor(i)}
	<li class="item" class:done={i.done}>
		<!-- The whole tile ticks the item off: that's the action wanted ten times in a
		     shop, so it gets the big target and editing gets the small one. -->
		<button
			class="tick"
			disabled={busy === i.id}
			aria-pressed={i.done}
			onclick={() => toggle(i)}
			title={i.title}
		>
			<span class="thumb">
				{#if pic?.imagePath}
					<img src={imgSrc(pic)} alt="" style={framingStyle(pic)} />
				{:else}
					<span class="noimg" aria-hidden="true">🛒</span>
				{/if}
				<span class="mark" aria-hidden="true">{i.done ? '✓' : ''}</span>
			</span>
			<span class="label">
				<span class="name">{i.title}</span>
				<span class="muted qty">
					{#if i.amount}{formatAmount(i.amount, tag)}{/if}
					{unitText(i.unit, i.unitLabel)}
					{#if costOf(i) !== null}
						<span class="cost">· {formatPrice(costOf(i), tag)}</span>
					{/if}
				</span>
				{#if i.note}<span class="muted note">{i.note}</span>{/if}
			</span>
		</button>
		<button class="btn-ghost edit" onclick={() => startEdit(i)} aria-label={t('shop.editItem')} title={t('shop.editItem')}>
			<span aria-hidden="true">✏️</span>
		</button>
	</li>
{/snippet}

{#snippet group(id: string, name: string, emoji: string, list: Item[])}
	<section class="card slist">
		<header class="listhead">
			<span class="emoji" aria-hidden="true">{emoji}</span>
			<!-- Inline-editable, like the tag rows and document boxes: an <input value=…>,
			     not a text node. -->
			{#if true}
				<input
					class="listname"
					value={name}
					aria-label={t('shop.listName')}
					onchange={(e) => renameList(id, e.currentTarget.value)}
				/>
			{:else}
				<h2 class="listname static">{name}</h2>
			{/if}
			<span class="count muted">{list.filter((i) => !i.done).length}</span>
			<button
				class="btn-add sm"
				onclick={() => startNew(id)}
				aria-label={t('shop.addTo', { name })}
				title={t('shop.addTo', { name })}
			>
				{@render plus()}
			</button>
			{#if id}
				<button
					class="btn-ghost rm"
					onclick={() => deleteList(id, name)}
					aria-label={t('shop.deleteList')}
					title={t('shop.deleteList')}><span aria-hidden="true">🗑</span></button
				>
			{/if}
		</header>

		{#if list.length === 0}
			<p class="muted empty">{t('shop.empty')}</p>
		{:else}
			<ul class="items">
				{#each list as i (i.id)}{@render tile(i)}{/each}
			</ul>
		{/if}
	</section>
{/snippet}

{#if tab === 'liste'}
<div class="board">
	{#each lists as c (c.id)}
		{@render group(c.id, c.name, c.emoji, byList.get(c.id) ?? [])}
	{/each}
</div>

{#if lists.length === 0}
	<p class="muted">{t('shop.needList')}</p>
{/if}
{:else}
	<ShoppingRegister products={products as never} lists={lists as never} isAdmin={isAdmin} />
{/if}

{#if showForm}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="backdrop" role="presentation" onclick={() => (showForm = false)}>
		<div
			class="card modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="si-heading"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
		>
			<h3 id="si-heading">{editing ? t('shop.editItem') : t('shop.newItem')}</h3>

			<div class="field namefield">
				<label for="si-title">{t('shop.itemName')}</label>
				<input
					id="si-title"
					bind:value={form.title}
					autocomplete="off"
					role="combobox"
					aria-expanded={suggestOpen && suggestions.length > 0}
					aria-controls="si-suggest"
					oninput={() => {
						suggestOpen = true;
						// Typing away from a picked suggestion unpicks it, or the row would
						// keep the old product's picture under a different name.
						if (editingProduct && form.title.trim().toLowerCase() !== editingProduct.name.toLowerCase())
							productId = editing ? productId : null;
					}}
					onfocus={() => (suggestOpen = true)}
					onkeydown={(e) => e.key === 'Escape' && (suggestOpen = false)}
				/>
				{#if suggestOpen && suggestions.length > 0}
					<!-- Saved items, most-bought first. Each carries the picture it will bring
					     with it, so picking is recognition rather than recall. -->
					<ul class="suggest" id="si-suggest" role="listbox" aria-label={t('shop.suggestions')}>
						{#each suggestions as p (p.id)}
							<li>
								<button type="button" role="option" aria-selected="false" onclick={() => choose(p)}>
									<span class="sthumb">
										{#if p.imagePath}
											<img src={imgSrc(p)} alt="" style={framingStyle(p)} />
										{:else}
											<span class="noimg" aria-hidden="true">🛒</span>
										{/if}
									</span>
									<span class="sname">{p.name}</span>
									{#if p.listId}
										<span class="muted slistname">{lists.find((c) => c.id === p.listId)?.name ?? ''}</span>
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
			<div class="grid two">
				<div class="field">
					<label for="si-amount">{t('shop.amount')}</label>
					<input id="si-amount" inputmode="decimal" bind:value={form.amount} />
				</div>
				<div class="field">
					<label for="si-unit">{t('shop.unit')}</label>
					<select id="si-unit" bind:value={form.unit}>
						{#each UNITS as u (u)}<option value={u}>{t(`unit.${u}`)}</option>{/each}
					</select>
				</div>
			</div>
			{#if form.unit === 'other'}
				<!-- "Other" is a real unit with a name of its own, not a blank — so the list
				     can say "2 nett" without that word leaking into anything else. -->
				<div class="field">
					<label for="si-unitlabel">{t('shop.unitOwn')}</label>
					<input id="si-unitlabel" placeholder={t('shop.unitOwnHint')} bind:value={form.unitLabel} />
				</div>
			{/if}
			<div class="grid two">
				<div class="field">
					<label for="si-list">{t('shop.list')}</label>
					<select id="si-list" bind:value={form.listId}>
						{#each lists as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
					</select>
				</div>
				<div class="field">
					<span class="flabel">{t('shop.price', { unit: unitText(form.unit, form.unitLabel || null) })}</span>
					{#if editingProduct?.priceOre != null}
						<p class="pricetag">{formatPrice(editingProduct.priceOre, tag)}</p>
					{:else}
						<p class="pricetag muted">{t('shop.priceNone')}</p>
					{/if}
				</div>
			</div>
			<div class="field">
				<label for="si-note">{t('shop.note')}</label>
				<input id="si-note" bind:value={form.note} />
			</div>

			{#if productId && isAdmin}
				<div class="field">
					<label for="si-frame">{t('shop.photo')}</label>
					<div class="framerow">
						<input type="file" accept="image/*" bind:this={fileInput} onchange={onPicked} hidden />
						{#if editingProduct?.imagePath}
							<!-- The preview *is* the tile's window, so the crop can't be a surprise. -->
							<div
								id="si-frame"
								class="frame"
								class:drag={dragging}
								bind:this={frame}
								role="slider"
								tabindex="0"
								aria-label={t('shop.framingHint')}
								aria-valuenow={framing.imageX}
								aria-valuemin="0"
								aria-valuemax="100"
								onpointerdown={startDrag}
								onpointermove={moveDrag}
								onpointerup={endDrag}
								onpointercancel={endDrag}
								onkeydown={nudge}
							>
								<img src={imgSrc({ id: productId! })} alt="" style={framingStyle(framing)} />
							</div>
						{:else}
							<!-- Empty, the frame is presentational: there's nothing to aim yet, so it
							     isn't a slider, and it isn't a second button either — a duplicate of
							     the "+" beside it would announce the same name twice to a screen
							     reader and make every by-name locator ambiguous. -->
							<div class="frame empty" aria-hidden="true">
								<span class="noimg">🛒</span>
							</div>
						{/if}
						<div class="framectl">
							<!-- The same round "+" that adds a chore, a reward, a document box or a
							     category. It used to be a bare .btn-ghost here, which renders with no
							     background or border at all and read as stray text in the form. -->
							<div class="addrow">
								<button
									class="btn-add"
									disabled={uploading}
									onclick={() => fileInput?.click()}
									aria-label={editingProduct?.imagePath ? t('shop.replacePhoto') : t('shop.addPhoto')}
									title={editingProduct?.imagePath ? t('shop.replacePhoto') : t('shop.addPhoto')}
								>
									{@render plus()}
								</button>
								<span class="addlabel">
									{editingProduct?.imagePath ? t('shop.replacePhoto') : t('shop.addPhoto')}
								</span>
							</div>
							{#if editingProduct?.imagePath}
								<button class="btn-ghost recut" disabled={uploading} onclick={recut}>
									{t('shop.recut')}
								</button>
								<label class="zoom">
									{t('shop.zoom')}
									<input
										type="range"
										min={ZOOM_MIN}
										max={ZOOM_MAX}
										bind:value={framing.imageZoom}
										onchange={saveFraming}
									/>
								</label>
								<button class="btn-ghost remove" disabled={uploading} onclick={removeImage}>
									{t('shop.removePhoto')}
								</button>
								<p class="muted hint">{t('shop.framingHint')}</p>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<div class="row spread">
				{#if editing}
					<div class="row destructive">
						<button class="btn-ghost danger" onclick={() => del(editing!, form.title)}>
							{t('shop.deleteItem')}
						</button>
						{#if editingProduct && isAdmin}
							<button class="btn-ghost danger small" onclick={forgetProduct}>{t('shop.forget')}</button>
						{/if}
					</div>
				{:else}
					<span></span>
				{/if}
				<div class="row">
					<button class="btn-ghost" onclick={() => (showForm = false)}>{t('chores.cancel')}</button>
					<button class="btn-primary" onclick={save}>{t('chores.save')}</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Mounted after the item dialog on purpose: it is opened *from* that dialog, so it
     has to sit on top of it rather than under it. -->
{#if cutting}
	<CutoutEditor src={cutting} onsave={useCutout} oncancel={() => (cutting = null)} />
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
	.total {
		margin: 0;
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		line-height: 1.2;
		font-size: var(--t-2);
	}
	.total strong {
		font-size: var(--t-5);
	}
	.cost {
		white-space: nowrap;
	}
	.flabel {
		display: block;
		font-size: var(--t-3);
		color: var(--text-dim);
		margin-bottom: var(--s-2);
	}
	.pricetag {
		margin: 0;
		min-height: 44px;
		display: flex;
		align-items: center;
		font-weight: 600;
	}
	.newlist {
		flex: none;
		white-space: nowrap;
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
	}
	/* Same tab strip as /tasks: scrolls rather than wrapping on a narrow phone. */
	.tabs {
		display: flex;
		gap: var(--s-2);
		overflow-x: auto;
		scrollbar-width: none;
		padding-bottom: var(--s-3);
		margin-bottom: var(--s-6);
		border-bottom: 1px solid var(--border);
	}
	.tabs::-webkit-scrollbar {
		display: none;
	}
	.tabs button {
		display: inline-flex;
		align-items: center;
		flex: none;
		min-height: 44px;
		padding: var(--s-3) var(--s-5);
		border: 1px solid transparent;
		border-radius: 999px;
		background: none;
		color: var(--text-dim);
		font-size: var(--t-3);
		white-space: nowrap;
	}
	.tabs button.on {
		background: var(--surface-2);
		border-color: var(--border);
		color: var(--text);
		font-weight: 600;
	}
	.clear {
		flex: none;
		min-height: 40px;
		font-size: var(--t-3);
		white-space: nowrap;
	}

	.board {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
		gap: var(--s-6);
		align-items: start;
	}
	.slist {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
		padding: var(--s-5);
	}
	.listhead {
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}
	.listhead .emoji {
		font-size: var(--t-5);
		line-height: 1;
		flex: none;
	}
	.listname {
		flex: 1;
		min-width: 0;
		font-size: var(--t-5);
		font-weight: 700;
	}
	/* Editable but not shouting "form field" until touched — a page of these would
	   otherwise read as a settings screen. */
	input.listname {
		border-color: transparent;
		background: none;
		padding: var(--s-1) var(--s-2);
		min-height: 40px;
	}
	input.listname:hover {
		border-color: var(--border);
	}
	input.listname:focus {
		border-color: var(--primary);
		background: var(--surface);
	}
	.listname.static {
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

	.items {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.item {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		border-radius: 10px;
		background: var(--surface-2);
	}
	.tick {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		border: none;
		background: none;
		padding: var(--s-2);
		text-align: left;
		flex: 1;
		min-width: 0;
		min-height: 52px;
	}
	/* Fixed-ratio media window: the image is taken out of flow with `inset: 0` rather
	   than `height: 100%`, which against an aspect-ratio box resolves to auto and
	   renders the picture at its intrinsic size. */
	.thumb {
		position: relative;
		width: 46px;
		aspect-ratio: 1;
		flex: none;
		border-radius: 8px;
		overflow: hidden;
		background: var(--surface);
		display: block;
	}
	.thumb img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}
	.noimg {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		/* line-height 1 so what's centred is the glyph, not the font's idea of a line. */
		line-height: 1;
		font-size: var(--t-5);
		opacity: 0.55;
	}
	.mark {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
		font-size: var(--t-6);
		font-weight: 700;
		color: #fff;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
	}
	.item.done .mark {
		background: color-mix(in srgb, var(--ok) 62%, transparent);
	}
	.label {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.qty,
	.note {
		font-size: var(--t-1);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item.done .name {
		text-decoration: line-through;
		color: var(--text-dim);
		font-weight: 500;
	}
	.edit {
		min-height: 36px;
		padding: var(--s-1) var(--s-2);
		flex: none;
	}
	@media (pointer: coarse) {
		.edit {
			min-height: 44px;
		}
	}

	.modal {
		max-width: 480px;
	}
	.grid.two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	@media (max-width: 480px) {
		.grid.two {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	/* The suggestion list overlays what's below it, so the dialog doesn't jump taller
	   the moment two letters are typed. */
	.namefield {
		position: relative;
	}
	.suggest {
		position: absolute;
		z-index: 2;
		left: 0;
		right: 0;
		top: 100%;
		margin: var(--s-1) 0 0;
		padding: var(--s-1);
		list-style: none;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: var(--shadow);
		max-height: 15rem;
		overflow-y: auto;
	}
	.suggest button {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		width: 100%;
		border: none;
		background: none;
		text-align: left;
		padding: var(--s-2);
		border-radius: 8px;
		min-height: 44px;
	}
	.suggest button:hover {
		background: var(--surface-2);
	}
	.sthumb {
		position: relative;
		width: 32px;
		aspect-ratio: 1;
		flex: none;
		border-radius: 6px;
		overflow: hidden;
		background: var(--surface-2);
		display: block;
	}
	.sthumb img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}
	.sname {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.slistname {
		font-size: var(--t-1);
		flex: none;
	}
	.destructive {
		flex-wrap: wrap;
		gap: var(--s-2);
	}
	.small {
		font-size: var(--t-1);
		min-height: 36px;
		padding: var(--s-1) var(--s-2);
	}
	.framerow {
		display: flex;
		gap: var(--s-4);
		flex-wrap: wrap;
	}
	.frame {
		position: relative;
		width: 128px;
		aspect-ratio: 1;
		flex: none;
		border-radius: 10px;
		overflow: hidden;
		background: var(--surface-2);
		border: 1px solid var(--border);
		cursor: grab;
		touch-action: none;
	}
	.frame.drag {
		cursor: grabbing;
		border-color: var(--primary);
	}
	/* The empty frame is a button, so it gets the dashed "nothing here yet" treatment
	   and a pointer, rather than the grab cursor that implies something to drag. */
	.frame.empty {
		border-style: dashed;
	}
	.frame img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}
	.framectl {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		flex: 1 1 10rem;
		min-width: 0;
	}
	.addrow {
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}
	.addlabel {
		font-size: var(--t-2);
		min-width: 0;
	}
	.recut,
	.remove {
		align-self: flex-start;
		min-height: 36px;
		padding: var(--s-1) var(--s-2);
		font-size: var(--t-2);
	}
	.zoom {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		font-size: var(--t-2);
		margin: 0;
	}
	.hint {
		margin: 0;
		font-size: var(--t-1);
	}
	.danger {
		color: var(--danger);
	}
</style>
