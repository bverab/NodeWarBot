type OrderedSlot = {
  id: string;
  name: string;
  order?: number | null;
  position?: number | null;
};

function slotOrder(slot: OrderedSlot) {
  return slot.order ?? slot.position ?? Number.MAX_SAFE_INTEGER;
}

export function sortSlotsByOrder<T extends OrderedSlot>(slots: T[]) {
  return [...slots].sort((a, b) => {
    const orderDelta = slotOrder(a) - slotOrder(b);

    if (orderDelta !== 0) {
      return orderDelta;
    }

    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}
