import { test, expect, type Page } from '@playwright/test';
import { join } from 'node:path';

const ADMIN = { name: 'Alex', email: 'parent@example.com', password: 'familypass123' };

/**
 * The app's date-only strings are in the *server's local zone* (see
 * src/lib/server/date.ts), so a test must be too. `toISOString()` is UTC, and between
 * local midnight and the UTC offset those disagree by a day — which silently files a
 * chore under yesterday and then asserts it appears in today's deck. That made the
 * whole suite fail after midnight CEST and pass again by morning.
 */
function isoDay(d = new Date()): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

// One shared page/context — the dashboard is a single stateful instance set up once.
// The wizard is switched to English so assertions can use English strings.
test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
});
test.afterAll(async () => {
	await page.close();
});

test('first-run setup wizard (in English) creates the household and signs the admin in', async () => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/setup/);

	// Wizard starts in Norwegian; switch to English for the rest of the assertions.
	await page.locator('#lc').selectOption('en');
	await page.getByLabel('Family / household name').fill('The Testersons');
	await page.getByRole('button', { name: 'Next' }).click();

	await page.getByLabel('Your name').fill(ADMIN.name);
	await page.getByLabel('Email').fill(ADMIN.email);
	await page.getByLabel(/Password/).fill(ADMIN.password);
	await page.getByRole('button', { name: 'Next' }).click();

	await page.getByRole('button', { name: 'Next' }).click(); // skip weather

	await page.getByRole('button', { name: '+ Add member' }).click();
	await page.getByPlaceholder('Name').fill('Robin');
	await page.getByRole('button', { name: 'Finish setup' }).click();

	await expect(page).toHaveURL('/');
	await expect(page.getByText('The Testersons')).toBeVisible();
	await expect(page.getByRole('button', { name: /Alex/ })).toBeVisible();
});

test('an admin creates a chore with a time; it shows in a card deck and is ticked off in standard mode', async () => {
	await page.goto('/tasks');
	await page.getByRole('button', { name: '+ New chore' }).click();
	await page.getByLabel('Title').fill('Feed the cat');
	await page.getByLabel('Repeats').selectOption('daily');
	await page.getByLabel('Time (optional)').fill('08:30');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Feed the cat · Every day')).toBeVisible();
	await expect(
		page.locator('.deflist li', { hasText: 'Feed the cat' })
	).toContainText('08:30');

	const deckCard = page.locator('.chorecard', { hasText: 'Feed the cat' }).first();
	await expect(deckCard).toContainText('08:30');

	// Leave admin mode and complete the chore card from Today.
	await page.getByRole('button', { name: /Alex/ }).click();
	await expect(page.getByRole('button', { name: '🔒 Admin' })).toBeVisible();

	await page.goto('/');
	const card = page.locator('.chorecard', { hasText: 'Feed the cat' }).first();
	await expect(card).toContainText('08:30');
	await expect(card).toHaveAttribute('data-status', 'todo');
	await card.click();
	await expect(card).toHaveAttribute('data-status', 'done');

	// It was the only chore due today, so the Today page celebrates.
	await expect(page.getByText("All of today's chores are done!")).toBeVisible();
});

