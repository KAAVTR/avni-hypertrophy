/* Personal training log helpers. Numbers come from the export or from what you type. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Logic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var MUSCLES = {
    1: "Chest",
    2: "Back",
    3: "Triceps",
    4: "Biceps",
    5: "Shoulders",
    6: "Quads",
    7: "Glutes",
    8: "Hamstrings",
    9: "Calves",
    10: "Traps",
    11: "Forearms",
    12: "Abs"
  };

  var MUSCLE_ID = {};
  Object.keys(MUSCLES).forEach(function (id) {
    MUSCLE_ID[MUSCLES[id]] = Number(id);
  });

  var CATEGORIES = [
    { name: "Upper push", ids: [1, 3, 5] },
    { name: "Upper pull", ids: [2, 4] },
    { name: "Legs", ids: [6, 7, 8] },
    { name: "Accessory", ids: [9, 10, 11, 12] }
  ];

  var WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  var EQUIPMENT_TYPES = [
    "Barbell",
    "Dumbbell",
    "Machine",
    "Cable",
    "Smith machine",
    "Bodyweight",
    "Bodyweight loadable",
    "Freemotion",
    "Machine assistance"
  ];

  var RIR_BY_WEEKS = {
    4: [2, 1, 0, 8],
    5: [2, 1, 0, 0, 8],
    6: [3, 2, 2, 1, 0, 8],
    7: [3, 2, 2, 1, 1, 0, 8],
    8: [3, 3, 2, 2, 1, 1, 0, 8]
  };

  function clone(obj) {
    if (typeof structuredClone === "function") return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
  }

  function emptyOverlay() {
    return {
      version: 1,
      mesoMeta: {},
      days: {},
      deleted: {},
      newMesos: [],
      pristine: {},
      bodyweights: [],
      customExercises: [],
      customTemplates: [],
      settings: { autoMatch: true, usePreferred: false, preferredTypes: [] }
    };
  }

  function normName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function muscleTone(id) {
    var n = Number(id);
    if (n === 1 || n === 3 || n === 5) return "push";
    if (n === 2 || n === 4) return "pull";
    if (n === 6 || n === 7 || n === 8) return "legs";
    return "acc";
  }

  function isCurrent(meso) {
    if (!meso || meso.deleted) return false;
    if (meso.finishedAt) return false;
    return meso.status === "ready" || meso.status === "current";
  }

  function isEditable(meso) {
    return isCurrent(meso);
  }

  function decodeRir(microRirs, weekCount) {
    var s = String(microRirs == null ? "" : microRirs);
    if (!s) return [];
    var arr = s.split("").map(function (ch) { return Number(ch); });
    if (weekCount && arr.length !== weekCount && RIR_BY_WEEKS[weekCount]) return RIR_BY_WEEKS[weekCount].slice();
    return arr;
  }

  function weekRirList(meso) {
    if (meso.weekRir && meso.weekRir.length) return meso.weekRir;
    return decodeRir(meso.microRirs, meso.weeks.length);
  }

  function weekRir(meso, weekIndex) {
    var list = weekRirList(meso);
    return list[weekIndex];
  }

  function isDeloadWeek(meso, weekIndex) {
    var rir = weekRir(meso, weekIndex);
    return rir === 8 || weekIndex === meso.weeks.length - 1;
  }

  function encodeRir(arr) {
    return Number(arr.join(""));
  }

  function rirForWeeks(n) {
    return (RIR_BY_WEEKS[n] || RIR_BY_WEEKS[4]).slice();
  }

  function materialize(seed, overlay) {
    var ov = overlay || emptyOverlay();
    var mesos = [];
    (seed || []).forEach(function (meso) {
      if (ov.deleted && ov.deleted[meso.key]) return;
      var copy = clone(meso);
      var meta = ov.mesoMeta && ov.mesoMeta[meso.key];
      if (meta) {
        if (meta.name != null) copy.name = meta.name;
        if (meta.status != null) copy.status = meta.status;
        if (meta.finishedAt !== undefined) copy.finishedAt = meta.finishedAt;
        if (meta.notes) copy.notes = clone(meta.notes);
        if (meta.generatedFrom) copy.generatedFrom = meta.generatedFrom;
      }
      copy.weeks.forEach(function (week) {
        week.days.forEach(function (day, i) {
          if (ov.days && ov.days[day.id]) week.days[i] = clone(ov.days[day.id]);
        });
      });
      mesos.push(copy);
    });
    (ov.newMesos || []).forEach(function (meso) {
      if (ov.deleted && ov.deleted[meso.key]) return;
      mesos.push(clone(meso));
    });
    mesos.sort(function (a, b) {
      var ac = isCurrent(a) ? 1 : 0;
      var bc = isCurrent(b) ? 1 : 0;
      if (ac !== bc) return bc - ac;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    return mesos;
  }

  function historyRows(mesos) {
    var rows = [];
    (mesos || []).forEach(function (meso) {
      meso.weeks.forEach(function (week, wi) {
        week.days.forEach(function (day, di) {
          var sets = [];
          var muscles = [];
          var seen = {};
          (day.exercises || []).forEach(function (ex) {
            var label = MUSCLES[ex.muscleGroupId];
            if (label && !seen[label]) {
              seen[label] = true;
              muscles.push(label);
            }
            (ex.sets || []).forEach(function (set) { sets.push(set); });
          });
          var logged = sets.filter(function (s) { return s.status === "complete"; }).length;
          rows.push({
            date: day.finishedAt || null,
            meso: meso.name,
            mesoKey: meso.key,
            week: wi + 1,
            day: di + 1,
            label: day.label || "",
            status: day.status || "pending",
            exercises: (day.exercises || []).length,
            setsLogged: logged,
            setsTotal: sets.length,
            muscles: muscles,
            dayId: day.id
          });
        });
      });
    });
    rows.sort(function (a, b) {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return 0;
    });
    return rows;
  }

  function historyCounts(rows) {
    var out = { complete: 0, skipped: 0, partial: 0, pending: 0, ready: 0 };
    rows.forEach(function (row) {
      if (out[row.status] == null) out[row.status] = 0;
      out[row.status] += 1;
    });
    return out;
  }

  function currentMeso(mesos) {
    for (var i = 0; i < mesos.length; i++) if (isCurrent(mesos[i])) return mesos[i];
    return mesos[0] || null;
  }

  function currentPosition(meso) {
    if (!meso || !meso.weeks.length) return { week: 0, day: 0 };
    var active = 0;
    var w, d, st, i;
    for (w = 0; w < meso.weeks.length; w++) {
      var started = meso.weeks[w].days.some(function (day) {
        return day.status === "complete" || day.status === "skipped" || day.status === "partial" || day.status === "ready";
      });
      if (started) active = w;
    }
    var days = meso.weeks[active].days;
    var prefer = ["partial", "ready", "pending"];
    for (i = 0; i < prefer.length; i++) {
      for (d = 0; d < days.length; d++) {
        if (days[d].status === prefer[i]) return { week: active, day: d };
      }
    }
    for (w = active; w < meso.weeks.length; w++) {
      for (d = 0; d < meso.weeks[w].days.length; d++) {
        st = meso.weeks[w].days[d].status;
        if (st !== "complete" && st !== "skipped") return { week: w, day: d };
      }
    }
    var lastW = meso.weeks.length - 1;
    return { week: lastW, day: Math.max(0, meso.weeks[lastW].days.length - 1) };
  }

  function deloadLocked(meso) {
    var last = meso.weeks.length - 1;
    for (var w = 0; w < last; w++) {
      for (var d = 0; d < meso.weeks[w].days.length; d++) {
        var st = meso.weeks[w].days[d].status;
        if (st === "ready" || st === "pending" || st === "partial") return true;
      }
    }
    return false;
  }

  function findMeso(mesos, key) {
    for (var i = 0; i < mesos.length; i++) if (mesos[i].key === key) return mesos[i];
    return null;
  }

  function locateDay(mesos, key, weekIndex, dayIndex) {
    var meso = findMeso(mesos, key);
    if (!meso || !meso.weeks[weekIndex]) return null;
    var day = meso.weeks[weekIndex].days[dayIndex];
    if (!day) return null;
    return { meso: meso, day: day, weekIndex: weekIndex, dayIndex: dayIndex };
  }

  function lastLoggedSet(mesos, exerciseName) {
    var needle = normName(exerciseName);
    if (!needle) return null;
    var best = null;
    (mesos || []).forEach(function (meso) {
      meso.weeks.forEach(function (week, wi) {
        week.days.forEach(function (day, di) {
          (day.exercises || []).forEach(function (ex) {
            if (normName(ex.name) !== needle) return;
            (ex.sets || []).forEach(function (set) {
              if (set.status !== "complete") return;
              if (set.reps == null || set.reps < 0) return;
              var t = set.finishedAt || day.finishedAt || "";
              if (!best || t > best.t) {
                best = {
                  t: t,
                  weight: set.weight,
                  reps: set.reps,
                  unit: set.unit || meso.unit || "lb",
                  meso: meso.name,
                  week: wi + 1,
                  day: di + 1,
                  date: t
                };
              }
            });
          });
        });
      });
    });
    return best;
  }

  function exerciseHistory(mesos, exerciseName, exerciseId) {
    var needle = normName(exerciseName);
    var rows = [];
    (mesos || []).forEach(function (meso) {
      meso.weeks.forEach(function (week, wi) {
        week.days.forEach(function (day, di) {
          (day.exercises || []).forEach(function (ex) {
            var nameMatch = needle && normName(ex.name) === needle;
            var idMatch = exerciseId != null && ex.exerciseId != null && String(ex.exerciseId) === String(exerciseId);
            if (!nameMatch && !idMatch) return;
            if (!ex.sets || !ex.sets.length) return;
            rows.push({
              date: day.finishedAt,
              meso: meso.name,
              mesoKey: meso.key,
              week: wi + 1,
              day: di + 1,
              label: day.label || "",
              status: ex.status,
              unit: meso.unit || "lb",
              sets: ex.sets.map(function (s) {
                return {
                  weight: s.weight,
                  reps: s.reps,
                  status: s.status,
                  setType: s.setType,
                  repsTarget: s.repsTarget
                };
              })
            });
          });
        });
      });
    });
    rows.sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
    return rows;
  }

  function uid(prefix) {
    return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }

  function defaultDayLabels(n, start) {
    var i = WEEKDAYS.indexOf(start || "Monday");
    if (i < 0) i = 0;
    var out = [];
    for (var k = 0; k < n; k++) out.push(WEEKDAYS[(i + k) % 7]);
    return out;
  }

  function blankSlot(muscleGroupId, priority) {
    return {
      muscleGroupId: muscleGroupId,
      priority: priority || "grow",
      exerciseName: null,
      exerciseId: null,
      sets: []
    };
  }

  function blankBoard() {
    return {
      title: "New workout plan",
      subtitle: "Start from scratch",
      sourceLabel: "Start from scratch",
      targetsIncluded: false,
      sameUnits: true,
      days: [
        { label: "Monday", slots: [] },
        { label: "Tuesday", slots: [] }
      ]
    };
  }

  function boardFromTemplate(tpl) {
    var keys = Object.keys(tpl.days || {});
    var labels = defaultDayLabels(keys.length || tpl.days_per_week || 2, "Monday");
    return {
      title: tpl.name,
      subtitle: "Custom template",
      sourceLabel: tpl.name,
      targetsIncluded: false,
      sameUnits: true,
      days: keys.map(function (key, i) {
        return {
          label: labels[i] || "",
          slots: (tpl.days[key] || []).map(function (item) {
            return {
              muscleGroupId: MUSCLE_ID[item.muscle] || null,
              priority: "grow",
              exerciseName: item.exercise,
              exerciseId: null,
              sets: []
            };
          })
        };
      })
    };
  }

  function blankDaysBoard(n, name) {
    var labels = defaultDayLabels(n, "Monday");
    return {
      title: name || "New workout plan",
      subtitle: "Blank board",
      sourceLabel: name || "Blank",
      targetsIncluded: false,
      sameUnits: true,
      days: labels.map(function (label) { return { label: label, slots: [] }; })
    };
  }

  function copySetsFromDay(day) {
    return (day.exercises || []).map(function (ex) {
      return {
        muscleGroupId: ex.muscleGroupId,
        priority: null,
        exerciseName: ex.name,
        exerciseId: ex.exerciseId,
        sets: (ex.sets || []).filter(function (s) { return s.status !== "skipped" || s.weightTarget != null || s.repsTarget != null; }).map(function (s) {
          return {
            setType: s.setType || "regular",
            weight: s.weightTarget != null ? s.weightTarget : s.weight,
            weightTarget: s.weightTarget != null ? s.weightTarget : (s.status === "complete" ? s.weight : s.weight),
            weightTargetMin: s.weightTargetMin,
            weightTargetMax: s.weightTargetMax,
            repsTarget: s.repsTarget,
            reps: s.status === "complete" && s.reps != null && s.reps >= 0 ? s.reps : null
          };
        })
      };
    });
  }

  function boardFromMesoWeek(meso, weekIndex) {
    var week = meso.weeks[weekIndex];
    var title = meso.name + " (copy)";
    return {
      title: title,
      subtitle: meso.name,
      sourceLabel: meso.name,
      targetsIncluded: true,
      sourceUnit: meso.unit || "lb",
      sameUnits: true,
      days: week.days.map(function (day) {
        var slots = (day.exercises || []).map(function (ex) {
          var copied = copySetsFromDay({ exercises: [ex] })[0];
          return copied;
        });
        return { label: day.label || "", slots: slots };
      })
    };
  }

  function stripTargets(board) {
    var copy = clone(board);
    copy.targetsIncluded = false;
    copy.sameUnits = false;
    copy.days.forEach(function (day) {
      day.slots.forEach(function (slot) { slot.sets = []; });
    });
    return copy;
  }

  function pickSpreadDays(loads, n) {
    var picked = [];
    var i, s, best, bestScore, load, dist, score;
    for (s = 0; s < n; s++) {
      best = null;
      bestScore = Infinity;
      for (i = 0; i < loads.length; i++) {
        if (picked.indexOf(i) !== -1) continue;
        load = loads[i];
        dist = 0;
        if (picked.length) {
          dist = Math.min.apply(null, picked.map(function (p) { return Math.abs(p - i); }));
        }
        score = load * 10 - dist;
        if (score < bestScore || (score === bestScore && (best == null || i < best))) {
          bestScore = score;
          best = i;
        }
      }
      if (best == null) break;
      picked.push(best);
    }
    return picked.sort(function (a, b) { return a - b; });
  }

  function builderBoard(daysPerWeek, priorities, startDay) {
    var labels = defaultDayLabels(daysPerWeek, startDay || "Monday");
    var days = labels.map(function (label) { return { label: label, slots: [] }; });
    var plan = [];
    (priorities.emphasize || []).forEach(function (id) {
      plan.push({ id: id, tier: "emphasize", sessions: Math.min(2, daysPerWeek), per: 2 });
    });
    (priorities.grow || []).forEach(function (id) {
      plan.push({ id: id, tier: "grow", sessions: Math.min(2, daysPerWeek), per: 1 });
    });
    (priorities.maintain || []).forEach(function (id) {
      plan.push({ id: id, tier: "maintain", sessions: 1, per: 1 });
    });
    plan.forEach(function (p) {
      var loads = days.map(function (d) { return d.slots.length; });
      pickSpreadDays(loads, p.sessions).forEach(function (di) {
        for (var k = 0; k < p.per; k++) days[di].slots.push(blankSlot(p.id, p.tier));
      });
    });
    var guard = 0;
    while (guard++ < 30) {
      var empty = -1;
      var donor = -1;
      var best = 1;
      days.forEach(function (day, i) {
        if (!day.slots.length && empty < 0) empty = i;
        if (day.slots.length > best) {
          best = day.slots.length;
          donor = i;
        }
      });
      if (empty < 0 || donor < 0) break;
      days[empty].slots.push(days[donor].slots.pop());
    }
    return {
      title: "New workout plan",
      subtitle: "Meso builder",
      sourceLabel: "Meso builder",
      targetsIncluded: false,
      sameUnits: true,
      days: days
    };
  }

  function equipmentMatches(equipment, types) {
    if (!types || !types.length) return true;
    var eq = String(equipment || "").toLowerCase();
    return types.some(function (type) {
      var t = type.toLowerCase();
      if (t === "bodyweight") return eq.indexOf("bodyweight only") !== -1 || eq === "bodyweight";
      if (t === "bodyweight loadable") return eq.indexOf("loadable") !== -1;
      if (t === "machine assistance") return eq.indexOf("assistance") !== -1;
      if (t === "smith machine") return eq.indexOf("smith") !== -1;
      return eq.indexOf(t) !== -1;
    });
  }

  function usageIndex(mesos) {
    var count = {};
    var last = {};
    (mesos || []).forEach(function (meso) {
      meso.weeks.forEach(function (week) {
        week.days.forEach(function (day) {
          (day.exercises || []).forEach(function (ex) {
            var key = normName(ex.name);
            var done = (ex.sets || []).filter(function (s) { return s.status === "complete"; }).length;
            count[key] = (count[key] || 0) + done;
            (ex.sets || []).forEach(function (s) {
              var t = s.finishedAt || "";
              if (t && (!last[key] || t > last[key])) last[key] = t;
            });
            if (!last[key] && day.finishedAt && done) last[key] = day.finishedAt;
          });
        });
      });
    });
    return { count: count, last: last };
  }

  function autofillBoard(board, library, mesos, opts) {
    opts = opts || {};
    var fillEmpty = opts.fillEmpty !== false;
    var replace = !!opts.replace;
    var types = opts.usePreferred ? (opts.preferredTypes || []) : [];
    var usage = usageIndex(mesos);
    var ranked = (library || []).slice().sort(function (a, b) {
      var ca = usage.count[normName(a.name)] || 0;
      var cb = usage.count[normName(b.name)] || 0;
      if (cb !== ca) return cb - ca;
      var la = usage.last[normName(a.name)] || "";
      var lb = usage.last[normName(b.name)] || "";
      return lb.localeCompare(la);
    });
    var used = {};
    if (!replace) {
      board.days.forEach(function (day) {
        day.slots.forEach(function (slot) {
          if (slot.exerciseName) used[normName(slot.exerciseName)] = true;
        });
      });
    }
    board.days.forEach(function (day) {
      day.slots.forEach(function (slot) {
        if (slot.exerciseName && !replace) return;
        if (!slot.exerciseName && !fillEmpty) return;
        var muscle = MUSCLES[slot.muscleGroupId];
        var pick = null;
        for (var i = 0; i < ranked.length; i++) {
          var ex = ranked[i];
          if (ex.muscle !== muscle) continue;
          if (used[normName(ex.name)]) continue;
          if (!equipmentMatches(ex.equipment, types)) continue;
          pick = ex;
          break;
        }
        if (!pick && types.length) {
          for (var j = 0; j < ranked.length; j++) {
            var ex2 = ranked[j];
            if (ex2.muscle !== muscle) continue;
            if (used[normName(ex2.name)]) continue;
            pick = ex2;
            break;
          }
        }
        if (pick) {
          slot.exerciseName = pick.name;
          slot.exerciseId = pick.exercise_id || null;
          used[normName(pick.name)] = true;
        } else if (replace) {
          slot.exerciseName = null;
          slot.exerciseId = null;
        }
      });
    });
    return board;
  }

  function boardIssues(board) {
    var issues = [];
    if (!board || !board.days || !board.days.length) issues.push("Add at least one day.");
    (board.days || []).forEach(function (day, i) {
      if (!day.slots || !day.slots.length) issues.push("All workouts must have muscle groups added.");
    });
    var seen = {};
    issues = issues.filter(function (msg) {
      if (seen[msg]) return false;
      seen[msg] = true;
      return true;
    });
    return issues;
  }

  function createMeso(opts) {
    var board = opts.board;
    var weeks = opts.weeks;
    var unit = opts.unit || "lb";
    var now = opts.now || new Date().toISOString();
    var rir = rirForWeeks(weeks);
    var mesoId = uid("id");
    var key = uid("m");
    var includeTargets = !!(board.targetsIncluded && board.sameUnits !== false && (board.sourceUnit || unit) === unit);
    var priorities = {};
    board.days.forEach(function (day) {
      day.slots.forEach(function (slot) {
        if (!slot.muscleGroupId) return;
        if (!priorities[slot.muscleGroupId] && slot.priority) {
          priorities[slot.muscleGroupId] = { muscleGroupId: Number(slot.muscleGroupId), mgPriorityType: slot.priority };
        }
      });
    });

    function makeDay(template, weekIndex) {
      var dayId = uid("d");
      var exercises = [];
      template.slots.forEach(function (slot, ei) {
        if (!slot.exerciseName) return;
        var sets = [];
        var useSets = includeTargets && weekIndex === 0 && slot.sets && slot.sets.length;
        if (useSets) {
          slot.sets.forEach(function (src, si) {
            sets.push({
              id: uid("s"),
              position: si,
              setType: src.setType || "regular",
              weight: src.weightTarget != null ? src.weightTarget : src.weight,
              weightTarget: src.weightTarget != null ? src.weightTarget : src.weight,
              weightTargetMin: src.weightTargetMin != null ? src.weightTargetMin : null,
              weightTargetMax: src.weightTargetMax != null ? src.weightTargetMax : null,
              reps: null,
              repsTarget: src.repsTarget != null ? src.repsTarget : null,
              bodyweight: null,
              unit: unit,
              status: "ready",
              createdAt: now,
              finishedAt: null
            });
          });
        }
        exercises.push({
          id: uid("e"),
          dayId: dayId,
          exerciseId: slot.exerciseId || null,
          position: exercises.length,
          jointPain: null,
          muscleGroupId: slot.muscleGroupId,
          sets: sets,
          status: sets.length ? "ready" : "empty",
          name: slot.exerciseName,
          notes: [],
          createdAt: now,
          updatedAt: now
        });
      });
      var seen = {};
      var muscleGroups = [];
      exercises.forEach(function (ex) {
        if (!ex.muscleGroupId || seen[ex.muscleGroupId]) return;
        seen[ex.muscleGroupId] = true;
        muscleGroups.push({
          muscleGroupId: ex.muscleGroupId,
          pump: null,
          soreness: null,
          workload: null,
          recommendedSets: null,
          status: "programmed"
        });
      });
      var status = "pending";
      if (exercises.some(function (ex) { return ex.sets.length; })) status = "ready";
      return {
        id: dayId,
        mesoId: mesoId,
        week: weekIndex,
        position: 0,
        label: template.label || "",
        status: status,
        finishedAt: null,
        bodyweight: null,
        bodyweightAt: null,
        unit: unit,
        notes: [],
        exercises: exercises,
        muscleGroups: muscleGroups,
        createdAt: now,
        updatedAt: now
      };
    }

    var weeksArr = [];
    for (var w = 0; w < weeks; w++) {
      var days = board.days.map(function (template, di) {
        var day = makeDay(template, w);
        day.position = di;
        return day;
      });
      weeksArr.push({ days: days });
    }

    return {
      id: mesoId,
      key: key,
      local: true,
      userId: null,
      name: (opts.name || "New meso plan").trim() || "New meso plan",
      days: board.days.length,
      unit: unit,
      sourceTemplateId: null,
      sourceMesoId: null,
      microRirs: encodeRir(rir),
      weekRir: rir,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      deletedAt: null,
      status: "ready",
      generatedFrom: board.sourceLabel || "New meso plan",
      priorities: priorities,
      notes: [],
      weeks: weeksArr
    };
  }

  function endMesoRecord(meso, now) {
    return {
      status: "complete",
      finishedAt: now || new Date().toISOString()
    };
  }

  function refreshExerciseStatus(ex) {
    if (!ex.sets || !ex.sets.length) {
      ex.status = "empty";
      return;
    }
    var complete = ex.sets.filter(function (s) { return s.status === "complete"; }).length;
    if (complete === ex.sets.length) ex.status = "complete";
    else if (ex.sets.every(function (s) { return s.status === "skipped"; })) ex.status = "skipped";
    else if (complete > 0 || ex.sets.some(function (s) { return s.status === "skipped"; })) ex.status = "partial";
    else if (ex.sets.some(function (s) { return s.status === "pendingReps"; })) ex.status = "ready";
    else ex.status = "ready";
  }

  function refreshDayStatus(day, opts) {
    opts = opts || {};
    var sets = [];
    (day.exercises || []).forEach(function (ex) {
      refreshExerciseStatus(ex);
      (ex.sets || []).forEach(function (s) { sets.push(s); });
    });
    if (opts.force === "skipped") {
      day.status = "skipped";
      if (!day.finishedAt) day.finishedAt = opts.now || new Date().toISOString();
      return;
    }
    if (!sets.length) {
      day.status = "pending";
      if (!opts.keepFinished) day.finishedAt = null;
      return;
    }
    var complete = sets.filter(function (s) { return s.status === "complete"; }).length;
    var skipped = sets.filter(function (s) { return s.status === "skipped"; }).length;
    var now = opts.now || new Date().toISOString();
    if (complete === sets.length) {
      day.status = "complete";
      if (!day.finishedAt) day.finishedAt = now;
    } else if (skipped === sets.length) {
      day.status = "skipped";
      if (!day.finishedAt) day.finishedAt = now;
    } else if (complete > 0 || skipped > 0) {
      day.status = "partial";
      if (!day.finishedAt) day.finishedAt = now;
    } else {
      day.status = "ready";
      day.finishedAt = null;
    }
  }

  function mesoSummary(meso) {
    var counts = { complete: 0, skipped: 0, partial: 0, pending: 0, ready: 0 };
    var muscles = {};
    for (var id = 1; id <= 12; id++) muscles[id] = meso.weeks.map(function () { return 0; });
    meso.weeks.forEach(function (week, wi) {
      week.days.forEach(function (day) {
        var st = day.status || "pending";
        if (counts[st] == null) counts[st] = 0;
        counts[st] += 1;
        (day.exercises || []).forEach(function (ex) {
          if (!ex.muscleGroupId) return;
          var n = (ex.sets || []).filter(function (s) { return s.status === "complete"; }).length;
          if (!muscles[ex.muscleGroupId]) muscles[ex.muscleGroupId] = meso.weeks.map(function () { return 0; });
          muscles[ex.muscleGroupId][wi] += n;
        });
      });
    });
    return {
      completed: counts.complete || 0,
      skipped: counts.skipped || 0,
      incomplete: (counts.partial || 0) + (counts.pending || 0) + (counts.ready || 0),
      counts: counts,
      muscles: muscles
    };
  }

  function mergeBodyweight(seedEntries, extra) {
    var map = {};
    (seedEntries || []).forEach(function (e) {
      map[e.date] = { date: e.date, bodyweight: e.bodyweight, unit: e.unit || "lb", source: "seed" };
    });
    (extra || []).forEach(function (e) {
      map[e.date] = { date: e.date, bodyweight: e.bodyweight, unit: e.unit || "lb", source: "local" };
    });
    return Object.keys(map).sort().map(function (k) { return map[k]; });
  }

  function libraryWithCustom(library, custom) {
    var list = (library || []).slice();
    (custom || []).forEach(function (ex) {
      list.push({
        name: ex.name,
        muscle: ex.muscle,
        equipment: ex.equipment || "Custom",
        last_performed: null,
        exercise_id: ex.exercise_id || null,
        custom: true
      });
    });
    return list;
  }

  function slotSummary(slot) {
    if (!slot.sets || !slot.sets.length) return null;
    var weights = slot.sets.map(function (s) { return s.weightTarget != null ? s.weightTarget : s.weight; }).filter(function (n) { return n != null; });
    var reps = slot.sets.map(function (s) { return s.repsTarget; }).filter(function (n) { return n != null; });
    return {
      sets: slot.sets.length,
      weight: weights.length ? weights[0] : null,
      reps: reps.length ? reps[0] : null,
      varied: weights.some(function (w) { return w !== weights[0]; }) || reps.some(function (r) { return r !== reps[0]; })
    };
  }

  return {
    MUSCLES: MUSCLES,
    MUSCLE_ID: MUSCLE_ID,
    CATEGORIES: CATEGORIES,
    WEEKDAYS: WEEKDAYS,
    EQUIPMENT_TYPES: EQUIPMENT_TYPES,
    RIR_BY_WEEKS: RIR_BY_WEEKS,
    clone: clone,
    emptyOverlay: emptyOverlay,
    normName: normName,
    muscleTone: muscleTone,
    isCurrent: isCurrent,
    isEditable: isEditable,
    decodeRir: decodeRir,
    weekRirList: weekRirList,
    weekRir: weekRir,
    isDeloadWeek: isDeloadWeek,
    encodeRir: encodeRir,
    rirForWeeks: rirForWeeks,
    materialize: materialize,
    historyRows: historyRows,
    historyCounts: historyCounts,
    currentMeso: currentMeso,
    currentPosition: currentPosition,
    deloadLocked: deloadLocked,
    findMeso: findMeso,
    locateDay: locateDay,
    lastLoggedSet: lastLoggedSet,
    exerciseHistory: exerciseHistory,
    uid: uid,
    defaultDayLabels: defaultDayLabels,
    blankBoard: blankBoard,
    blankSlot: blankSlot,
    boardFromTemplate: boardFromTemplate,
    blankDaysBoard: blankDaysBoard,
    boardFromMesoWeek: boardFromMesoWeek,
    stripTargets: stripTargets,
    builderBoard: builderBoard,
    autofillBoard: autofillBoard,
    equipmentMatches: equipmentMatches,
    boardIssues: boardIssues,
    createMeso: createMeso,
    endMesoRecord: endMesoRecord,
    refreshExerciseStatus: refreshExerciseStatus,
    refreshDayStatus: refreshDayStatus,
    mesoSummary: mesoSummary,
    mergeBodyweight: mergeBodyweight,
    libraryWithCustom: libraryWithCustom,
    slotSummary: slotSummary,
    usageIndex: usageIndex
  };
});
