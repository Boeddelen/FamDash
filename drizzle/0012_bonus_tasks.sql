CREATE TABLE `bonus_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`points` integer DEFAULT 5 NOT NULL,
	`emoji` text DEFAULT '⭐' NOT NULL,
	`image_path` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bonus_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`bonus_task_id` text,
	`member_id` text NOT NULL,
	`title` text NOT NULL,
	`emoji` text DEFAULT '⭐' NOT NULL,
	`points` integer NOT NULL,
	`note` text,
	`claimed_on` text NOT NULL,
	`claimed_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bonus_task_id`) REFERENCES `bonus_tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bonus_claims_member_idx` ON `bonus_claims` (`member_id`);