test('standard users cannot create, edit the time of, or delete chores — only tick them off', async () => {
	await page.goto('/tasks');
	await expect(page.getByRole('button', { name: '🔒 Admin' })).toBeVisible(); // still standard mode

	await expect(page.getByRole('button', { name: '+ New chore' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
	// The per-chore action row (Edit + delete) is only rendered for admins.
	await expect(page.locator('.deflist li .row')).toHaveCount(0);
	// The chore itself, and its schedule/time, are still visible read-only.
	await expect(page.locator('.deflist li', { hasText: 'Feed the cat' })).toContainText('08:30');
	// The only interactive control left is the tick-off card.
	await expect(page.locator('.chorecard', { hasText: 'Feed the cat' }).first()).toBeVisible();
});

test('signing in as admin reveals the chore controls again, and editing works', async () => {
	await page.goto('/tasks');
	await expect(page.getByRole('button', { name: '🔒 Admin' })).toBeVisible();

	// Admin controls are hidden in standard mode, so elevate first via the nav.
	await page.getByRole('button', { name: '🔒 Admin' }).click();
	const loginDialog = page.getByRole('dialog', { name: 'Admin sign-in' });
	await expect(loginDialog).toBeVisible();
	await loginDialog.getByLabel('Email').fill(ADMIN.email);
	await loginDialog.getByLabel('Password').fill(ADMIN.password);
	await loginDialog.getByRole('button', { name: 'Sign in' }).click();
	await expect(loginDialog).toBeHidden();

	await page.getByRole('button', { name: 'Edit' }).first().click();
	await page.getByLabel('Title').fill('Feed the cats');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Feed the cats · Every day')).toBeVisible();
});

test('a chore with a category and a checklist: steps can be ticked and auto-complete it', async () => {
	// Also exercises a "Once" chore dated today — a past bug silently dropped these.
	const today = isoDay();
	await page.goto('/tasks');
	await page.getByRole('button', { name: '+ New chore' }).click();
	await page.getByLabel('Title').fill('Clean room');
	await page.getByLabel('Category').selectOption('cleaning');
	await page.getByLabel('Repeats').selectOption('none');
	await page.getByLabel('Date').fill(today);
	await page.getByLabel(/Checklist/).fill('Make bed\nVacuum\nTidy desk');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.locator('.deflist li', { hasText: 'Clean room' })).toContainText('☑️ 3');
	await expect(page.locator('.deflist li', { hasText: 'Clean room' })).toContainText('🧹');

	const card = page.locator('.chorecard.has-checklist', { hasText: 'Clean room' }).first();
	await expect(card).toBeVisible();
	const steps = card.locator('.step');
	await expect(steps).toHaveCount(3);

	await steps.nth(0).click();
	await steps.nth(1).click();
	await expect(card).toHaveAttribute('data-status', 'todo');
	await steps.nth(2).click();
	await expect(card).toHaveAttribute('data-status', 'done');

	// Unticking a step drops it back out of "done".
	await steps.nth(0).click();
	await expect(card).toHaveAttribute('data-status', 'todo');
});

test('points are tracked per child, and an admin can define a reward and redeem it against their balance', async () => {
	const today = isoDay();
	await page.goto('/tasks');

	// A chore assigned to Robin specifically (not "Anyone") worth 5 points, due today.
	await page.getByRole('button', { name: '+ New chore' }).click();
	await page.getByLabel('Title').fill('Water the plants');
	await page.getByLabel('Repeats').selectOption('none');
	await page.getByLabel('Date').fill(today);
	await page.getByLabel('Points').fill('5');
	const assignedSelect = page.locator('#ca');
	const robinValue = await assignedSelect.locator('option', { hasText: 'Robin' }).getAttribute('value');
	await assignedSelect.selectOption(robinValue!);
	await page.getByRole('button', { name: 'Save' }).click();

	const card = page.locator('.chorecard', { hasText: 'Water the plants' }).first();
	await card.click();
	await expect(card).toHaveAttribute('data-status', 'done');

	// The strip breaks Robin's balance out on their own pill — never a household total.
	const pointsPill = page.locator('.pill', { hasText: 'Robin' });
	await expect(pointsPill.locator('.bal')).toHaveText('5p');

	// Spending those points happens on the Rewards tab of the same page.
	await page.goto('/tasks?tab=premier');
	await page.getByRole('button', { name: 'New reward' }).click();
	const rewardDialog = page.getByRole('dialog');
	await rewardDialog.getByLabel('Reward').fill('Movie night');
	await rewardDialog.getByLabel('Points cost').fill('5');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.locator('.catalog li', { hasText: 'Movie night' })).toBeVisible();

	await page
		.locator('.catalog li', { hasText: 'Movie night' })
		.getByRole('button', { name: 'Redeem' })
		.click();
	await expect(page.locator('.reward .recent')).toContainText('Movie night');

	await page.goto('/tasks');
	await expect(page.locator('.pill', { hasText: 'Robin' }).locator('.bal')).toHaveText('0p');
});

test('an admin rolls a redemption back and the points return to the bank, ready to spend again', async () => {
	await page.goto('/tasks?tab=premier');
	const entry = page.locator('.reward .recent li', { hasText: 'Movie night' });
	await expect(entry).toBeVisible();

	// The roll-back button is admin-only — spending is open to everyone, un-spending
	// is a parent's call.
	page.once('dialog', (d) => d.accept());
	await entry.getByRole('button', { name: 'Roll back' }).click();
	await expect(page.locator('.reward .recent li', { hasText: 'Movie night' })).toHaveCount(0);

	// The 5p are back on Robin's balance, not parked anywhere in between.
	await page.goto('/tasks');
	await expect(page.locator('.pill', { hasText: 'Robin' }).locator('.bal')).toHaveText('5p');

	// And genuinely spendable: redeeming the same reward again works.
	await page.goto('/tasks?tab=premier');
	await page
		.locator('.catalog li', { hasText: 'Movie night' })
		.getByRole('button', { name: 'Redeem' })
		.click();
	await expect(page.locator('.reward .recent')).toContainText('Movie night');

	// Roll it back once more, so Robin ends this test with points to spend on the
	// bonus-task test that follows.
	page.once('dialog', (d) => d.accept());
	await page
		.locator('.reward .recent li', { hasText: 'Movie night' })
		.getByRole('button', { name: 'Roll back' })
		.click();
	await page.goto('/tasks');
	await expect(page.locator('.pill', { hasText: 'Robin' }).locator('.bal')).toHaveText('5p');
});

test('bonus tasks: a card with a picture is browsed, claimed for extra points, and can be undone', async () => {
	await page.goto('/tasks?tab=bonus');
	await page.getByRole('button', { name: 'New bonus task' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Bonus task', { exact: true }).fill('Wash the car');
	await dialog.getByLabel('Points earned').fill('15');
	await dialog.getByRole('button', { name: 'Save' }).click();

	// The dialog stays open on the newly created card, because adding the picture
	// needs an id to upload against.
	await expect(dialog.getByText('Save first')).toHaveCount(0);
	await dialog
		.locator('input[type=file]')
		.setInputFiles(join(process.cwd(), 'tests/fixtures/bonus-photo.png'));

	const card = page.locator('.bcard', { hasText: 'Wash the car' });
	await expect(card.locator('.thumb img')).toBeVisible();

	// Reframe it: drag the focal point into the top-left quarter of the window, then
	// zoom in a notch. Both save as you go, so there's no separate save step.
	const frame = dialog.locator('.frame');
	const box = (await frame.boundingBox())!;
	await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.2);
	await page.mouse.up();
	await expect(frame.locator('img')).toHaveCSS('object-position', '25% 20%');

	await dialog.getByLabel('Zoom').press('ArrowRight'); // one 5% step
	await expect(frame.locator('img')).toHaveCSS('transform', 'matrix(1.05, 0, 0, 1.05, 0, 0)');

	// "Whole picture" is the other way out of a bad crop.
	await dialog.getByRole('button', { name: 'Whole picture' }).click();
	await expect(frame.locator('img')).toHaveCSS('object-fit', 'contain');
	await dialog.getByRole('button', { name: 'Fill the card' }).click();
	await dialog.getByRole('button', { name: 'Cancel' }).click();

	// The card picks the framing up — the deck renders from the same values the
	// preview did, so what was dragged into place is what ends up on the card.
	const thumbImg = card.locator('.thumb img');
	await expect(thumbImg).toHaveCSS('object-position', '25% 20%');
	await expect(thumbImg).toHaveCSS('transform', 'matrix(1.05, 0, 0, 1.05, 0, 0)');

	const framed = await thumbImg.evaluate((img: HTMLImageElement) => {
		const frameEl = img.parentElement as HTMLElement;
		// offset*, not getBoundingClientRect: the zoom above is a transform, and a
		// client rect would report the *scaled* box rather than the layout box we care
		// about here.
		return {
			naturalW: img.naturalWidth,
			dw: Math.abs(img.offsetWidth - frameEl.clientWidth),
			dh: Math.abs(img.offsetHeight - frameEl.clientHeight)
		};
	});
	// The picture is served by the image endpoint and really decoded.
	expect(framed.naturalW).toBeGreaterThan(0);
	// The <img> box is exactly the 4:3 window — not its own intrinsic height spilling
	// out of a frame that then clips whichever half it likes. That mismatch is what
	// made photos look mis-framed in the first place, so it's asserted, not eyeballed.
	expect(framed.dw).toBeLessThan(1);
	expect(framed.dh).toBeLessThan(1);

	await expect(card).toContainText('+15p');

	// Claim it for Robin — bonus points land immediately, no approval step.
	const memberSelect = page.locator('#bfmember');
	const robinValue = await memberSelect.locator('option', { hasText: 'Robin' }).getAttribute('value');
	await memberSelect.selectOption(robinValue!);
	await card.getByRole('button', { name: 'I did this' }).click();
	await expect(page.locator('.bonus .recent')).toContainText('Wash the car');

	await page.goto('/tasks');
	await expect(page.locator('.pill', { hasText: 'Robin' }).locator('.bal')).toHaveText('20p');

	// A bonus task is a standing offer, so it can be claimed again and again.
	await page.goto('/tasks?tab=bonus');
	await page.locator('.bcard', { hasText: 'Wash the car' }).getByRole('button', { name: 'I did this' }).click();
	await page.goto('/tasks');
	await expect(page.locator('.pill', { hasText: 'Robin' }).locator('.bal')).toHaveText('35p');

	// Undoing a claim takes exactly those points back out again.
	await page.goto('/tasks?tab=bonus');
	page.once('dialog', (d) => d.accept());
	await page.locator('.bonus .recent li').first().getByRole('button', { name: 'Undo' }).click();
	await page.goto('/tasks');
	await expect(page.locator('.pill', { hasText: 'Robin' }).locator('.bal')).toHaveText('20p');
});

test('the four tabs are one page: switching keeps the points strip and writes the tab to the URL', async () => {
	await page.goto('/tasks');

	// Chores is the default, so it stays out of the URL entirely.
	await expect(page).toHaveURL(/\/tasks$/);
	await expect(page.getByRole('tab', { name: 'Chores' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('.deflist li', { hasText: 'Feed the cat' })).toBeVisible();

	const strip = page.locator('.pill', { hasText: 'Robin' });
	await expect(strip).toBeVisible();

	// Each tab swaps the panel underneath without leaving the page — and the strip,
	// which is the thread tying all four together, never goes away.
	for (const [name, slug, marker] of [
		['Rewards', 'premier', '.reward'],
		['Consequences', 'konsekvenser', '.consequence'],
		['Bonus', 'bonus', '.bonus']
	] as const) {
		await page.getByRole('tab', { name }).click();
		await expect(page).toHaveURL(new RegExp(`\\/tasks\\?tab=${slug}$`));
		await expect(page.locator(marker)).toBeVisible();
		await expect(strip).toBeVisible();
		// Only ever one panel at a time — the other tabs' content is gone, not hidden.
		await expect(page.locator('.deflist')).toHaveCount(0);
	}

	// The URL is the source of truth, so a reload lands on the same tab.
	await page.goto('/tasks?tab=konsekvenser');
	await expect(page.getByRole('tab', { name: 'Consequences' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('.consequence')).toBeVisible();

	// An unknown slug falls back to Chores rather than rendering an empty page.
	await page.goto('/tasks?tab=nonsense');
	await expect(page.getByRole('tab', { name: 'Chores' })).toHaveAttribute('aria-selected', 'true');
});

test("each avatar rings how far through today its member is, and glows once they've done a bonus task too", async () => {
	await page.goto('/tasks');

	// Robin's one chore due today ("Water the plants") is ticked off, and the bonus test
	// above left one claim standing — so the ring is closed *and* glowing.
	const robin = page.locator('.pill', { hasText: 'Robin' }).locator('.avatar');
	await expect(robin).toHaveAttribute('data-progress', '1/1');
	await expect(robin).toHaveClass(/\bcomplete\b/);
	await expect(robin).toHaveClass(/\bglow\b/);

	// Giving Robin a second chore due today reopens the ring: 1 of 2, no longer complete,
	// and the glow goes with it — a bonus only counts once the day's own list is done.
	const today = isoDay();
	await page.getByRole('button', { name: '+ New chore' }).click();
	await page.getByLabel('Title').fill('Set the table');
	await page.getByLabel('Repeats').selectOption('none');
	await page.getByLabel('Date').fill(today);
	const assigned = page.locator('#ca');
	const robinValue = await assigned.locator('option', { hasText: 'Robin' }).getAttribute('value');
	await assigned.selectOption(robinValue!);
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(robin).toHaveAttribute('data-progress', '1/2');
	await expect(robin).not.toHaveClass(/\bcomplete\b/);
	await expect(robin).not.toHaveClass(/\bglow\b/);

	// The ring is drawn inside the avatar's own box, so adding one never changes how much
	// room the avatar takes — that would shove every list it sits in sideways.
	const ringed = await robin.evaluate((el) => el.getBoundingClientRect().width);
	expect(Math.round(ringed)).toBe(32);

	// Ticking the new chore off closes the ring again, and the glow comes back with it.
	await page.locator('.chorecard', { hasText: 'Set the table' }).first().click();
	await expect(robin).toHaveAttribute('data-progress', '2/2');
	await expect(robin).toHaveClass(/\bglow\b/);

	// The ring follows the avatar everywhere, not just on this page: progress is resolved
	// once in the root layout load, so the operator bar on the Today page draws the same
	// ring without that page knowing anything about chores.
	// (The "nothing due today → no ring at all" case is covered in progress.test.ts —
	// by this point in the run every member has chores due today.)
	await page.goto('/');
	const inBar = page.locator('.opbar .choice', { hasText: 'Robin' }).locator('.avatar');
	await expect(inBar).toHaveAttribute('data-progress', '2/2');
	await expect(inBar).toHaveClass(/\bglow\b/);
});

test('clicking a member on the dashboard opens their profile popup, with points, streak, today\'s chores — and can switch the operator', async () => {
	await page.goto('/');
	await page.getByRole('button', { name: /Robin/ }).click();

	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('heading', { name: 'Robin' })).toBeVisible();
	await expect(dialog).toContainText('1 day streak');
	await expect(dialog).toContainText('Water the plants');

	// No PIN was set for Robin, so becoming operator from inside the popup is immediate.
	await dialog.getByRole('button', { name: 'Become operator' }).click();
	await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

	// Reopening the profile while already the operator offers "Sign out" instead.
	await page.getByRole('button', { name: /Robin/ }).click();
	await expect(page.getByRole('dialog').getByRole('button', { name: 'Sign out' })).toBeVisible();
	await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click();
	await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});

test('tags: created in Settings, attached to a chore, and filterable in the week view', async () => {
	await page.goto('/settings');
	await page.getByPlaceholder('Label').fill('Outdoors');
	await page.getByRole('button', { name: 'Add tag' }).click();
	// The tag's label is an inline-editable input (same pattern as the members list),
	// so its text lives in a value, not as rendered text content.
	await expect(page.locator('ul.list li input.mname')).toHaveValue('Outdoors');

	await page.goto('/tasks');
	await page
		.locator('.deflist li', { hasText: 'Water the plants' })
		.getByRole('button', { name: 'Edit' })
		.click();
	await page.getByRole('button', { name: 'Outdoors', exact: true }).click();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.locator('.deflist li', { hasText: 'Water the plants' }).locator('.chip')).toHaveText(
		'Outdoors'
	);

	await page.goto('/week');
	await expect(page.locator('.tagfilter .tagopt', { hasText: 'Outdoors' })).toBeVisible();
	// "Feed the cats" repeats daily, so it has a card in every column; scope to today's
	// column so these locators resolve to exactly one element each.
	const todayCol = page.locator('.day.today');
	await expect(todayCol.locator('.chore', { hasText: 'Water the plants' }).locator('.chip')).toHaveText(
		'Outdoors'
	);

	// Filtering by the tag keeps the tagged chore but hides an untagged one due the same day.
	await page.locator('.tagfilter .tagopt', { hasText: 'Outdoors' }).click();
	await expect(todayCol.locator('.chore', { hasText: 'Water the plants' })).toBeVisible();
	await expect(todayCol.locator('.chore', { hasText: 'Feed the cats' })).toBeHidden();
	await page.locator('.tagfilter .tagopt', { hasText: 'Outdoors' }).click(); // reset for later tests
});

test('calendar notations: multi-day span, multiple members, and a recurring notation', async () => {
	// A second member, so "multiple members on one notation" is meaningfully testable.
	await page.goto('/settings');
	const membersSection = page.locator('section.card', { hasText: 'Family members' });
	const addRow = membersSection.locator('.addrow');
	await addRow.locator('input.emoji').fill('🦄');
	await addRow.getByPlaceholder('Name').fill('Ada');
	await addRow.getByRole('button', { name: 'Add' }).click();
	// Member names, like tag labels, are inline-editable inputs — check the value, not text content.
	await expect(membersSection.locator('.mlist input.mname')).toHaveCount(2);
	await expect(membersSection.locator('.mlist input.mname').last()).toHaveValue('Ada');

	// Multi-day: started yesterday, still ongoing today. Created directly via the API
	// (like the existing future-dated to-do test) so this doesn't depend on which
	// weekday "today" happens to be relative to the week grid's boundaries.
	const yesterday = isoDay(new Date(Date.now() - 86_400_000));
	const today = isoDay();
	await page.evaluate(
		async ({ yesterday, today }) => {
			await fetch('/api/plan-items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: 'Family trip', date: yesterday, endDate: today })
			});
		},
		{ yesterday, today }
	);
	await page.goto('/');
	await expect(page.locator('.agenda li', { hasText: 'Family trip' })).toBeVisible();

	// A recurring, multi-member notation created through the actual form.
	await page.goto('/week');
	await page.getByRole('button', { name: '+ New notation' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Title').fill('Swim practice');
	await dialog.getByRole('button', { name: /Robin/ }).click();
	await dialog.getByRole('button', { name: /Ada/ }).click();
	await dialog.locator('#nr').selectOption('daily');
	await dialog.getByRole('button', { name: 'Save' }).click();

	const todayCol = page.locator('.day.today');
	const item = todayCol.locator('.item', { hasText: 'Swim practice' });
	await expect(item).toBeVisible();
	await expect(item.locator('.mdot')).toHaveCount(2); // both linked members shown, each their own color
	await expect(item.locator('.recur')).toBeVisible(); // recurring indicator

	// Deleting the whole series removes it — including from today's column.
	page.once('dialog', (d) => d.accept());
	await item.getByRole('button', { name: 'Delete whole series' }).click();
	await expect(todayCol.locator('.item', { hasText: 'Swim practice' })).toHaveCount(0);
});

test('reward bank: create, tag to a person, edit, and delete', async () => {
	// A tag named after a member "connects" a reward to them — it pre-selects that
	// member as who a tagged reward is redeemed for, without restricting anyone else
	// from picking a different member instead.
	await page.goto('/settings');
	await page.getByPlaceholder('Label').fill('Ada');
	await page.getByRole('button', { name: 'Add tag' }).click();
	await expect(page.getByPlaceholder('Label')).toHaveValue(''); // input clears once the tag is saved

	await page.goto('/tasks?tab=premier');
	await page.getByRole('button', { name: 'New reward' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Reward').fill('Extra screen time');
	await dialog.getByLabel('Points cost').fill('10');
	await dialog.getByRole('button', { name: 'Ada', exact: true }).click();
	await dialog.getByRole('button', { name: 'Save' }).click();

	const row = page.locator('.reward .catalog li', { hasText: 'Extra screen time' });
	await expect(row).toBeVisible();
	await expect(row.locator('.chip')).toHaveText('Ada');
	const selectedLabel = await row
		.locator('select')
		.evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.textContent);
	expect(selectedLabel).toContain('Ada');

	// Editing changes the existing reward in place rather than creating a new one.
	await row.getByRole('button', { name: 'Edit' }).click();
	await dialog.getByLabel('Reward').fill('Extra tablet time');
	await dialog.getByLabel('Points cost').fill('15');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(page.locator('.reward .catalog li', { hasText: 'Extra screen time' })).toHaveCount(0);
	const renamedRow = page.locator('.reward .catalog li', { hasText: 'Extra tablet time' });
	await expect(renamedRow).toContainText('15p');
	await expect(renamedRow.locator('.chip')).toHaveText('Ada'); // tag survives the edit

	// Deleting removes it from the catalog for good.
	page.once('dialog', (d) => d.accept());
	await renamedRow.getByRole('button', { name: '🗑' }).click();
	await expect(page.locator('.reward .catalog li', { hasText: 'Extra tablet time' })).toHaveCount(0);
});

test('an admin can set a PIN and sign in with it instead of email + password', async () => {
	await page.goto('/settings');
	page.once('dialog', (d) => d.accept('135790'));
	await page.getByRole('button', { name: 'Set PIN' }).click();
	await expect(page.getByRole('button', { name: '🔑 PIN' })).toBeVisible();

	// Log out, then sign back in via the PIN pad instead of the password form.
	await page.getByRole('button', { name: /Alex/ }).click();
	await expect(page.getByRole('button', { name: '🔒 Admin' })).toBeVisible();

	await page.getByRole('button', { name: '🔒 Admin' }).click();
	const dialog = page.getByRole('dialog', { name: 'Admin sign-in' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Use a PIN instead' }).click();

	const pinDialog = page.getByRole('dialog', { name: 'Admin PIN sign-in' });
	for (const d of '135790') {
		await pinDialog.getByRole('button', { name: d, exact: true }).click();
	}
	await pinDialog.getByRole('button', { name: 'Sign in' }).click();
	await expect(pinDialog).toBeHidden();
	await expect(page.getByRole('button', { name: /Alex/ })).toBeVisible();
});

test('the week planner starts on today, so tomorrow onwards is what you see next', async () => {
	await page.goto('/week');
	await expect(page.locator('.day').first()).toBeVisible();

	// The seven columns run forward from today, never backwards into days already gone.
	const iso = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	const shown = await page
		.locator('.day')
		.evaluateAll((els) => els.map((el) => el.getAttribute('data-date')));
	const expected = Array.from({ length: 7 }, (_, i) => {
		const d = new Date();
		d.setDate(d.getDate() + i);
		return iso(d);
	});
	expect(shown).toEqual(expected);

	// Today's column is the first one, and it's the only one marked as today.
	const firstIsToday = await page
		.locator('.day')
		.first()
		.evaluate((el) => el.classList.contains('today'));
	expect(firstIsToday).toBe(true);
	await expect(page.locator('.day.today')).toHaveCount(1);
	await expect(page.locator('.day').first().locator('.todaypill')).toBeVisible();

	// Paging moves a whole week and back again.
	await page.getByRole('button', { name: '→' }).click();
	await expect(page.locator('.day').first()).not.toHaveClass(/today/);
	await page.getByRole('button', { name: 'Today', exact: true }).click();
	await expect(page.locator('.day').first()).toHaveClass(/today/);
});

test('a plan item added in the week view appears in the month view', async () => {
	const today = new Date();
	await page.goto('/week');
	const label = today.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
	const col = page.locator('.day', { hasText: label }).first();
	await col.getByPlaceholder('Add to-do…').fill('Swim bag');
	await col.getByPlaceholder('Add to-do…').press('Enter');
	await expect(page.getByText('Swim bag')).toBeVisible();

	await page.goto('/month');
	await page
		.locator('.cell', { hasText: new RegExp(`^${today.getDate()}(\\D|$)`) })
		.first()
		.click();
	await expect(page.locator('.detail')).toContainText('Swim bag');
});

test('a future-dated to-do shows up in "Coming up" on the Today page', async () => {
	const future = isoDay(new Date(Date.now() + 2 * 86_400_000));
	await page.evaluate(
		async (date) => {
			await fetch('/api/plan-items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: 'Library books due', date })
			});
		},
		future
	);

	await page.goto('/');
	await expect(page.getByText('Library books due')).toBeVisible();
});

test('the "Weekly plan" card on the Today page finds and opens the school PDF library', async () => {
	await page.goto('/');
	const dashboardCard = page.locator('a.doclink');
	await expect(dashboardCard).toContainText('Weekly plan');
	await expect(dashboardCard).toContainText('No documents yet');
	await dashboardCard.click();
	await expect(page).toHaveURL('/upload');

	await page.setInputFiles(
		'input[type=file]',
		join(process.cwd(), 'tests/fixtures/school-calendar.pdf')
	);
	await expect(page.getByText('school-calendar')).toBeVisible();

	await page.getByRole('button', { name: /school-calendar/ }).click();
	await expect(page.getByRole('dialog')).toBeVisible();

	// The document is rendered into the page as canvases rather than handed to an
	// <iframe>: Android has no inline PDF viewer, so an iframe shows nothing there.
	// A canvas with real pixels is the thing that actually works on every device.
	const firstPage = page.locator('.viewport canvas').first();
	await expect(firstPage).toBeVisible({ timeout: 15_000 });
	const size = await firstPage.evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
	expect(size.w).toBeGreaterThan(100);
	expect(size.h).toBeGreaterThan(100);

	await page.getByRole('button', { name: /Close/ }).click();
	await expect(page.getByRole('dialog')).toBeHidden();

	// The Today page now shows it as the latest document.
	await page.goto('/');
	await expect(page.getByText('Latest: school-calendar')).toBeVisible();
});

test('weekly plans are filed into named boxes, and deleting a box keeps its documents', async () => {
	await page.goto('/upload');

	// A box is created through the same round "+" the tasks page uses.
	page.once('dialog', (d) => d.accept('Robin'));
	await page.getByRole('button', { name: 'New box' }).click();
	// The name is an inline-editable <input value=…>, not a text node.
	const boxName = page.locator('input.boxname');
	await expect(boxName).toHaveValue('Robin');

	// Uploading from inside the box files the document into it.
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Upload to Robin' }).click();
	await (await chooser).setFiles(join(process.cwd(), 'tests/fixtures/school-calendar.pdf'));

	const robinBox = page.locator('.box', { has: page.locator('input.boxname') });
	await expect(robinBox.locator('.doc')).toHaveCount(1);
	await expect(robinBox.getByText('school-calendar')).toBeVisible();

	// Renaming the box leaves its contents alone.
	await boxName.fill('Alex');
	await boxName.blur();
	await expect(page.getByRole('button', { name: 'Upload to Alex' })).toBeVisible();
	await expect(robinBox.locator('.doc')).toHaveCount(1);

	// Deleting a box must never delete a term's worth of weekly plans with it — the
	// documents fall back to the unfiled pile instead.
	page.once('dialog', (d) => d.accept());
	await page.getByRole('button', { name: 'Delete box' }).click();
	await expect(page.locator('input.boxname')).toHaveCount(0);
	const unfiled = page.locator('.box', { hasText: 'Unfiled' });
	await expect(unfiled.locator('.doc')).toHaveCount(2);
});

test('anyone can add and rename a weekly plan, but only an admin can delete one', async () => {
	await page.goto('/upload');

	// Drop out of admin mode — a child at the tablet on a Monday morning.
	await page.getByRole('button', { name: /Alex/ }).click();
	await expect(page.getByRole('button', { name: '🔒 Admin' })).toBeVisible();

	// The destructive and structural controls are gone…
	await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'New box' })).toHaveCount(0);
	// …but adding a document and naming it are still there.
	await expect(page.getByRole('button', { name: /^Upload to/ })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Rename' }).first()).toBeVisible();

	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: /^Upload to/ }).first().click();
	await (await chooser).setFiles(join(process.cwd(), 'tests/fixtures/school-calendar.pdf'));
	await expect(page.locator('.box', { hasText: 'Unfiled' }).locator('.doc')).toHaveCount(3);

	// Renaming needs no unlock either — no admin dialog should appear.
	page.once('dialog', (d) => d.accept('Week 38 - Alex'));
	await page.getByRole('button', { name: 'Rename' }).first().click();
	await expect(page.getByText('Week 38 - Alex')).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Admin sign-in' })).toHaveCount(0);

	// Back into admin mode for the tests that follow.
	await page.getByRole('button', { name: '🔒 Admin' }).click();
	const dlg = page.getByRole('dialog', { name: 'Admin sign-in' });
	await dlg.getByLabel('Email').fill(ADMIN.email);
	await dlg.getByLabel('Password').fill(ADMIN.password);
	await dlg.getByRole('button', { name: 'Sign in' }).click();
	await expect(dlg).toBeHidden();
	await expect(page.getByRole('button', { name: 'Delete' }).first()).toBeVisible();
});

test('a long PDF renders lazily, so a tablet is never asked for every page at once', async () => {
	await page.goto('/upload');
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: /^Upload to/ }).first().click();
	await (await chooser).setFiles(join(process.cwd(), 'tests/fixtures/school-newsletter.pdf'));
	await expect(page.getByText('school-newsletter')).toBeVisible();

	await page.getByRole('button', { name: /school-newsletter/ }).click();
	await expect(page.getByRole('dialog')).toBeVisible();

	// Every page gets a placeholder at its real aspect ratio, so the scrollbar is
	// honest from the start and nothing jumps as pages fill in.
	await expect(page.locator('.viewport .page')).toHaveCount(12);

	// The first page is drawn with real pixels…
	const first = page.locator('.viewport .page canvas').first();
	await expect(first).toBeVisible({ timeout: 15_000 });
	const size = await first.evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
	expect(size.w).toBeGreaterThan(100);
	expect(size.h).toBeGreaterThan(100);

	// …but the whole document is not. At this sheet's width an A4 page is ~21 MB of
	// canvas, so rasterising twelve at once is what kills the tab on a cheap Android
	// tablet. This is the assertion that keeps the viewer lazy.
	const drawnAtTop = await page.locator('.viewport .page canvas').count();
	expect(drawnAtTop).toBeGreaterThan(0);
	expect(drawnAtTop).toBeLessThan(12);

	// Scrolling to the end draws the last page — and still doesn't hold all twelve.
	await page.locator('.viewport').evaluate((el) => el.scrollTo(0, el.scrollHeight));
	await expect(page.locator('.viewport .page[data-page="12"] canvas')).toBeVisible({
		timeout: 15_000
	});
	expect(await page.locator('.viewport .page canvas').count()).toBeLessThan(12);

	await page.getByRole('button', { name: /Close/ }).click();
	await expect(page.getByRole('dialog')).toBeHidden();
});

test('an avatar image can be uploaded for a member', async () => {
	// A 1x1 PNG as a throwaway avatar.
	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
		'base64'
	);
	await page.goto('/settings');
	await page.setInputFiles('.mrow input[type=file]', {
		name: 'face.png',
		mimeType: 'image/png',
		buffer: png
	});
	await expect(page.locator('.mrow img').first()).toBeVisible();
});

