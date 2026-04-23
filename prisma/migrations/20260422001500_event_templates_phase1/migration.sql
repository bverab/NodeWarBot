CREATE TABLE "EventTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'war',
    "typeDefault" TEXT NOT NULL DEFAULT 'Evento',
    "classIconSource" TEXT NOT NULL DEFAULT 'bot',
    "participantDisplayStyle" TEXT NOT NULL DEFAULT 'modern',
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "time" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 70,
    "closeBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EventTemplate_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "EventTemplateRoleSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "max" INTEGER NOT NULL,
    "emoji" TEXT,
    "emojiSource" TEXT,
    CONSTRAINT "EventTemplateRoleSlot_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "EventTemplateRolePermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleSlotId" TEXT NOT NULL,
    "discordRoleId" TEXT,
    "discordRoleName" TEXT,
    CONSTRAINT "EventTemplateRolePermission_roleSlotId_fkey" FOREIGN KEY ("roleSlotId") REFERENCES "EventTemplateRoleSlot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "EventTemplateNotifyTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "EventTemplateNotifyTarget_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EventTemplate_guildId_eventType_name_key" ON "EventTemplate"("guildId", "eventType", "name");
CREATE INDEX "EventTemplate_guildId_eventType_isArchived_idx" ON "EventTemplate"("guildId", "eventType", "isArchived");
CREATE INDEX "EventTemplate_guildId_isArchived_idx" ON "EventTemplate"("guildId", "isArchived");
CREATE UNIQUE INDEX "EventTemplateRoleSlot_templateId_name_key" ON "EventTemplateRoleSlot"("templateId", "name");
CREATE UNIQUE INDEX "EventTemplateRoleSlot_templateId_position_key" ON "EventTemplateRoleSlot"("templateId", "position");
CREATE INDEX "EventTemplateRoleSlot_templateId_position_idx" ON "EventTemplateRoleSlot"("templateId", "position");
CREATE INDEX "EventTemplateRolePermission_roleSlotId_idx" ON "EventTemplateRolePermission"("roleSlotId");
CREATE UNIQUE INDEX "EventTemplateNotifyTarget_templateId_targetId_key" ON "EventTemplateNotifyTarget"("templateId", "targetId");
CREATE INDEX "EventTemplateNotifyTarget_templateId_position_idx" ON "EventTemplateNotifyTarget"("templateId", "position");
