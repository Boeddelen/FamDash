CREATE TABLE `document_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `school_documents` ADD `group_id` text REFERENCES `document_groups`(`id`) ON DELETE SET NULL;
