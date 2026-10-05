const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Logic = require("../logic.js");

const root = path.join(__dirname, "..");
const seed = JSON.parse(fs.readFileSync(path.join(root, "data/official/rp-training-data.json"), "utf8"));
const library = JSON.parse(fs.readFileSync(path.join(root, "data/exercise-library.json"), "utf8"));
const templates = JSON.parse(fs.readFileSync(path.join(root, "data/templates.json"), "utf8"));
const bw = JSON.parse(fs.readFileSync(path.join(root, "data/bodyweight-log.json"), "utf8"));
const settings = JSON.parse(fs.readFileSync(path.join(root, "data/settings-profile.json"), "utf8"));

assert.strictEqual(seed.length, 23, "meso count");
assert.strictEqual(library.exercises.length, 305, "exercise count");
assert.strictEqual(bw.entries.length, 22, "bodyweight count");
assert.ok(!settings.profile.email, "email stripped");
assert.ok(!JSON.stringify(settings).includes("@"), "no email-like text");

const mesos = Logic.materialize(seed, Logic.emptyOverlay());
assert.strictEqual(mesos.length, 23);
const rows = Logic.historyRows(mesos);
assert.strictEqual(rows.length, 705, "history count");
const counts = Logic.historyCounts(rows);
assert.strictEqual(counts.complete, 310);
assert.strictEqual(counts.skipped, 371);
assert.strictEqual(counts.partial, 14);
assert.strictEqual(counts.pending, 7);
assert.strictEqual(counts.ready, 3);

const current = Logic.currentMeso(mesos);
assert.strictEqual(current.name, "Keep it goong");
const pos = Logic.currentPosition(current);
assert.deepStrictEqual(pos, { week: 2, day: 0 });
assert.strictEqual(Logic.weekRir(current, 0), 2);
assert.strictEqual(Logic.weekRir(current, 2), 0);
assert.strictEqual(Logic.weekRir(current, 3), 8);
assert.strictEqual(Logic.deloadLocked(current), true);

const squat = Logic.lastLoggedSet(mesos, "Barbell Squat (High Bar)");
assert.ok(squat && squat.weight != null && squat.reps != null, "last squat comes from logs");

const hist = Logic.exerciseHistory(mesos, "Barbell Squat (High Bar)");
assert.ok(hist.length > 0);

const custom = templates.custom_templates[0];
assert.strictEqual(custom.name, "2026 Plan");
const board = Logic.boardFromTemplate(custom);
assert.strictEqual(board.days.length, 6);
assert.strictEqual(board.days[0].slots[0].exerciseName, "Cable Cross Body Lateral Raise");
assert.strictEqual(Logic.boardIssues(board).length, 0);
assert.ok(Logic.boardIssues(Logic.blankBoard()).length > 0);

const copy = Logic.boardFromMesoWeek(current, 0);
assert.strictEqual(copy.days.length, 5);
assert.strictEqual(copy.days[0].slots[0].exerciseName, "Barbell Squat (High Bar)");
const summary = Logic.slotSummary(copy.days[0].slots[0]);
assert.ok(summary.sets >= 1);
assert.ok(summary.weight != null);

const built = Logic.builderBoard(5, { emphasize: [1, 2, 5, 6], grow: [], maintain: [] }, "Monday");
assert.strictEqual(built.days.length, 5);
const slotCount = built.days.reduce((n, d) => n + d.slots.length, 0);
assert.strictEqual(slotCount, 16, "4 emphasize muscles × 2 days × 2 exercises");
built.days.forEach((d) => assert.ok(d.slots.length > 0));

const filled = Logic.clone(built);
Logic.autofillBoard(filled, library.exercises, mesos, { fillEmpty: true });
const named = filled.days.reduce((n, d) => n + d.slots.filter((s) => s.exerciseName).length, 0);
assert.strictEqual(named, slotCount, "autofill uses the library");

