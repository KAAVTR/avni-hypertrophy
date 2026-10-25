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

const squatSlot = Logic.clone(copy.days[0].slots[0]);
assert.strictEqual(squatSlot.exerciseName, "Barbell Squat (High Bar)");
assert.ok(squatSlot.sets.length > 0);
Logic.assignSlotExercise(squatSlot, "Hack Squat", "hack");
assert.strictEqual(squatSlot.exerciseName, "Hack Squat");
assert.strictEqual(squatSlot.sets.length, 0, "a different exercise drops the old targets");
squatSlot.sets = [{ weightTarget: 100, repsTarget: 8 }];
Logic.assignSlotExercise(squatSlot, "Hack Squat", "hack");
assert.strictEqual(squatSlot.sets.length, 1, "the same exercise keeps its targets");

const swapped = Logic.clone(copy);
swapped.days[0].slots[0].exerciseName = "Not a real quad lift";
Logic.autofillBoard(swapped, library.exercises, mesos, { replace: true, fillEmpty: false });
assert.notStrictEqual(swapped.days[0].slots[0].exerciseName, "Not a real quad lift");
assert.strictEqual(swapped.days[0].slots[0].sets.length, 0, "autofill replace clears leftover targets");

const live = Logic.clone(current);
Logic.suspendForNewMeso(live, "m-new", "2026-10-25T00:00:00.000Z");
const overlaySuspend = Logic.emptyOverlay();
overlaySuspend.mesoMeta[current.key] = {
  status: live.status,
  finishedAt: live.finishedAt,
  endedBy: live.endedBy,
  previousStatus: live.previousStatus,
  previousFinishedAt: live.previousFinishedAt
};
const suspended = Logic.materialize(seed, overlaySuspend);
const paused = Logic.findMeso(suspended, current.key);
assert.strictEqual(paused.status, "complete");
assert.strictEqual(paused.endedBy, "m-new");
assert.strictEqual(paused.previousStatus, "ready");
assert.strictEqual(Logic.isEditable(paused), false);
assert.strictEqual(Logic.historyRows(suspended).length, 705, "suspending a meso does not drop history");
assert.strictEqual(Logic.restoreSuspendedMeso(paused, "other"), false);
assert.strictEqual(paused.status, "complete");
assert.strictEqual(Logic.restoreSuspendedMeso(paused, "m-new"), true);
assert.strictEqual(paused.status, "ready");
assert.strictEqual(paused.finishedAt, null);
assert.strictEqual(paused.endedBy, null);
assert.strictEqual(Logic.isCurrent(paused), true);
Logic.reopenMesoRecord(paused);

function stubMeso(key, name) {
  return { key: key, name: name || key, status: "ready", finishedAt: null, endedBy: null, previousStatus: null, previousFinishedAt: null, local: true, weeks: [] };
}
function currentKeys(list) {
  return list.filter((m) => Logic.isCurrent(m)).map((m) => m.key);
}
const chainGoong = stubMeso("goong", "Keep it goong");
const chainA = stubMeso("A", "Chain A");
const chainB = stubMeso("B", "Chain B");
Logic.suspendForNewMeso(chainGoong, "A", "2026-10-25T00:00:00.000Z");
Logic.suspendForNewMeso(chainA, "B", "2026-10-25T00:01:00.000Z");
const chain = [chainGoong, chainA, chainB];
const droppedA = Logic.releaseOnDelete(chain, "A");
assert.strictEqual(droppedA.restored, null);
assert.strictEqual(chainGoong.endedBy, "B");
assert.strictEqual(Logic.isCurrent(chainGoong), false);
assert.deepStrictEqual(currentKeys(chain), ["B"]);
const alive = [chainGoong, chainB];
const droppedB = Logic.releaseOnDelete(alive, "B");
assert.strictEqual(droppedB.restored && droppedB.restored.key, "goong");
assert.deepStrictEqual(currentKeys(alive), ["goong"]);

const direct = [stubMeso("g"), stubMeso("a")];
Logic.suspendForNewMeso(direct[0], "a", "2026-10-25T00:00:00.000Z");
const droppedDirect = Logic.releaseOnDelete(direct, "a");
assert.strictEqual(droppedDirect.restored && droppedDirect.restored.key, "g");
assert.deepStrictEqual(currentKeys(direct), ["g"]);

const linked = [stubMeso("g2"), stubMeso("a2"), stubMeso("b2")];
Logic.suspendForNewMeso(linked[0], "a2", "2026-10-25T00:00:00.000Z");
Logic.suspendForNewMeso(linked[1], "b2", "2026-10-25T00:01:00.000Z");
const droppedCurrent = Logic.releaseOnDelete(linked, "b2");
assert.strictEqual(droppedCurrent.restored && droppedCurrent.restored.key, "a2");
assert.strictEqual(Logic.isCurrent(linked[0]), false);
assert.strictEqual(linked[0].endedBy, "a2");
assert.deepStrictEqual(currentKeys(linked), ["a2"]);
assert.strictEqual(Logic.isEditable(paused), true);

const olderCurrent = stubMeso("old", "Keep it goong");
olderCurrent.createdAt = "2026-09-14T14:31:18.416Z";
const newerCurrent = stubMeso("new", "Chain B");
newerCurrent.createdAt = "2026-10-25T18:00:00.000Z";
const finishedCurrent = stubMeso("done", "Finished");
finishedCurrent.status = "complete";
finishedCurrent.finishedAt = "2026-08-01T00:00:00.000Z";
const repaired = Logic.suspendExtras([olderCurrent, newerCurrent, finishedCurrent]);
assert.strictEqual(repaired.length, 1);
assert.strictEqual(repaired[0].key, "old");
assert.strictEqual(Logic.isCurrent(olderCurrent), false);
assert.strictEqual(olderCurrent.endedBy, "new");
assert.strictEqual(olderCurrent.status, "complete");
assert.strictEqual(Logic.isCurrent(newerCurrent), true);
assert.strictEqual(Logic.suspendExtras([newerCurrent]).length, 0);

const oldShape = Logic.emptyOverlay();
delete oldShape.board;
const mergedOld = Object.assign(Logic.emptyOverlay(), oldShape);
assert.strictEqual(mergedOld.board, null);
assert.strictEqual(Logic.materialize(seed, oldShape).length, 23);

console.log("logic tests ok", {
  mesos: mesos.length,
  history: rows.length,
  exercises: library.exercises.length,
  bodyweight: bw.entries.length,
  current: current.name,
  week: pos.week + 1,
  day: pos.day + 1
});
