<script lang="ts">
	// A touch-friendly numeric PIN entry: dot progress + a 0-9 keypad.
	// Bind `pin` from the parent; this component only edits it.
	let { pin = $bindable(''), max = 8 }: { pin?: string; max?: number } = $props();

	function press(d: string) {
		if (d === 'del') pin = pin.slice(0, -1);
		else if (pin.length < max) pin += d;
	}
</script>

<div class="dots">
	{#each Array(Math.max(4, pin.length)) as _, i}
		<span class="dot" class:filled={i < pin.length}></span>
	{/each}
</div>
<div class="keys">
	{#each ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as k}
		{#if k === ''}
			<span></span>
		{:else}
			<button type="button" onclick={() => press(k)}>{k === 'del' ? '⌫' : k}</button>
		{/if}
	{/each}
</div>

<style>
	.dots {
		display: flex;
		justify-content: center;
		gap: var(--s-4);
		margin: var(--s-5) 0;
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2px solid var(--text-dim);
	}
	.dot.filled {
		background: var(--primary);
		border-color: var(--primary);
	}
	.keys {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--s-3);
		margin-bottom: var(--s-5);
	}
	.keys button {
		font-size: var(--t-5);
		min-height: 56px;
	}
</style>
