// Roster add and remove animations. They run on throwaway copies of the card
// in an overlay, using the Web Animations API, so the real page is never in a
// half-animated state. Set ROSTER_FX to false to turn them all off.
import { useLayoutEffect, useRef, type RefObject } from "react";

export const ROSTER_FX = true;

const GOLD = "#F6C861";
const CRIMSON = "#F05A72";
const PANEL = "#20232C";

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function makeLayer(): HTMLElement {
  const layer = document.createElement("div");
  Object.assign(layer.style, { position: "fixed", inset: "0", zIndex: "80", pointerEvents: "none", overflow: "hidden" });
  document.body.appendChild(layer);
  return layer;
}

function place(el: HTMLElement, rect: { left: number; top: number; width: number; height: number }) {
  Object.assign(el.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0"
  });
}

/** A copy of an element that can be moved around freely. */
function copyOf(el: HTMLElement): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement;
  Object.assign(copy.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    margin: "0",
    maxHeight: "none",
    overflow: "hidden",
    transform: "none"
  });
  copy.removeAttribute("id");
  return copy;
}

/** The modal's dimmed backdrop, faded out after the real modal closes. */
function fadeBackdrop(layer: HTMLElement) {
  const backdrop = document.createElement("div");
  Object.assign(backdrop.style, { position: "fixed", inset: "0", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" });
  layer.appendChild(backdrop);
  backdrop
    .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: "ease-out", fill: "forwards" })
    .finished.then(() => backdrop.remove());
}