test('the published .ics feed serves chores, its link can be regenerated, and baseline security headers are set', async ({
	request
}) => {
	const health = await request.get('/healthz');
	expect((await health.json()).status).toBe('ok');
	expect(health.headers()['x-content-type-options']).toBe('nosniff');
	expect(health.headers()['x-frame-options']).toBe('DENY');

	await page.goto('/settings');
	const feedUrl = await page.locator('code.feed').innerText();
	const feed = await request.get(feedUrl);
	expect(feed.ok()).toBeTruthy();
	expect(await feed.text()).toContain('BEGIN:VCALENDAR');

	// Regenerating invalidates the old link immediately and issues a new working one.
	page.once('dialog', (d) => d.accept());
	await page.getByRole('button', { name: 'Regenerate link' }).click();
	await expect(page.locator('code.feed')).not.toHaveText(feedUrl);
	const newFeedUrl = await page.locator('code.feed').innerText();

	expect((await request.get(feedUrl)).status()).toBe(404);
	const newFeed = await request.get(newFeedUrl);
	expect(newFeed.ok()).toBeTruthy();
	expect(await newFeed.text()).toContain('BEGIN:VCALENDAR');
});

test('the "Did you know?" box shows a fact from dayinhistory.dev, with a working "Another fact" button', async () => {
	await page.goto('/');
	const box = page.locator('.onthisday');
	await expect(box).toBeVisible();
	await expect(box.getByText('Did you know?')).toBeVisible();

	// Lives against the real dayinhistory.dev API; tolerate it being unreachable —
	// only assert the shape when a fact actually came back.
	const headline = box.locator('.headline');
	if (await headline.isVisible().catch(() => false)) {
		const first = await headline.innerText();
		expect(first.length).toBeGreaterThan(0);

		const nextButton = box.getByRole('button', { name: 'Another fact' });
		if (await nextButton.isVisible().catch(() => false)) {
			await nextButton.click();
			await expect(headline).not.toHaveText(first);
		}
	} else {
		await expect(box.getByText('No historical facts available right now.')).toBeVisible();
	}
});

