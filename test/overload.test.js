const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Logic = require("../logic.js");
const Overload = require("../overload.js");

function near(actual, expected, tol, label) {
  assert.ok(Math.abs(actual - expected) <= tol, (label || "value") + " " + actual + " vs " + expected + " (tol " + tol + ")");
}

assert.deepStrictEqual(Overload.weekRirSchedule(4), [2, 1, 0, 8]);
assert.deepStrictEqual(Overload.weekRirSchedule(5), [2, 1, 0, 0, 8]);
assert.deepStrictEqual(Overload.weekRirSchedule(6), [3, 2, 2, 1, 0, 8]);
assert.deepStrictEqual(Overload.WEEK_RIR_ALT[6], [3, 2, 1, 0, 0, 8]);
assert.deepStrictEqual(Overload.weekRirSchedule(8), [3, 3, 2, 2, 1, 1, 0, 8]);
assert.strictEqual(Overload.weekRirSchedule(7), null);
[4, 5, 6, 8].forEach((n) => assert.strictEqual(Overload.weekRirSchedule(n).slice(-1)[0], 8));

const root = path.join(__dirname, "..");
const seed = JSON.parse(fs.readFileSync(path.join(root, "data/official/rp-training-data.json"), "utf8"));
const mesos = Logic.materialize(seed, Logic.emptyOverlay());
const goong = mesos.find((m) => m.name === "Keep it goong");
const neo = mesos.find((m) => m.name === "New meso plan" && m.createdAt && m.createdAt.indexOf("2026-08-17") === 0);
assert.ok(goong && neo, "example mesos");

function logged(meso, week, day, name) {
  const ex = meso.weeks[week].days[day].exercises.find((e) => e.name === name);
  assert.ok(ex, name + " W" + (week + 1) + " D" + (day + 1));
  return Overload.workingSets(ex.sets);
}

function rec(sets, inc, rir, opts) {
  return Overload.nextSessionRecommend(sets, inc, rir, opts || {});
}

/* 1) Barbell squat — New meso plan. +5 lb steps, reps held. */
const squatW1 = logged(neo, 0, 0, "Barbell Squat (High Bar)");
const squatW2rec = rec(squatW1, 2.5, 1, { equipment: "Barbell" });
assert.strictEqual(squatW2rec.reason, "weight_up");
assert.strictEqual(squatW2rec.weight, 210);
assert.strictEqual(squatW2rec.reps, 5);
near(squatW2rec.bandMin, 210 * 0.875, 0.01, "squat band min");

const squatW2 = logged(neo, 1, 0, "Barbell Squat (High Bar)");
const squatW3rec = rec(squatW2, 2.5, 0, { equipment: "Barbell" });
assert.strictEqual(squatW3rec.weight, 215);
assert.strictEqual(squatW3rec.reps, 5);
assert.strictEqual(squatW3rec.reason, "weight_up");

/* 2) Dumbbell flye — same weight, +1 rep. 5 lb jump is too big. */
const flyW1 = logged(goong, 0, 1, "Dumbbell Flye (Flat)");
const flyW2rec = rec(flyW1, 5, 1, { equipment: "Dumbbell" });
assert.strictEqual(flyW2rec.reason, "reps_up");
assert.strictEqual(flyW2rec.weight, 50);
assert.strictEqual(flyW2rec.reps, 16);
assert.strictEqual(Overload.coachPhrase(flyW2rec), "same weight +1 rep — DB jump too big");

const flyW2 = logged(goong, 1, 1, "Dumbbell Flye (Flat)");
const flyW3rec = rec(flyW2, 5, 0, { equipment: "Dumbbell" });
assert.strictEqual(flyW3rec.weight, 50);
assert.strictEqual(flyW3rec.reps, 19);
assert.strictEqual(flyW3rec.reason, "reps_up");

/* Lateral raise — same pattern, +1 target rep. */
const latW1 = logged(goong, 0, 1, "Dumbbell Lateral Raise (Super ROM)");
const latW2rec = rec(latW1, 5, 1, { equipment: "Dumbbell" });
assert.strictEqual(latW2rec.weight, 30);
assert.strictEqual(latW2rec.reps, 10);
assert.strictEqual(latW2rec.reason, "reps_up");

