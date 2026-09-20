import { rmSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Unit tests that touch the DB (points.ts, tags.ts, ...) must never run against the
// real household data in ./data — the same reasoning as playwright.config.ts's .pw-data.
const TEST_DATA_DIR = new URL('./.vitest-data', import.meta.url).pathname;
rmSync(TEST_DATA_DIR, { recursive: true, force: true });

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'node',
		env: { DATA_DIR: TEST_DATA_DIR }
	}
});
