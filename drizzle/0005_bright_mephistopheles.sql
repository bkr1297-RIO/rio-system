CREATE TABLE `user_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(64) NOT NULL,
	`provider_account_id` varchar(256),
	`provider_account_name` varchar(256),
	`access_token` text,
	`refresh_token` text,
	`token_expires_at` timestamp,
	`scopes` text,
	`status` enum('connected','expired','revoked','error') NOT NULL DEFAULT 'connected',
	`connected_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_connections_id` PRIMARY KEY(`id`)
);