/* 3) Pulldown — weight up, then a miss retargets reps to what was logged. */
const pullW1 = logged(goong, 0, 2, "Pulldown (Normal Grip)");
const pullW2rec = rec(pullW1, 2.5, 1, { equipment: "Cable" });
assert.strictEqual(pullW2rec.reason, "weight_up");
assert.strictEqual(pullW2rec.weight, 122.5);
near(pullW2rec.reps, 9, 1, "pulldown reps near export 9 / achieved 10");
assert.ok(pullW2rec.pctLabel.indexOf("2.") === 1 || pullW2rec.pctLabel.indexOf("+2.") === 0);

const pullW2 = logged(goong, 1, 2, "Pulldown (Normal Grip)");
const pullW3rec = rec(pullW2, 2.5, 0, { equipment: "Cable" });
assert.strictEqual(pullW3rec.weight, 127.5);
assert.strictEqual(pullW3rec.reps, 6);
assert.strictEqual(pullW3rec.reason, "weight_up");
assert.strictEqual(Overload.labelSetOverload(6, 9), "decrease");

/* Lying leg curl — the "+2.3% from last week" wording. */
const curlW1 = logged(goong, 0, 0, "Lying Leg Curl");
const curlW2rec = rec(curlW1, 2.5, 1, { equipment: "Machine" });
assert.strictEqual(curlW2rec.weight, 112.5);
assert.strictEqual(curlW2rec.reps, 10);
assert.strictEqual(Overload.coachPhrase(curlW2rec), "+2.3% from last week");

const curlW2 = logged(goong, 1, 0, "Lying Leg Curl");
const curlW3rec = rec(curlW2, 2.5, 0, { equipment: "Machine" });
assert.strictEqual(curlW3rec.weight, 115);
assert.strictEqual(curlW3rec.reps, 12);

/* Today on Keep it goong is week 3. Squat last week was 225×5 → 230×5. */
const priorSquat = Overload.findPriorLogged(goong, "Barbell Squat (High Bar)", 2, 0);
assert.ok(priorSquat);
const todaySquat = rec(priorSquat.sets, 2.5, 0, { equipment: "Barbell" });
assert.strictEqual(todaySquat.weight, 230);
assert.strictEqual(todaySquat.reps, 5);
assert.strictEqual(todaySquat.reason, "weight_up");

/* Deload. Early calf ~90% → 62.5. Late deadlift ~50% of 315, within one plate of 160. */
const calfW1 = logged(neo, 0, 0, "Calf Machine");
const calfDl = rec(calfW1, 2.5, 8, { dayIndex: 0, daysPerWeek: 5, equipment: "Machine" });
assert.strictEqual(calfDl.reason, "deload");
assert.strictEqual(calfDl.phase, "early");
assert.strictEqual(calfDl.weight, 62.5);
assert.strictEqual(Overload.coachPhrase(calfDl), "deload ~90% W1 early days");
assert.ok(calfDl.sets >= 1 && calfDl.sets <= 2);

const deadW1 = logged(neo, 0, 3, "Deadlift");
const deadDl = rec(deadW1, 2.5, 8, { dayIndex: 3, daysPerWeek: 5, equipment: "Barbell" });
assert.strictEqual(deadDl.phase, "late");
near(deadDl.weight, 160, 2.5, "late deadlift deload");
assert.strictEqual(Overload.coachPhrase(deadDl), "deload ~50% W1 later days");
assert.ok(deadDl.weight < 315 * 0.6);

/* Early squat deload is ~90% of week-1 205, rounded to 2.5 lb. */
const squatDl = rec(squatW1, 2.5, 8, { dayIndex: 0, daysPerWeek: 5, equipment: "Barbell" });
assert.strictEqual(squatDl.phase, "early");
near(squatDl.weight, 0.9 * 205, 2.5, "early squat deload");
assert.ok(squatDl.weight < 205);

