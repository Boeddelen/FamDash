CREATE TABLE `plan_series` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text,
	`notes` text,
	`time` text,
	`duration_days` integer DEFAULT 1 NOT NULL,
	`recurrence` text DEFAULT 'daily' NOT NULL,
	`weekday_mask` integer DEFAULT 0 NOT NULL,
	`start_date` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_series_members` (
	`series_id` text NOT NULL,
	`member_id` text NOT NULL,
	PRIMARY KEY(`series_id`, `member_id`),
	FOREIGN KEY (`series_id`) REFERENCES `plan_series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plan_item_members` (
	`plan_item_id` text NOT NULL,
	`member_id` text NOT NULL,
	PRIMARY KEY(`plan_item_id`, `member_id`),
	FOREIGN KEY (`plan_item_id`) REFERENCES `plan_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_item_members_member_idx` ON `plan_item_members` (`member_id`);
--> statement-breakpoint
ALTER TABLE `plan_items` ADD `series_id` text REFERENCES plan_series(id) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `plan_items` ADD `end_date` text;
--> statement-breakpoint
ALTER TABLE `plan_items` ADD `time` text;
--> statement-breakpoint
INSERT INTO `plan_item_members` (`plan_item_id`, `member_id`)
	SELECT `id`, `member_id` FROM `plan_items` WHERE `member_id` IS NOT NULL;
