# Hypertrophy

Personal workout log for Avni. It is a free, offline-capable page for the mesocycles, history, exercises, and bodyweight already in her export, plus anything she adds on the phone.

It is not affiliated with RP Strength, and it does not need an RP account. Built-in template workouts are not included. Numbers on the page come from the export or from what you type.

## Open it

**https://htmlpreview.github.io/?https://raw.githubusercontent.com/KAAVTR/avni-hypertrophy/main/index.html**

After the first load the history is stored on the phone (IndexedDB), so later visits work offline. Add to Home Screen if you want an icon. That icon keeps a separate log from the browser tab, so pick one and stick with it.

Shorter link, once GitHub Pages is turned on for this repo (`main` / root):

**https://kaavtr.github.io/avni-hypertrophy/**

1. Open https://github.com/KAAVTR/avni-hypertrophy/settings/pages
2. Source: **Deploy from a branch**
3. Branch **main**, folder **/ (root)**, Save

## What’s in it

- **Today** opens the current mesocycle, Keep it goong, on the week and day that are actually up next (Week 3, Day 1 in the export). A coach line suggests weight and reps from the last logged session: a small load bump (about +2.3% when the plates allow), the same weight plus one rep when a dumbbell jump is too big, or a lighter deload (~90% of week 1 early in the week, ~50% later). Traps and forearms are optional on deload. After you log a set, the next week’s suggestion shows under that lift. Set counts are not changed from pump or soreness.
- **Mesos** lists all 23 exported mesocycles. Finished ones are read-only. The current one, and any you create here, can be logged.
- **History** lists every workout (705 in the export). Filter by status and open a day.
- **Plan a mesocycle** copies one of your weeks, starts from your custom template “2026 Plan”, runs a lite muscle-priority builder, or starts from a blank board. Catalog names are listed without their day contents.
- **Lifts** is the 305-exercise library with last-performed dates and set history.
- **More** has bodyweight (22 exported entries, plus new ones), JSON export, and JSON import.

Logs you add stay on the phone, layered on top of the seed file. Export a backup from More if you want a copy.

## Run it locally

```bash
python3 -m http.server 43123
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

```bash
node test/logic.test.js
node test/overload.test.js
```
