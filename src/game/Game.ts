import { Sound } from "./audio";
import { Keyboard } from "./input";
import { Renderer } from "./render";
import { Sim, type GameEvent, type Input } from "./sim";
import { Touch } from "./touch";

const TICK_MS = 1000 / 60;

/** Fixed-timestep loop gluing the simulation, renderer and keyboard together. */
export class Game {
  readonly sim = new Sim();
  private readonly renderer: Renderer;
  private readonly keys: Keyboard;
  private readonly touch: Touch;
  private readonly sound = new Sound();
  private acc = 0;
  private last = 0;
  private paused = false;
  hiScore = 0;
  staked = false;
  /** Whether a running game is paused (P, a two-finger tap, or the tab going to the background). */
  get isPaused(): boolean { return this.paused; }
  /** Playing on Tezos X: the renderer marks the ꜩ with an X. */
  set layer2(on: boolean) { this.renderer.layer2 = on; }

  constructor(canvas: HTMLCanvasElement, private readonly onEvent: (e: GameEvent) => void) {
    this.renderer = new Renderer(canvas);
    this.keys = new Keyboard(canvas);
    this.touch = new Touch(canvas, document.querySelector(".touch"));
    canvas.addEventListener("keydown", (e) => {
      this.sound.unlock(); // browsers only start audio after a gesture
      if (e.key === "m" || e.key === "M") this.sound.toggleMute();
    });
    for (const el of [canvas, document.querySelector(".touch")]) el?.addEventListener("pointerdown", () => this.sound.unlock());
    // Leaving the tab (or the phone locking) pauses a running game rather than letting it play on blind.
    document.addEventListener("visibilitychange", () => { if (document.hidden && this.sim.phase === "playing") this.paused = true; });
    canvas.focus();
    requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number): void {
    if (this.last === 0) this.last = now;
    this.acc += Math.min(250, now - this.last);
    this.last = now;

    const pauseToggled = this.keys.consumePause();
    if ((this.touch.consumePause() || pauseToggled) && this.sim.phase === "playing") this.paused = !this.paused;

    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      const k = this.keys.read(), t = this.touch.read(this.sim.playerX);
      const input: Input = { left: k.left || t.left, right: k.right || t.right, fire: k.fire || t.fire, start: k.start || t.start };
      if (!this.paused) this.sim.step(input);
      for (const e of this.sim.events.splice(0)) {
        if (e.type === "gameover") this.hiScore = Math.max(this.hiScore, e.score);
        this.play(e);
        this.onEvent(e);
      }
    }
    this.sound.setSaucer(this.sim.phase === "playing" && this.sim.bank !== null && !this.paused);
    this.renderer.draw(this.sim, this.hiScore, this.staked, this.sound.muted);
    requestAnimationFrame((t) => this.frame(t));
  }

  private play(e: GameEvent): void {
    switch (e.type) {
      case "shoot": this.sound.shoot(); break;
      case "step": this.sound.step(); break;
      case "kill": this.sound.kill(); break;
      case "bank": this.sound.bank(); break;
      case "hit": this.sound.hit(); break;
      case "wave": this.sound.wave(); break;
      case "life": this.sound.life(); break;
      case "gameover": this.sound.gameover(); break;
      default: break;
    }
  }
}
