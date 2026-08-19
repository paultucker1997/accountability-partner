# Accountability Partner

A gamified daily habit tracker built as a single self-contained HTML file — no build step, no backend, no dependencies beyond a Google Fonts stylesheet.

## Features

- **10 core habits** (gym, cardio, calorie target, no porn, reading, meditation, prayer, water, sleep, steps) whose daily completion drives an overall streak, XP, and levels
- **Custom habits** — add your own from a curated suggestions list or type your own
- **Structured exercise logging** — duration + type chips for both gym (lifting/pilates/HIIT) and cardio (run/walk/hike/bike/swim), with MET-based calorie-burn estimates
- **Calorie calculator** — a built-in ~65-item food database with per-100g and "per typical serving" (`1 banana`, `1 egg`, etc.) auto-calculation, plus a "remember this food" flow for anything not on the list
- **Weight tracking** — day-over-day delta, auto-saves as you type
- **Day navigation** — step backward to fill in missed days or forward to plan ahead; streaks recalculate correctly around the edits
- **Shared board** — open the same link with friends, everyone gets their own card, streaks, and a leaderboard
- **Evening reminder** — a 9pm Mountain Time check-in (while the page is open) showing what's left undone today

## How it works

This is built to run as a [Claude Artifact](https://claude.ai) using the `artifact` runtime capability for shared/multiplayer state (a classic versioned artifact — each write publishes a new version and reloads viewers to it). Outside that environment it falls back automatically to a fully-featured single-player mode backed by `localStorage`.

Just open `index.html` in a browser to use it solo — no server required.

## Notes

- The calorie-burn math uses the standard MET formula (`kcal = MET × weight(kg) × hours`), with rough sex and age adjustments layered on. It's a reasonable estimate, not a lab measurement.
- The shared-board sync model reloads the page after each save (that's how classic Artifacts propagate updates), so multiplayer isn't instant/live-typing — more "check in and see what's new."
