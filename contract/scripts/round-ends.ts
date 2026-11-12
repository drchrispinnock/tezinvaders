// Prints a contract's round_ends (storage field 5, 0-based index 4 of the comb) as RFC 3339,
// reading the storage JSON from the RPC on stdin. The RPC may give the comb nested or flat.
//   curl …/context/contracts/KT1…/storage | node contract/scripts/round-ends.ts
interface Node { prim?: string; args?: Node[]; string?: string; int?: string }
const flat = (n: Node): Node[] => n.prim === "Pair" && n.args ? n.args.flatMap((a, i) => (i === n.args!.length - 1 ? flat(a) : [a])) : [n];
let text = "";
process.stdin.on("data", (d) => (text += d)).on("end", () => {
  const field = flat(JSON.parse(text) as Node)[4];
  if (!field) { console.error("no round_ends in storage"); process.exit(1); }
  console.log(field.string ?? new Date(Number(field.int) * 1000).toISOString().replace(/\.\d+Z/, "Z"));
});
