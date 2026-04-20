CREATE TABLE `approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`intentId` varchar(64) NOT NULL,
	`decision` enum('approved','denied') NOT NULL,
	`decidedBy` varchar(128) NOT NULL,
	`signature` text NOT NULL,
	`publicKey` text NOT NULL,
	`decidedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `executions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`intentId` varchar(64) NOT NULL,
	`status` enum('success','blocked') NOT NULL,
	`detail` text,
	`executedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `executions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `intents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`intentId` varchar(64) NOT NULL,
	`action` varchar(128) NOT NULL,
	`description` text,
	`requestedBy` varchar(128) NOT NULL,
	`intentHash` varchar(128) NOT NULL,
	`status` enum('pending','approved','denied','executed','blocked') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `intents_id` PRIMARY KEY(`id`),
	CONSTRAINT `intents_intentId_unique` UNIQUE(`intentId`)
);
--> statement-breakpoint
CREATE TABLE `ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blockId` varchar(64) NOT NULL,
	`intentId` varchar(64) NOT NULL,
	`action` varchar(128) NOT NULL,
	`decision` varchar(32) NOT NULL,
	`previousHash` varchar(128),
	`currentHash` varchar(128) NOT NULL,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`recordedBy` varchar(128) NOT NULL DEFAULT 'RIO System',
	CONSTRAINT `ledger_id` PRIMARY KEY(`id`),
	CONSTRAINT `ledger_blockId_unique` UNIQUE(`blockId`)
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receiptId` varchar(64) NOT NULL,
	`intentId` varchar(64) NOT NULL,
	`action` varchar(128) NOT NULL,
	`requestedBy` varchar(128) NOT NULL,
	`approvedBy` varchar(128),
	`decision` varchar(32) NOT NULL,
	`timestampRequest` timestamp NOT NULL,
	`timestampApproval` timestamp,
	`timestampExecution` timestamp,
	`signature` text,
	`receiptHash` varchar(128) NOT NULL,
	`previousHash` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `receipts_receiptId_unique` UNIQUE(`receiptId`)
);
