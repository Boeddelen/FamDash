ALTER TABLE `household` ADD `reward_note` text;
--> statement-breakpoint
ALTER TABLE `chores` ADD `category` text;
--> statement-breakpoint
ALTER TABLE `chores` ADD `checklist` text;
--> statement-breakpoint
ALTER TABLE `chore_instances` ADD `checklist_done` text;
