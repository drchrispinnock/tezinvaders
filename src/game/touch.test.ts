import { describe, expect, it } from "vitest";
import { steer } from "./touch";

describe("touch steering", () => {
  it("moves toward the finger and stops inside the dead zone", () => {
    expect(steer(280, null)).toEqual({ left: false, right: false });
    expect(steer(280, 400)).toEqual({ left: false, right: true });
    expect(steer(280, 100)).toEqual({ left: true, right: false });
    expect(steer(280, 283)).toEqual({ left: false, right: false });
    expect(steer(280, 277)).toEqual({ left: false, right: false });
  });
});
