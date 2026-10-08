/**
 * Unit tests for utils/pointsSlabPolicy.js — no DB, no connection.
 *   node utils/__pointsSlabPolicy.test.mjs
 */
import {
  slugSchemeCode,
  validateSlabReward,
  validateAndNormalizeSlabs
} from "./pointsSlabPolicy.js";

let passed = 0;
let failed = 0;

const ok = (label, cond, detail = "") => {
  if (cond) {
    passed++;
    console.log(`  ok  ${label}${detail ? ` :: ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ""}`);
  }
};
const eq = (label, actual, expected) =>
  ok(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);

console.log("\n--- slugSchemeCode ---");
eq("uppercases", slugSchemeCode("oct24-buy10"), "OCT24-BUY10");
eq("strips spaces and punctuation", slugSchemeCode(" buy 10 get 1 free "), "BUY10GET1FREE");
eq("keeps dashes", slugSchemeCode("A-B-C"), "A-B-C");
eq("caps at 40 chars", slugSchemeCode("X".repeat(60)).length, 40);
eq("handles null", slugSchemeCode(null), "");
eq("handles undefined", slugSchemeCode(undefined), "");

console.log("\n--- validateSlabReward ---");
ok("points-only reward is valid", validateSlabReward({ points: 10 }) === null);
ok("extraQuantity-only reward is valid", validateSlabReward({ extraQuantity: 1 }) === null);
ok("discount-only reward is valid", validateSlabReward({ discountPercentage: 5 }) === null);
ok("cashback-only reward is valid", validateSlabReward({ cashbackAmount: 500 }) === null);
ok("empty reward is rejected", validateSlabReward({}) !== null);
ok("negative points rejected", validateSlabReward({ points: -1 }) !== null);
ok("discount over 100 rejected", validateSlabReward({ discountPercentage: 101 }) !== null);
ok("discount exactly 100 accepted", validateSlabReward({ discountPercentage: 100 }) === null);
ok("mixed reward accepted", validateSlabReward({ points: 5, extraQuantity: 1 }) === null);

console.log("\n--- validateAndNormalizeSlabs: happy paths ---");
{
  const r = validateAndNormalizeSlabs([
    { from: 10, to: null, label: "10+", reward: { points: 100 } }
  ]);
  ok("single open-ended slab valid", r.valid, r.error);
  eq("seq renumbered to 1", r.slabs[0].seq, 1);
  eq("null `to` preserved", r.slabs[0].to, null);
}
{
  const r = validateAndNormalizeSlabs([
    { from: 5, to: 9, reward: { points: 50 } },
    { from: 10, to: null, reward: { points: 100 } }
  ]);
  ok("two-tier ladder valid", r.valid, r.error);
  eq("two slabs returned", r.slabs.length, 2);
  eq("seq 1 and 2", r.slabs.map((s) => s.seq), [1, 2]);
}
{
  // Unsorted input must come back ordered, since "highest qualifying" depends on it.
  const r = validateAndNormalizeSlabs([
    { from: 50, to: null, reward: { points: 500 } },
    { from: 1, to: 9, reward: { points: 10 } },
    { from: 10, to: 49, reward: { points: 100 } }
  ]);
  ok("unsorted ladder sorted ascending", r.valid, r.error);
  eq("from values ascending", r.slabs.map((s) => s.from), [1, 10, 50]);
  eq("seq follows the sort", r.slabs.map((s) => s.seq), [1, 2, 3]);
}
{
  // Adjacent, gap-free edges are legal: 1-9 then 10-19.
  const r = validateAndNormalizeSlabs([
    { from: 1, to: 9, reward: { points: 10 } },
    { from: 10, to: 19, reward: { points: 20 } }
  ]);
  ok("adjacent non-overlapping ranges accepted", r.valid, r.error);
}
{
  const r = validateAndNormalizeSlabs([
    { from: 10, to: null, reward: { points: 100 }, label: "  " }
  ]);
  eq("blank label auto-generated", r.slabs[0].label, "10+");
}
{
  const r = validateAndNormalizeSlabs([
    { from: 5, to: 9, reward: { points: 50 }, label: "" }
  ]);
  eq("blank label with a range auto-generated", r.slabs[0].label, "5-9");
}
{
  const r = validateAndNormalizeSlabs([
    { from: "10", to: "", reward: { points: "100" } }
  ]);
  ok("string numerics coerced", r.valid, r.error);
  eq("from coerced to number", r.slabs[0].from, 10);
  eq("blank `to` becomes null", r.slabs[0].to, null);
  eq("points coerced to number", r.slabs[0].reward.points, 100);
}

console.log("\n--- validateAndNormalizeSlabs: rejections ---");
ok("empty array rejected", !validateAndNormalizeSlabs([]).valid);
ok("non-array rejected", !validateAndNormalizeSlabs(null).valid);
ok("missing `from` rejected", !validateAndNormalizeSlabs([{ to: 9, reward: { points: 1 } }]).valid);
ok("negative `from` rejected", !validateAndNormalizeSlabs([{ from: -1, reward: { points: 1 } }]).valid);
ok(
  "`to` below `from` rejected",
  !validateAndNormalizeSlabs([{ from: 10, to: 5, reward: { points: 1 } }]).valid
);
{
  const r = validateAndNormalizeSlabs([{ from: 10, to: 5, reward: { points: 1 } }]);
  ok("`to` below `from` explains itself", r.error.includes("cannot be less than"), r.error);
}
ok("slab without reward rejected", !validateAndNormalizeSlabs([{ from: 10, to: null }]).valid);
{
  // The important one: 5-15 and 10-20 both claim 10..15.
  const r = validateAndNormalizeSlabs([
    { from: 5, to: 15, reward: { points: 50 } },
    { from: 10, to: 20, reward: { points: 100 } }
  ]);
  ok("overlapping slabs rejected", !r.valid);
  ok("overlap error names the ranges", r.error.includes("overlap"), r.error);
}
{
  const r = validateAndNormalizeSlabs([
    { from: 10, to: null, reward: { points: 100 } },
    { from: 20, to: null, reward: { points: 200 } }
  ]);
  ok("two open-ended slabs rejected", !r.valid, r.error);
  ok("two open-ended error says only one allowed", r.error.includes("Only one slab"), r.error);
}
{
  // Sorted ascending this becomes tier 1 = 1-9, tier 2 = 50+. Values 1-9 hit
  // tier 1 and 50+ hits tier 2, so nothing is unreachable — this is legal.
  const r = validateAndNormalizeSlabs([
    { from: 50, to: null, reward: { points: 500 } },
    { from: 1, to: 9, reward: { points: 10 } }
  ]);
  ok("open-ended above a bounded tier is legal once sorted", r.valid, r.error);
  eq("sorted into a reachable ladder", r.slabs.map((s) => s.from), [1, 50]);
}
{
  // Here the open-ended tier starts at 1 and the bounded tier at 5-9, so the
  // bounded tier is swallowed — every value >= 5 already matches the open tier.
  const r = validateAndNormalizeSlabs([
    { from: 1, to: null, reward: { points: 10 } },
    { from: 5, to: 9, reward: { points: 50 } }
  ]);
  ok("open-ended tier shadowing a bounded tier is rejected", !r.valid, r.error);
  ok(
    "shadowing error explains the unreachable tier",
    (r.error || "").includes("never be reached"),
    r.error
  );
}
{
  const many = Array.from({ length: 30 }, (_, i) => ({
    from: i * 100,
    to: i * 100 + 99,
    reward: { points: 1 }
  }));
  ok("more than 25 slabs rejected", !validateAndNormalizeSlabs(many).valid);
}

console.log("\n--- normalisation never mutates input ---");
{
  const input = [{ from: 10, to: null, reward: { points: 100 }, label: "" }];
  const snapshot = JSON.stringify(input);
  validateAndNormalizeSlabs(input);
  eq("input untouched", JSON.stringify(input), snapshot);
}

console.log(`\n================ ${passed} passed, ${failed} failed ================\n`);
process.exit(failed === 0 ? 0 : 1);
