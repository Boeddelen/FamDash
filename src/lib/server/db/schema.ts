import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core';

const now = sql`(unixepoch())`;
const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

/** Singleton row (id = 'singleton') holding household-wide settings. */
export const household = sqliteTable('household', {
	id: text('id').primaryKey().default('singleton'),
	name: text('name').notNull().default('Our Family'),
	timezone: text('timezone').notNull().default('UTC'),
	weatherLat: real('weather_lat'),
	weatherLon: real('weather_lon'),
	weatherLabel: text('weather_label'),
	theme: text('theme').notNull().default('auto'), // auto | light | dark
	locale: text('locale').notNull().default('nb'), // nb | en
	feedToken: text('feed_token').$defaultFn(() => crypto.randomUUID()),
	setupComplete: integer('setup_complete', { mode: 'boolean' }).notNull().default(false),
	/** @deprecated Unused — superseded by the rewards catalog (see rewards/rewardRedemptions).
	 * Column kept rather than migrated away purely to avoid an unnecessary DROP COLUMN. */
	rewardNote: text('reward_note'),
	createdAt: integer('created_at').notNull().default(now)
});

/** Parent / guardian accounts. One or more; may be shared. Gate "big edits". */
export const admins = sqliteTable('admins', {
	id: id(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	/** Optional quick sign-in PIN (6–10 digits), for touchscreen use alongside email+password. */
	pinHash: text('pin_hash'),
	createdAt: integer('created_at').notNull().default(now)
});

/**
 * An active admin elevation. Expired when now - lastActivityAt > idle timeout.
 * Backed by either an admin account or an adult family member who unlocked with their
 * own PIN — exactly one of the two ids is set.
 */
export const adminSessions = sqliteTable('admin_sessions', {
	id: id(),
	adminId: text('admin_id').references(() => admins.id, { onDelete: 'cascade' }),
	memberId: text('member_id').references(() => members.id, { onDelete: 'cascade' }),
	lastActivityAt: integer('last_activity_at').notNull().default(now),
	createdAt: integer('created_at').notNull().default(now)
});

/** Family member profiles used for the operator switch + chore attribution. No login. */
export const members = sqliteTable('members', {
	id: id(),
	name: text('name').notNull(),
	role: text('role').notNull().default('child'), // adult | child
	color: text('color').notNull().default('#4f46e5'),
	emoji: text('emoji').notNull().default('🙂'),
	avatarPath: text('avatar_path'), // relative path under DATA_DIR/uploads for a face photo
	pinHash: text('pin_hash'),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: integer('created_at').notNull().default(now)
});

export const calendarConnections = sqliteTable('calendar_connections', {
	id: id(),
	kind: text('kind').notNull(), // google | caldav | ics_sub
	label: text('label').notNull(),
	color: text('color').notNull().default('#0ea5e9'),
	encCredentials: text('enc_credentials').notNull(), // AES-256-GCM JSON blob
	/** For caldav/google: which remote calendar hrefs are enabled + writable target. */
	config: text('config', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
	writable: integer('writable', { mode: 'boolean' }).notNull().default(false),
	lastSyncAt: integer('last_sync_at'),
	lastError: text('last_error'),
	createdAt: integer('created_at').notNull().default(now)
});

export const calendarEvents = sqliteTable(
	'calendar_events',
	{
		id: id(),
		connectionId: text('connection_id')
			.notNull()
			.references(() => calendarConnections.id, { onDelete: 'cascade' }),
		uid: text('uid').notNull(),
		title: text('title').notNull(),
		start: integer('start').notNull(), // unix seconds
		end: integer('end').notNull(),
		allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
		location: text('location'),
		description: text('description'),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(t) => [unique('calendar_events_conn_uid_start').on(t.connectionId, t.uid, t.start)]
);

/**
 * A named box on /upload that documents are filed into — one per child in practice,
 * since the weekly plans arrive one per child every Monday.
 * Deliberately not a foreign key to `members`: the boxes are for whatever the household
 * wants to keep separate, which isn't always a person.
 */
export const documentGroups = sqliteTable('document_groups', {
	id: id(),
	name: text('name').notNull(),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: integer('created_at').notNull().default(now)
});

/** Uploaded school documents (PDFs). Stored on disk under DATA_DIR/uploads/school/. */
export const schoolDocuments = sqliteTable('school_documents', {
	id: id(),
	/** Which box it's filed in. Null is the "unfiled" pile, which is where every
	 *  document uploaded before the boxes existed starts out. Deleting a box sets this
	 *  back to null rather than cascading — losing a box must never lose a PDF. */
	groupId: text('group_id').references(() => documentGroups.id, { onDelete: 'set null' }),
	title: text('title').notNull(),
	filename: text('filename').notNull(),
	storedPath: text('stored_path').notNull(), // relative to DATA_DIR
	mimeType: text('mime_type').notNull().default('application/pdf'),
	sizeBytes: integer('size_bytes').notNull().default(0),
	contentHash: text('content_hash').notNull(),
	uploadedByAdminId: text('uploaded_by_admin_id'),
	/**
	 * Set once the document's school week is over — the weekly plans are read Mon–Fri,
	 * so everything still active is archived at the Saturday boundary. Null means it's
	 * on the board now. A timestamp rather than a boolean so the archiving job can be
	 * idempotent and catch up after downtime instead of depending on having been awake
	 * at exactly the right minute.
	 */
	archivedAt: integer('archived_at'),
	/**
	 * Set when a parent puts an archived document back. Without it the restore is
	 * futile — `archivedAt` goes null, then the next run of the job re-archives the row
	 * on the same `uploadedAt` it used the first time, silently undoing them. It also
	 * covers the case the upload date can't express: a plan uploaded on the Friday
	 * *before* the week it's actually for.
	 */
	archiveExempt: integer('archive_exempt', { mode: 'boolean' }).notNull().default(false),
	uploadedAt: integer('uploaded_at').notNull().default(now)
});

/**
 * A shopping list — "Rema", "Frukt og grønt", whatever the household wants to keep
 * apart. (These were called categories until migration 0021 renamed the table and its
 * foreign keys to match what the UI had always called them.)
 *
 * Every item belongs to exactly one: there is no catch-all, and the UI won't let you
 * create an item without choosing a list. Migration 0020 swept the last loose rows into
 * one. Deleting a list deletes the items on it (see api/shopping-lists/[id]) — which is
 * what "delete this shopping list" means to the person tapping it.
 */
export const shoppingLists = sqliteTable('shopping_lists', {
	id: id(),
	name: text('name').notNull(),
	emoji: text('emoji').notNull().default('🛒'),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: integer('created_at').notNull().default(now)
});

/**
 * A product the household buys — "Havregryn", "Hakket tomat". This is the memory
 * behind the shopping list: typing a few letters suggests one, and picking it brings
 * back its category *and its picture*, so the effort of cutting a photo out is spent
 * once rather than every week. Clearing the list removes `shopping_items` rows; the
 * products they were made from survive, which is the whole point.
 *
 * The picture lives here rather than on the list row for the same reason — one product,
 * one picture, no second source of truth to drift.
 */
export const shoppingProducts = sqliteTable(
	'shopping_products',
	{
		id: id(),
		name: text('name').notNull(),
		listId: text('list_id').references(() => shoppingLists.id, {
			onDelete: 'set null'
		}),
		/** The unit this is normally bought in, and the price for *one of that unit* —
		 *  per kg, per litre, per piece. Both are register master data: admin-editable,
		 *  so a line on the list can't quietly change what a product costs. */
		unit: text('unit').notNull().default('stk'),
		/** The household's own word for the unit, when `unit` is 'other'. */
		unitLabel: text('unit_label'),
		/** Whole øre, never kroner in a float — see $lib/units.ts. */
		priceOre: integer('price_ore'),
		imagePath: text('image_path'),
		/** `contain` by default, not `cover`: a product picture is a cut-out on a
		 *  transparent background, and cropping one to fill a square would slice the
		 *  jar's lid off. Rendered through `framingStyle()` like every other framed
		 *  picture in the app. */
		imageFit: text('image_fit').notNull().default('contain'),
		imageX: integer('image_x').notNull().default(50),
		imageY: integer('image_y').notNull().default(50),
		imageZoom: integer('image_zoom').notNull().default(100),
		/** Suggestion order: what you buy often comes up first. */
		timesUsed: integer('times_used').notNull().default(0),
		lastUsedAt: integer('last_used_at'),
		createdAt: integer('created_at').notNull().default(now)
	},
	(t) => [uniqueIndex('shopping_products_name_unique').on(sql`${t.name} COLLATE NOCASE`)]
);

export const shoppingItems = sqliteTable('shopping_items', {
	id: id(),
	/** Null is the uncategorised pile — deleting a category empties it rather than
	 *  taking the items with it, same rule as the document boxes. */
	listId: text('list_id').references(() => shoppingLists.id, {
		onDelete: 'set null'
	}),
	/** The product this row was made from — where its picture and remembered category
	 *  come from. Null only for rows that predate a product, or whose product was
	 *  deleted; the row keeps working either way because `title` is its own copy. */
	productId: text('product_id').references(() => shoppingProducts.id, { onDelete: 'set null' }),
	title: text('title').notNull(),
	/** How many of `unit`. Null means "some" — the list still works without a number. */
	amount: real('amount'),
	/** Inherited from the product when the row is added, then free to differ: something
	 *  normally bought by the kilo can be one packet this week without rewriting the
	 *  register. */
	unit: text('unit').notNull().default('stk'),
	unitLabel: text('unit_label'),
	/** @deprecated Superseded by `amount` + `unit`. Migration 0019 parsed the leading
	 *  number out of it; kept rather than dropped so nothing is lost, read by nothing. */
	quantity: text('quantity'),
	note: text('note'),
	done: integer('done', { mode: 'boolean' }).notNull().default(false),
	/** @deprecated The picture moved to `shoppingProducts` so it survives the list being
	 *  cleared. These columns are still written by migration 0018's backfill and then
	 *  left alone — kept rather than dropped to avoid a destructive migration, and read
	 *  by nothing. */
	imageFit: text('image_fit').notNull().default('cover'),
	imageX: integer('image_x').notNull().default(50),
	imageY: integer('image_y').notNull().default(50),
	imageZoom: integer('image_zoom').notNull().default(100),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: integer('created_at').notNull().default(now)
});

export const chores = sqliteTable('chores', {
	id: id(),
	title: text('title').notNull(),
	notes: text('notes'),
	assignedMemberId: text('assigned_member_id').references(() => members.id, { onDelete: 'set null' }),
	recurrence: text('recurrence').notNull().default('none'), // none | daily | weekly | weekdays | custom
	/** For weekly/custom: bitmask of weekdays, Sun=1<<0 .. Sat=1<<6. */
	weekdayMask: integer('weekday_mask').notNull().default(0),
	startDate: text('start_date'), // YYYY-MM-DD, one-off or recurrence anchor
	time: text('time'), // HH:MM, optional — when during the day it should be done
	/** A small fixed set of category keys (see CHORE_CATEGORIES) — purely cosmetic (icon/grouping). */
	category: text('category'),
	/** Ordered sub-steps, e.g. ["Make the bed", "Vacuum", "Tidy the desk"]. Null = no checklist. */
	checklist: text('checklist', { mode: 'json' }).$type<string[] | null>(),
	points: integer('points').notNull().default(1),
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at').notNull().default(now)
});

export const choreInstances = sqliteTable(
	'chore_instances',
	{
		id: id(),
		choreId: text('chore_id')
			.notNull()
			.references(() => chores.id, { onDelete: 'cascade' }),
		dueDate: text('due_date').notNull(), // YYYY-MM-DD
		status: text('status').notNull().default('todo'), // todo | done | skipped
		completedByMemberId: text('completed_by_member_id').references(() => members.id, {
			onDelete: 'set null'
		}),
		completedAt: integer('completed_at'),
		/** Indices into the parent chore's `checklist` that are ticked off for this occurrence. */
		checklistDone: text('checklist_done', { mode: 'json' }).$type<number[] | null>()
	},
	(t) => [unique('chore_instances_chore_due').on(t.choreId, t.dueDate)]
);

/**
 * The template for a recurring calendar notation (e.g. "swim practice, every Tue/Thu").
 * Its actual dated occurrences are materialised as plan_items rows (seriesId set),
 * the same relationship chores have to chore_instances. A one-off notation (including
 * a one-off multi-day one) skips this entirely — it's just a single plan_items row.
 */
export const planSeries = sqliteTable('plan_series', {
	id: id(),
	title: text('title').notNull(),
	category: text('category'),
	notes: text('notes'),
	time: text('time'), // HH:MM; null = all-day
	/** How many days each occurrence spans, from its start date. 1 = single day. */
	durationDays: integer('duration_days').notNull().default(1),
	recurrence: text('recurrence').notNull().default('daily'), // daily | weekly | weekdays | custom
	weekdayMask: integer('weekday_mask').notNull().default(0),
	startDate: text('start_date').notNull(), // YYYY-MM-DD anchor
	/** Dates deliberately excluded from generation — e.g. one occurrence was deleted or
	 * moved off its scheduled day, and shouldn't reappear next time this regenerates. */
	skipDates: text('skip_dates', { mode: 'json' }).$type<string[]>().notNull().default([]),
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at').notNull().default(now)
});

/** Which members a recurring notation's series is for — copied onto each new occurrence. */
export const planSeriesMembers = sqliteTable(
	'plan_series_members',
	{
		seriesId: text('series_id')
			.notNull()
			.references(() => planSeries.id, { onDelete: 'cascade' }),
		memberId: text('member_id')
			.notNull()
			.references(() => members.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.seriesId, t.memberId] })]
);

export const planItems = sqliteTable('plan_items', {
	id: id(),
	/** Set only for a materialised occurrence of a plan_series; null for a standalone item. */
	seriesId: text('series_id').references(() => planSeries.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	date: text('date').notNull(), // YYYY-MM-DD
	endDate: text('end_date'), // YYYY-MM-DD inclusive; null = single-day (same as date)
	time: text('time'), // HH:MM; null = all-day
	/** @deprecated superseded by planItemMembers (multi-member support); kept for the historical column. */
	memberId: text('member_id').references(() => members.id, { onDelete: 'set null' }),
	category: text('category'),
	done: integer('done', { mode: 'boolean' }).notNull().default(false),
	notes: text('notes'),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: integer('created_at').notNull().default(now)
});

/** Which members a notation applies to — zero, one, or several. */
export const planItemMembers = sqliteTable(
	'plan_item_members',
	{
		planItemId: text('plan_item_id')
			.notNull()
			.references(() => planItems.id, { onDelete: 'cascade' }),
		memberId: text('member_id')
			.notNull()
			.references(() => members.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.planItemId, t.memberId] }), index('plan_item_members_member_idx').on(t.memberId)]
);

