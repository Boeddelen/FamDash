/**
 * Walk through the dashboard against a throwaway instance and save screenshots.
 * Usage:  node tests/screenshots.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const DATA = '/tmp/fd-shots-data';
const PORT = 4188;
const OUT = 'tests/screenshots';
rmSync(DATA, { recursive: true, force: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const srv = spawn('node', ['build/index.js'], {
	env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), BODY_SIZE_LIMIT: '16M' },
	stdio: 'inherit'
});

async function waitUp() {
	for (let i = 0; i < 40; i++) {
		try {
			if ((await fetch(`http://localhost:${PORT}/healthz`)).ok) return;
		} catch {}
		await sleep(500);
	}
	throw new Error('server did not start');
}

const base = `http://localhost:${PORT}`;

try {
	await waitUp();
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

	// Setup wizard (kept in Norwegian — the default)
	await page.goto(base);
	await shot('01-setup-household');
	await page.locator('#hn').fill('Nordby');
	await page.locator('#tz').fill('Europe/Oslo');
	await page.getByRole('button', { name: /Neste/ }).click();
	await page.locator('#an').fill('Kari');
	await page.locator('#ae').fill('kari@example.com');
	await page.locator('#ap').fill('familypass123');
	await page.getByRole('button', { name: /Neste/ }).click();
	await page.locator('#pl').fill('Trondheim');
	await page.getByRole('button', { name: /Søk/ }).click();
	await sleep(800);
	await page
		.locator('.results button')
		.first()
		.click()
		.catch(() => {});
	await page.getByRole('button', { name: /Neste/ }).click();
	for (const [i, name] of [['Robin', '🦊'], ['Alex', '🐨'], ['Mamma', '🌟']].entries()) {
		await page.getByRole('button', { name: /Legg til medlem/ }).click();
		await page.locator('.member').nth(i).locator('input[placeholder]').first().fill(name[0]);
	}
	await shot('02-setup-members');
	await page.getByRole('button', { name: /Fullfør oppsett/ }).click();
	await page.waitForURL(base + '/');
	await sleep(2000); // let weather load

	// Seed some content via the API (admin cookie is set)
	const api = (path, body, method = 'POST') =>
		page.evaluate(
			async ([p, b, m]) => {
				const r = await fetch(p, {
					method: m,
					headers: { 'content-type': 'application/json' },
					body: b ? JSON.stringify(b) : undefined
				});
				return r.json();
			},
			[path, body, method]
		);

	const members = await api('/api/members', null, 'GET');
	const ada = members.find((m) => m.name === 'Robin')?.id ?? null;
	const even = members.find((m) => m.name === 'Alex')?.id ?? null;
	await api('/api/chores', { title: 'Tømme oppvaskmaskin', recurrence: 'daily', assignedMemberId: ada, points: 2 });
	await api('/api/chores', { title: 'Ta ut søppel', recurrence: 'weekly', weekdayMask: 1 << 3, assignedMemberId: even, points: 1 });
	await api('/api/chores', { title: 'Gå tur med hunden', recurrence: 'weekdays', points: 1 });
	await api('/api/chores', { title: 'Rydde rommet', recurrence: 'weekly', weekdayMask: (1 << 6) | (1 << 0), assignedMemberId: ada });
	const today = new Date().toISOString().slice(0, 10);
	const plus = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
	// mark a couple done / overdue for the deck colours
	const insts = await api('/api/chores', null, 'GET');
	await api('/api/plan-items', { title: 'Fotballtrening 17:00', date: today, memberId: even });
	await api('/api/plan-items', { title: 'Pakke svømmebag', date: plus(1), memberId: ada });
	await api('/api/plan-items', { title: 'Besøk av bestemor', date: plus(2) });
	await api('/api/calendars', {
		kind: 'ics_sub',
		label: 'Norske helligdager',
		url: 'https://www.officeholidays.com/ics/norway',
		color: '#0ea5e9'
	});

	// Give one member a photo so avatars are visible in the shots.
	if (ada) {
		const png = Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z+DwHwAFhwJ/lYQCnQAAAABJRU5ErkJggg==',
			'base64'
		);
		await page.evaluate(
			async ([id, b64]) => {
				const bin = atob(b64);
				const arr = new Uint8Array(bin.length);
				for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
				const fd = new FormData();
				fd.append('file', new File([arr], 'face.png', { type: 'image/png' }));
				await fetch(`/api/members/${id}/avatar`, { method: 'POST', body: fd });
			},
			[ada, png.toString('base64')]
		);
	}
	await sleep(2500); // calendar sync

	await page.goto(base + '/');
	await page.reload();
	await sleep(800);
	await shot('03-dashboard');

	await page.goto(base + '/week');
	await sleep(500);
	await shot('04-week');

	await page.goto(base + '/month');
	await sleep(500);
	await shot('05-month');

	await page.goto(base + '/chores');
	await sleep(500);
	await shot('06-chores');

	// School documents + viewer
	await page.goto(base + '/upload');
	await page.setInputFiles('input[type=file]', 'tests/fixtures/school-calendar.pdf');
	await sleep(800);
	await page.locator('.doc .open').first().click();
	await sleep(900);
	await shot('07-pdf-viewer');
	await page.getByRole('button', { name: /Lukk/ }).click();

	await page.goto(base + '/settings');
	await sleep(500);
	await shot('08-settings');

	// Phone width
	await page.setViewportSize({ width: 400, height: 850 });
	await page.goto(base + '/');
	await page.reload();
	await sleep(800);
	await shot('09-dashboard-phone');

	// Dark mode
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto(base + '/');
	await page.reload();
	await sleep(800);
	await shot('10-dashboard-dark');

	await browser.close();
	console.log(`\nScreenshots written to ${OUT}/`);
} finally {
	srv.kill();
}
