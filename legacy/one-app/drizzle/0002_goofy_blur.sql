CREATE TABLE `key_backups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`encryptedKey` text NOT NULL,
	`iv` varchar(64) NOT NULL,
	`salt` varchar(64) NOT NULL,
	`publicKeyFingerprint` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `key_backups_id` PRIMARY KEY(`id`)
);
