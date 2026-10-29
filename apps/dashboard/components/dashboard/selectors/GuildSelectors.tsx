"use client";

import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { filterChannelsBySearch } from "@/lib/channelSearch";
import selectorStyles from "./GuildSelectors.module.css";

export type RoleOption = {
  id: string;
  name: string;
  color: number | null;
  managed: boolean;
};

export type ChannelOption = {
  displayName?: string | null;
  id: string;
  label?: string | null;
  name: string;
  type: number;
};

function useFloatingDropdown(open: boolean) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});

  const updatePosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 4;
    const preferredHeight = 260;
    const minUsableHeight = 140;
    const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
    const left = Math.min(Math.max(rect.left, viewportPadding), window.innerWidth - width - viewportPadding);
    const availableBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding - gap);
    const availableAbove = Math.max(0, rect.top - viewportPadding - gap);
    const measuredHeight = dropdownRef.current?.offsetHeight ?? preferredHeight;
    const desiredHeight = Math.min(measuredHeight, preferredHeight);
    const shouldOpenAbove = availableBelow < Math.min(desiredHeight, minUsableHeight) && availableAbove > availableBelow;
    const availableHeight = shouldOpenAbove ? availableAbove : availableBelow;
    const maxHeight = Math.max(Math.min(preferredHeight, availableHeight), Math.min(minUsableHeight, Math.max(availableAbove, availableBelow)));
    const panelHeight = Math.min(desiredHeight, maxHeight);

    setDropdownStyle({
      left,
      maxHeight,
      top: shouldOpenAbove ? rect.top - gap - panelHeight : rect.bottom + gap,
      width
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return { containerRef, dropdownRef, dropdownStyle };
}

export function RoleMultiSelect({
  label,
  roles,
  selected,
  onChange,
  emptyText,
  loadError
}: {
  label: string;
  roles: RoleOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyText: string;
  loadError?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { containerRef, dropdownRef, dropdownStyle } = useFloatingDropdown(open);
  const selectedRoles = selected
    .map((roleId) => roles.find((role) => role.id === roleId))
    .filter((role): role is RoleOption => Boolean(role));
  const unresolvedSelectedRoleIds = selected.filter((roleId) => !roles.some((role) => role.id === roleId));
  const filteredRoles = roles
    .filter((role) => role.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 80);

  const toggle = (roleId: string) => {
    onChange(selected.includes(roleId) ? selected.filter((id) => id !== roleId) : [...selected, roleId]);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className={selectorStyles.roleMultiSelect} ref={containerRef}>
      <div className={selectorStyles.rolePickerHeader}>
        <div>
          <div className={selectorStyles.fieldHeading}>{label}</div>
          <span>{selected.length === 1 ? "1 role selected" : `${selected.length} roles selected`}</span>
        </div>
        {selected.length && roles.length ? <button onClick={() => onChange([])} type="button">Clear</button> : null}
      </div>
      <button className={`${selectorStyles.roleSelectTrigger} ${open ? selectorStyles.selectorOpen : ""}`} disabled={!roles.length} onClick={() => setOpen((current) => !current)} type="button">
        <span>{roles.length ? (selected.length ? `${selected.length} roles selected` : "Select roles") : loadError ?? emptyText}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {!roles.length ? <p className={selectorStyles.inlineHelp}>{loadError ?? emptyText}</p> : null}
      {selectedRoles.length ? (
        <div className={selectorStyles.selectedRoleChips}>
          {selectedRoles.slice(0, 10).map((role) => (
            <button aria-label={`Remove ${role.name}`} key={role.id} onClick={() => toggle(role.id)} type="button">
              {role.name}
              <X size={12} aria-hidden="true" />
            </button>
          ))}
          {selectedRoles.length > 10 ? <span>+{selectedRoles.length - 10}</span> : null}
        </div>
      ) : null}
      {!selectedRoles.length && unresolvedSelectedRoleIds.length ? (
        <div className={selectorStyles.selectedRoleChips}>
          {unresolvedSelectedRoleIds.slice(0, 6).map((roleId) => (
            <span key={roleId}>{roleId}</span>
          ))}
          {unresolvedSelectedRoleIds.length > 6 ? <span>+{unresolvedSelectedRoleIds.length - 6}</span> : null}
        </div>
      ) : null}
      {open && roles.length && typeof document !== "undefined" ? createPortal(
        <div className={selectorStyles.roleDropdown} ref={dropdownRef} style={dropdownStyle}>
          <label className={selectorStyles.roleSearch}>
            <Search size={14} aria-hidden="true" />
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Search roles" value={query} />
          </label>
          <div className={selectorStyles.roleOptionsList}>
            {filteredRoles.length ? (
              filteredRoles.map((role) => (
                <button aria-pressed={selected.includes(role.id)} key={role.id} onClick={() => toggle(role.id)} type="button">
                  <span>{role.name}</span>
                  {selected.includes(role.id) ? <Check size={14} aria-hidden="true" /> : null}
                </button>
              ))
            ) : (
              <p>No roles match that search.</p>
            )}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}

export type MemberOption = {
  id: string;
  displayName: string;
};

type MemberSearchResult = MemberOption & { username: string | null; canViewChannel: boolean };

const MEMBER_SEARCH_DELAY_MS = 300;

// People picker for PvE "By people" access. Discord only searches by the start of a username or nickname, and only
// members who can see the event channel can be picked.
export function MemberMultiSelect({
  guildId,
  channelId,
  label,
  selected,
  onChange,
  max,
  disabledText
}: {
  guildId: string;
  channelId: string | null;
  label: string;
  selected: MemberOption[];
  onChange: (members: MemberOption[]) => void;
  max: number;
  disabledText: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberSearchResult[]>([]);
  const [searchState, setSearchState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const { containerRef, dropdownRef, dropdownStyle } = useFloatingDropdown(open);
  const selectedIds = new Set(selected.map((member) => member.id));

  const toggle = (member: MemberOption) => {
    if (selectedIds.has(member.id)) {
      onChange(selected.filter((entry) => entry.id !== member.id));
    } else if (selected.length < max) {
      onChange([...selected, { id: member.id, displayName: member.displayName }]);
    }
  };

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || !channelId || !trimmed) {
      setResults([]);
      setSearchState({ loading: false, error: null });
      return;
    }

    let cancelled = false;
    setSearchState({ loading: true, error: null });
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ query: trimmed, channelId });
      const response = await fetch(`/api/guilds/${guildId}/members?${params.toString()}`).catch(() => null);
      const json = (await response?.json().catch(() => null)) as { members?: MemberSearchResult[]; error?: string } | null;
      if (cancelled) {
        return;
      }
      if (!response?.ok || !Array.isArray(json?.members)) {
        setResults([]);
        setSearchState({ loading: false, error: json?.error ?? "Member search failed." });
        return;
      }
      setResults(json.members);
      setSearchState({ loading: false, error: null });
    }, MEMBER_SEARCH_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [channelId, guildId, open, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [containerRef, dropdownRef, open]);

  return (
    <div className={selectorStyles.roleMultiSelect} ref={containerRef}>
      <div className={selectorStyles.rolePickerHeader}>
        <div>
          <div className={selectorStyles.fieldHeading}>{label}</div>
          <span>{selected.length === 1 ? "1 person selected" : `${selected.length} people selected`} (max {max})</span>
        </div>
        {selected.length ? <button onClick={() => onChange([])} type="button">Clear</button> : null}
      </div>
      <button className={`${selectorStyles.roleSelectTrigger} ${open ? selectorStyles.selectorOpen : ""}`} disabled={!channelId} onClick={() => setOpen((current) => !current)} type="button">
        <span>{channelId ? "Search people" : disabledText}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {!channelId ? <p className={selectorStyles.inlineHelp}>{disabledText}</p> : null}
      {selected.length ? (
        <div className={selectorStyles.selectedRoleChips}>
          {selected.map((member) => (
            <button aria-label={`Remove ${member.displayName}`} key={member.id} onClick={() => toggle(member)} type="button">
              {member.displayName}
              <X size={12} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
      {open && channelId && typeof document !== "undefined" ? createPortal(
        <div className={selectorStyles.roleDropdown} ref={dropdownRef} style={dropdownStyle}>
          <label className={selectorStyles.roleSearch}>
            <Search size={14} aria-hidden="true" />
            <input autoFocus maxLength={32} onChange={(event) => setQuery(event.target.value)} placeholder="Start of a username or nickname" value={query} />
          </label>
          <div className={selectorStyles.roleOptionsList}>
            {!query.trim() ? (
              <p>Type to search members of this server.</p>
            ) : searchState.loading ? (
              <p>Searching...</p>
            ) : searchState.error ? (
              <p>{searchState.error}</p>
            ) : results.length ? (
              results.map((member) => (
                <button
                  aria-pressed={selectedIds.has(member.id)}
                  disabled={!member.canViewChannel || (!selectedIds.has(member.id) && selected.length >= max)}
                  key={member.id}
                  onClick={() => toggle(member)}
                  title={member.username ?? undefined}
                  type="button"
                >
                  <span>{member.displayName}</span>
                  {selectedIds.has(member.id) ? <Check size={14} aria-hidden="true" /> : !member.canViewChannel ? <small>Cannot see the channel</small> : null}
                </button>
              ))
            ) : (
              <p>No members match that search.</p>
            )}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}

export function ChannelSelect({
  channels,
  value,
  onChange,
  emptyText
}: {
  channels: ChannelOption[];
  value: string;
  onChange: (channelId: string) => void;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { containerRef, dropdownRef, dropdownStyle } = useFloatingDropdown(open);
  const selected = channels.find((channel) => channel.id === value);
  const filtered = useMemo(() => filterChannelsBySearch(channels, query), [channels, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className={selectorStyles.channelSelect} ref={containerRef}>
      <button className={`${selectorStyles.roleSelectTrigger} ${open ? selectorStyles.selectorOpen : ""}`} disabled={!channels.length} onClick={() => setOpen((current) => !current)} type="button">
        <span>{selected ? `#${selected.name}` : channels.length ? "No channel selected" : emptyText}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && channels.length && typeof document !== "undefined" ? createPortal(
        <div className={selectorStyles.roleDropdown} ref={dropdownRef} style={dropdownStyle}>
          <label className={selectorStyles.roleSearch}>
            <Search size={14} aria-hidden="true" />
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Search channels" value={query} />
          </label>
          <div className={selectorStyles.roleOptionsList}>
            <button aria-pressed={!value} onClick={() => {
              onChange("");
              setOpen(false);
            }} type="button">
              <span>No channel selected</span>
              {!value ? <Check size={14} aria-hidden="true" /> : null}
            </button>
            {filtered.length ? (
              filtered.map((channel) => (
                <button aria-pressed={channel.id === value} key={channel.id} onClick={() => {
                  onChange(channel.id);
                  setOpen(false);
                }} type="button">
                  <span>#{channel.name}</span>
                  {channel.id === value ? <Check size={14} aria-hidden="true" /> : null}
                </button>
              ))
            ) : query.trim() ? (
              <p>No postable channels match that search.</p>
            ) : (
              <p>No postable channels could be loaded.</p>
            )}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
