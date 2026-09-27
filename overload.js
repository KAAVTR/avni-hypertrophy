/* Personal load/rep coach.
   High- and medium-confidence rules only: week RIR ladders, a small weekly
   load bump or +1 rep, and a lighter deload. Not an RP Strength product.
   Pump, soreness, and workload do not change set counts here — that mapping
   is not published. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Overload = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var WEEK_RIR = {
    4: [2, 1, 0, 8],
    5: [2, 1, 0, 0, 8],
    6: [3, 2, 2, 1, 0, 8],
    8: [3, 3, 2, 2, 1, 1, 0, 8]
  };

  /* One 6-week meso in the export used this ladder. The default is WEEK_RIR[6]. */
  var WEEK_RIR_ALT = {
    6: [3, 2, 1, 0, 0, 8]
  };

  var LOAD_BUMP = 1.0225;
  var FEW_PERCENT = 0.035;
  var SMALLEST_STEP_MAX = 0.05;
  var BAND_MIN = 0.875;
  var BAND_MAX = 1.125;
  var DELOAD_BAND_MAX = 1.1;
  var DELOAD_EARLY = 0.9;
  var DELOAD_LATE = 0.5;
  var LB_BAR = 2.5;
  var LB_DUMBBELL = 5;

  function weekRirSchedule(weeks) {
    var n = Number(weeks);
    if (!WEEK_RIR[n]) return null;
    return WEEK_RIR[n].slice();
  }

  function roundTo(value, increment) {
    if (increment == null || increment <= 0) return Math.round(value * 1000) / 1000;
    var steps = Math.round(value / increment);
    return Math.round(steps * increment * 1000) / 1000;
  }

  function mean(nums) {
    var sum = 0;
    for (var i = 0; i < nums.length; i++) sum += nums[i];
    return sum / nums.length;
  }

  function normName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function isDumbbell(equipment) {
    return String(equipment || "").toLowerCase().indexOf("dumbbell") !== -1;
  }

  function equipmentIncrement(equipment, unit) {
    if (unit && String(unit).toLowerCase() !== "lb") return null;
    return isDumbbell(equipment) ? LB_DUMBBELL : LB_BAR;
  }

  function optionalDeloadSkip(muscleGroupId) {
    var id = Number(muscleGroupId);
    return id === 10 || id === 11;
  }

  function workingSets(sets) {
    var out = [];
    (sets || []).forEach(function (set) {
      if (!set || set.status === "skipped") return;
      if (set.reps == null || Number(set.reps) < 0) return;
      if (set.weight == null || set.weight === "" || Number.isNaN(Number(set.weight))) return;
      out.push({
        weight: Number(set.weight),
        reps: Number(set.reps),
        repsTarget: set.repsTarget == null || set.repsTarget === "" ? null : Number(set.repsTarget)
      });
    });
    return out;
  }

  function pctLabel(from, to) {
    if (!from) return "";
    var pct = ((to - from) / from) * 100;
    var rounded = Math.round(pct * 10) / 10;
    var body = Math.abs(rounded).toFixed(1);
    return (rounded > 0 ? "+" : rounded < 0 ? "−" : "") + body + "%";
  }

  function emptyRec() {
    return { weight: null, reps: null, bandMin: null, bandMax: null, reason: "no_history", sets: null, phase: null, pctLabel: "", dumbbell: false };
  }

  function withBand(weight, reps, reason, extra) {
    var deload = reason === "deload";
    var rec = {
      weight: weight,
      reps: reps,
      bandMin: Math.round(weight * BAND_MIN * 1000) / 1000,
      bandMax: Math.round(weight * (deload ? DELOAD_BAND_MAX : BAND_MAX) * 1000) / 1000,
      reason: reason,
      sets: extra.sets == null ? null : extra.sets,
      phase: extra.phase || null,
      pctLabel: extra.pctLabel || "",
      dumbbell: !!extra.dumbbell,
      targetRir: extra.targetRir == null ? null : extra.targetRir
    };
    return rec;
  }

  function recommendDeload(lastSets, equipmentIncrement, opts) {
    var sets = workingSets(lastSets);
    var week1Weight = opts.week1Weight != null ? Number(opts.week1Weight) : (sets.length ? mean(sets.map(function (s) { return s.weight; })) : null);
    var week1Reps = opts.week1Reps != null ? Number(opts.week1Reps) : (sets.length ? sets[0].reps : null);
    var week1Sets = opts.week1Sets != null ? Number(opts.week1Sets) : sets.length;
    if (week1Weight == null || !week1Weight || week1Reps == null) return emptyRec();
    var days = Number(opts.daysPerWeek) || 1;
    var dayIndex = Number(opts.dayIndex) || 0;
    var early = dayIndex < Math.ceil(days / 2);
    var factor = early ? DELOAD_EARLY : DELOAD_LATE;
    var raw = week1Weight * factor;
    var weight = equipmentIncrement ? roundTo(raw, equipmentIncrement) : Math.round(raw * 1000) / 1000;
    if (weight <= 0) return emptyRec();
    var reps = Math.max(1, Math.round(0.5 * week1Reps));
    var setCount = Math.max(1, Math.ceil(0.5 * (week1Sets || 1)));
    return withBand(weight, reps, "deload", {
      sets: setCount,
      phase: early ? "early" : "late",
      dumbbell: isDumbbell(opts.equipment),
      targetRir: 8
    });
  }

  function recommendAccumulation(lastSets, equipmentIncrement, weekRir, opts) {
    var sets = workingSets(lastSets);
    if (!sets.length) return emptyRec();
    var weights = sets.map(function (s) { return s.weight; });
    var w = mean(weights);
    if (!w || w <= 0) return emptyRec();
    var rFirst = sets[0].reps;
    var rAchieved = mean(sets.map(function (s) { return s.reps; }));
    var dumbbell = isDumbbell(opts.equipment);
    if (!equipmentIncrement || equipmentIncrement <= 0) {
      var idealOpen = Math.round(w * LOAD_BUMP * 1000) / 1000;
      return withBand(idealOpen, Math.max(1, Math.round(rAchieved)), "weight_up", {
        pctLabel: pctLabel(w, idealOpen),
        dumbbell: dumbbell,
        targetRir: weekRir
      });
    }
    var ideal = w * LOAD_BUMP;
    var plate = roundTo(ideal, equipmentIncrement);
    if (plate <= w) plate = roundTo(w + equipmentIncrement, equipmentIncrement);
    var jump = (plate - w) / w;
    var oneStep = roundTo(w + equipmentIncrement, equipmentIncrement);
    var smallest = Math.abs(plate - oneStep) < 1e-6;
    if (jump <= FEW_PERCENT || (smallest && jump <= SMALLEST_STEP_MAX)) {
      return withBand(plate, Math.max(1, Math.round(rAchieved)), "weight_up", {
        pctLabel: pctLabel(w, plate),
        dumbbell: dumbbell,
        targetRir: weekRir
      });
    }
    return withBand(w, Math.max(1, Math.round(rFirst) + 1), "reps_up", {
      dumbbell: dumbbell,
      targetRir: weekRir
    });
  }

  function nextSessionRecommend(lastSets, equipmentIncrement, weekRir, opts) {
    opts = opts || {};
    var rir = Number(weekRir);
    if (rir === 8 || opts.deload) return recommendDeload(lastSets, equipmentIncrement, opts);
    return recommendAccumulation(lastSets, equipmentIncrement, rir, opts);
  }

  function coachPhrase(rec) {
    if (!rec || rec.reason === "no_history") return "";
    if (rec.reason === "weight_up") return (rec.pctLabel || "") + " from last week";
    if (rec.reason === "reps_up") {
      return rec.dumbbell ? "same weight +1 rep — DB jump too big" : "same weight +1 rep — next jump too big";
    }
    if (rec.reason === "deload") {
      return rec.phase === "late" ? "deload ~50% W1 later days" : "deload ~90% W1 early days";
    }
    return "";
  }

  function labelSetOverload(loggedReps, targetReps) {
    if (targetReps == null || loggedReps == null) return null;
    var logged = Number(loggedReps);
    var target = Number(targetReps);
    if (Number.isNaN(logged) || Number.isNaN(target)) return null;
    if (logged >= target) return "increase";
    if (logged >= target - 1) return "maintain";
    return "decrease";
  }

  function findPriorLogged(meso, exerciseName, weekIndex, dayIndex) {
    var needle = normName(exerciseName);
    if (!meso || !needle) return null;
    for (var w = weekIndex - 1; w >= 0; w--) {
      var week = meso.weeks[w];
      if (!week) continue;
      var same = null;
      var any = null;
      (week.days || []).forEach(function (day, di) {
        (day.exercises || []).forEach(function (ex) {
          if (normName(ex.name) !== needle) return;
          var sets = workingSets(ex.sets);
          if (!sets.length) return;
          var hit = { sets: sets, weekIndex: w, dayIndex: di };
          if (di === dayIndex) same = hit;
          else if (!any) any = hit;
        });
      });
      if (same) return same;
      if (any) return any;
    }
    return null;
  }

  function weekOneReference(meso, exerciseName, dayIndex) {
    var needle = normName(exerciseName);
    var week = meso && meso.weeks && meso.weeks[0];
    var found = null;
    if (week) {
      (week.days || []).forEach(function (day, di) {
        (day.exercises || []).forEach(function (ex) {
          if (normName(ex.name) !== needle) return;
          var sets = workingSets(ex.sets);
          if (!sets.length) return;
          if (di === dayIndex || !found) found = { sets: sets, dayIndex: di };
        });
      });
    }
    if (!found) return { sets: [], weight: null, reps: null, count: 0, dayIndex: null };
    return {
      sets: found.sets,
      weight: mean(found.sets.map(function (s) { return s.weight; })),
      reps: found.sets[0].reps,
      count: found.sets.length,
      dayIndex: found.dayIndex
    };
  }

  return {
    WEEK_RIR: WEEK_RIR,
    WEEK_RIR_ALT: WEEK_RIR_ALT,
    weekRirSchedule: weekRirSchedule,
    roundTo: roundTo,
    equipmentIncrement: equipmentIncrement,
    optionalDeloadSkip: optionalDeloadSkip,
    workingSets: workingSets,
    nextSessionRecommend: nextSessionRecommend,
    coachPhrase: coachPhrase,
    labelSetOverload: labelSetOverload,
    findPriorLogged: findPriorLogged,
    weekOneReference: weekOneReference
  };
});
