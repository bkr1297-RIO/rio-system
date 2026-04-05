CREATE TABLE `principals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`principalId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`displayName` varchar(256),
	`principalType` enum('human','agent','service') NOT NULL DEFAULT 'human',
	`roles` json NOT NULL,
	`status` enum('active','suspended','revoked') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `principals_id` PRIMARY KEY(`id`),
	CONSTRAINT `principals_principalId_unique` UNIQUE(`principalId`),
	CONSTRAINT `principals_userId_unique` UNIQUE(`userId`)
);