// The dashboard lives on a wall tablet and on phones, so "it fits the screen" is a
// property worth asserting rather than eyeballing. Runs last, against the household
// the earlier tests built up, so the pages are full of real content.
test('every page fits the screen at phone and tablet widths, with no sideways scroll', async () => {
	const widths = [
		{ w: 360, label: 'small phone' },
		{ w: 390, label: 'phone' },
		{ w: 768, label: 'tablet portrait' },
		{ w: 1024, label: 'tablet landscape' }
	];
	const routes = [
		'/',
		'/week',
		'/month',
		'/tasks',
		'/tasks?tab=premier',
		'/tasks?tab=konsekvenser',
		'/tasks?tab=bonus',
		'/upload',
		'/shopping',
		'/shopping?tab=register',
		'/settings'
	];

	for (const { w, label } of widths) {
		await page.setViewportSize({ width: w, height: 900 });
		for (const route of routes) {
			await page.goto(route);
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow, `${route} overflows horizontally at ${w}px (${label})`).toBeLessThanOrEqual(0);
		}
	}
	await page.setViewportSize({ width: 1280, height: 900 });
});

test('a tall dialog stays reachable on a short screen', async () => {
	// The chore form is the tallest dialog in the app; on a short viewport it must start
	// at the top of the overlay and scroll, never be centred with its head cut off.
	await page.setViewportSize({ width: 390, height: 640 });
	await page.goto('/tasks');
	await page.getByRole('button', { name: '+ New chore' }).click();

	const box = await page.getByRole('dialog').boundingBox();
	expect(box, 'dialog should be rendered').not.toBeNull();
	expect(box!.y, 'dialog top is cut off above the viewport').toBeGreaterThanOrEqual(0);

	// And the buttons at its foot are reachable by scrolling the overlay.
	await page.locator('.backdrop').evaluate((b) => b.scrollTo(0, b.scrollHeight));
	await expect(page.getByRole('button', { name: 'Save' })).toBeInViewport();

	await page.getByRole('button', { name: 'Cancel' }).click();
	await page.setViewportSize({ width: 1280, height: 900 });
});

