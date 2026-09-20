<script lang="ts">
	import { page } from '$app/state';
	import type { DayProgress } from '$lib/server/chores/progress';

	type M = { id: string; emoji: string; color: string; name?: string; hasAvatar?: boolean };
	let {
		member,
		size = 44,
		ring = false,
		progress = true
	}: {
		member: M;
		/** A number is pixels. A CSS length (`clamp(46px, 13vw, 76px)`) lets a caller size
		 *  the avatar against the viewport — everything else here derives from `--s`, so
		 *  the ring, the glow and the emoji all follow without further changes. Avoid
		 *  percentages: `--s` feeds `font-size` calcs, where a percentage would resolve
		 *  against the parent font size rather than the width and quietly go wrong. */
		size?: number | string;
		/** The thick outer ring marking a *selected* member (the unlock picker). Unrelated
		 *  to the progress ring below — they can both be on at once. */
		ring?: boolean;
		/** Opt out of the today-progress ring. Off in the settings photo editor, where a
		 *  ring around the picture you're cropping is just noise. */
		progress?: boolean;
	} = $props();

	// Resolved once per request in +layout.server.ts, so every avatar anywhere in the app
	// can draw its ring without its page passing progress data down as props.
	const day = $derived(
		progress ? ((page.data.progress as Record<string, DayProgress> | undefined)?.[member.id] ?? null) : null
	);
	// Nothing due today means nothing to measure: no ring at all, rather than an empty
	// one that would read as "behind" on a day off.
	const show = $derived(!!day && day.total > 0);
	const pct = $derived(day && day.total > 0 ? Math.min(1, day.done / day.total) : 0);
	const complete = $derived(show && pct >= 1);
	// The fourth state. Going past what was asked only counts once the day's own chores
	// are actually finished — a glow at 0/3 would reward skipping the list.
	const glow = $derived(complete && !!day?.bonus);
	// How strongly the *arc* is tinted: dim at nothing-done, gradually stronger on the
	// way, full colour once closed. The groove behind it stays at full opacity whatever
	// this is — otherwise "0 of 1 done" fades out into looking like no ring at all, and
	// the one state that means "nothing was asked of you today" stops being distinct.
	const strength = $derived(Math.round((0.45 + 0.55 * pct) * 100));

	const len = $derived(typeof size === 'number' ? `${size}px` : size);
	// The intrinsic width/height attributes reserve layout space before the image loads,
	// but they only take a number — a fluid size has no single value to give them, so
	// they're dropped there and the CSS aspect-ratio holds the box instead.
	const px = $derived(typeof size === 'number' ? size : undefined);
</script>

<span
	class="avatar"
	class:ring
	class:prog={show}
	class:complete
	class:glow
	style="--s:{len}; --c:{member.color}; --p:{pct * 100}; --strength:{strength}%"
	title={member.name}
	aria-label={show ? `${member.name ?? ''} — ${day?.done}/${day?.total}` : member.name}
	data-progress={show ? `${day?.done}/${day?.total}` : undefined}
>
	{#if show}
		<span class="track" aria-hidden="true"></span>
	{/if}
	<span class="face">
		{#if member.hasAvatar}
			<!-- Eager, not lazy: these sit at the top of every page, so lazy-loading only
			     delays the one image the household actually looks at first. -->
			<img
				src="/api/members/{member.id}/avatar"
				alt={member.name ?? ''}
				width={px}
				height={px}
				decoding="async"
				fetchpriority="high"
			/>
		{:else}
			<span class="emoji">{member.emoji}</span>
		{/if}
	</span>
</span>

<style>
	.avatar {
		position: relative;
		display: inline-flex;
		width: var(--s);
		/* aspect-ratio rather than an explicit height: a fluid --s stays a circle, and
		   a flex/grid parent can't squash the box out of round. */
		aspect-ratio: 1;
		flex: none;
		border-radius: 50%;
		/* Ring thickness and its gap to the photo both scale with the avatar, so a 26px
		   row avatar and a 76px unlock avatar read as the same object. */
		--rw: max(2px, calc(var(--s) * 0.075));
		--gap: max(1px, calc(var(--s) * 0.045));
	}
	/* The face is inset only when there's a ring to make room for — without one the
	   avatar is pixel-identical to what it was before rings existed. */
	.face {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: color-mix(in srgb, var(--c) 18%, var(--surface));
		overflow: hidden;
	}
	.avatar.prog .face {
		inset: calc(var(--rw) + var(--gap));
	}
	/* One element, two background layers: the coloured arc on top of an always-visible
	   neutral groove, both punched into a ring by the radial mask. The dimming lives in
	   the arc's own colour rather than in `opacity`, which would fade the groove too. */
	.track {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background:
			conic-gradient(
				color-mix(in srgb, var(--c) var(--strength), transparent) calc(var(--p) * 1%),
				transparent 0
			),
			linear-gradient(var(--border), var(--border));
		-webkit-mask: radial-gradient(
			farthest-side,
			transparent calc(100% - var(--rw)),
			#000 calc(100% - var(--rw))
		);
		mask: radial-gradient(farthest-side, transparent calc(100% - var(--rw)), #000 calc(100% - var(--rw)));
		transition: background 0.35s ease;
	}
	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.emoji {
		/* Sized off the face, not the avatar box, so the glyph doesn't grow into the ring. */
		font-size: calc(var(--s) * 0.5);
		line-height: 1;
	}
	.avatar:not(.prog) .emoji {
		font-size: calc(var(--s) * 0.58);
	}

	/* Selection ring (the unlock picker) and the bonus glow are both outer shadows, so
	   they're declared together rather than fighting over `box-shadow`. */
	.avatar.ring {
		box-shadow: 0 0 0 2px var(--c);
	}
	.avatar.glow {
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 60%, transparent), 0 0 calc(var(--s) * 0.22) color-mix(in srgb, var(--c) 75%, transparent);
		animation: pulse 2.4s ease-in-out infinite;
	}
	.avatar.ring.glow {
		box-shadow: 0 0 0 2px var(--c), 0 0 calc(var(--s) * 0.22) color-mix(in srgb, var(--c) 75%, transparent);
	}
	@keyframes pulse {
		50% {
			box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 60%, transparent), 0 0 calc(var(--s) * 0.42) color-mix(in srgb, var(--c) 90%, transparent);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.avatar.glow {
			animation: none;
		}
	}
</style>
