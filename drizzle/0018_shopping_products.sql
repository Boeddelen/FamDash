CREATE TABLE `shopping_products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category_id` text REFERENCES `shopping_categories`(`id`) ON DELETE SET NULL,
	`image_path` text,
	`image_fit` text DEFAULT 'contain' NOT NULL,
	`image_x` integer DEFAULT 50 NOT NULL,
	`image_y` integer DEFAULT 50 NOT NULL,
	`image_zoom` integer DEFAULT 100 NOT NULL,
	`times_used` integer DEFAULT 0 NOT NULL,
	`last_used_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shopping_products_name_unique` ON `shopping_products` (`name` COLLATE NOCASE);
--> statement-breakpoint
ALTER TABLE `shopping_items` ADD `product_id` text REFERENCES `shopping_products`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
INSERT INTO `shopping_products` (`id`, `name`, `category_id`, `image_path`, `image_fit`, `image_x`, `image_y`, `image_zoom`, `times_used`, `last_used_at`, `created_at`)
SELECT `id`, `title`, `category_id`, `image_path`, `image_fit`, `image_x`, `image_y`, `image_zoom`, 1, `created_at`, `created_at`
FROM `shopping_items`
WHERE `id` IN (SELECT MIN(`id`) FROM `shopping_items` GROUP BY lower(`title`));
--> statement-breakpoint
UPDATE `shopping_items` SET `product_id` = (
	SELECT p.`id` FROM `shopping_products` p WHERE lower(p.`name`) = lower(`shopping_items`.`title`)
);
