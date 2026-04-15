CREATE TABLE `proposal_packets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposalId` varchar(64) NOT NULL,
	`type` enum('outreach','task','analysis','financial','follow_up') NOT NULL,
	`category` varchar(128) NOT NULL,
	`riskTier` enum('LOW','MEDIUM','HIGH') NOT NULL,
	`riskFactors` json NOT NULL,
	`baselinePattern` json,
	`proposal` json NOT NULL,
	`whyItMatters` text NOT NULL,
	`reasoning` text NOT NULL,
	`status` enum('proposed','approved','rejected','executed','failed','expired') NOT NULL DEFAULT 'proposed',
	`notionPageId` varchar(64),
	`receiptId` varchar(64),
	`intentId` varchar(64),
	`aftermath` json,
	`createdBy` varchar(64) NOT NULL DEFAULT 'system',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `proposal_packets_id` PRIMARY KEY(`id`),
	CONSTRAINT `proposal_packets_proposalId_unique` UNIQUE(`proposalId`)
);
--> statement-breakpoint
CREATE TABLE `sentinel_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` varchar(64) NOT NULL,
	`type` enum('contrast','invariant_violation','trace_break','anomaly','system_correction') NOT NULL,
	`severity` enum('INFO','WARN','CRITICAL') NOT NULL,
	`subject` varchar(256) NOT NULL,
	`baseline` json,
	`observed` json,
	`delta` json,
	`context` json,
	`proposalId` varchar(64),
	`acknowledged` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sentinel_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `sentinel_events_eventId_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `trust_policies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policyId` varchar(64) NOT NULL,
	`category` varchar(128) NOT NULL,
	`riskTier` enum('LOW','MEDIUM','HIGH') NOT NULL,
	`trustLevel` int NOT NULL DEFAULT 0,
	`conditions` json,
	`active` boolean NOT NULL DEFAULT true,
	`governanceReceiptId` varchar(64),
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trust_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `trust_policies_policyId_unique` UNIQUE(`policyId`)
);
