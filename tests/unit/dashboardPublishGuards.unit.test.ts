import { describe, expect, it } from "vitest";
import { getPublishBlockReason } from "../../apps/dashboard/lib/server/publishGuards";

const now = new Date("2030-05-05T20:00:00.000Z");
const minutes = (value: number) => new Date(now.getTime() + value * 60_000);

describe("getPublishBlockReason", () => {
  it("allows an open event whose signups and end are in the future", () => {
    expect(getPublishBlockReason({ isClosed: false, closesAt: minutes(30), expiresAt: minutes(40) }, now)).toBeNull();
  });

  it("blocks closed events", () => {
    expect(getPublishBlockReason({ isClosed: true, closesAt: minutes(30), expiresAt: minutes(40) }, now)).toBe(
      "Signups are closed for this event. Reopen them before publishing."
    );
  });

  it("blocks events that have already ended or whose signup window is over", () => {
    const expired = "This event has already ended or its signups are over, so it cannot be published.";

    expect(getPublishBlockReason({ isClosed: false, closesAt: minutes(-20), expiresAt: minutes(-10) }, now)).toBe(expired);
    expect(getPublishBlockReason({ isClosed: false, closesAt: minutes(-1), expiresAt: minutes(40) }, now)).toBe(expired);
    expect(getPublishBlockReason({ isClosed: false, closesAt: minutes(0), expiresAt: minutes(40) }, now)).toBe(expired);
  });
});
