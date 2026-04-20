CREATE TABLE `email_firewall_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`strictness` enum('strict','standard','permissive') NOT NULL DEFAULT 'standard',
	`preset` varchar(32) NOT NULL DEFAULT 'personal',
	`ruleOverrides` json NOT NULL,
	`categoryOverrides` json NOT NULL,
	`internalDomains` json NOT NULL,
	`llmEnabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_firewall_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_firewall_config_userId_unique` UNIQUE(`userId`)
);
