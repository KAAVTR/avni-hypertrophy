# Keep it goong

Personal workout logger for Avni. Open it on your phone, pick the day, and log weight, reps, and a checkmark for each set.

It is a free page for one mesocycle. It is not affiliated with RP Strength, and it does not need an RP account.

## On your iPhone

Open this link in Safari or Chrome:

**https://htmlpreview.github.io/?https://raw.githubusercontent.com/KAAVTR/avni-hypertrophy/bcb9dcd9/index.html**

1. You land on the current day: **Week 3, Day 1**.
2. Use the arrows, or tap **All weeks**, to move between weeks and days.
3. Type weight and reps, then tap the box to log the set. It saves on this phone automatically.
4. Tap **Edit** to rename a lift or add and remove sets. Tap **Done** when you finish.
5. Tap **···** to mark the day logged, reset the day back to the export, or download a backup.

Logs stay in the browser (`localStorage`). They are not uploaded.

Add to Home Screen (Share → Add to Home Screen) if you want an icon. That icon keeps a **separate** log from the Safari tab, so pick one and stick with it.

### Shorter link (one settings click)

GitHub’s automatic publish step cannot turn Pages on for this account. To get `https://kaavtr.github.io/avni-hypertrophy/`:

1. Open https://github.com/KAAVTR/avni-hypertrophy/settings/pages
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Branch **main**, folder **/ (root)**, then **Save**.
4. Wait about a minute, then open https://kaavtr.github.io/avni-hypertrophy/

## Run it locally

From this folder:

```bash
python3 -m http.server 43123
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

## What’s in the program

`program.json` is the exported mesocycle **Keep it goong**: 4 weeks, 5 days, starting Sep 14, 2026. Week 4 is the deload.

Numbers on the page come from that file only.

- Weeks 1–2 are filled with what was already logged or skipped.
- Week 3 days 1–3 have planned weights and rep targets. Rep boxes start empty so you can type what you actually did. The gray number in the box is the target.
- Week 3 days 4–5 and all of week 4 were not programmed in the export. Those days list the same lifts and prefill the last logged weight. They are not new numbers.

Reset a day from **···** if you want the export back.

The public page shows the program (lift names and the weights already in the export). Sets you log stay on the phone.
