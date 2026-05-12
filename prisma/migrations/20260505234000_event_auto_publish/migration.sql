ALTER TABLE "Event" ADD COLUMN "autoPublishEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "scheduledPublishAt" DATETIME;
ALTER TABLE "Event" ADD COLUMN "publishError" TEXT;
ALTER TABLE "Event" ADD COLUMN "lastPublishAttemptAt" DATETIME;

CREATE INDEX "Event_autoPublishEnabled_scheduledPublishAt_idx" ON "Event"("autoPublishEnabled", "scheduledPublishAt");
