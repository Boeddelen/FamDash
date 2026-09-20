import { defineConfig } from '@playwright/test';
import { rmSync } from 'node:fs';

// Fresh data dir for every run so the setup wizard always shows.
const DATA_DIR = new URL('./.pw-data', import.meta.url).pathname;
rmSync(DATA_DIR, { recursive: true, force: true });

const PORT = 4183;
// Never ./build: that is what the live launchd service runs from, and rebuilding into
// it mid-run crashes the family's dashboard and auto-deploys whatever is on disk.
const OUT = 'build-e2e';

export default defineConfig({
	testDir: './tests/e2e',
	timeout: 30_000,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	use: {
		baseURL: `http://localhost:${PORT}`,
		...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {})
	},
	webServer: {
		command: `BUILD_OUT=${OUT} npm run build && DATA_DIR=${DATA_DIR} PORT=${PORT} BODY_SIZE_LIMIT=16M node ${OUT}/index.js`,
		port: PORT,
		reuseExistingServer: false,
		timeout: 120_000
	}
});
