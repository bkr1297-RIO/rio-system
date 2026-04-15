CREATE TABLE `budget_pools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`poolId` varchar(64) NOT NULL,
	`name` varchar(256) NOT NULL,
	`balanceCents` int NOT NULL DEFAULT 0,
	`limitCents` int NOT NULL DEFAULT 0,
	`spendingRateCentsPerDay` int NOT NULL DEFAULT 0,
	`status` enum('active','frozen','depleted') NOT NULL DEFAULT 'active',
	`policyVersion` varchar(128),
	`governanceReceiptId` varchar(64),
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budget_pools_id` PRIMARY KEY(`id`),
	CONSTRAINT `budget_pools_poolId_unique` UNIQUE(`poolId`)
);
--> statement-breakpoint
CREATE TABLE `financial_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transactionId` varchar(64) NOT NULL,
	`budgetPoolId` varchar(64) NOT NULL,
	`proposalId` varchar(64),
	`type` enum('deposit','withdrawal','transfer','adjustment','limit_change') NOT NULL,
	`amountCents` int NOT NULL,
	`description` text NOT NULL,
	`receiptId` varchar(64),
	`initiatedBy` varchar(64) NOT NULL DEFAULT 'system',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `financial_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `financial_transactions_transactionId_unique` UNIQUE(`transactionId`)
);
--> statement-breakpoint
CREATE TABLE `handoff_packets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`handoffId` varchar(64) NOT NULL,
	`fromAgent` varchar(128) NOT NULL,
	`toAgent` varchar(128) NOT NULL,
	`workType` enum('proposal','financial','analysis','review','execution','research') NOT NULL,
	`payload` json NOT NULL,
	`instructions` text NOT NULL,
	`deadline` timestamp,
	`approvalRequired` boolean NOT NULL DEFAULT true,
	`status` enum('pending','accepted','in_progress','completed','rejected','expired') NOT NULL DEFAULT 'pending',
	`result` json,
	`receiptId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `handoff_packets_id` PRIMARY KEY(`id`),
	CONSTRAINT `handoff_packets_handoffId_unique` UNIQUE(`handoffId`)
);