/** Small dots flying out from a point. */
function burst(layer: HTMLElement, x: number, y: number, color: string, count: number, spread: number, upward = 0) {
  for (let i = 0; i < count; i++) {
    const size = 4 + Math.random() * 5;
    const dot = document.createElement("div");
    Object.assign(dot.style, {
      position: "fixed",
      left: `${x - size / 2}px`,
      top: `${y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "50%",
      background: color,
      boxShadow: `0 0 8px ${color}`
    });
    layer.appendChild(dot);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const distance = spread * (0.55 + Math.random() * 0.6);
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - upward;
    dot
      .animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0 }
        ],
        { duration: 550 + Math.random() * 350, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" }
      )
      .finished.then(() => dot.remove());
  }
}

/** A gold ring that expands and fades around a rectangle. */
function ring(layer: HTMLElement, rect: DOMRect, color: string) {
  const el = document.createElement("div");
  place(el, rect);
  Object.assign(el.style, { borderRadius: "10px", border: `2px solid ${color}`, boxShadow: `0 0 18px ${color}` });
  layer.appendChild(el);
  el.animate(
    [
      { transform: "scale(1)", opacity: 1 },
      { transform: "scale(1.3)", opacity: 0 }
    ],
    { duration: 600, easing: "ease-out", fill: "forwards" }
  ).finished.then(() => el.remove());
}

/** True when the middle of the element is on screen and not scrolled out of a scrolling container. */
export function isShowing(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  if (rect.width === 0 || cy < 0 || cy > window.innerHeight || cx < 0 || cx > window.innerWidth) return false;
  for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    if (getComputedStyle(parent).overflowY === "visible") continue;
    const box = parent.getBoundingClientRect();
    if (cy < box.top || cy > box.bottom || cx < box.left || cx > box.right) return false;
  }
  return true;
}

const SHIELD_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${GOLD}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

/** "Added to roster" pill at the bottom of the screen, used when the new card is off screen. */
function makeRosterPill(layer: HTMLElement): { pill: HTMLElement; target: DOMRect } {
  const pill = document.createElement("div");
  pill.innerHTML = `<span data-target style="display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:rgba(246,200,97,0.14)">${SHIELD_SVG}</span><span>Added to roster</span><span data-plus style="color:${GOLD};font-weight:700">+1</span>`;
  Object.assign(pill.style, {
    position: "fixed",
    bottom: "28px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 18px 8px 8px",
    borderRadius: "999px",
    background: PANEL,
    border: "1px solid rgba(246,200,97,0.5)",
    boxShadow: "0 10px 30px -10px rgba(0,0,0,0.9), 0 0 24px -6px rgba(246,200,97,0.6)",
    color: "#EEF0F7",
    font: "600 14px var(--font-body), system-ui, sans-serif",
    whiteSpace: "nowrap"
  });
  layer.appendChild(pill);
  pill.style.left = `${(window.innerWidth - pill.offsetWidth) / 2}px`;
  const target = (pill.querySelector("[data-target]") as HTMLElement).getBoundingClientRect();
  (pill.querySelector("[data-plus]") as HTMLElement).style.opacity = "0";
  pill.animate(
    [
      { transform: "translateY(140%)", opacity: 0 },
      { transform: "translateY(0)", opacity: 1 }
    ],
    { duration: 380, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "forwards" }
  );
  return { pill, target };
}

/**
 * The add popup shrinks and flies into the new card in the roster grid, which
 * then pops in with a gold burst. If that card is off screen it flies into an
 * "Added to roster" pill instead. Call it just before closing the popup.
 */
export async function flyToRoster(popup: HTMLElement, championId: string): Promise<void> {
  if (!ROSTER_FX) return;
  const from = popup.getBoundingClientRect();
  const layer = makeLayer();
  fadeBackdrop(layer);
  const flyer = document.createElement("div");
  place(flyer, from);
  Object.assign(flyer.style, { borderRadius: "12px", overflow: "hidden", boxShadow: "0 0 30px -4px rgba(246,200,97,0.55)" });
  flyer.appendChild(copyOf(popup));
  layer.appendChild(flyer);

  // Wait for the roster to show the new card.
  let card: HTMLElement | null = null;
  for (let i = 0; i < 20 && !card; i++) {
    await nextFrame();
    card = document.querySelector<HTMLElement>(`[data-roster-champion="${CSS.escape(championId)}"]`);
  }
  const toCard = card && isShowing(card) ? card : null;
  let to: DOMRect;
  let pill: HTMLElement | null = null;
  if (toCard) {
    to = toCard.getBoundingClientRect();
    toCard.style.visibility = "hidden";
  } else {
    const made = makeRosterPill(layer);
    pill = made.pill;
    to = made.target;
  }

  const scale = Math.min(to.width / from.width, to.height / from.height);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const lift = 60 + Math.min(120, Math.abs(dx) * 0.25);
  const flight = flyer.animate(
    [
      { transform: "translate(0, 0) scale(1) rotate(0deg)", offset: 0 },
      { transform: "translate(0, 6px) scale(1.04) rotate(0deg)", offset: 0.14 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(${0.25 + scale}) rotate(-7deg)`, offset: 0.58 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0deg)`, offset: 1 }
    ],
    { duration: 820, easing: "cubic-bezier(.5,0,.2,1)", fill: "forwards" }
  );
  await flight.finished;
  flyer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" }).finished.then(() => flyer.remove());

  const cx = to.left + to.width / 2;
  const cy = to.top + to.height / 2;
  if (toCard) {
    toCard.style.visibility = "";
    toCard.animate(
      [
        { transform: "scale(0.7)", filter: "brightness(2.2)" },
        { transform: "scale(1.12)", filter: "brightness(1.4)", offset: 0.45 },
        { transform: "scale(1)", filter: "brightness(1)" }
      ],
      { duration: 560, easing: "cubic-bezier(.34,1.56,.64,1)" }
    );
    ring(layer, toCard.getBoundingClientRect(), GOLD);
    burst(layer, cx, cy, GOLD, 16, 90);
    await wait(950);
  } else if (pill) {
    burst(layer, cx, cy, GOLD, 12, 60);
    pill.animate([{ transform: "scale(1)" }, { transform: "scale(1.1)" }, { transform: "scale(1)" }], {
      duration: 380,
      easing: "cubic-bezier(.34,1.56,.64,1)",
      composite: "add"
    });
    (pill.querySelector("[data-plus]") as HTMLElement).animate(
      [
        { opacity: 0, transform: "translateY(8px) scale(0.6)" },
        { opacity: 1, transform: "translateY(0) scale(1.25)", offset: 0.6 },
        { opacity: 1, transform: "translateY(0) scale(1)" }
      ],
      { duration: 420, easing: "ease-out", fill: "forwards" }
    );
    await wait(1100);
    await pill.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(60%)" }], {
      duration: 300,
      easing: "ease-in",
      fill: "forwards"
    }).finished;
  }
  layer.remove();
}

// Clip shapes from a flat card to a crumpled ball; each has the same 8 points so they blend.
const CRUMPLE_STEPS = [
  "0% 0%, 50% 0%, 100% 0%, 100% 50%, 100% 100%, 50% 100%, 0% 100%, 0% 50%",
  "4% 3%, 48% 7%, 97% 1%, 92% 47%, 98% 97%, 53% 91%, 2% 99%, 7% 53%",
  "12% 10%, 53% 19%, 88% 6%, 79% 50%, 91% 90%, 46% 77%, 8% 92%, 21% 46%",
  "22% 20%, 50% 29%, 80% 15%, 71% 52%, 82% 82%, 51% 69%, 18% 84%, 31% 49%",
  "29% 27%, 52% 33%, 73% 25%, 69% 52%, 75% 75%, 48% 67%, 25% 77%, 33% 50%"
];

const TRASH_SVG = `<svg viewBox="0 0 64 76" width="100%" height="100%" fill="none" stroke="${CRIMSON}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="overflow:visible">
  <g data-lid>
    <rect x="24" y="5" width="16" height="8" rx="3" fill="${PANEL}"/>
    <rect x="5" y="12" width="54" height="8" rx="3" fill="${PANEL}"/>
  </g>
  <path d="M10 24h44l-4 44.5a5 5 0 0 1-5 4.5H19a5 5 0 0 1-5-4.5Z" fill="${PANEL}"/>
  <path d="M24 33v31M32 33v31M40 33v31" opacity="0.55"/>
</svg>`;

/**
 * Crumples a card into a ball and throws it into a trash can that rises from
 * the bottom of the screen. `card` is hidden for the duration; pass a roster
 * card (it disappears for good when it is removed from the roster) or a popup
 * that is about to close.
 */
export async function crumpleIntoTrash(card: HTMLElement): Promise<void> {
  if (!ROSTER_FX) return;
  const from = card.getBoundingClientRect();
  const layer = makeLayer();
  fadeBackdrop(layer);

  // The wrapper carries the throw; the copy inside it does the crumpling.
  const wrapper = document.createElement("div");
  place(wrapper, from);
  const copy = copyOf(card);
  const creases = document.createElement("div");
  Object.assign(creases.style, {
    position: "absolute",
    inset: "0",
    opacity: "0",
    background:
      "linear-gradient(118deg, transparent 30%, rgba(0,0,0,0.45) 32%, transparent 35%), linear-gradient(64deg, transparent 52%, rgba(255,255,255,0.18) 54%, transparent 57%), linear-gradient(160deg, transparent 62%, rgba(0,0,0,0.4) 64%, transparent 67%), radial-gradient(circle at 42% 40%, transparent 20%, rgba(0,0,0,0.55) 80%)"
  });
  copy.appendChild(creases);
  wrapper.appendChild(copy);
  layer.appendChild(wrapper);
  card.style.visibility = "hidden";

  const trash = document.createElement("div");
  const trashWidth = 72;
  const trashHeight = 86;
  place(trash, {
    left: window.innerWidth / 2 - trashWidth / 2,
    top: window.innerHeight - trashHeight - 28,
    width: trashWidth,
    height: trashHeight
  });
  Object.assign(trash.style, { filter: "drop-shadow(0 0 16px rgba(240,90,114,0.45))", transformOrigin: "50% 100%" });
  trash.innerHTML = TRASH_SVG;
  layer.appendChild(trash);
  const lid = trash.querySelector<SVGGElement>("[data-lid]")!;
  Object.assign(lid.style, { transformBox: "fill-box", transformOrigin: "100% 100%" });

  trash.animate(
    [
      { transform: "translateY(160%)", opacity: 0 },
      { transform: "translateY(0)", opacity: 1 }
    ],
    { duration: 420, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "forwards" }
  );

  const crumple = copy.animate(
    CRUMPLE_STEPS.map((shape, i) => ({
      clipPath: `polygon(${shape})`,
      transform: ["none", "rotate(-4deg) skewX(4deg)", "rotate(5deg) scale(0.9) skewY(-6deg)", "rotate(-8deg) scale(0.8) skewX(8deg)", "rotate(12deg) scale(0.72)"][i],
      filter: `brightness(${1 - i * 0.08}) saturate(${1 - i * 0.15})`
    })),
    { duration: 560, easing: "ease-in-out", fill: "forwards" }
  );
  creases.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 560, easing: "ease-in", fill: "forwards" });
  await wait(330);
  lid.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(-32deg)" }], {
    duration: 260,
    easing: "cubic-bezier(.34,1.56,.64,1)",
    fill: "forwards"
  });
  await crumple.finished;

  // The ball is the middle ~40% of the card after crumpling; size it to drop into the can.
  const mouthX = window.innerWidth / 2;
  const mouthY = window.innerHeight - trashHeight - 28 + 30;
  const ball = Math.min(from.width, from.height) * 0.4 * 0.72;
  const scale = Math.min(1, 34 / Math.max(ball, 1));
  const dx = mouthX - (from.left + from.width / 2);
  const dy = mouthY - (from.top + from.height / 2);
  const lift = 80 + Math.min(140, Math.abs(dy) * 0.2);
  const toss = wrapper.animate(
    [
      { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(${(1 + scale) / 2}) rotate(220deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy - 8}px) scale(${scale}) rotate(400deg)`, opacity: 1, offset: 0.88 },
      { transform: `translate(${dx}px, ${dy + 14}px) scale(${scale * 0.8}) rotate(430deg)`, opacity: 0 }
    ],
    { duration: 620, easing: "cubic-bezier(.45,0,.55,1)", fill: "forwards" }
  );
  await toss.finished;
  wrapper.remove();

  lid.animate([{ transform: "rotate(-32deg)" }, { transform: "rotate(0deg)" }], { duration: 160, easing: "ease-in", fill: "forwards" });
  trash.animate(
    [
      { transform: "rotate(0deg) scale(1)" },
      { transform: "rotate(-9deg) scale(1.06, 0.94)" },
      { transform: "rotate(7deg) scale(0.98, 1.03)" },
      { transform: "rotate(-4deg)" },
      { transform: "rotate(2deg)" },
      { transform: "rotate(0deg) scale(1)" }
    ],
    { duration: 480, easing: "ease-out", composite: "add" }
  );
  burst(layer, mouthX, mouthY - 6, "#A3A9C2", 12, 46, 30);
  burst(layer, mouthX, mouthY - 6, CRIMSON, 6, 36, 24);
  await wait(650);
  await trash.animate(
    [
      { transform: "translateY(0)", opacity: 1 },
      { transform: "translateY(150%)", opacity: 0 }
    ],
    { duration: 340, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" }
  ).finished;
  layer.remove();
}

