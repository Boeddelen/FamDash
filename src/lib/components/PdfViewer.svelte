<script lang="ts">
	import { getI18n } from '$lib/i18n';

	let {
		src,
		title,
		onclose
	}: { src: string; title: string; onclose: () => void } = $props();

	const { t } = getI18n();

	type Status = 'loading' | 'ready' | 'failed';
	let status = $state<Status>('loading');
	let pageCount = $state(0);
	let viewport = $state<HTMLDivElement>();

	/**
	 * Ceiling on a single page's canvas. Chrome caps a canvas at 16384px per side and
	 * refuses very large allocations outright, but an Android device gives up long
	 * before that — and its failure mode is the nasty one: `getContext`/`render`
	 * succeeds and hands back a *blank* canvas, so the page looks empty rather than
	 * broken. 4 MP is comfortably readable for an A4 page and well inside what a cheap
	 * tablet will allocate.
	 */
	const MAX_CANVAS_PX = 4_000_000;

	function key(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	let observer: IntersectionObserver | null = null;
	// The loading task, not the document, is what owns teardown in pdf.js — destroying it
	// stops the worker and frees the parsed document.
	let loadingTask: { destroy(): Promise<void> } | null = null;
	const tasks = new Map<number, { cancel(): void }>();
	let started = false;

	/**
	 * Render the document to canvases with pdf.js rather than handing the URL to an
	 * <iframe>: Android's Chrome has no inline PDF viewer and offers a download instead,
	 * which means the weekly plan can't be read on a phone at all. pdf.js is imported
	 * here, on open, so it never costs anything on a normal dashboard load.
	 *
	 * Pages are rasterised *as they come into view*, not all at once. At this sheet's
	 * width an A4 page is roughly 1940x2743 device pixels — about 21 MB of canvas — so a
	 * twelve-page newsletter rendered eagerly asks Android for a quarter of a gigabyte
	 * and gets blank canvases or a killed tab. Holding only what's near the viewport
	 * keeps that bounded no matter how long the document is.
	 */
	async function render(container: HTMLDivElement) {
		if (started) return;
		started = true;
		try {
			// The `legacy` build, deliberately: the default one calls brand-new JS such as
			// Uint8Array.prototype.toHex, which an older iPad or Android tablet — exactly
			// what this dashboard runs on — doesn't have, and the whole viewer dies.
			const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
			const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
			pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

			const task = pdfjs.getDocument({ url: src });
			loadingTask = task;
			const doc = await task.promise;
			pageCount = doc.numPages;

			// Cap the pixel ratio: a 3x retina phone rendering an A4 page at full width
			// produces a canvas big enough to be refused on some devices.
			const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);

			async function rasterise(holder: HTMLElement, n: number) {
				if (holder.dataset.state) return; // already drawn, or being drawn
				holder.dataset.state = 'busy';
				try {
					const page = await doc.getPage(n);
					const unscaled = page.getViewport({ scale: 1 });
					const cssWidth = holder.clientWidth || container.clientWidth || 800;
					let scale = (cssWidth * dpr) / unscaled.width;

					// Stay under the per-canvas ceiling whatever the page's own size is —
					// a scanned A3 or a poster-sized page would otherwise blow past it.
					const px = unscaled.width * scale * (unscaled.height * scale);
					if (px > MAX_CANVAS_PX) scale *= Math.sqrt(MAX_CANVAS_PX / px);

					const vp = page.getViewport({ scale });
					const canvas = document.createElement('canvas');
					canvas.width = Math.floor(vp.width);
					canvas.height = Math.floor(vp.height);
					canvas.setAttribute('aria-label', `${title} — ${n}/${doc.numPages}`);

					const ctx = canvas.getContext('2d');
					if (!ctx) throw new Error('no 2d context');

					const task = page.render({ canvas, canvasContext: ctx, viewport: vp });
					tasks.set(n, task);
					await task.promise;
					tasks.delete(n);

					holder.replaceChildren(canvas);
					holder.dataset.state = 'done';
					// Ready as soon as the *first* page is on screen. Waiting for the last
					// one leaves a slow tablet showing "opening…" over a readable page.
					if (status === 'loading') status = 'ready';
				} catch (err) {
					tasks.delete(n);
					// Leave it unmarked so scrolling back re-attempts it.
					delete holder.dataset.state;
					if ((err as Error)?.name !== 'RenderingCancelledException') throw err;
				}
			}

			function release(holder: HTMLElement, n: number) {
				tasks.get(n)?.cancel();
				tasks.delete(n);
				const canvas = holder.querySelector('canvas');
				// Zeroing the dimensions releases the backing store immediately rather
				// than waiting for GC to get round to it, which is the whole point.
				if (canvas) {
					canvas.width = 0;
					canvas.height = 0;
				}
				holder.replaceChildren();
				delete holder.dataset.state;
			}

			observer = new IntersectionObserver(
				(entries) => {
					for (const e of entries) {
						const holder = e.target as HTMLElement;
						const n = Number(holder.dataset.page);
						if (e.isIntersecting) {
							rasterise(holder, n).catch((err) => console.error('[pdf] page', n, err));
						} else {
							release(holder, n);
						}
					}
				},
				// One screen of slack either side, so a page is drawn before it's scrolled
				// to and only a handful are ever resident.
				{ root: container, rootMargin: '100% 0px' }
			);

			// Placeholders first, each with its page's real aspect ratio, so the scrollbar
			// is honest from the start and nothing jumps as pages fill in.
			for (let n = 1; n <= doc.numPages; n++) {
				const page = await doc.getPage(n);
				const vp = page.getViewport({ scale: 1 });
				const holder = document.createElement('div');
				holder.className = 'page';
				holder.dataset.page = String(n);
				holder.style.aspectRatio = `${vp.width} / ${vp.height}`;
				container.appendChild(holder);
				observer.observe(holder);
			}
		} catch (err) {
			// Rendering can fail on a corrupt or password-protected file — offer the
			// download rather than an empty box.
			console.error('[pdf] could not render', err);
			status = 'failed';
		}
	}

	$effect(() => {
		if (viewport) render(viewport);
		return () => {
			observer?.disconnect();
			for (const task of tasks.values()) task.cancel();
			tasks.clear();
			loadingTask?.destroy().catch(() => {});
		};
	});
