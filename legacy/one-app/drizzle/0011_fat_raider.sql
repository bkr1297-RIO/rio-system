CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notificationId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`type` enum('APPROVAL_NEEDED','EXECUTION_COMPLETE','EXECUTION_FAILED','KILL_SWITCH','POLICY_UPDATE','SYSTEM') NOT NULL,
	`title` varchar(256) NOT NULL,
	`body` text NOT NULL,
	`intentId` varchar(64),
	`executionId` varchar(64),
	`read` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `notifications_notificationId_unique` UNIQUE(`notificationId`)
);
--> statement-breakpoint
CREATE TABLE `policy_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ruleId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(256) NOT NULL,
	`description` text,
	`toolPattern` varchar(128) NOT NULL,
	`riskOverride` enum('LOW','MEDIUM','HIGH'),
	`requiresApproval` boolean NOT NULL DEFAULT true,
	`condition` json,
	`enabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `policy_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `policy_rules_ruleId_unique` UNIQUE(`ruleId`)
);