/**
 * Slides the children of a grid from their old spots to their new ones whenever
 * `key` changes, so cards glide into gaps instead of jumping. Children need a
 * `data-flip-id`.
 */
export function useFlipChildren(ref: RefObject<HTMLElement>, key: unknown) {
  const last = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const container = ref.current;
    const next = new Map<string, { x: number; y: number }>();
    if (!container) {
      last.current = next;
      return;
    }
    const box = container.getBoundingClientRect();
    container.querySelectorAll<HTMLElement>(":scope > [data-flip-id]").forEach((child) => {
      const rect = child.getBoundingClientRect();
      // Measured relative to the container so page or container scrolling doesn't count as movement.
      const pos = { x: rect.left - box.left + container.scrollLeft, y: rect.top - box.top + container.scrollTop };
      const id = child.dataset.flipId!;
      next.set(id, pos);
      const prev = last.current.get(id);
      if (ROSTER_FX && prev && (prev.x !== pos.x || prev.y !== pos.y)) {
        child.animate(
          [{ transform: `translate(${prev.x - pos.x}px, ${prev.y - pos.y}px)` }, { transform: "none" }],
          { duration: 450, easing: "cubic-bezier(.2,.8,.2,1)" }
        );
      }
    });
    last.current = next;
  }, [ref, key]);
}
