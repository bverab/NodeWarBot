import { describe, expect, it } from "vitest";
import {
  clearPermissionDraft,
  createPermissionDraftState,
  getPermissionDraft,
  getPermissionPayload,
  openPermissionDraft,
  updatePermissionDraft
} from "../../apps/dashboard/lib/slotPermissionDrafts";

const slot = (id: string, allowedRoleIds: string[]) => ({ id, allowedRoleIds });

describe("slot permission drafts", () => {
  it("starts an editing session from the roles the slot has right now", () => {
    const state = openPermissionDraft(createPermissionDraftState(), slot("slot_1", ["11111", "22222"]));

    expect(getPermissionDraft(state, slot("slot_1", []))).toEqual(["11111", "22222"]);
    expect(getPermissionPayload(state, "slot_1")).toBeUndefined();
  });

  it("only sends roles once the user actually changed them", () => {
    let state = openPermissionDraft(createPermissionDraftState(), slot("slot_1", ["11111"]));
    expect(getPermissionPayload(state, "slot_1")).toBeUndefined();

    state = updatePermissionDraft(state, "slot_1", ["11111", "33333"]);
    expect(getPermissionPayload(state, "slot_1")).toEqual(["11111", "33333"]);

    state = updatePermissionDraft(state, "slot_1", []);
    expect(getPermissionPayload(state, "slot_1")).toEqual([]);
  });

  it("forgets the draft when the editor is cancelled, so a later edit does not resend old roles", () => {
    let state = openPermissionDraft(createPermissionDraftState(), slot("slot_1", ["11111"]));
    state = updatePermissionDraft(state, "slot_1", ["99999"]);

    state = clearPermissionDraft(state, "slot_1");
    expect(getPermissionPayload(state, "slot_1")).toBeUndefined();

    // Reopened later, the slot has other roles (changed elsewhere): the draft must start from those.
    state = openPermissionDraft(state, slot("slot_1", ["44444"]));
    expect(getPermissionDraft(state, slot("slot_1", ["44444"]))).toEqual(["44444"]);
    expect(getPermissionPayload(state, "slot_1")).toBeUndefined();
  });

  it("forgets the draft after saving", () => {
    let state = openPermissionDraft(createPermissionDraftState(), slot("slot_1", []));
    state = updatePermissionDraft(state, "slot_1", ["55555"]);

    state = clearPermissionDraft(state, "slot_1");
    state = openPermissionDraft(state, slot("slot_1", ["55555"]));

    // Editing only the name now must not touch the roles.
    expect(getPermissionPayload(state, "slot_1")).toBeUndefined();
  });

  it("reopening a slot discards an old untouched or touched draft", () => {
    let state = openPermissionDraft(createPermissionDraftState(), slot("slot_1", ["11111"]));
    state = updatePermissionDraft(state, "slot_1", ["99999"]);

    state = openPermissionDraft(state, slot("slot_1", ["11111"]));

    expect(getPermissionDraft(state, slot("slot_1", ["11111"]))).toEqual(["11111"]);
    expect(getPermissionPayload(state, "slot_1")).toBeUndefined();
  });

  it("keeps slots independent and never mutates the previous state", () => {
    const start = openPermissionDraft(createPermissionDraftState(), slot("slot_1", ["11111"]));
    const withSecond = openPermissionDraft(start, slot("slot_2", ["22222"]));
    const touched = updatePermissionDraft(withSecond, "slot_2", ["33333"]);
    const cleared = clearPermissionDraft(touched, "slot_2");

    expect(start.drafts).toEqual({ slot_1: ["11111"] });
    expect(touched.drafts).toEqual({ slot_1: ["11111"], slot_2: ["33333"] });
    expect(cleared.drafts).toEqual({ slot_1: ["11111"] });
    expect(getPermissionPayload(touched, "slot_1")).toBeUndefined();
    expect(getPermissionPayload(touched, "slot_2")).toEqual(["33333"]);
  });

  it("falls back to the slot's roles when no draft exists", () => {
    expect(getPermissionDraft(createPermissionDraftState(), slot("slot_9", ["77777"]))).toEqual(["77777"]);
  });
});
