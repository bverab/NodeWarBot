"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { MemberMultiSelect, RoleMultiSelect, type MemberOption, type RoleOption } from "@/components/dashboard/selectors/GuildSelectors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MAX_PVE_ACCESS_ENTRIES, PVE_ACCESS_MODES, PVE_ACCESS_MODE_TEXT, PVE_FILLER_RULE, type PveAccessMode } from "@/lib/pveAccessModes";
import styles from "@/app/guilds/[guildId]/_styles/overview.module.css";

type PveAccessEditorProps = {
  guildId: string;
  eventId: string;
  channelId: string | null;
  manageable: boolean;
  roles: RoleOption[];
  roleLoadError: string | null;
  initialMode: PveAccessMode;
  initialRoleIds: string[];
  initialUsers: MemberOption[];
};

type SaveResponse = {
  ok?: boolean;
  error?: string;
  promoted?: Array<{ displayName: string; optionLabel: string }>;
  synced?: boolean;
  syncError?: string;
};

// Who joins this PvE event as a main signup. Saving moves up fillers who now qualify and refreshes the Discord message.
export function PveAccessEditor({ guildId, eventId, channelId, manageable, roles, roleLoadError, initialMode, initialRoleIds, initialUsers }: PveAccessEditorProps) {
  const router = useRouter();
  const [mode, setMode] = useState<PveAccessMode>(initialMode);
  const [roleIds, setRoleIds] = useState<string[]>(initialRoleIds);
  const [users, setUsers] = useState<MemberOption[]>(initialUsers);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const roleName = (roleId: string) => roles.find((role) => role.id === roleId)?.name ?? roleId;

  const missing = mode === "ROLES" && !roleIds.length
    ? "Select at least one role with access."
    : mode === "USERS" && !users.length
      ? "Select at least one person with access."
      : null;

  const save = async () => {
    if (busy || missing) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/guilds/${guildId}/events/${eventId}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessMode: mode, roleIds, userIds: users.map((member) => member.id) })
      });
      const json = (await response.json().catch(() => null)) as SaveResponse | null;
      if (!response.ok || !json?.ok) {
        setNotice(json?.error ?? "Saving the access failed.");
        return;
      }

      const lines = ["Access saved."];
      if (json.promoted?.length) {
        lines.push(`Moved up from fillers: ${json.promoted.map((entry) => `${entry.displayName} (${entry.optionLabel})`).join(", ")}.`);
      }
      if (json.syncError) {
        lines.push(`The Discord message could not be refreshed: ${json.syncError}`);
      }
      setNotice(lines.join(" "));
      router.refresh();
    } catch {
      setNotice("Saving the access failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h3><Shield size={16} aria-hidden="true" /> Signup access</h3>
      <p>
        <strong>{PVE_ACCESS_MODE_TEXT[mode].label}.</strong> {PVE_ACCESS_MODE_TEXT[mode].help}
        {mode !== "OPEN" ? ` ${PVE_FILLER_RULE}` : ""}
      </p>
      {manageable ? (
        <>
          <div className={styles.segmentControl}>
            {PVE_ACCESS_MODES.map((accessMode) => (
              <button aria-pressed={mode === accessMode} key={accessMode} onClick={() => setMode(accessMode)} type="button">
                {PVE_ACCESS_MODE_TEXT[accessMode].label}
              </button>
            ))}
          </div>
          {mode === "ROLES" ? (
            <RoleMultiSelect emptyText="No Discord roles could be loaded." label="Roles with access" loadError={roleLoadError} onChange={setRoleIds} roles={roles} selected={roleIds} />
          ) : null}
          {mode === "USERS" ? (
            <MemberMultiSelect
              channelId={channelId}
              disabledText="Set the event's Discord channel first: only people who can see it can be picked."
              guildId={guildId}
              label="People with access"
              max={MAX_PVE_ACCESS_ENTRIES}
              onChange={setUsers}
              selected={users}
            />
          ) : null}
          {missing ? <p className={styles.formHint}>{missing}</p> : null}
          <Button disabled={busy || Boolean(missing)} onClick={save} type="button">
            {busy ? "Saving..." : "Save access"}
          </Button>
        </>
      ) : mode === "ROLES" ? (
        <div className={styles.participantList}>{roleIds.map((roleId) => <span className={styles.pill} key={roleId}>{roleName(roleId)}</span>)}</div>
      ) : mode === "USERS" ? (
        <div className={styles.participantList}>{users.map((member) => <span className={styles.pill} key={member.id}>{member.displayName}</span>)}</div>
      ) : null}
      {notice ? <p className={styles.formNotice}>{notice}</p> : null}
    </Card>
  );
}