test("a chore can only be ticked off on the day it's due — other days are admin-only", async () => {
	const tomorrow = isoDay(new Date(Date.now() + 86_400_000));
	await page.goto('/tasks');

	// Admin is still signed in from the previous test.
	await page.getByRole('button', { name: '+ New chore' }).click();
	await page.getByLabel('Title').fill('Take out the bins');
	await page.getByLabel('Repeats').selectOption('none');
	await page.getByLabel('Date').fill(tomorrow);
	await page.getByRole('button', { name: 'Save' }).click();

	// …and a one-off due today, to prove this is a date rule rather than a lockdown.
	// (A *daily* chore is no good for that: it has seven occurrences in the rolling
	// deck, so `.first()` would just as likely match tomorrow's.)
	await page.getByRole('button', { name: '+ New chore' }).click();
	await page.getByLabel('Title').fill('Tidy the hall');
	await page.getByLabel('Repeats').selectOption('none');
	await page.getByLabel('Date').fill(isoDay());
	await page.getByRole('button', { name: 'Save' }).click();

	const card = page.locator('.chorecard', { hasText: 'Take out the bins' }).first();
	await expect(card).toBeVisible();
	// An admin may register it for another day.
	await expect(card).toBeEnabled();
	const id = await card.getAttribute('data-id');

	// Drop to standard mode — the card locks rather than offering a tap that would fail.
	await page.getByRole('button', { name: /Alex/ }).click();
	await expect(page.getByRole('button', { name: '🔒 Admin' })).toBeVisible();
	await expect(card).toBeDisabled();
	await expect(card).toHaveClass(/\blocked\b/);

	// And the rule is the server's, not the button's: going straight at the API in
	// standard mode is refused for tomorrow…
	expect((await page.request.post(`/api/chore-instances/${id}`, { data: { status: 'done' } })).status()).toBe(401);
	// …as is the checklist route, which would otherwise be the way round it.
	expect((await page.request.post(`/api/chore-instances/${id}/checklist`, { data: { index: 0 } })).status()).toBe(401);

	// Today's chores are unaffected — this is a date rule, not a lockdown.
	const todayCard = page.locator('.chorecard', { hasText: 'Tidy the hall' }).first();
	await expect(todayCard).toBeEnabled();
	await expect(todayCard).not.toHaveClass(/\blocked\b/);

	// An admin can register the other day.
	await page.getByRole('button', { name: '🔒 Admin' }).click();
	const dlg = page.getByRole('dialog', { name: 'Admin sign-in' });
	await dlg.getByLabel('Email').fill(ADMIN.email);
	await dlg.getByLabel('Password').fill(ADMIN.password);
	await dlg.getByRole('button', { name: 'Sign in' }).click();
	await expect(dlg).toBeHidden();
	expect((await page.request.post(`/api/chore-instances/${id}`, { data: { status: 'done' } })).ok()).toBe(true);
});

