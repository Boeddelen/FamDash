CREATE TABLE `consequences` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`emoji` text DEFAULT '⚡' NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `consequence_draws` (
	`id` text PRIMARY KEY NOT NULL,
	`consequence_id` text,
	`member_id` text NOT NULL,
	`title` text NOT NULL,
	`emoji` text DEFAULT '⚡' NOT NULL,
	`note` text,
	`dealt_by_admin_id` text,
	`dealt_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`consequence_id`) REFERENCES `consequences`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dealt_by_admin_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `consequence_draws_member_idx` ON `consequence_draws` (`member_id`);
