CREATE TABLE `sentinel_thresholds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`metric_type` varchar(64) NOT NULL,
	`info_threshold` decimal(10,6) NOT NULL,
	`warn_threshold` decimal(10,6) NOT NULL,
	`critical_threshold` decimal(10,6) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`approval_trace_id` varchar(128),
	`last_modified_by` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sentinel_thresholds_id` PRIMARY KEY(`id`)
);
