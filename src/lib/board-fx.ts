// Battlegroup board animations: defenders flipping in when a plan is published,
// dealing back into rows after Auto-suggest, and flying between members when
// reassigned. Cards are found by `data-flip-id` (the champion id) inside a
// container. Set BOARD_FX to false to turn them off.

export const BOARD_FX = true;

type Positions = Map<string, { x: number; y: number }>;

function cards(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-flip-id]"));
}

function onScreen(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.bottom > -40 && rect.top < window.innerHeight + 40;
}

/** Where every card is now, in page coordinates, so a later change can animate from here. */
export function snapshotPositions(container: HTMLElement | null): Positions {
  const positions: Positions = new Map();
  if (!container) return positions;
  for (const el of cards(container)) {
    const id = el.dataset.flipId!;
    if (positions.has(id)) continue;
    const rect = el.getBoundingClientRect();
    positions.set(id, { x: rect.left + window.scrollX, y: rect.top + window.scrollY });
  }
  return positions;
}

/**
 * Moves every card from where it was in `before` to where it is now. The card
 * that was just reassigned (`movedId`) arcs over the others and lands with a
 * gold flash; cards that newly appear pop in.
 */
export function flyFromSnapshot(container: HTMLElement | null, before: Positions, movedId: string | null) {
  if (!BOARD_FX || !container) return;
  for (const el of cards(container)) {
    const id = el.dataset.flipId!;
    const rect = el.getBoundingClientRect();
    const prev = before.get(id);
    const isMoved = id === movedId;
    if (!prev) {
      if (isMoved) popIn(el);
      continue;
    }
    const dx = prev.x - (rect.left + window.scrollX);
    const dy = prev.y - (rect.top + window.scrollY);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    if (isMoved) {
      el.style.position = "relative";
      el.style.zIndex = "30";
      const lift = 40 + Math.min(100, Math.hypot(dx, dy) * 0.15);
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(1)`, filter: "brightness(1)" },
          { transform: `translate(${dx / 2}px, ${dy / 2 - lift}px) scale(1.15) rotate(-6deg)`, filter: "brightness(1.3)", offset: 0.5 },
          { transform: "translate(0, 0) scale(1)", filter: "brightness(1)" }
        ],
        { duration: 700, easing: "cubic-bezier(.45,0,.25,1)" }
      ).finished.then(() => {
        el.style.zIndex = "";
        el.style.position = "";
        glow(el);
      });
    } else {
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: 480,
        easing: "cubic-bezier(.2,.8,.2,1)"
      });
    }
  }
}

function popIn(el: HTMLElement) {
  el.animate(
    [
      { transform: "scale(0.5)", opacity: 0 },
      { transform: "scale(1.12)", opacity: 1, offset: 0.6 },
      { transform: "scale(1)", opacity: 1 }
    ],
    { duration: 520, easing: "cubic-bezier(.34,1.56,.64,1)" }
  ).finished.then(() => glow(el));
}

function glow(el: HTMLElement) {
  el.animate(
    [
      { filter: "drop-shadow(0 0 0 rgba(246,200,97,0))" },
      { filter: "drop-shadow(0 0 14px rgba(246,200,97,0.9))", offset: 0.3 },
      { filter: "drop-shadow(0 0 0 rgba(246,200,97,0))" }
    ],
    { duration: 800, easing: "ease-out" }
  );
}

/**
 * Brings every card on screen in one after another: "flip" turns them over
 * like cards being revealed, "deal" drops them in like a dealt hand.
 */
export function dealIn(container: HTMLElement | null, style: "flip" | "deal") {
  if (!BOARD_FX || !container) return;
  const visible = cards(container).filter(onScreen);
  const step = Math.min(55, 1100 / Math.max(visible.length, 1));
  visible.forEach((el, i) => {
    const keyframes =
      style === "flip"
        ? [
            { transform: "perspective(700px) rotateY(-90deg) scale(0.9)", opacity: 0, filter: "brightness(2)" },
            { transform: "perspective(700px) rotateY(12deg) scale(1.03)", opacity: 1, filter: "brightness(1.3)", offset: 0.65 },
            { transform: "perspective(700px) rotateY(0deg) scale(1)", opacity: 1, filter: "brightness(1)" }
          ]
        : [
            { transform: `translate(${(i % 2 ? 1 : -1) * 60}px, -120px) rotate(${(i % 2 ? 1 : -1) * 18}deg) scale(0.7)`, opacity: 0 },
            { transform: "translate(0, 6px) rotate(0deg) scale(1.02)", opacity: 1, offset: 0.75 },
            { transform: "none", opacity: 1 }
          ];
    el.animate(keyframes, {
      duration: style === "flip" ? 560 : 520,
      delay: i * step,
      easing: "cubic-bezier(.2,.8,.2,1)",
      fill: "backwards"
    });
  });
}

/** A gold "PUBLISHED" stamp that slams onto the middle of the container's visible area. */
export function stamp(container: HTMLElement | null, text: string, delay = 0) {
  if (!BOARD_FX || !container) return;
  const box = container.getBoundingClientRect();
  const top = Math.max(box.top, 0);
  const bottom = Math.min(box.bottom, window.innerHeight);
  const el = document.createElement("div");
  el.textContent = text;
  Object.assign(el.style, {
    position: "fixed",
    left: `${box.left + box.width / 2}px`,
    top: `${(top + bottom) / 2}px`,
    zIndex: "80",
    pointerEvents: "none",
    padding: "10px 26px",
    border: "4px solid #F6C861",
    borderRadius: "10px",
    color: "#F6C861",
    background: "rgba(13,15,20,0.78)",
    font: "700 clamp(28px, 6vw, 52px)/1 var(--font-display), system-ui, sans-serif",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    textShadow: "0 0 18px rgba(246,200,97,0.7)",
    boxShadow: "0 0 40px -6px rgba(246,200,97,0.7), inset 0 0 18px rgba(246,200,97,0.25)",
    opacity: "0"
  });
  document.body.appendChild(el);
  const base = "translate(-50%, -50%) rotate(-10deg)";
  el.animate(
    [
      { transform: `${base} scale(3)`, opacity: 0 },
      { transform: `${base} scale(0.92)`, opacity: 1, offset: 0.55 },
      { transform: `${base} scale(1.04)`, opacity: 1, offset: 0.75 },
      { transform: `${base} scale(1)`, opacity: 1, offset: 0.85 },
      { transform: `${base} scale(1)`, opacity: 1, offset: 0.95 },
      { transform: `${base} scale(1.1)`, opacity: 0 }
    ],
    { duration: 2000, delay, easing: "ease-out", fill: "forwards" }
  ).finished.then(() => el.remove());
  // The board shakes as the stamp hits.
  container.animate(
    [
      { transform: "none" },
      { transform: "translate(-4px, 3px)" },
      { transform: "translate(4px, -2px)" },
      { transform: "translate(-2px, 1px)" },
      { transform: "none" }
    ],
    { duration: 260, delay: delay + 1100, easing: "ease-out" }
  );
}
