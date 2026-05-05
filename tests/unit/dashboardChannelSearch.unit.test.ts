import { filterChannelsBySearch, normalizeSearchText } from "../../apps/dashboard/lib/channelSearch";

describe("dashboard channel search", () => {
  const channels = [
    { id: "1", name: "🐶 GRITARIA 🐶", type: 0 },
    { id: "2", name: "🍌-CÓDIGOS-BDO-🍌", type: 0 },
    { id: "3", name: "📘 LOBBY", type: 0 },
    { id: "4", name: "G-R-I-T-A-R-I-A", type: 0 },
    { id: "5", name: "CHAT-GENERAL", type: 0 },
    { id: "6", name: "ʟᴏʙʙʏ", type: 0 },
    { id: "7", name: "ɢʀɪᴛᴀʀɪᴀ", type: 0 }
  ];

  it("normalizes decorated channel labels for search", () => {
    expect(normalizeSearchText("🐶 GRITARIA 🐶")).toBe("gritaria");
    expect(normalizeSearchText("🐶-GRITARIA-🐶")).toBe("gritaria");
    expect(normalizeSearchText("#🐶-GRITARIA-🐶")).toBe("gritaria");
    expect(normalizeSearchText("🍌-CÓDIGOS-BDO-🍌")).toBe("codigos bdo");
    expect(normalizeSearchText("📘 LOBBY")).toBe("lobby");
    expect(normalizeSearchText("CHAT-GENERAL")).toBe("chat general");
    expect(normalizeSearchText("ʟᴏʙʙʏ")).toBe("lobby");
    expect(normalizeSearchText("ɢʀɪᴛᴀʀɪᴀ")).toBe("gritaria");
  });

  it("finds Gritaria channels despite emojis, case, accents, and separators", () => {
    expect(filterChannelsBySearch(channels, "gritaria").map((channel) => channel.id)).toContain("1");
    expect(filterChannelsBySearch(channels, "GRITARIA").map((channel) => channel.id)).toContain("1");
    expect(filterChannelsBySearch(channels, "gri").map((channel) => channel.id)).toContain("1");
    expect(filterChannelsBySearch(channels, "grit").map((channel) => channel.id)).toContain("1");
    expect(filterChannelsBySearch(channels, "🐶 gritaria").map((channel) => channel.id)).toContain("1");
    expect(filterChannelsBySearch(channels, "gritaria 🐶").map((channel) => channel.id)).toContain("1");
    expect(filterChannelsBySearch(channels, "gritaria").map((channel) => channel.id)).toContain("4");
    expect(filterChannelsBySearch(channels, "gritaria").map((channel) => channel.id)).toContain("7");
  });

  it("finds decorated BDO code channels with partial and accent-insensitive queries", () => {
    expect(filterChannelsBySearch(channels, "codigos").map((channel) => channel.id)).toContain("2");
    expect(filterChannelsBySearch(channels, "códigos").map((channel) => channel.id)).toContain("2");
    expect(filterChannelsBySearch(channels, "codigo").map((channel) => channel.id)).toContain("2");
    expect(filterChannelsBySearch(channels, "bdo").map((channel) => channel.id)).toContain("2");
    expect(filterChannelsBySearch(channels, "codigos bdo").map((channel) => channel.id)).toContain("2");
  });

  it("searches optional visible label fields as a fallback", () => {
    const result = filterChannelsBySearch(
      [{ id: "6", name: "raw-channel", label: "🐶 GRITARIA 🐶", displayName: "Gritaria", type: 0 }],
      "gritaria"
    );

    expect(result.map((channel) => channel.id)).toEqual(["6"]);
  });

  it("matches the real selector channel shape with visible labels", () => {
    const result = filterChannelsBySearch(
      [
        { id: "1", name: "🔴 LOBBY-GENERAL 🔴", label: "#🔴 LOBBY-GENERAL 🔴", type: 0 },
        { id: "2", name: "🔵 LOBBY 🔵", label: "#🔵 LOBBY 🔵", type: 0 },
        { id: "3", name: "🐶 GRITARIA 🐶", label: "#🐶 GRITARIA 🐶", type: 0 }
      ],
      "lobby"
    );

    expect(result.map((channel) => channel.id)).toEqual(["2", "1"]);
    expect(filterChannelsBySearch(result, "general").map((channel) => channel.id)).toEqual(["1"]);
  });

  it("finds lobby with partial and decorated-letter queries", () => {
    expect(filterChannelsBySearch(channels, "lobby").map((channel) => channel.id)).toEqual(expect.arrayContaining(["3", "6"]));
    expect(filterChannelsBySearch(channels, "lob").map((channel) => channel.id)).toEqual(expect.arrayContaining(["3", "6"]));
    expect(filterChannelsBySearch(channels, "lobby").map((channel) => channel.id)).toContain("6");
  });
});
