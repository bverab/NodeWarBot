"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { parseDiscordEmoji } from "@/lib/discordEmoji";
import styles from "./overview.module.css";

type EmojiSummary = {
  id: string;
  name: string;
  animated: boolean;
  url: string;
  source: "guild" | "application";
  raw?: string;
  syntax: string;
};

type RawEmoji = Partial<EmojiSummary> & {
  raw?: unknown;
  syntax?: unknown;
};

type EmojiPickerProps = {
  guildId: string;
  name?: string;
  defaultValue?: string | null;
  defaultSource?: string | null;
};

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function loadEmojiSource(url: string, source: EmojiSummary["source"]) {
  const response = await fetchWithTimeout(url);
  const json = (await response.json().catch(() => null)) as { emojis?: unknown; error?: string } | null;

  if (!response.ok || json?.error) {
    throw new Error(json?.error ?? (source === "application" ? "Could not load Spectre emojis. Use Manual fallback." : "Could not load server emojis. Use Manual fallback."));
  }

  const rawEmojis = Array.isArray(json?.emojis) ? json.emojis : [];
  return rawEmojis
    .map((emoji) => normalizeEmoji(emoji, source))
    .filter((emoji): emoji is EmojiSummary => Boolean(emoji));
}

function normalizeEmoji(value: unknown, source: EmojiSummary["source"]): EmojiSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const emoji = value as RawEmoji;
  const id = typeof emoji.id === "string" ? emoji.id : "";
  const name = typeof emoji.name === "string" ? emoji.name : "";

  if (!id || !name) {
    return null;
  }

  const animated = Boolean(emoji.animated);
  const extension = animated ? "gif" : "png";
  const syntax = typeof emoji.syntax === "string"
    ? emoji.syntax
    : typeof emoji.raw === "string"
      ? emoji.raw
      : `<${animated ? "a" : ""}:${name}:${id}>`;
  const url = typeof emoji.url === "string" && emoji.url
    ? emoji.url
    : `https://cdn.discordapp.com/emojis/${id}.${extension}?size=48&quality=lossless`;

  return {
    id,
    name,
    animated,
    url,
    source,
    raw: typeof emoji.raw === "string" ? emoji.raw : syntax,
    syntax
  };
}

function debugEmojiState(input: {
  tab: string;
  guildLoading: boolean;
  applicationLoading: boolean;
  guildLoaded: boolean;
  applicationLoaded: boolean;
  guildCount: number;
  applicationCount: number;
  filteredCount: number;
}) {
  if (process.env.NODE_ENV === "development") {
    console.debug("[EmojiPicker]", input);
  }
}

