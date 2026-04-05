CREATE TABLE `approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`approvalId` varchar(64) NOT NULL,
	`intentId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`decision` enum('APPROVED','REJECTED') NOT NULL,
	`signature` text NOT NULL,
	`boundToolName` varchar(128) NOT NULL,
	`boundArgsHash` varchar(128) NOT NULL,
	`expiresAt` bigint NOT NULL,
	`maxExecutions` int NOT NULL DEFAULT 1,
	`executionCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `approvals_id` PRIMARY KEY(`id`),
	CONSTRAINT `approvals_approvalId_unique` UNIQUE(`approvalId`)
);
--> statement-breakpoint
CREATE TABLE `executions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`executionId` varchar(64) NOT NULL,
	`intentId` varchar(64) NOT NULL,
	`approvalId` varchar(64),
	`result` json,
	`receiptHash` varchar(128),
	`preflightResults` json,
	`executedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `executions_id` PRIMARY KEY(`id`),
	CONSTRAINT `executions_executionId_unique` UNIQUE(`executionId`)
);
--> statement-breakpoint
CREATE TABLE `intents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`intentId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`toolName` varchar(128) NOT NULL,
	`toolArgs` json NOT NULL,
	`argsHash` varchar(128) NOT NULL,
	`riskTier` enum('LOW','MEDIUM','HIGH') NOT NULL,
	`blastRadius` json,
	`status` enum('PENDING_APPROVAL','APPROVED','REJECTED','EXECUTED','FAILED','KILLED') NOT NULL DEFAULT 'PENDING_APPROVAL',
	`reflection` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `intents_id` PRIMARY KEY(`id`),
	CONSTRAINT `intents_intentId_unique` UNIQUE(`intentId`)
);
--> statement-breakpoint
CREATE TABLE `ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entryId` varchar(64) NOT NULL,
	`entryType` enum('ONBOARD','INTENT','APPROVAL','EXECUTION','KILL','SYNC') NOT NULL,
	`payload` json NOT NULL,
	`hash` varchar(128) NOT NULL,
	`prevHash` varchar(128) NOT NULL,
	`timestamp` bigint NOT NULL,
	CONSTRAINT `ledger_id` PRIMARY KEY(`id`),
	CONSTRAINT `ledger_entryId_unique` UNIQUE(`entryId`)
);
--> statement-breakpoint
CREATE TABLE `proxy_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`publicKey` text NOT NULL,
	`policyHash` varchar(128) NOT NULL,
	`seedVersion` varchar(32) NOT NULL DEFAULT 'SEED-v1.0.0',
	`status` enum('ACTIVE','KILLED','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
	`killReason` text,
	`killedAt` timestamp,
	`onboardedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `proxy_users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tool_registry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`toolName` varchar(128) NOT NULL,
	`description` text NOT NULL,
	`riskTier` enum('LOW','MEDIUM','HIGH') NOT NULL,
	`requiredParams` json NOT NULL,
	`blastRadiusBase` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tool_registry_id` PRIMARY KEY(`id`),
	CONSTRAINT `tool_registry_toolName_unique` UNIQUE(`toolName`)
);
