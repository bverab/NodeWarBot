"use client";

import { useEffect } from "react";

export function RememberGuild({ guildId }: { guildId: string }) {
  useEffect(() => {
    window.localStorage.setItem("spectre:lastGuildId", guildId);
  }, [guildId]);

  return null;
}