export function EmojiPicker({ guildId, name = "emoji", defaultValue, defaultSource }: EmojiPickerProps) {
  const isMountedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"guild" | "application" | "manual">("guild");
  const [query, setQuery] = useState("");
  const [value, setValue] = useState(defaultValue ?? "");
  const [source, setSource] = useState(defaultSource ?? (defaultValue ? "manual" : ""));
  const [guildEmojis, setGuildEmojis] = useState<EmojiSummary[]>([]);
  const [applicationEmojis, setApplicationEmojis] = useState<EmojiSummary[]>([]);
  const [guildLoading, setGuildLoading] = useState(false);
  const [applicationLoading, setApplicationLoading] = useState(false);
  const [guildLoaded, setGuildLoaded] = useState(false);
  const [applicationLoaded, setApplicationLoaded] = useState(false);
  const [guildError, setGuildError] = useState<string | null>(null);
  const [applicationError, setApplicationError] = useState<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadGuildEmojis = useCallback(async (force = false) => {
    if (guildLoading || (guildLoaded && !force)) {
      return;
    }

    setGuildLoading(true);
    setGuildError(null);
    try {
      const emojis = await loadEmojiSource(`/api/guilds/${guildId}/emojis`, "guild");
      if (!isMountedRef.current) {
        return;
      }
      setGuildEmojis(emojis);
      setGuildLoaded(true);
    } catch {
      if (!isMountedRef.current) {
        return;
      }
      setGuildEmojis([]);
      setGuildError("Could not load server emojis. Use Manual fallback.");
      setGuildLoaded(true);
    } finally {
      if (isMountedRef.current) {
        setGuildLoading(false);
      }
    }
  }, [guildId, guildLoaded, guildLoading]);

  const loadApplicationEmojis = useCallback(async (force = false) => {
    if (applicationLoading || (applicationLoaded && !force)) {
      return;
    }

    setApplicationLoading(true);
    setApplicationError(null);
    try {
      const emojis = await loadEmojiSource("/api/application-emojis", "application");
      if (!isMountedRef.current) {
        return;
      }
      setApplicationEmojis(emojis);
      setApplicationLoaded(true);
    } catch {
      if (!isMountedRef.current) {
        return;
      }
      setApplicationEmojis([]);
      setApplicationError("Could not load Spectre emojis. Use Manual fallback.");
      setApplicationLoaded(true);
    } finally {
      if (isMountedRef.current) {
        setApplicationLoading(false);
      }
    }
  }, [applicationLoaded, applicationLoading]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (tab === "guild") {
      void loadGuildEmojis();
      return;
    }

    if (tab === "application") {
      void loadApplicationEmojis();
    }

  }, [loadApplicationEmojis, loadGuildEmojis, open, tab]);

  useEffect(() => {
    setGuildEmojis([]);
    setApplicationEmojis([]);
    setGuildLoaded(false);
    setApplicationLoaded(false);
    setGuildLoading(false);
    setApplicationLoading(false);
    setGuildError(null);
    setApplicationError(null);
  }, [guildId]);

  const currentEmojis = tab === "application" ? applicationEmojis : tab === "guild" ? guildEmojis : [];
  const currentLoading = tab === "application" ? applicationLoading : tab === "guild" ? guildLoading : false;
  const currentError = tab === "application" ? applicationError : tab === "guild" ? guildError : null;
  const currentLoaded = tab === "application" ? applicationLoaded : tab === "guild" ? guildLoaded : true;

  const filtered = useMemo(
    () => {
      const matching = currentEmojis.filter((emoji) => {
        return emoji.name.toLowerCase().includes(query.toLowerCase());
      });
      debugEmojiState({
        tab,
        guildLoading,
        applicationLoading,
        guildLoaded,
        applicationLoaded,
        guildCount: guildEmojis.length,
        applicationCount: applicationEmojis.length,
        filteredCount: matching.length
      });
      return matching;
    },
    [applicationEmojis.length, applicationLoaded, applicationLoading, currentEmojis, guildEmojis.length, guildLoaded, guildLoading, query, tab]
  );

  const allEmojis = useMemo(() => [...guildEmojis, ...applicationEmojis], [applicationEmojis, guildEmojis]);
  const previewEmoji = allEmojis.find((emoji) => emoji.syntax === value || emoji.raw === value);
  const parsedValue = parseDiscordEmoji(value);
  const selectedName = previewEmoji?.name ?? parsedValue?.name ?? (value && source === "manual" ? "Manual" : null);

  const retry = () => {
    if (tab === "application") {
      setApplicationError(null);
      void loadApplicationEmojis(true);
      return;
    }

    if (tab === "guild") {
      setGuildError(null);
      void loadGuildEmojis(true);
    }
  };

  return (
    <div className={styles.emojiPicker}>
      <input name={name} type="hidden" value={value} />
      <input name={`${name}Source`} type="hidden" value={source} />
      <div className={styles.emojiControl}>
        <button className={styles.emojiTrigger} onClick={() => setOpen((current) => !current)} type="button">
          {previewEmoji || parsedValue ? <img alt="" src={(previewEmoji?.url ?? parsedValue?.imageUrl) as string} /> : <span>{value && source === "manual" ? value.slice(0, 2) : "+"}</span>}
          <span>{value ? "Change icon" : "Select icon"}</span>
          {selectedName ? <small>{selectedName}</small> : null}
        </button>
        {value ? (
          <button
            aria-label="Clear icon"
            className={styles.emojiClear}
            onClick={() => {
              setValue("");
              setSource("");
            }}
            type="button"
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div className={styles.emojiMenu}>
          <div className={styles.emojiTabs} role="tablist" aria-label="Emoji sources">
            <button aria-selected={tab === "guild"} onClick={() => setTab("guild")} type="button">Server</button>
            <button aria-selected={tab === "application"} onClick={() => setTab("application")} type="button">Spectre</button>
            <button aria-selected={tab === "manual"} onClick={() => setTab("manual")} type="button">Manual</button>
          </div>
          {tab === "manual" ? (
            <label className={styles.compactField}>
              Emoji or text
              <input
                maxLength={128}
                onChange={(event) => {
                  setValue(event.target.value);
                  setSource(event.target.value ? "manual" : "");
                }}
                placeholder="emoji or :flame:"
                value={value}
              />
            </label>
          ) : (
            <>
              <label className={styles.searchField}>
                <Search size={14} aria-hidden="true" />
                <input onChange={(event) => setQuery(event.target.value)} placeholder="Search emoji" value={query} />
              </label>
              <div className={styles.emojiGrid}>
                {currentLoading ? (
                  Array.from({ length: 18 }, (_, index) => <span className={styles.emojiSkeleton} key={index} />)
                ) : filtered.length ? (
                  filtered.slice(0, 48).map((emoji) => (
                    <button
                      key={`${emoji.source}-${emoji.id}`}
                      onClick={() => {
                        setValue(emoji.raw ?? emoji.syntax);
                        setSource(emoji.source);
                        setOpen(false);
                      }}
                      title={emoji.name}
                      type="button"
                    >
                      <img alt="" src={emoji.url} />
                    </button>
                  ))
                ) : currentError ? (
                  <p>
                    {currentError}
                    <button className={styles.retryButton} onClick={retry} type="button">Retry</button>
                  </p>
                ) : (
                  <p>
                    {currentLoaded ? "No emojis found. Try another search or use Manual fallback." : "Open this tab to load emojis."}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
