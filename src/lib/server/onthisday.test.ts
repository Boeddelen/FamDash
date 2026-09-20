import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { refreshOnThisDay } from './onthisday';
import * as settingsModule from './settings';

const eventsPage = {
	count: 2,
	next: null,
	previous: null,
	results: [
		{ year: '2001', title: 'A big event', description: 'Something happened.' },
		{ year: '', title: '', description: 'Missing title should be dropped' } // no title → filtered out
	]
};
const birthsPage = {
	count: 1,
	next: null,
	previous: null,
	results: [
		{
			name: 'Ada Lovelace',
			description: 'English mathematician',
			bio: 'Long bio text',
			birth_year: '1815',
			death_year: '1852'
		}
	]
};
const deathsPage = {
	count: 1,
	next: null,
	previous: null,
	results: [
		{ name: 'Some Person', description: 'A notable person', birth_year: '1900', death_year: '1980' }
	]
};

describe('refreshOnThisDay', () => {
	beforeEach(() => {
		vi.spyOn(settingsModule, 'setSetting').mockResolvedValue(undefined);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				const page = url.includes('/events/')
					? eventsPage
					: url.includes('/births/')
						? birthsPage
						: deathsPage;
				return new Response(JSON.stringify(page), { status: 200 });
			})
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('normalizes events, births and deaths into a single typed list, dropping items without a title', async () => {
		const snapshot = await refreshOnThisDay();
		expect(snapshot.items).toHaveLength(3);

		const event = snapshot.items.find((i) => i.kind === 'event');
		expect(event).toMatchObject({ kind: 'event', year: 2001, title: 'A big event', text: 'Something happened.' });

		const birth = snapshot.items.find((i) => i.kind === 'birth');
		expect(birth).toMatchObject({ kind: 'birth', year: 1815, title: 'Ada Lovelace', text: 'English mathematician' });

		const death = snapshot.items.find((i) => i.kind === 'death');
		expect(death).toMatchObject({ kind: 'death', year: 1980, title: 'Some Person', text: 'A notable person' });
	});

	it('caches the result under today\'s date via setSetting', async () => {
		const snapshot = await refreshOnThisDay();
		expect(settingsModule.setSetting).toHaveBeenCalledWith('onThisDay', snapshot);
		expect(snapshot.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('propagates an HTTP error from the API instead of silently returning nothing', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
		await expect(refreshOnThisDay()).rejects.toThrow(/HTTP 500/);
	});
});
