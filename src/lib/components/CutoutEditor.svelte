<script lang="ts">
	import { getI18n } from '$lib/i18n';

	/**
	 * Turn a photo into a small square PNG with the background cut away.
	 *
	 * Everything happens in the browser on a canvas — same principle as $lib/image.ts,
	 * which is why there's still no image library on the server. The output is PNG
	 * rather than the WebP the other uploads use: a cut-out has hard alpha edges, and
	 * lossy WebP fringes them with coloured halos against a dark tile.
	 *
	 * `src` is either a freshly picked File or the URL of a picture already stored, so
	 * an old JPEG can be re-cut without being re-taken.
	 */
	let {
		src,
		onsave,
		oncancel
	}: {
		src: File | string;
		onsave: (file: File) => void | Promise<void>;
		oncancel: () => void;
	} = $props();

	const { t } = getI18n();

	/** Output edge. Small on purpose — the tile draws it at ~46px and the editor at
	 *  128px, so 512 survives a retina tablet with room to spare and still lands well
	 *  under 100 kB as a PNG. */
	const EDGE = 512;
	/** Snapshots are EDGE² × 4 bytes ≈ 1 MB each, so the undo stack is capped rather
	 *  than left to grow until a tablet gives up. */
	const MAX_HISTORY = 8;

	type Mode = 'crop' | 'bg';
	let mode = $state<Mode>('crop');
	let ready = $state(false);
	let saving = $state(false);
	let failed = $state(false);

	let source: ImageBitmap | HTMLImageElement | null = null;
	let canvas = $state<HTMLCanvasElement>();
	let ctx: CanvasRenderingContext2D | null = null;

	// --- crop ----------------------------------------------------------------
	// The same pan-and-zoom gesture as the framing control elsewhere, so there's only
	// one way to aim a picture in this app.
	let zoom = $state(100);
	let focusX = $state(50);
	let focusY = $state(50);
	let dragging = $state(false);

	// --- background ----------------------------------------------------------
	let tolerance = $state(28);
	let erasing = $state(false);
	let brush = $state(28);
	const history: ImageData[] = [];
	let canUndo = $state(false);

	async function decode(): Promise<ImageBitmap | HTMLImageElement> {
		if (typeof src === 'string') {
			const img = new Image();
			// Same-origin, so the canvas stays untainted and getImageData works.
			img.src = src;
			await img.decode();
			return img;
		}
		if ('createImageBitmap' in globalThis) {
			try {
				return await createImageBitmap(src, { imageOrientation: 'from-image' });
			} catch {
				/* fall through */
			}
		}
		const url = URL.createObjectURL(src);
		try {
			const img = new Image();
			img.src = url;
			await img.decode();
			return img;
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	/**
	 * Draw the cropped region into the working canvas. This is destructive — it is what
	 * clears any background editing, which is why changing the crop says so out loud.
	 */
	function bake() {
		if (!source || !ctx || !canvas) return;
		const w = 'width' in source ? source.width : 0;
		const h = 'height' in source ? source.height : 0;
		if (!w || !h) return;

		// The visible square is the shorter edge divided by the zoom, positioned by the
		// focal point — so zooming pulls in towards whatever was aimed at, exactly like
		// framingStyle() does for an already-stored picture.
		const edge = Math.min(w, h) / (zoom / 100);
		const sx = ((w - edge) * focusX) / 100;
		const sy = ((h - edge) * focusY) / 100;

		ctx.clearRect(0, 0, EDGE, EDGE);
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(source as CanvasImageSource, sx, sy, edge, edge, 0, 0, EDGE, EDGE);
		history.length = 0;
		canUndo = false;
	}

	function snapshot() {
		if (!ctx) return;
		history.push(ctx.getImageData(0, 0, EDGE, EDGE));
		if (history.length > MAX_HISTORY) history.shift();
		canUndo = history.length > 0;
	}

	function undo() {
		const prev = history.pop();
		if (prev && ctx) ctx.putImageData(prev, 0, 0);
		canUndo = history.length > 0;
	}

	/** Canvas pixel under a pointer, accounting for the CSS size it's displayed at. */
	function pixelAt(e: PointerEvent): { x: number; y: number } | null {
		if (!canvas) return null;
		const r = canvas.getBoundingClientRect();
		const x = Math.floor(((e.clientX - r.left) / r.width) * EDGE);
		const y = Math.floor(((e.clientY - r.top) / r.height) * EDGE);
		if (x < 0 || y < 0 || x >= EDGE || y >= EDGE) return null;
		return { x, y };
	}

	/**
	 * Remove every pixel connected to the tapped one that's a similar colour — the
	 * "tap the background" tool.
	 *
	 * Flood fill rather than "remove every pixel of this colour anywhere", because a
	 * white label on a jar is the same white as the worktop behind it, and only one of
	 * them should disappear. Comparison is squared distance in RGB against the seed,
	 * which is crude next to a perceptual space but is what makes a 262k-pixel sweep
	 * finish in a few milliseconds on a tablet.
	 */
	function floodErase(startX: number, startY: number) {
		if (!ctx) return;
		snapshot();
		const img = ctx.getImageData(0, 0, EDGE, EDGE);
		const d = img.data;
		const seed = (startY * EDGE + startX) * 4;
		if (d[seed + 3] === 0) return; // already gone
		const [sr, sg, sb] = [d[seed], d[seed + 1], d[seed + 2]];
		const limit = tolerance * tolerance * 3;

		// A plain Int32Array stack beats an array of {x,y} objects by enough to matter
		// at this size, and never triggers a GC pause mid-gesture.
		const stack = new Int32Array(EDGE * EDGE);
		const seen = new Uint8Array(EDGE * EDGE);
		let top = 0;
		stack[top++] = startY * EDGE + startX;
		seen[startY * EDGE + startX] = 1;

		while (top > 0) {
			const p = stack[--top];
			const i = p * 4;
			if (d[i + 3] === 0) continue;
			const dr = d[i] - sr;
			const dg = d[i + 1] - sg;
			const db = d[i + 2] - sb;
			if (dr * dr + dg * dg + db * db > limit) continue;
			d[i + 3] = 0;

			const x = p % EDGE;
			const y = (p / EDGE) | 0;
			if (x > 0 && !seen[p - 1]) (seen[p - 1] = 1), (stack[top++] = p - 1);
			if (x < EDGE - 1 && !seen[p + 1]) (seen[p + 1] = 1), (stack[top++] = p + 1);
			if (y > 0 && !seen[p - EDGE]) (seen[p - EDGE] = 1), (stack[top++] = p - EDGE);
			if (y < EDGE - 1 && !seen[p + EDGE]) (seen[p + EDGE] = 1), (stack[top++] = p + EDGE);
		}
		ctx.putImageData(img, 0, 0);
	}

	/** Rub out a circle, for the bits the flood fill can't reach. */
	function eraseAt(x: number, y: number) {
		if (!ctx) return;
		ctx.save();
		ctx.globalCompositeOperation = 'destination-out';
		ctx.beginPath();
		ctx.arc(x, y, brush, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}

	function onDown(e: PointerEvent) {
		const p = pixelAt(e);
		if (!p) return;
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			/* a nicety, not a requirement */
		}
		if (mode === 'crop') {
			dragging = true;
			aim(e);
			return;
		}
		if (erasing) {
			dragging = true;
			snapshot();
			eraseAt(p.x, p.y);
		} else {
			floodErase(p.x, p.y);
		}
	}

	function onMove(e: PointerEvent) {
		if (!dragging) return;
		if (mode === 'crop') return aim(e);
		const p = pixelAt(e);
		if (p && erasing) eraseAt(p.x, p.y);
	}

	function onUp(e: PointerEvent) {
		dragging = false;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			/* already released */
		}
	}

	function aim(e: PointerEvent) {
		if (!canvas) return;
		const r = canvas.getBoundingClientRect();
		focusX = Math.min(100, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * 100)));
		focusY = Math.min(100, Math.max(0, Math.round(((e.clientY - r.top) / r.height) * 100)));
		bake();
	}

	function reset() {
		bake();
	}

	/**
	 * Trim the transparent margin away so the subject fills the square. This is the
	 * "crop" half of the job done for you: once the background is gone, the right crop
	 * is whatever is left, and nobody wants to drag a box around it by hand.
	 */
	function trim() {
		if (!ctx) return;
		const img = ctx.getImageData(0, 0, EDGE, EDGE);
		const d = img.data;
		let minX = EDGE;
		let minY = EDGE;
		let maxX = -1;
		let maxY = -1;
		for (let y = 0; y < EDGE; y++) {
			for (let x = 0; x < EDGE; x++) {
				if (d[(y * EDGE + x) * 4 + 3] > 8) {
					if (x < minX) minX = x;
					if (x > maxX) maxX = x;
					if (y < minY) minY = y;
					if (y > maxY) maxY = y;
				}
			}
		}
		if (maxX < 0) return; // everything erased — nothing to trim to
		snapshot();
		const w = maxX - minX + 1;
		const h = maxY - minY + 1;
		// Square it off around the subject and leave a little air, so the tile doesn't
		// look like the item is pressed against the glass.
		const side = Math.max(w, h) * 1.08;
		const cx = minX + w / 2;
		const cy = minY + h / 2;
		const cut = ctx.getImageData(0, 0, EDGE, EDGE);
		const tmp = document.createElement('canvas');
		tmp.width = tmp.height = EDGE;
		tmp.getContext('2d')?.putImageData(cut, 0, 0);
		ctx.clearRect(0, 0, EDGE, EDGE);
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(tmp, cx - side / 2, cy - side / 2, side, side, 0, 0, EDGE, EDGE);
	}

	async function save() {
		if (!canvas || saving) return;
		saving = true;
		try {
			const blob = await new Promise<Blob | null>((r) => canvas!.toBlob(r, 'image/png'));
			if (!blob) throw new Error('no blob');
			await onsave(new File([blob], 'cutout.png', { type: 'image/png' }));
		} catch {
			failed = true;
		} finally {
			saving = false;
		}
	}

	$effect(() => {
		let alive = true;
		(async () => {
			try {
				const decoded = await decode();
				if (!alive) return;
				source = decoded;
				if (canvas) {
					canvas.width = canvas.height = EDGE;
					ctx = canvas.getContext('2d', { willReadFrequently: true });
					bake();
					ready = true;
				}
			} catch {
				failed = true;
			}
		})();
		return () => {
			alive = false;
			if (source && 'close' in source) source.close();
		};
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="backdrop" role="presentation" onclick={oncancel}>
	<div
		class="card sheet"
		role="dialog"
		aria-modal="true"
		aria-label={t('cut.title')}
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
	>
		<h3>{t('cut.title')}</h3>

		{#if failed}
			<p class="muted">{t('cut.failed')}</p>
		{/if}

		<!-- The checkerboard behind the canvas is what makes "transparent" legible; on a
		     flat background a cut-out just looks like a photo with a pale edge. -->
		<div class="stage">
			<canvas
				bind:this={canvas}
				class:crop={mode === 'crop'}
				onpointerdown={onDown}
				onpointermove={onMove}
				onpointerup={onUp}
				onpointercancel={onUp}
			></canvas>
		</div>

		<div class="tabs" role="tablist" aria-label={t('cut.title')}>
			<button role="tab" aria-selected={mode === 'crop'} class:on={mode === 'crop'} onclick={() => (mode = 'crop')}>
				{t('cut.crop')}
			</button>
			<button role="tab" aria-selected={mode === 'bg'} class:on={mode === 'bg'} onclick={() => (mode = 'bg')}>
				{t('cut.background')}
			</button>
		</div>

		{#if mode === 'crop'}
			<p class="muted hint">{t('cut.cropHint')}</p>
			<label class="slider">
				{t('shop.zoom')}
				<input type="range" min="100" max="300" bind:value={zoom} oninput={bake} />
			</label>
		{:else}
			<p class="muted hint">{erasing ? t('cut.eraseHint') : t('cut.tapHint')}</p>
			<div class="row row-wrap tools">
				<button class="btn-ghost" class:on={!erasing} onclick={() => (erasing = false)}>
					{t('cut.tapTool')}
				</button>
				<button class="btn-ghost" class:on={erasing} onclick={() => (erasing = true)}>
					{t('cut.eraseTool')}
				</button>
				<button class="btn-ghost" onclick={trim}>{t('cut.trim')}</button>
				<button class="btn-ghost" disabled={!canUndo} onclick={undo}>{t('cut.undo')}</button>
				<button class="btn-ghost" onclick={reset}>{t('cut.reset')}</button>
			</div>
			<label class="slider">
				{erasing ? t('cut.brush') : t('cut.tolerance')}
				{#if erasing}
					<input type="range" min="6" max="90" bind:value={brush} />
				{:else}
					<input type="range" min="4" max="90" bind:value={tolerance} />
				{/if}
			</label>
		{/if}

		<div class="row spread foot">
			<button class="btn-ghost" onclick={oncancel}>{t('chores.cancel')}</button>
			<button class="btn-primary" disabled={!ready || saving} onclick={save}>
				{saving ? t('cut.saving') : t('cut.use')}
			</button>
		</div>
	</div>
</div>

<style>
	/* Above the item dialog it was opened from (.backdrop is z-index 200 in app.css). */
	.backdrop {
		z-index: 300;
	}
	.sheet {
		width: 100%;
		max-width: 420px;
	}
	.stage {
		display: flex;
		justify-content: center;
		margin-bottom: var(--s-4);
	}
	canvas {
		width: min(280px, 100%);
		aspect-ratio: 1;
		height: auto;
		border-radius: 12px;
		border: 1px solid var(--border);
		touch-action: none;
		cursor: crosshair;
		/* The classic transparency checkerboard, drawn with gradients so there's no
		   asset to ship. */
		background-color: #fff;
		background-image: linear-gradient(45deg, #d7dae1 25%, transparent 25%),
			linear-gradient(-45deg, #d7dae1 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #d7dae1 75%),
			linear-gradient(-45deg, transparent 75%, #d7dae1 75%);
		background-size: 16px 16px;
		background-position: 0 0, 0 8px, 8px -8px, -8px 0;
	}
	canvas.crop {
		cursor: grab;
	}
	.tabs {
		display: flex;
		gap: var(--s-2);
		margin-bottom: var(--s-3);
	}
	.tabs button {
		flex: 1;
		min-height: 44px;
		border-radius: 999px;
		background: none;
		border: 1px solid transparent;
		color: var(--text-dim);
		font-size: var(--t-3);
	}
	.tabs button.on {
		background: var(--surface-2);
		border-color: var(--border);
		color: var(--text);
		font-weight: 600;
	}
	.hint {
		margin: 0 0 var(--s-3);
		font-size: var(--t-1);
	}
	.tools {
		margin-bottom: var(--s-3);
	}
	.tools .btn-ghost {
		min-height: 40px;
		font-size: var(--t-2);
		padding: var(--s-1) var(--s-3);
		border-color: var(--border);
	}
	.tools .btn-ghost.on {
		background: var(--surface-2);
		font-weight: 600;
	}
	.slider {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		font-size: var(--t-2);
		margin: 0 0 var(--s-4);
	}
	.slider input {
		flex: 1;
		min-width: 0;
	}
	.foot {
		margin-top: var(--s-2);
	}
</style>
