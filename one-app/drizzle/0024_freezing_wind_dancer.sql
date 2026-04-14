ALTER TABLE `learning_events` ADD `actionSignature` varchar(128);--> statement-breakpoint
ALTER TABLE `learning_events` ADD `riskScore` int DEFAULT 50;--> statement-breakpoint
ALTER TABLE `learning_events` ADD `decision` enum('APPROVED','REJECTED','BLOCKED');