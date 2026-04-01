CREATE TABLE `demo_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` varchar(64) NOT NULL,
	`step` int NOT NULL,
	`step_label` varchar(32) NOT NULL,
	`action` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `demo_events_id` PRIMARY KEY(`id`)
);
