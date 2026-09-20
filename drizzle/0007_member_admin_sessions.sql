--> Admin elevations can now be backed by an adult family member (who unlocked with
--> their own PIN) instead of an admin account, so admin_id becomes nullable and a
--> member_id is added. The table only ever holds sessions that expire after a few
--> minutes of inactivity, so it's recreated rather than rebuilt in place — the only
--> effect is that anyone currently elevated signs in again.
DROP TABLE `admin_sessions`;
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text,
	`member_id` text,
	`last_activity_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