/**
 * A reward a child can redeem their points balance for, e.g. "Kinokveld — 50p".
 * `weight` sets its relative odds of being drawn by the rewards bandit — equal by
 * default — same convention as consequences.weight.
 */
export const rewards = sqliteTable('rewards', {
	id: id(),
	title: text('title').notNull(),
	pointsCost: integer('points_cost').notNull(),
	emoji: text('emoji').notNull().default('🎁'),
	weight: integer('weight').notNull().default(1),
	/** How long a redemption of this reward stays in effect before it times out.
	 * Both null = no timer (the historical default — an instant, one-off reward). */
	durationValue: integer('duration_value'),
	durationUnit: text('duration_unit'), // days | weeks | months | null
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at').notNull().default(now)
});

/**
 * A logged redemption. Title/cost are snapshotted at redemption time so editing or
 * deleting a reward later doesn't rewrite history or the member's spent total.
 * `expiresAt` is likewise computed from the reward's duration at redemption time, so
 * a later edit to that duration doesn't retroactively change an already-redeemed one.
 */
export const rewardRedemptions = sqliteTable('reward_redemptions', {
	id: id(),
	rewardId: text('reward_id').references(() => rewards.id, { onDelete: 'set null' }),
	memberId: text('member_id')
		.notNull()
		.references(() => members.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	pointsCost: integer('points_cost').notNull(),
	note: text('note'),
	expiresAt: integer('expires_at'),
	redeemedByAdminId: text('redeemed_by_admin_id').references(() => admins.id, { onDelete: 'set null' }),
	redeemedAt: integer('redeemed_at').notNull().default(now)
});

/**
 * A standing offer of extra points: "wash the car, +15p". Unlike a chore it has no
 * schedule and nobody it's assigned to — it sits in a browsable card deck on /rewards
 * until someone claims it, and it can be claimed again and again.
 * `imagePath` is a thumbnail under DATA_DIR/uploads/bonus/, downscaled in the browser
 * before upload exactly like an avatar (there's no image library on the server).
 */
export const bonusTasks = sqliteTable('bonus_tasks', {
	id: id(),
	title: text('title').notNull(),
	notes: text('notes'),
	points: integer('points').notNull().default(5),
	emoji: text('emoji').notNull().default('⭐'),
	imagePath: text('image_path'), // relative path under DATA_DIR/uploads
	/** How the thumbnail is framed inside the card's fixed 4:3 window. A photo shot
	 * for something else never crops well by luck, so the framing is stored per card
	 * rather than guessed: `imageFit` picks fill-the-frame vs show-the-whole-picture,
	 * `imageX`/`imageY` are the focal point in per cent (what stays visible when the
	 * frame crops), and `imageZoom` is a per-cent scale on top. Defaults reproduce
	 * plain `object-fit: cover` centred. */
	imageFit: text('image_fit').notNull().default('cover'), // cover | contain
	imageX: integer('image_x').notNull().default(50),
	imageY: integer('image_y').notNull().default(50),
	imageZoom: integer('image_zoom').notNull().default(100),
	sortOrder: integer('sort_order').notNull().default(0),
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at').notNull().default(now)
});

/**
 * A claimed bonus task — the *earning* twin of rewardRedemptions. Title/emoji/points
 * are snapshotted at claim time so editing or deleting the task later doesn't rewrite
 * history or a child's balance. Deleting the row is the admin "undo", which hands the
 * points straight back (see getPointsSummary — it sums these rows, nothing else).
 * `claimedOn` is the YYYY-MM-DD the claim counts *for*, so the day/week/month/year
 * buckets are computed from date strings exactly like chore_instances.due_date.
 */
export const bonusClaims = sqliteTable(
	'bonus_claims',
	{
		id: id(),
		bonusTaskId: text('bonus_task_id').references(() => bonusTasks.id, { onDelete: 'set null' }),
		memberId: text('member_id')
			.notNull()
			.references(() => members.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		emoji: text('emoji').notNull().default('⭐'),
		points: integer('points').notNull(),
		note: text('note'),
		claimedOn: text('claimed_on').notNull(), // YYYY-MM-DD
		claimedAt: integer('claimed_at').notNull().default(now)
	},
	(t) => [index('bonus_claims_member_idx').on(t.memberId)]
);

/**
 * A possible consequence for breaking a screen-time rule, drawn at random via the
 * "one-armed bandit" randomizer on /rewards (e.g. "no dessert", "15 min extra
 * chores"). `weight` sets its relative odds of being drawn — equal by default.
 */
export const consequences = sqliteTable('consequences', {
	id: id(),
	title: text('title').notNull(),
	emoji: text('emoji').notNull().default('⚡'),
	weight: integer('weight').notNull().default(1),
	/** How long a dealt consequence stays in effect before it times out. Both null =
	 * no timer (the historical default — an instant, one-off consequence). */
	durationValue: integer('duration_value'),
	durationUnit: text('duration_unit'), // days | weeks | months | null
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at').notNull().default(now)
});

/**
 * A logged draw. Title/emoji are snapshotted at draw time so editing or deleting a
 * consequence later doesn't rewrite history, same as reward_redemptions. `expiresAt`
 * is likewise computed from the consequence's duration at draw time.
 */
export const consequenceDraws = sqliteTable(
	'consequence_draws',
	{
		id: id(),
		consequenceId: text('consequence_id').references(() => consequences.id, { onDelete: 'set null' }),
		memberId: text('member_id')
			.notNull()
			.references(() => members.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		emoji: text('emoji').notNull().default('⚡'),
		note: text('note'),
		expiresAt: integer('expires_at'),
		dealtByAdminId: text('dealt_by_admin_id').references(() => admins.id, { onDelete: 'set null' }),
		dealtAt: integer('dealt_at').notNull().default(now)
	},
	(t) => [index('consequence_draws_member_idx').on(t.memberId)]
);

/** Household-defined free-form tag vocabulary, usable on chores and plan items. */
export const tags = sqliteTable('tags', {
	id: id(),
	label: text('label').notNull(),
	color: text('color').notNull().default('#6b7280'),
	createdAt: integer('created_at').notNull().default(now)
});

/** Generic many-to-many tagging: which tags are attached to which entity. */
export const entityTags = sqliteTable(
	'entity_tags',
	{
		tagId: text('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' }),
		entityType: text('entity_type').notNull(), // 'chore' | 'plan_item'
		entityId: text('entity_id').notNull()
	},
	(t) => [
		primaryKey({ columns: [t.entityType, t.entityId, t.tagId] }),
		index('entity_tags_tag_idx').on(t.tagId)
	]
);

/** Generic key/value store for cached weather, cron bookkeeping, misc runtime state. */
export const appSettings = sqliteTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value', { mode: 'json' }),
	updatedAt: integer('updated_at').notNull().default(now)
});

