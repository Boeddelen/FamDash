ALTER TABLE `bonus_tasks` ADD `image_fit` text DEFAULT 'cover' NOT NULL;--> statement-breakpoint
ALTER TABLE `bonus_tasks` ADD `image_x` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `bonus_tasks` ADD `image_y` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `bonus_tasks` ADD `image_zoom` integer DEFAULT 100 NOT NULL;
