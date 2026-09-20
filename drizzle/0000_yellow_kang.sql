CREATE TABLE `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`last_activity_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `admins` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admins_email_unique` ON `admins` (`email`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendar_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`color` text DEFAULT '#0ea5e9' NOT NULL,
	`enc_credentials` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`writable` integer DEFAULT false NOT NULL,
	`last_sync_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`uid` text NOT NULL,
	`title` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`location` text,
	`description` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `calendar_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_events_conn_uid_start` ON `calendar_events` (`connection_id`,`uid`,`start`);--> statement-breakpoint
CREATE TABLE `chore_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`chore_id` text NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`completed_by_member_id` text,
	`completed_at` integer,
	FOREIGN KEY (`chore_id`) REFERENCES `chores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_instances_chore_due` ON `chore_instances` (`chore_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `chores` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`assigned_member_id` text,
	`recurrence` text DEFAULT 'none' NOT NULL,
	`weekday_mask` integer DEFAULT 0 NOT NULL,
	`start_date` text,
	`points` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`assigned_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `household` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`name` text DEFAULT 'Our Family' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`weather_lat` real,
	`weather_lon` real,
	`weather_label` text,
	`theme` text DEFAULT 'auto' NOT NULL,
	`feed_token` text,
	`setup_complete` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'child' NOT NULL,
	`color` text DEFAULT '#4f46e5' NOT NULL,
	`emoji` text DEFAULT '🙂' NOT NULL,
	`pin_hash` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_items` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`member_id` text,
	`category` text,
	`done` integer DEFAULT false NOT NULL,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`bucket` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`bucket`, `window_start`)
);
--> statement-breakpoint
CREATE TABLE `school_events` (
	`id` text PRIMARY KEY NOT NULL,
	`import_id` text NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`end_date` text,
	`start_time` text,
	`end_time` text,
	`notes` text,
	`source_line` text,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`target_connection_id` text,
	`external_uid` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `school_imports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_connection_id`) REFERENCES `calendar_connections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `school_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`content_hash` text NOT NULL,
	`page_count` integer DEFAULT 0 NOT NULL,
	`raw_text` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'parsed' NOT NULL,
	`uploaded_at` integer DEFAULT (unixepoch()) NOT NULL
);
