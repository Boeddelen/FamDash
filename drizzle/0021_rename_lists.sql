ALTER TABLE `shopping_categories` RENAME TO `shopping_lists`;--> statement-breakpoint
ALTER TABLE `shopping_items` RENAME COLUMN `category_id` TO `list_id`;--> statement-breakpoint
ALTER TABLE `shopping_products` RENAME COLUMN `category_id` TO `list_id`;