</script>

<svelte:window onkeydown={key} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="backdrop" role="presentation" onclick={onclose}>
	<div class="sheet" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" onclick={(e) => e.stopPropagation()}>
		<header>
			<strong>{title}</strong>
			<div class="row">
				{#if status === 'ready' && pageCount > 1}
					<span class="muted count">{pageCount}</span>
				{/if}
				<a class="btn-ghost" href="{src}?dl=1" download>{t('docs.download')}</a>
				<button class="btn-ghost" onclick={onclose}>✕ {t('docs.close')}</button>
			</div>
		</header>

		<div class="viewport" bind:this={viewport}>
			{#if status === 'loading'}
				<p class="note muted">{t('docs.rendering')}</p>
			{:else if status === 'failed'}
				<p class="note">
					{t('docs.renderFailed')}
					<!-- Two escapes, because they fail differently: the plain link hands the
					     file to whatever the device does with PDFs (on Android, Chrome's own
					     handler or Drive), the download keeps a copy. -->
					<a href={src} target="_blank" rel="noopener">{t('docs.openExternal')}</a>
					<a href="{src}?dl=1" download>{t('docs.download')}</a>
				</p>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Shares .backdrop from app.css; a document viewer wants to fill the screen, so it
	   overrides the padding, dimming and stacking order. */
	.backdrop {
		background: rgba(0, 0, 0, 0.6);
		padding: max(2vmin, env(safe-area-inset-top)) max(2vmin, env(safe-area-inset-right))
			max(2vmin, env(safe-area-inset-bottom)) max(2vmin, env(safe-area-inset-left));
		z-index: 400;
		overflow: hidden;
		animation: fade 0.15s ease;
	}
	.sheet {
		background: var(--surface);
		border-radius: 14px;
		width: min(1000px, 100%);
		/* dvh, not vh: iOS Safari's toolbars change the usable height as you scroll. */
		height: min(92dvh, 1400px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
		animation: pop 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.2);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-4);
		padding: var(--s-4) var(--s-5);
		border-bottom: 1px solid var(--border);
	}
	header strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.count {
		font-size: var(--t-3);
		white-space: nowrap;
	}
	.viewport {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		background: #525659;
		padding: var(--s-4);
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
	/* The page holders and canvases are appended by the renderer, so they're outside
	   Svelte's scoping. The holder carries the page's aspect ratio and therefore its
	   full height before anything is drawn — that's what stops the scrollbar lying and
	   the content jumping as pages rasterise. */
	.viewport :global(.page) {
		position: relative;
		width: 100%;
		flex: none;
		background: #fff;
		border-radius: 6px;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
		overflow: hidden;
	}
	/* `inset: 0`, not `height: 100%` — a percentage height against an aspect-ratio box
	   resolves to auto and the canvas renders at its intrinsic size. */
	.viewport :global(.page canvas) {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}
	.note {
		color: #e8eaf0;
		text-align: center;
		padding: var(--s-7) var(--s-3);
	}
	.note a {
		color: #fff;
		text-decoration: underline;
		margin: 0 var(--s-2);
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@keyframes pop {
		from {
			transform: scale(0.98);
			opacity: 0;
		}
	}
</style>