assert.strictEqual(Overload.labelSetOverload(10, 7), "increase");
assert.strictEqual(Overload.labelSetOverload(8, 9), "maintain");
assert.strictEqual(Overload.labelSetOverload(6, 9), "decrease");
assert.strictEqual(Overload.labelSetOverload(5, null), null);
assert.strictEqual(rec([], 2.5, 1).reason, "no_history");

assert.strictEqual(Overload.optionalDeloadSkip(10), true);
assert.strictEqual(Overload.optionalDeloadSkip(11), true);
assert.strictEqual(Overload.optionalDeloadSkip(6), false);
assert.strictEqual(Overload.equipmentIncrement("Dumbbell", "lb"), 5);
assert.strictEqual(Overload.equipmentIncrement("Barbell", "lb"), 2.5);
assert.strictEqual(Overload.equipmentIncrement("Cable", "lb"), 2.5);
assert.strictEqual(Overload.equipmentIncrement("Barbell", "kg"), null);

const w1ref = Overload.weekOneReference(goong, "Barbell Squat (High Bar)", 0);
assert.strictEqual(w1ref.weight, 205);
assert.strictEqual(w1ref.reps, 8);

/* Same effort when she changes the weight on a set. Epley + week RIR. */
const same = Overload.adjustRepsForWeight({ lastWeight: 230, lastReps: 5, newWeight: 230, weekRir: 0, equipmentStep: 2.5 });
assert.strictEqual(same.reps, 5);
assert.strictEqual(same.direction, "same");
assert.strictEqual(same.tip, "");

const lighter = Overload.adjustRepsForWeight({ lastWeight: 230, lastReps: 5, newWeight: 200, weekRir: 0, equipmentStep: 2.5 });
assert.strictEqual(lighter.reps, 10);
assert.strictEqual(lighter.direction, "up");
assert.strictEqual(lighter.tip, "weight ↓ → reps ↑");

const heavier = Overload.adjustRepsForWeight({ lastWeight: 230, lastReps: 5, newWeight: 250, weekRir: 0, equipmentStep: 2.5 });
assert.strictEqual(heavier.reps, 2);
assert.strictEqual(heavier.direction, "down");
assert.strictEqual(heavier.tip, "weight ↑ → reps ↓");

const onePlate = Overload.adjustRepsForWeight({ lastWeight: 230, lastReps: 5, newWeight: 232.5, weekRir: 0, equipmentStep: 2.5 });
assert.strictEqual(onePlate.reps, 5, "a ~1% plate step is under one rep");

const back = Overload.adjustRepsForWeight({ lastWeight: 200, lastReps: lighter.reps, newWeight: 230, weekRir: 0, equipmentStep: 2.5 });
assert.strictEqual(back.reps, 5, "the curve is invertible within rounding");

const weekRir2 = Overload.adjustRepsForWeight({ lastWeight: 205, lastReps: 5, newWeight: 185, weekRir: 2, equipmentStep: 2.5 });
assert.strictEqual(weekRir2.reps, 9);
assert.strictEqual(weekRir2.tip, "weight ↓ → reps ↑");

const typing = Overload.adjustRepsForWeight({ lastWeight: 230, lastReps: 5, newWeight: 2, weekRir: 0, equipmentStep: 2.5 });
assert.strictEqual(typing.ignored, true);

console.log("overload tests ok", {
  squat: squatW2rec.weight + "x" + squatW2rec.reps + " → " + squatW3rec.weight + "x" + squatW3rec.reps,
  flye: flyW2rec.weight + "x" + flyW2rec.reps + " → " + flyW3rec.weight + "x" + flyW3rec.reps,
  pulldown: pullW2rec.weight + "x" + pullW2rec.reps + " → " + pullW3rec.weight + "x" + pullW3rec.reps,
  curl: Overload.coachPhrase(curlW2rec),
  todaySquat: todaySquat.weight + "x" + todaySquat.reps + " " + Overload.coachPhrase(todaySquat),
  deloadCalf: calfDl.weight + " " + Overload.coachPhrase(calfDl),
  deloadDead: deadDl.weight + " " + Overload.coachPhrase(deadDl)
});