test('the shopping list: anyone can add a list, an item and a picture, and tick it off', async () => {
	await page.goto('/shopping');

	// Everything here is open — do it in standard mode to prove that.
	await page.getByRole('button', { name: /Alex/ }).click();
	await expect(page.getByRole('button', { name: '🔒 Admin' })).toBeVisible();

	page.once('dialog', (d) => d.accept('Fruit & veg'));
	await page.getByRole('button', { name: 'New shopping list' }).click();
	// The category name is an inline <input value=…>, not a text node.
	await expect(page.locator('input.listname')).toHaveValue('Fruit & veg');

	await page.getByRole('button', { name: 'Add to Fruit & veg' }).click();
	// Scoped by class: once a picture is being cut out there are two dialogs open.
	const dialog = page.locator('.modal[role=dialog]');
	await dialog.getByLabel('Item').fill('Bananas');
	await dialog.getByLabel('How many').fill('2');
	await dialog.getByLabel('Unit', { exact: true }).selectOption('kg');
	await dialog.getByRole('button', { name: 'Save' }).click();

	// The amount and its unit show on the line.
	await expect(page.locator('.item', { hasText: 'Bananas' })).toContainText('2 kg');

	// The picture is register master data, so a standard user isn't offered it…
	await expect(dialog.getByRole('button', { name: 'Add picture' })).toHaveCount(0);
	await dialog.getByRole('button', { name: 'Cancel' }).click();

	// …but an admin is.
	await page.getByRole('button', { name: '🔒 Admin' }).click();
	const adlg = page.getByRole('dialog', { name: 'Admin sign-in' });
	await adlg.getByLabel('Email').fill(ADMIN.email);
	await adlg.getByLabel('Password').fill(ADMIN.password);
	await adlg.getByRole('button', { name: 'Sign in' }).click();
	await expect(adlg).toBeHidden();

	await page.locator('.item', { hasText: 'Bananas' }).getByRole('button', { name: 'Edit item' }).click();
	await expect(dialog.getByRole('button', { name: 'Add picture' })).toBeVisible();
	// Picking a photo opens the cut-out editor on its own — that's the point of a
	// product picture, and a separate "now remove the background" step never gets taken.
	await page.setInputFiles('input[type=file]', join(process.cwd(), 'tests/fixtures/bonus-photo.png'));
	const cut = page.getByRole('dialog', { name: 'Cut out the item' });
	await expect(cut).toBeVisible();

	// Tapping the canvas in background mode removes what's under it, which is undoable.
	await cut.getByRole('tab', { name: 'Background' }).click();
	await expect(cut.getByRole('button', { name: 'Undo' })).toBeDisabled();
	const stage = cut.locator('canvas');
	const sb = (await stage.boundingBox())!;
	await page.mouse.click(sb.x + 4, sb.y + 4);
	await expect(cut.getByRole('button', { name: 'Undo' })).toBeEnabled();

	await cut.getByRole('button', { name: 'Use picture' }).click();
	await expect(cut).toBeHidden();
	await expect(dialog.getByRole('button', { name: 'Replace' })).toBeVisible();

	// What lands on the server is a transparent PNG, not the JPEG/WebP the other
	// uploads use — a cut-out needs an alpha channel, and lossy formats fringe it.
	const src = await page.locator('.item', { hasText: 'Bananas' }).locator('img').getAttribute('src');
	const stored = await page.request.get(src!.split('?')[0]);
	expect(stored.headers()['content-type']).toBe('image/png');

	// And it's shown whole rather than cropped to fill the tile. (Regex, not a literal:
	// the browser re-serialises the inline style with spaces after the colons.)
	await expect(page.locator('.item', { hasText: 'Bananas' }).locator('img')).toHaveAttribute(
		'style',
		/object-fit:\s*contain/
	);

	// An already-stored picture can be re-cut without being re-taken.
	await dialog.getByRole('button', { name: 'Edit picture' }).click();
	await expect(page.getByRole('dialog', { name: 'Cut out the item' })).toBeVisible();
	await page.getByRole('dialog', { name: 'Cut out the item' }).getByRole('button', { name: 'Cancel' }).click();

	// Dragging the preview reframes the picture, and that saves on its own.
	const frame = dialog.locator('.frame');
	const box = (await frame.boundingBox())!;
	await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.75);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.75);
	await page.mouse.up();

	// The tile renders from the same framingStyle() as the editor's preview, so what was
	// dragged into place is literally what the list shows.
	const tile = page.locator('.item', { hasText: 'Bananas' });
	await expect(tile.locator('img')).toHaveAttribute('style', /object-position:\s*25%/);
	await dialog.getByRole('button', { name: 'Cancel' }).click();

	// Back to standard mode for the rest — ticking off is everyone's.
	await page.getByRole('button', { name: /Alex/ }).click();
	await expect(page.getByRole('button', { name: '🔒 Admin' })).toBeVisible();

	// Ticking off is a tap on the tile, and the outstanding count drops.
	// The category is located by its input, not by text: the name is an inline
	// <input value=…>, which `hasText` cannot see.
	const listCard = page.locator('.slist', { has: page.locator('input.listname') });
	await expect(listCard.locator('.count')).toHaveText('1');
	await tile.locator('.tick').click();
	await expect(tile).toHaveClass(/\bdone\b/);
	await expect(listCard.locator('.count')).toHaveText('0');

	// There is no catch-all any more: every item is on a list, so no box appears that
	// nobody made.
	await expect(page.locator('.slist')).toHaveCount(1);
	await expect(page.locator('.item')).toHaveCount(1);
});

