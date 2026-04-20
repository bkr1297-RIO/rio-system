CREATE TABLE `pending_email_approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`intentId` varchar(128) NOT NULL,
	`actionType` varchar(128) NOT NULL,
	`actionSummary` text NOT NULL,
	`actionDetails` json,
	`proposerEmail` varchar(320) NOT NULL,
	`approverEmail` varchar(320) NOT NULL,
	`tokenNonce` varchar(128) NOT NULL,
	`status` enum('PENDING','APPROVED','DECLINED','EXPIRED') NOT NULL DEFAULT 'PENDING',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `pending_email_approvals_id` PRIMARY KEY(`id`),
	CONSTRAINT `pending_email_approvals_intentId_unique` UNIQUE(`intentId`),
	CONSTRAINT `pending_email_approvals_tokenNonce_unique` UNIQUE(`tokenNonce`)
);
