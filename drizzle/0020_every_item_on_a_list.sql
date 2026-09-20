INSERT INTO `shopping_categories` (`id`, `name`, `emoji`, `sort_order`, `created_at`)
SELECT lower(hex(randomblob(4))) || '-0000-4000-8000-' || lower(hex(randomblob(6))),
       'Handleliste', '🛒', -1, unixepoch()
WHERE EXISTS (SELECT 1 FROM `shopping_items` WHERE `category_id` IS NULL);
--> statement-breakpoint
UPDATE `shopping_items`
SET `category_id` = (SELECT `id` FROM `shopping_categories` WHERE `sort_order` = -1 LIMIT 1)
WHERE `category_id` IS NULL;
--> statement-breakpoint
UPDATE `shopping_categories` SET `sort_order` = 0 WHERE `sort_order` = -1;
