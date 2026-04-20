CREATE TABLE `key_backups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`signerId` varchar(128) NOT NULL,
	`publicKey` text NOT NULL,
	`encryptedKey` text NOT NULL,
	`salt` text NOT NULL,
	`iv` text NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `key_backups_id` PRIMARY KEY(`id`)
);
