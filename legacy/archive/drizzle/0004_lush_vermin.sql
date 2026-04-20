CREATE TABLE `policies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policyId` varchar(64) NOT NULL,
	`action` varchar(128) NOT NULL,
	`type` enum('auto_approve','auto_deny','reduce_pause','increase_scrutiny') NOT NULL,
	`risk_level` varchar(32),
	`confidence` int NOT NULL DEFAULT 0,
	`based_on_decisions` int NOT NULL DEFAULT 0,
	`approval_rate` int NOT NULL DEFAULT 0,
	`avg_decision_time_sec` int NOT NULL DEFAULT 0,
	`title` varchar(256) NOT NULL,
	`description` text,
	`status` enum('active','dismissed','expired') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `policies_policyId_unique` UNIQUE(`policyId`)
);
