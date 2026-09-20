CREATE TABLE `shopping_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`emoji` text DEFAULT '🛒' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shopping_items` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text REFERENCES `shopping_categories`(`id`) ON DELETE SET NULL,
	`title` text NOT NULL,
	`quantity` text,
	`note` text,
	`done` integer DEFAULT false NOT NULL,
	`image_path` text,
	`image_fit` text DEFAULT 'cover' NOT NULL,
	`image_x` integer DEFAULT 50 NOT NULL,
	`image_y` integer DEFAULT 50 NOT NULL,
	`image_zoom` integer DEFAULT 100 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
