ALTER TABLE `shopping_products` ADD `unit` text DEFAULT 'stk' NOT NULL;--> statement-breakpoint
ALTER TABLE `shopping_products` ADD `unit_label` text;--> statement-breakpoint
ALTER TABLE `shopping_products` ADD `price_ore` integer;--> statement-breakpoint
ALTER TABLE `shopping_items` ADD `amount` real;--> statement-breakpoint
ALTER TABLE `shopping_items` ADD `unit` text DEFAULT 'stk' NOT NULL;--> statement-breakpoint
ALTER TABLE `shopping_items` ADD `unit_label` text;--> statement-breakpoint
UPDATE `shopping_items` SET `amount` = CAST(replace(trim(`quantity`), ',', '.') AS REAL)
WHERE `quantity` IS NOT NULL
  AND trim(`quantity`) <> ''
  AND CAST(replace(trim(`quantity`), ',', '.') AS REAL) > 0;
