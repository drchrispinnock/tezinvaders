import { describe, expect, it } from "vitest";
import { verifierReason } from "./verifier";

describe("verifierReason", () => {
  it("maps the verifier's refusals to fixed labels and never echoes its text", () => {
    expect(verifierReason("the replay scored 730, not 780", 422)).toBe("the verifier replayed the game and got a different score");
    expect(verifierReason('bad input log near "<img src=x>"', 422)).toBe("the verifier could not read the game recording");
    expect(verifierReason("<b>anything</b>", 500)).toBe("the verifier answered 500");
    expect(verifierReason(undefined, 413)).toBe("the game recording is too large");
  });
});
