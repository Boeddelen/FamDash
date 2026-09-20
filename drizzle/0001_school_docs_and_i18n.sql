ALTER TABLE `household` ADD `locale` text DEFAULT 'nb' NOT NULL;
--> statement-breakpoint
ALTER TABLE `members` ADD `avatar_path` text;
--> statement-breakpoint
DROP TABLE IF EXISTS `school_events`;
--> statement-breakpoint
DROP TABLE IF EXISTS `school_imports`;
--> statement-breakpoint
CREATE TABLE `school_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`filename` text NOT NULL,
	`stored_path` text NOT NULL,
	`mime_type` text DEFAULT 'application/pdf' NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`content_hash` text NOT NULL,
	`uploaded_by_admin_id` text,
	`uploaded_at` integer DEFAULT (unixepoch()) NOT NULL
);
