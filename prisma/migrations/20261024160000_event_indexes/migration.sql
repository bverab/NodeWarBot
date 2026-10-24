-- DropIndex
DROP INDEX "Event_messageId_idx";

-- DropIndex
DROP INDEX "EventParticipant_eventId_idx";

-- DropIndex
DROP INDEX "EventRoleSlot_eventId_position_idx";

-- DropIndex
DROP INDEX "EventTemplateRoleSlot_templateId_position_idx";

-- DropIndex
DROP INDEX "EventWaitlistEntry_eventId_position_idx";

-- DropIndex
DROP INDEX "GarmothProfile_guildId_idx";

-- CreateIndex
CREATE INDEX "Event_guildId_eventType_idx" ON "Event"("guildId", "eventType");
