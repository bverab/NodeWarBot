-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT,
    "eventType" TEXT NOT NULL DEFAULT 'war',
    "accessMode" TEXT NOT NULL DEFAULT 'OPEN',
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
    "autoPublishEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduledPublishAt" DATETIME,
    "publishError" TEXT,
    "lastPublishAttemptAt" DATETIME,
    "createdAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "closesAt" DATETIME NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Event_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("accessMode", "autoPublishEnabled", "channelId", "classIconSource", "closeBeforeMinutes", "closesAt", "createdAt", "creatorId", "dayOfWeek", "duration", "eventType", "expiresAt", "groupId", "guildId", "id", "isClosed", "lastPublishAttemptAt", "messageId", "name", "participantDisplayStyle", "publishError", "scheduledPublishAt", "time", "timezone", "type") SELECT "accessMode", "autoPublishEnabled", "channelId", "classIconSource", "closeBeforeMinutes", "closesAt", "createdAt", "creatorId", "dayOfWeek", "duration", "eventType", "expiresAt", "groupId", "guildId", "id", "isClosed", "lastPublishAttemptAt", "messageId", "name", "participantDisplayStyle", "publishError", "scheduledPublishAt", "time", "timezone", "type" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE UNIQUE INDEX "Event_messageId_key" ON "Event"("messageId");
CREATE INDEX "Event_channelId_idx" ON "Event"("channelId");
CREATE INDEX "Event_messageId_idx" ON "Event"("messageId");
CREATE INDEX "Event_groupId_idx" ON "Event"("groupId");
CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt");
CREATE INDEX "Event_channelId_createdAt_idx" ON "Event"("channelId", "createdAt");
CREATE INDEX "Event_autoPublishEnabled_scheduledPublishAt_idx" ON "Event"("autoPublishEnabled", "scheduledPublishAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
