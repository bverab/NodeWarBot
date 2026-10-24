// Editing session state for a slot's allowed roles. A draft only lives while the slot editor is open: it starts from the
// roles the slot has at that moment and is discarded on cancel and after saving, so a later edit can never resend
// roles chosen in an earlier session.
export type PermissionDraftState = {
  drafts: Record<string, string[]>;
  touched: Record<string, boolean>;
};

type SlotRoles = { id: string; allowedRoleIds: string[] };

export function createPermissionDraftState(): PermissionDraftState {
  return { drafts: {}, touched: {} };
}

export function openPermissionDraft(state: PermissionDraftState, slot: SlotRoles): PermissionDraftState {
  return {
    drafts: { ...state.drafts, [slot.id]: [...slot.allowedRoleIds] },
    touched: { ...state.touched, [slot.id]: false }
  };
}

export function updatePermissionDraft(state: PermissionDraftState, slotId: string, roleIds: string[]): PermissionDraftState {
  return {
    drafts: { ...state.drafts, [slotId]: [...roleIds] },
    touched: { ...state.touched, [slotId]: true }
  };
}

export function clearPermissionDraft(state: PermissionDraftState, slotId: string): PermissionDraftState {
  const { [slotId]: _draft, ...drafts } = state.drafts;
  const { [slotId]: _touched, ...touched } = state.touched;
  return { drafts, touched };
}

export function getPermissionDraft(state: PermissionDraftState, slot: SlotRoles) {
  return state.drafts[slot.id] ?? slot.allowedRoleIds;
}

// undefined = the user did not touch the roles, so the PATCH must not include them.
export function getPermissionPayload(state: PermissionDraftState, slotId: string) {
  return state.touched[slotId] ? state.drafts[slotId] ?? [] : undefined;
}
