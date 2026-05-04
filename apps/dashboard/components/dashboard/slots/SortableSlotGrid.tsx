"use client";

import type { ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import styles from "./SortableSlotGrid.module.css";

type SortableItem = {
  id: string;
};

type SortableSlotGridProps<T extends SortableItem> = {
  className: string;
  disabled?: boolean;
  getItemClassName?: (item: T) => string;
  items: T[];
  onReorder: (items: T[]) => void;
  renderItem: (item: T, index: number, dragHandle: ReactNode) => ReactNode;
};

type SortableSlotProps<T extends SortableItem> = {
  disabled: boolean;
  itemClassName?: string;
  index: number;
  item: T;
  renderItem: SortableSlotGridProps<T>["renderItem"];
};

function SortableSlot<T extends SortableItem>({ disabled, itemClassName = "", index, item, renderItem }: SortableSlotProps<T>) {
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform, transition } = useSortable({
    id: item.id,
    disabled
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  const dragHandle = disabled ? null : (
    <button
      aria-label="Drag to reorder slot"
      className={styles.handle}
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
    >
      <GripVertical size={15} aria-hidden="true" />
    </button>
  );

  return (
    <div className={`${styles.item} ${itemClassName} ${isDragging ? styles.dragging : ""}`} ref={setNodeRef} style={style}>
      {renderItem(item, index, dragHandle)}
    </div>
  );
}

export function SortableSlotGrid<T extends SortableItem>({
  className,
  disabled = false,
  getItemClassName,
  items,
  onReorder,
  renderItem
}: SortableSlotGridProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
      <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
        <div className={className}>
          {items.map((item, index) => (
            <SortableSlot
              disabled={disabled}
              index={index}
              item={item}
              itemClassName={getItemClassName?.(item)}
              key={item.id}
              renderItem={renderItem}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
