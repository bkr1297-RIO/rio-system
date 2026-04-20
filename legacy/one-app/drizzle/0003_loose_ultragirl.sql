CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(256),
	`nodeId` varchar(64) NOT NULL DEFAULT 'gemini',
	`mode` enum('REFLECT','COMPUTE','DRAFT','VERIFY','EXECUTE') NOT NULL DEFAULT 'REFLECT',
	`messages` json NOT NULL,
	`intentIds` json,
	`status` enum('ACTIVE','CLOSED','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`),
	CONSTRAINT `conversations_conversationId_unique` UNIQUE(`conversationId`)
);
--> statement-breakpoint
CREATE TABLE `learning_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`eventType` enum('APPROVAL','REJECTION','EXECUTION','FEEDBACK','CORRECTION') NOT NULL,
	`intentId` varchar(64),
	`conversationId` varchar(64),
	`context` json,
	`feedback` text,
	`outcome` enum('POSITIVE','NEGATIVE','NEUTRAL') NOT NULL DEFAULT 'NEUTRAL',
	`tags` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `learning_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `learning_events_eventId_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `node_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nodeId` varchar(64) NOT NULL,
	`displayName` varchar(128) NOT NULL,
	`provider` enum('ANTHROPIC','OPENAI','GEMINI','MANUS_FORGE') NOT NULL,
	`modelName` varchar(128) NOT NULL,
	`capabilities` json NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`priority` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `node_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `node_configs_nodeId_unique` UNIQUE(`nodeId`)
);
--> statement-breakpoint
ALTER TABLE `ledger` MODIFY COLUMN `entryType` enum('ONBOARD','INTENT','APPROVAL','EXECUTION','KILL','SYNC','JORDAN_CHAT','LEARNING') NOT NULL;--> statement-breakpoint
ALTER TABLE `intents` ADD `sourceConversationId` varchar(64);