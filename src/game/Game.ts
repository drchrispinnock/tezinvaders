import { Sound } from "./audio";
import { Keyboard } from "./input";
import { Renderer } from "./render";
import { Sim, type GameEvent } from "./sim";

const TICK_MS = 1000 / 60;

/** Fixed-timestep loop gluing the simulation, renderer and keyboard together. */
export class Game {
  readonly sim = new Sim();
  private readonly renderer: Renderer;
  private readonly keys: Keyboard;
  private readonly sound = new Sound();
  private acc = 0;
  private last = 0;
  private paused = false;
  hiScore = 0;
  staked = false;

  constructor(canvas: HTMLCanvasElement, private readonly onEvent: (e: GameEvent) => void) {
    this.renderer = new Renderer(canvas);
    this.keys = new Keyboard(canvas);
    canvas.addEventListener("keydown", (e) => {
      this.sound.unlock(); // browsers only start audio after a gesture
      if (e.key === "m" || e.key === "M") this.sound.toggleMute();
    });
    canvas.focus();
    requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number): void {
    if (this.last === 0) this.last = now;
    this.acc += Math.min(250, now - this.last);
    this.last = now;

    if (this.keys.consumePause() && this.sim.phase === "playing") this.paused = !this.paused;

    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      const input = this.keys.read();
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
      case "gameover": this.sound.gameover(); break;
      default: break;
    }
  }
}