test('deleting a shopping list takes its items with it, but not what the register knows', async () => {
	await page.goto('/shopping');

	page.once('dialog', (d) => d.accept('Throwaway'));
	await page.getByRole('button', { name: 'New shopping list' }).click();
	await expect(page.locator('.slist')).toHaveCount(2);

	await page.getByRole('button', { name: 'Add to Throwaway' }).click();
	const dlg = page.locator('.modal[role=dialog]');
	await dlg.getByLabel('Item').fill('Cinnamon');
	await dlg.getByRole('button', { name: 'Save' }).click();
	await dlg.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.locator('.item', { hasText: 'Cinnamon' })).toHaveCount(1);

	// The list and its contents go together — orphaning them would make them invisible,
	// which is worse than removing them.
	page.once('dialog', (d) => d.accept());
	await page
		.locator('.slist', { has: page.getByRole('button', { name: 'Add to Throwaway' }) })
		.getByRole('button', { name: 'Delete list' })
		.click();
	await expect(page.locator('.slist')).toHaveCount(1);
	await expect(page.locator('.item', { hasText: 'Cinnamon' })).toHaveCount(0);

	// …but the register still remembers it, so it can be put straight back.
	await page.goto('/shopping?tab=register');
	await expect(page.locator('.row-item', { hasText: 'Cinnamon' })).toBeVisible();
});

