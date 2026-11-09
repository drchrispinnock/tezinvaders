import type { Input } from "./sim";

/** Keyboard state. `start` is edge-triggered so one press starts exactly one game. */
export class Keyboard {
  private readonly down = new Set<string>();
  private startPressed = false;
  pauseToggled = false;

  constructor(target: HTMLElement) {
    target.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowRight", " ", "Enter"].includes(e.key)) e.preventDefault();
      if (!this.down.has(e.key)) {
        if (e.key === "Enter") this.startPressed = true;
        if (e.key === "p" || e.key === "P") this.pauseToggled = true;
      }
      this.down.add(e.key);
    });
    target.addEventListener("keyup", (e) => this.down.delete(e.key));
    window.addEventListener("blur", () => this.down.clear());
  }

  read(): Input {
    const start = this.startPressed;
    this.startPressed = false;
    return {
      left: this.down.has("ArrowLeft") || this.down.has("a") || this.down.has("A"),
      right: this.down.has("ArrowRight") || this.down.has("d") || this.down.has("D"),
      fire: this.down.has(" "),
      start,
    };
  }

  consumePause(): boolean {
    const p = this.pauseToggled;
    this.pauseToggled = false;
    return p;
  }
}
