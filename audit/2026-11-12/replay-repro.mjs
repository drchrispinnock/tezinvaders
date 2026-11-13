import { Sim, replay, encodeLog, encodeInput } from '../../src/game/sim.ts';
import { attest } from '../../verifier/attest.ts';

// Only the public throwaway key from verifier/attest.test.ts is used.
const SK = 'edsk3QoqBuvdamxouPhin7swCvkQNgq4jP5KZPbwWNnwdZpSpJiEbq';
const suffix = Array.from({length: 20000}, (_, t) => {
  const phase = Math.floor(t / 90) % 4;
  return encodeInput({left: phase === 1, right: phase === 3, fire: t % 7 === 0, start: false});
});
const log = [...Array(20000).fill(0), 8, ...suffix];
for (let i = 0; i < 3; i++) {
  const sim = replay(4242, log);
  console.log(JSON.stringify({test: 'same log and outer seed', outerSeed: 4242, finalSeed: sim.seed, phase: sim.phase, score: sim.score}));
}
const req = {chainId:'NetXynUjJNZm7wi', contract:'KT1Ef9JmLVJNxbm8rezpAJ8cxX78V3yLFMSs', player:'tz1hr6Dvx4i686RFishFTWPeby949bjrV9KF', round:1, seed:4242, score:760, log:encodeLog(log)};
const histogram = {};
let accepted = false;
for (let i = 1; i <= 100; i++) {
  try {
    const a = await attest(SK, req);
    console.log(JSON.stringify({test:'real signing path accepts multi-game replay', attempts:i, score:a.score, proofPrefix:a.proof.slice(0,5)}));
    accepted = true;
    break;
  } catch(e) {
    histogram[e.message] = (histogram[e.message] || 0) + 1;
  }
}
console.log(JSON.stringify({accepted, histogram}));
// A single, normally recorded game is reproducible, in contrast to the restarted recording.
const control = new Sim(); control.startGame(4242);
for (const code of suffix) control.step({left: !!(code & 1), right: !!(code & 2), fire: !!(code & 4), start:false});
console.log(JSON.stringify({test:'single-game control', seed:control.seed, phase:control.phase, score:control.score}));

if (!accepted) throw new Error("No matching random replay in 100 tries; rerun the probabilistic reproduction");
