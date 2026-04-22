-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT,
    "eventType" TEXT NOT NULL DEFAULT 'war',
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "classIconSource" TEXT NOT NULL DEFAULT 'bot',
    "participantDisplayStyle" TEXT NOT NULL DEFAULT 'modern',
    "creatorId" TEXT,
    "guildId" TEXT,
    "channelId" TEXT,
    "messageId" TEXT,
    "dayOfWeek" INTEGER,
    "time" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "duration" INTEGER NOT NULL DEFAULT 70,
    "closeBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "closesAt" DATETIME NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Event_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventRoleSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "max" INTEGER NOT NULL,
    "emoji" TEXT,
    "emojiSource" TEXT,
    CONSTRAINT "EventRoleSlot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleSlotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isFake" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventParticipant_roleSlotId_fkey" FOREIGN KEY ("roleSlotId") REFERENCES "EventRoleSlot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventRolePermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleSlotId" TEXT NOT NULL,
    "discordRoleId" TEXT,
    "discordRoleName" TEXT,
    CONSTRAINT "EventRolePermission_roleSlotId_fkey" FOREIGN KEY ("roleSlotId") REFERENCES "EventRoleSlot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventWaitlistEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "roleName" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isFake" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "EventWaitlistEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventNotifyTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "EventNotifyTarget_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventSchedule" (
    "eventId" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'recurring',
    "lastCreatedAt" DATETIME,
    "lastMessageIdDeleted" DATETIME,
    CONSTRAINT "EventSchedule_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventRecapConfig" (
    "eventId" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "minutesBeforeExpire" INTEGER NOT NULL DEFAULT 0,
    "messageText" TEXT NOT NULL DEFAULT '',
    "threadId" TEXT,
    "lastPostedAt" DATETIME,
    CONSTRAINT "EventRecapConfig_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GarmothProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discordUserId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "garmothProfileUrl" TEXT NOT NULL,
    "linkedAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "characterName" TEXT,
    "classId" INTEGER,
    "className" TEXT,
    "specRaw" TEXT,
    "spec" TEXT,
    "gearScore" INTEGER,
    "lastSyncAt" DATETIME,
    "syncStatus" TEXT NOT NULL DEFAULT 'not_synced',
    "syncErrorMessage" TEXT,
    CONSTRAINT "GarmothProfile_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Event_channelId_idx" ON "Event"("channelId");

-- CreateIndex
CREATE INDEX "Event_messageId_idx" ON "Event"("messageId");

-- CreateIndex
CREATE INDEX "Event_groupId_idx" ON "Event"("groupId");

-- CreateIndex
CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt");

-- CreateIndex
CREATE INDEX "EventRoleSlot_eventId_position_idx" ON "EventRoleSlot"("eventId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "EventRoleSlot_eventId_name_key" ON "EventRoleSlot"("eventId", "name");

-- CreateIndex
CREATE INDEX "EventParticipant_userId_idx" ON "EventParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipant_roleSlotId_userId_key" ON "EventParticipant"("roleSlotId", "userId");

-- CreateIndex
CREATE INDEX "EventRolePermission_roleSlotId_idx" ON "EventRolePermission"("roleSlotId");

-- CreateIndex
CREATE INDEX "EventWaitlistEntry_eventId_position_idx" ON "EventWaitlistEntry"("eventId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "EventWaitlistEntry_eventId_userId_key" ON "EventWaitlistEntry"("eventId", "userId");

-- CreateIndex
CREATE INDEX "EventNotifyTarget_eventId_position_idx" ON "EventNotifyTarget"("eventId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "EventNotifyTarget_eventId_targetId_key" ON "EventNotifyTarget"("eventId", "targetId");

-- CreateIndex
CREATE INDEX "GarmothProfile_discordUserId_idx" ON "GarmothProfile"("discordUserId");

-- CreateIndex
CREATE INDEX "GarmothProfile_guildId_idx" ON "GarmothProfile"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "GarmothProfile_guildId_discordUserId_key" ON "GarmothProfile"("guildId", "discordUserId");