/** Simple fixed-window rate limit buckets (admin login etc.). */
export const rateLimits = sqliteTable(
	'rate_limits',
	{
		bucket: text('bucket').notNull(),
		windowStart: integer('window_start').notNull(),
		count: integer('count').notNull().default(0)
	},
	(t) => [primaryKey({ columns: [t.bucket, t.windowStart] })]
);

export type Member = typeof members.$inferSelect;
export type Admin = typeof admins.$inferSelect;
export type Chore = typeof chores.$inferSelect;
export type ChoreInstance = typeof choreInstances.$inferSelect;
export type PlanItem = typeof planItems.$inferSelect;
export type PlanSeries = typeof planSeries.$inferSelect;
export type CalendarConnection = typeof calendarConnections.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type SchoolDocument = typeof schoolDocuments.$inferSelect;
export type DocumentGroup = typeof documentGroups.$inferSelect;
export type ShoppingList = typeof shoppingLists.$inferSelect;
export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type ShoppingProduct = typeof shoppingProducts.$inferSelect;
export type Household = typeof household.$inferSelect;
export type Reward = typeof rewards.$inferSelect;
export type RewardRedemption = typeof rewardRedemptions.$inferSelect;
export type BonusTask = typeof bonusTasks.$inferSelect;
export type BonusClaim = typeof bonusClaims.$inferSelect;
export type Consequence = typeof consequences.$inferSelect;
export type ConsequenceDraw = typeof consequenceDraws.$inferSelect;
export type Tag = typeof tags.$inferSelect;
