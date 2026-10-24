// Why an event cannot be published to Discord right now (null = it can). A closed event, or one that has ended or
// whose signup window is over, would be posted already closed and be torn down by the bot on its next tick.
export function getPublishBlockReason(
  event: { isClosed: boolean; closesAt: Date; expiresAt: Date },
  now: Date = new Date()
) {
  if (event.isClosed) {
    return "Signups are closed for this event. Reopen them before publishing.";
  }

  if (event.expiresAt.getTime() <= now.getTime() || event.closesAt.getTime() <= now.getTime()) {
    return "This event has already ended or its signups are over, so it cannot be published.";
  }

  return null;
}