const created = Logic.createMeso({
  name: "Test meso",
  weeks: 4,
  unit: "lb",
  board: copy,
  now: "2026-09-27T00:00:00.000Z"
});
assert.strictEqual(created.weeks.length, 4);
assert.strictEqual(created.weeks[0].days[0].exercises[0].sets.length, copy.days[0].slots[0].sets.length);
assert.strictEqual(created.weeks[0].days[0].exercises[0].sets[0].reps, null);
assert.strictEqual(created.weeks[0].days[0].status, "ready");
assert.strictEqual(created.weeks[1].days[0].exercises[0].sets.length, 0);
assert.strictEqual(created.weeks[1].days[0].status, "pending");
assert.deepStrictEqual(created.weekRir, [2, 1, 0, 8]);
assert.strictEqual(created.local, true);

const overlay = Logic.emptyOverlay();
overlay.mesoMeta[current.key] = Logic.endMesoRecord(current, "2026-09-27T00:00:00.000Z");
overlay.newMesos.push(created);
const next = Logic.materialize(seed, overlay);
assert.strictEqual(next.length, 24);
assert.strictEqual(Logic.currentMeso(next).name, "Test meso");
assert.strictEqual(Logic.findMeso(next, current.key).status, "complete");
assert.ok(Logic.historyRows(next).length > 705);

const day = Logic.clone(current.weeks[2].days[0]);
day.exercises[0].sets[0].reps = 6;
day.exercises[0].sets[0].status = "complete";
Logic.refreshDayStatus(day, { now: "2026-09-27T00:00:00.000Z" });
assert.strictEqual(day.status, "partial");

const merged = Logic.mergeBodyweight(bw.entries, [{ date: "2026-09-27", bodyweight: 194, unit: "lb" }]);
assert.strictEqual(merged.length, 23);
assert.strictEqual(merged[merged.length - 1].bodyweight, 194);

const replacedDay = Logic.clone(current.weeks[2].days[0]);
const squatCard = replacedDay.exercises[0];
const extensionCard = Logic.clone(replacedDay.exercises[1]);
assert.strictEqual(squatCard.name, "Barbell Squat (High Bar)");
assert.strictEqual(squatCard.sets[0].repsTarget, 5);
assert.strictEqual(squatCard.sets[0].weightTarget, 230);
assert.strictEqual(squatCard.sets[2].repsTarget, null);
const keptId = squatCard.sets[0].id;
const keptType = squatCard.sets[0].setType;
const keptUnit = squatCard.sets[0].unit;
squatCard.sets[0].progressiveOverload = "increase";
squatCard.sets[0].reps = 5;
squatCard.sets[0].status = "complete";
Logic.clearReplacedSetTargets(squatCard);
squatCard.sets.forEach((set) => {
  assert.strictEqual(set.weight, null);
  assert.strictEqual(set.weightTarget, null);
  assert.strictEqual(set.weightTargetMin, null);
  assert.strictEqual(set.weightTargetMax, null);
  assert.strictEqual(set.reps, null);
  assert.strictEqual(set.repsTarget, null);
  assert.strictEqual(set.progressiveOverload, null);
  assert.strictEqual(set.status, "ready");
  assert.strictEqual(set.finishedAt, null);
});
assert.strictEqual(squatCard.sets.length, 3);
assert.strictEqual(squatCard.sets[0].id, keptId);
assert.strictEqual(squatCard.sets[0].setType, keptType);
assert.strictEqual(squatCard.sets[0].unit, keptUnit);
assert.deepStrictEqual(replacedDay.exercises[1], extensionCard);
assert.strictEqual(Logic.weekRir(current, 2), 0);

const kgBoard = Logic.stripTargets(copy);
const kgMeso = Logic.createMeso({ name: "Kg", weeks: 5, unit: "kg", board: kgBoard, now: "2026-09-27T00:00:00.000Z" });
assert.strictEqual(kgMeso.weeks[0].days[0].exercises[0].sets.length, 0, "unit change does not invent converted weights");
assert.deepStrictEqual(kgMeso.weekRir, [2, 1, 0, 0, 8]);

console.log("logic tests ok", {
  mesos: mesos.length,
  history: rows.length,
  exercises: library.exercises.length,
  bodyweight: bw.entries.length,
  current: current.name,
  week: pos.week + 1,
  day: pos.day + 1
});
