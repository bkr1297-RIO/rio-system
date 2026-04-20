CREATE TABLE `system_components` (
	`id` int AUTO_INCREMENT NOT NULL,
	`componentId` varchar(16) NOT NULL,
	`name` varchar(128) NOT NULL,
	`role` text NOT NULL,
	`status` enum('LIVE','PLANNED','LEGACY','DISABLED') NOT NULL,
	`implementation` text,
	`url` varchar(512),
	`githubRepo` varchar(256),
	`connections` json NOT NULL,
	`metadata` json,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_components_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_components_componentId_unique` UNIQUE(`componentId`)
);
