<script lang="ts">
	import { api } from '$lib/api';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/toast';
	import { getI18n, localeTag } from '$lib/i18n';
	import { framingStyle, type Framing } from '$lib/bonusImage';
	import { formatPrice, parsePrice, UNITS, type Unit } from '$lib/units';

	type ShopList = { id: string; name: string };
	type Product = Framing & {
		id: string;
		name: string;
		listId: string | null;
		imagePath: string | null;
		unit: Unit;
		unitLabel: string | null;
		priceOre: number | null;
		timesUsed: number;
	};

	let {
		products,
		lists,
		isAdmin
	}: { products: Product[]; lists: ShopList[]; isAdmin: boolean } = $props();

	const { t, locale } = getI18n();
	const tag = localeTag(locale);

	let query = $state('');
	const shown = $derived(
		query.trim()
			? products.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
			: products
	);

	/** Which row is open for editing, and the buffer it's edited in. Seeded once on
	 *  open rather than bound to `data` — otherwise a reload mid-edit would overwrite
	 *  what's being typed. */
	let editing = $state<string | null>(null);
	let buf = $state({ name: '', unit: 'stk' as Unit, unitLabel: '', price: '', listId: null as string | null });

	function open(p: Product) {
		editing = p.id;
		buf = {
			name: p.name,
			unit: p.unit,
			unitLabel: p.unitLabel ?? '',
			price: p.priceOre == null ? '' : formatPrice(p.priceOre, tag),
			listId: p.listId
		};
	}

	async function save(id: string) {
		if (!buf.name.trim()) return;
		try {
			await api(`/api/shopping-products/${id}`, {
				method: 'PATCH',
				body: JSON.stringify({
					name: buf.name.trim(),
					unit: buf.unit,
					unitLabel: buf.unit === 'other' ? buf.unitLabel.trim() || null : null,
					priceOre: parsePrice(buf.price),
					listId: buf.listId
				})
			});
			editing = null;
			await invalidateAll();
			toast(t('common.saved'), 'ok');
		} catch {
			/* api() toasts */
		}
	}

	const unitText = $derived((u: Unit, own: string | null) =>
		u === 'other' ? (own ?? t('unit.other')) : t(`unit.${u}`)
	);
</script>

{#if products.length === 0}
	<p class="muted">{t('reg.empty')}</p>
{:else}
	<div class="field search">
		<label for="rq">{t('reg.search')}</label>
		<input id="rq" bind:value={query} placeholder={t('reg.search')} />
	</div>

	<ul class="reg">
		{#each shown as p (p.id)}
			<li class="card row-item" data-id={p.id}>
				<span class="thumb">
					{#if p.imagePath}
						<img src="/api/shopping-products/{p.id}/image" alt="" style={framingStyle(p)} />
					{:else}
						<span class="noimg" aria-hidden="true">🛒</span>
					{/if}
				</span>

				{#if editing === p.id}
					<div class="editor">
						<div class="field">
							<label for="rn-{p.id}">{t('reg.name')}</label>
							<input id="rn-{p.id}" bind:value={buf.name} />
						</div>
						<div class="grid two">
							<div class="field">
								<label for="ru-{p.id}">{t('shop.unit')}</label>
								<select id="ru-{p.id}" bind:value={buf.unit}>
									{#each UNITS as u (u)}<option value={u}>{t(`unit.${u}`)}</option>{/each}
								</select>
							</div>
							<div class="field">
								<label for="rp-{p.id}">{t('shop.price', { unit: unitText(buf.unit, buf.unitLabel || null) })}</label>
								<input id="rp-{p.id}" inputmode="decimal" bind:value={buf.price} />
							</div>
						</div>
						{#if buf.unit === 'other'}
							<div class="field">
								<label for="rul-{p.id}">{t('shop.unitOwn')}</label>
								<input id="rul-{p.id}" placeholder={t('shop.unitOwnHint')} bind:value={buf.unitLabel} />
							</div>
						{/if}
						<div class="field">
							<label for="rc-{p.id}">{t('shop.category')}</label>
							<select id="rc-{p.id}" bind:value={buf.listId}>
								<option value={null}>{t('shop.uncategorised')}</option>
								{#each lists as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
							</select>
						</div>
						<div class="row">
							<button class="btn-primary" onclick={() => save(p.id)}>{t('reg.save')}</button>
							<button class="btn-ghost" onclick={() => (editing = null)}>{t('chores.cancel')}</button>
						</div>
					</div>
				{:else}
					<div class="info">
						<strong class="rname">{p.name}</strong>
						<span class="muted meta">
							{unitText(p.unit, p.unitLabel)}
							{#if p.priceOre != null}· {formatPrice(p.priceOre, tag)}/{unitText(p.unit, p.unitLabel)}{/if}
							· {p.timesUsed > 0 ? t('reg.used', { n: p.timesUsed }) : t('reg.never')}
						</span>
					</div>
					{#if isAdmin}
						<button class="btn-ghost edit" onclick={() => open(p)}>{t('reg.edit')}</button>
					{/if}
				{/if}
			</li>
		{/each}
	</ul>

	{#if !isAdmin}
		<p class="muted note">{t('shop.adminOnly')}</p>
	{/if}
{/if}

<style>
	.search {
		max-width: 22rem;
	}
	.reg {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.row-item {
		display: flex;
		align-items: flex-start;
		gap: var(--s-4);
		padding: var(--s-4);
	}
	/* Fixed-ratio media window: `inset: 0`, not `height: 100%`. */
	.thumb {
		position: relative;
		width: 46px;
		aspect-ratio: 1;
		flex: none;
		border-radius: 8px;
		overflow: hidden;
		background: var(--surface-2);
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
		line-height: 1;
		font-size: var(--t-5);
		opacity: 0.55;
	}
	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
	}
	.rname {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		font-size: var(--t-1);
	}
	.editor {
		flex: 1;
		min-width: 0;
	}
	.grid.two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	@media (max-width: 480px) {
		.grid.two {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.edit {
		flex: none;
		min-height: 40px;
		font-size: var(--t-2);
	}
	.note {
		margin-top: var(--s-5);
		font-size: var(--t-2);
	}
</style>
