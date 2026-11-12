// Touch controls for phones and tablets: an on-screen strip of left / right / fire buttons
// (index.html, shown only for coarse pointers) plus the canvas itself, where a tap starts a
// game, a finger held down fires and steers the ship toward it, and a two-finger tap pauses.
// Everything resolves to the same Input the keyboard produces, so touch games record, replay
// and attest exactly like keyboard ones.

import { WIDTH, type Input } from "./sim";

/** Dead zone, in logical pixels, inside which a steering target counts as reached. */
const STEER_DEAD_ZONE = 4;
/** A press that moves less than this (CSS pixels) is a tap. */
const TAP_SLOP = 12;

/** Left/right to move `playerX` toward `targetX`, or neither when it is close enough. */
export function steer(playerX: number, targetX: number | null): { left: boolean; right: boolean } {
  if (targetX === null) return { left: false, right: false };
  const d = targetX - playerX;
  return { left: d < -STEER_DEAD_ZONE, right: d > STEER_DEAD_ZONE };
}

export class Touch {
  private readonly held = new Set<string>();
  private target: number | null = null;
  private firing = false;
  private startPressed = false;
  private pauseToggled = false;
  private readonly pointers = new Map<number, { x: number; y: number; moved: boolean }>();

  constructor(private readonly canvas: HTMLCanvasElement, strip: HTMLElement | null) {
    strip?.querySelectorAll<HTMLElement>("[data-touch]").forEach((el) => {
      const key = el.dataset.touch!;
      const down = (e: PointerEvent) => { e.preventDefault(); el.setPointerCapture(e.pointerId); this.held.add(key); };
      const up = () => this.held.delete(key);
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("lostpointercapture", up);
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: false });
      if (this.pointers.size === 2) { this.pauseToggled = true; return; }
      this.firing = true;
      this.target = this.logicalX(e.clientX);
    });
    canvas.addEventListener("pointermove", (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (Math.abs(e.clientX - p.x) > TAP_SLOP || Math.abs(e.clientY - p.y) > TAP_SLOP) p.moved = true;
      if (this.pointers.size === 1) this.target = this.logicalX(e.clientX);
    });
    const end = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) {
        if (!p.moved) this.startPressed = true;   // a tap: start / continue (ignored while playing)
        this.firing = false;
        this.target = null;
      }
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
  }

  private logicalX(clientX: number): number {
    const r = this.canvas.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * WIDTH;
  }

  /** This tick's touch input; `playerX` is the ship's current position for drag steering. */
  read(playerX: number): Input {
    const start = this.startPressed;
    this.startPressed = false;
    const s = steer(playerX, this.target);
    return {
      left: this.held.has("left") || s.left,
      right: this.held.has("right") || s.right,
      fire: this.held.has("fire") || this.firing,
      start,
    };
  }

  consumePause(): boolean {
    const p = this.pauseToggled;
    this.pauseToggled = false;
    return p;
  }
}
