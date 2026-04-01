ALTER TABLE `ledger` ADD `receipt_hash` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `ledger` ADD `ledger_signature` text;--> statement-breakpoint
ALTER TABLE `ledger` ADD `protocol_version` varchar(8) DEFAULT 'v2';--> statement-breakpoint
ALTER TABLE `receipts` ADD `intent_hash` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `receipts` ADD `action_hash` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `receipts` ADD `verification_status` varchar(32) DEFAULT 'skipped';--> statement-breakpoint
ALTER TABLE `receipts` ADD `verification_hash` varchar(128) DEFAULT '';--> statement-breakpoint
ALTER TABLE `receipts` ADD `risk_score` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `receipts` ADD `risk_level` varchar(32) DEFAULT '';--> statement-breakpoint
ALTER TABLE `receipts` ADD `policy_rule_id` varchar(64) DEFAULT '';--> statement-breakpoint
ALTER TABLE `receipts` ADD `policy_decision` varchar(32) DEFAULT '';--> statement-breakpoint
ALTER TABLE `receipts` ADD `protocol_version` varchar(8) DEFAULT 'v2';