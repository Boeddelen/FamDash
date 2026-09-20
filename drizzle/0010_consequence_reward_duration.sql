ALTER TABLE `consequences` ADD `duration_value` integer;
--> statement-breakpoint
ALTER TABLE `consequences` ADD `duration_unit` text;
--> statement-breakpoint
ALTER TABLE `consequence_draws` ADD `expires_at` integer;
--> statement-breakpoint
ALTER TABLE `rewards` ADD `duration_value` integer;
--> statement-breakpoint
ALTER TABLE `rewards` ADD `duration_unit` text;
--> statement-breakpoint
ALTER TABLE `reward_redemptions` ADD `expires_at` integer;