test('the shopping list remembers what you buy: the picture and category come back next time', async () => {
	await page.goto('/shopping');

	// "Bananas" is still on the list from the previous test, with a picture on it.
	const tile = page.locator('.item', { hasText: 'Bananas' });
	await expect(tile.locator('img')).toBeVisible();

	// Clear the list completely — the ticked one plus anything left over.
	page.once('dialog', (d) => d.accept());
	await page.getByRole('button', { name: /^Clear ticked/ }).click();
	await expect(page.locator('.item', { hasText: 'Bananas' })).toHaveCount(0);

	// The previous test deleted its category, so make one to add into.
	page.once('dialog', (d) => d.accept('Fruit & veg'));
	await page.getByRole('button', { name: 'New shopping list' }).click();

	// Add it again by typing a prefix: the saved item is suggested, with its picture.
	await page.getByRole('button', { name: /^Add to/ }).first().click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Item').fill('Ban');
	const option = dialog.getByRole('option', { name: /Bananas/ });
	await expect(option).toBeVisible();
	await expect(option.locator('img')).toBeVisible();

	await option.click();
	await expect(dialog.getByLabel('Item')).toHaveValue('Bananas');
	// Picking it restores the picture without re-uploading anything — and without being
	// an admin, because putting a remembered item on the list is everyone's job.
	await dialog.getByRole('button', { name: 'Save' }).click();
	await dialog.getByRole('button', { name: 'Cancel' }).click();

	// …and the row on the list shows it.
	const again = page.locator('.item', { hasText: 'Bananas' });
	await expect(again.locator('img')).toBeVisible();

	// Typing a name in full, with no picking, resolves to the same remembered product
	// rather than starting a second one that would split the picture away from it.
	await page.getByRole('button', { name: /^Add to/ }).first().click();
	await dialog.getByLabel('Item').fill('bananas');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	// Two rows, one product: both show the picture that was only ever uploaded once.
	const rows = page.locator('.item').filter({ hasText: /banan/i });
	await expect(rows).toHaveCount(2);
	await expect(rows.nth(0).locator('img')).toBeVisible();
	await expect(rows.nth(1).locator('img')).toBeVisible();
});

test('the register: everyone can read it, only an admin can set a unit and a price', async () => {
	await page.goto('/shopping?tab=register');
	// Standard mode, carried over from the previous test.
	await expect(page.getByRole('button', { name: '🔒 Admin' })).toBeVisible();

	// Readable by all — it's the household's own list of what it buys.
	// Addressed by id, not by text: the moment Edit opens, the name becomes an
	// <input value=…> and `hasText` stops matching the row.
	const src = await page.locator('.row-item img').first().getAttribute('src');
	const productId = src!.split('/')[3];
	const row = page.locator(`.row-item[data-id="${productId}"]`);
	await expect(row).toBeVisible();
	await expect(row).toContainText('Bananas');
	// …but not editable, and the page says why.
	await expect(row.getByRole('button', { name: 'Edit' })).toHaveCount(0);
	await expect(page.getByText('Sign in as admin to edit the register')).toBeVisible();

	// The API is the real gate, not the missing button.
	const refused = await page.request.patch(`/api/shopping-products/${productId}`, {
		data: { priceOre: 1 }
	});
	expect(refused.status()).toBe(401);

	// As an admin, a unit and a price can be set.
	await page.getByRole('button', { name: '🔒 Admin' }).click();
	const dlg = page.getByRole('dialog', { name: 'Admin sign-in' });
	await dlg.getByLabel('Email').fill(ADMIN.email);
	await dlg.getByLabel('Password').fill(ADMIN.password);
	await dlg.getByRole('button', { name: 'Sign in' }).click();
	await expect(dlg).toBeHidden();

	await row.getByRole('button', { name: 'Edit' }).click();
	// A raw i18n key with no translation renders as its own literal name — this field
	// was "shop.category" on screen for a while after the key was renamed to
	// "shop.list" everywhere except here.
	await expect(row.getByText('shop.category')).toHaveCount(0);
	await row.getByLabel('Unit', { exact: true }).selectOption('kg');
	// Typed with a comma, as a Norwegian would; parsePrice() takes either separator.
	await row.getByLabel(/^Price per/).fill('24,90');
	await row.getByLabel('Store').fill('Coop Obs!');
	// The list picker in this same form is a genuinely different field from Store —
	// this is the exact confusion the feature request grew out of, so both must be
	// visible and distinct rather than one silently standing in for the other.
	await expect(row.getByLabel('List')).toBeVisible();
	await row.getByRole('button', { name: 'Save' }).click();
	// Rendered in the household's locale, which this test set to English.
	await expect(row).toContainText('24.90/kg');
	await expect(row).toContainText('Coop Obs!');

	// The price reaches the list as amount × price. The unit on a *line* is its own —
	// changing the register doesn't rewrite rows already on the list — so set it here.
	await page.goto('/shopping');
	const tile = page.locator('.item', { hasText: 'Bananas' }).first();
	await tile.getByRole('button', { name: 'Edit item' }).click();
	const dialog = page.locator('.modal[role=dialog]');
	await dialog.getByLabel('How many').fill('2');
	await dialog.getByLabel('Unit', { exact: true }).selectOption('kg');
	await dialog.getByRole('button', { name: 'Save' }).click();

	// 2 kg at 24.90/kg, and the header totals what's still to buy.
	await expect(tile).toContainText('2 kg');
	await expect(tile).toContainText('49.80');
	await expect(tile).toContainText('Coop Obs!');
	await expect(page.locator('.total')).toContainText('Still to buy');

	// "Other" is a unit in its own right, with the household's own word stored on it.
	await page.goto('/shopping?tab=register');
	const other = page.locator(`.row-item[data-id="${productId}"]`);
	await other.getByRole('button', { name: 'Edit' }).click();
	await other.getByLabel('Unit', { exact: true }).selectOption('other');
	await other.getByLabel('Own unit').fill('nett');
	await other.getByRole('button', { name: 'Save' }).click();
	await expect(other).toContainText('nett');
});
