"use client";

import { useEffect, useRef, useState } from "react";
import type { AttackMember, AttackSlot } from "./attack-map";

// Dragging a player's name onto the attack map, by mouse or finger. The same
// gestures as the Big Things map: a mouse drag starts after a few pixels, a
// touch drag after a short hold (so a normal swipe still scrolls).

const TOUCH_HOLD_MS = 300;
const TOUCH_SLOP_PX = 10;
const MOUSE_DRAG_PX = 4;

export type NameDrag = {
  member: AttackMember;
  /** The slot the name was picked up from, or null when dragged from the list. */
  from: AttackSlot | null;
  x: number;
  y: number;
  touch: boolean;
  /** The slot under the pointer, if any. */
  over: AttackSlot | null;
};

/** The slot under a screen point: anything marked with data-attack-slot. */
function slotAt(x: number, y: number): AttackSlot | null {
  const slot = document.elementFromPoint(x, y)?.closest("[data-attack-slot]")?.getAttribute("data-attack-slot");
  return (slot as AttackSlot | undefined) ?? null;
}

export function useNameDrag({
  enabled,
  onDrop
}: {
  /** Whether names can be picked up right now. */
  enabled: boolean;
  onDrop: (drag: NameDrag) => void;
}) {
  const [drag, setDrag] = useState<NameDrag | null>(null);
  const dragRef = useRef<NameDrag | null>(null);
  const endGesture = useRef<(() => void) | null>(null);
  // Set for the click that follows a drop, so dropping on a node doesn't also open it.
  const suppressClick = useRef(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => () => endGesture.current?.(), []);

  function updateDrag(next: NameDrag | null) {
    dragRef.current = next;
    setDrag(next);
  }

  function beginPress(member: AttackMember, from: AttackSlot | null, startX: number, startY: number, touch: boolean) {
    if (!enabled) return;
    endGesture.current?.();
    let dragging = false;
    let lastX = startX;
    let lastY = startY;

    const start = () => {
      dragging = true;
      if (touch) navigator.vibrate?.(12);
      updateDrag({ member, from, x: lastX, y: lastY, touch, over: slotAt(lastX, lastY) });
    };
    const move = (x: number, y: number, preventDefault: () => void) => {
      lastX = x;
      lastY = y;
      if (!dragging) {
        const distance = Math.hypot(x - startX, y - startY);
        if (touch && distance > TOUCH_SLOP_PX) stop();
        else if (!touch && distance > MOUSE_DRAG_PX) start();
        return;
      }
      preventDefault();
      updateDrag({ ...dragRef.current!, x, y, over: slotAt(x, y) });
    };
    const finish = (cancelled: boolean) => {
      const current = dragRef.current;
      stop();
      if (!dragging || !current) return;
      suppressClick.current = true;
      window.setTimeout(() => (suppressClick.current = false), 300);
      if (!cancelled) onDropRef.current(current);
    };

    const onPointerMove = (event: PointerEvent) => move(event.clientX, event.clientY, () => event.preventDefault());
    const onPointerUp = () => finish(false);
    const onTouchMove = (event: TouchEvent) => {
      const point = event.touches[0];
      if (point) move(point.clientX, point.clientY, () => event.preventDefault());
    };
    const onTouchEnd = () => finish(false);
    const onCancel = () => finish(true);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && finish(true);
    const holdTimer = touch ? window.setTimeout(start, TOUCH_HOLD_MS) : undefined;

    function stop() {
      window.clearTimeout(holdTimer);
      if (touch) {
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onTouchEnd);
        window.removeEventListener("touchcancel", onCancel);
      } else {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onCancel);
      }
      window.removeEventListener("keydown", onKey);
      endGesture.current = null;
      if (dragRef.current) updateDrag(null);
    }

    if (touch) {
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("touchend", onTouchEnd);
      window.addEventListener("touchcancel", onCancel);
    } else {
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onCancel);
    }
    window.addEventListener("keydown", onKey);
    endGesture.current = () => finish(true);
  }

  /** Press handlers for anything that can be picked up: a name in the list or a held slot. */
  function pressHandlers(member: AttackMember | undefined, from: AttackSlot | null) {
    if (!member || !enabled) return {};
    return {
      onPointerDown: (event: React.PointerEvent) => {
        if (event.pointerType === "touch" || event.button !== 0) return;
        event.preventDefault();
        beginPress(member, from, event.clientX, event.clientY, false);
      },
      onTouchStart: (event: React.TouchEvent) => {
        const point = event.touches[0];
        if (event.touches.length === 1 && point) beginPress(member, from, point.clientX, point.clientY, true);
      },
      onContextMenu: (event: React.MouseEvent) => event.preventDefault()
    };
  }

  return {
    drag,
    pressHandlers,
    /** True for the click a drop produces, which should be ignored. */
    clickSuppressed: () => suppressClick.current,
    cancel: () => endGesture.current?.()
  };
}
