<div align="center">

<img src="build/icon.png" width="116" alt="Claude Helm" />

# Claude Helm

**The dashboard for Claude Code.**
Monitor, search, and launch every project — time, cost, transcripts, and context, all in one place.

[![Latest release](https://img.shields.io/github/v/release/trifactorscalingllc/claude-helm?color=d97757&label=download)](https://github.com/trifactorscalingllc/claude-helm/releases/latest)
![Platform](https://img.shields.io/badge/platform-Windows-444)
![Local only](https://img.shields.io/badge/data-100%25%20local-4f7d5b)
![License](https://img.shields.io/badge/license-MIT-444)

<br/>

<img src="docs/screenshot.png" width="860" alt="Claude Helm dashboard" />

</div>

---

Claude Helm reads your local Claude Code history (`~/.claude`) and turns it into a real
dashboard: **how much time and money each project costs, what you worked on, and a one-click
way to jump back in.** It runs entirely on your machine, and it auto-updates itself.

## Download

**[⬇ Download the latest installer](https://github.com/trifactorscalingllc/claude-helm/releases/latest)** → run it → click **More info → Run anyway** at the SmartScreen prompt _(the app isn't code-signed yet)_. After that, it **updates itself silently** — no reinstalling.

---

## Features

### 🚀 Launch
- **One-click "Open in Claude"** — opens a terminal already in the project, running `claude`. No `cd`, no trust prompt.
- **Create projects** from the app (folder + open in Claude in one step).
- **Per-launch overrides** — open *this* project with Opus / Sonnet / Haiku without changing your default.
- **Open in editor** (VS Code, or your file explorer) right from the card.
- **Cross-platform launch** — Windows Terminal, macOS Terminal/iTerm, or your Linux terminal.

### 📊 Monitor & 📈 Analyze
- **Live engine** tails every transcript and computes, per project: **time spent**, **cost** (token×price estimate), sessions, tokens, tools used, files touched, and models.
- **Card metrics** — time, cost, a 14-day activity sparkline, and a live **"● active now"** dot.
- **System tray** — today's time + cost at a glance, plus an active-session indicator. Closing the window keeps it monitoring in the tray.
- **Desktop notifications** + **cost alerts** — get warned when a session finishes and when you hit 80%/100% of a weekly/monthly **budget**.
- **Overview** — range selector (1D/7D/1M/3M), per-project history chart, **spend forecast**, **spend-by-model**, 30-day heatmap, and **CSV export**.

<div align="center"><img src="docs/feat-overview.png" width="820" alt="Overview — budgets, forecast, spend by model, history" /></div>

- **Project detail** — per-day time/cost charts, token breakdown, tool-usage bars, most-edited files, and a session list.

<div align="center"><img src="docs/feat-detail.png" width="820" alt="Project detail — charts, tokens, tools, models" /></div>

### 🔎 Search & read
- **Unified search** across every conversation **and** your saved context/memory — highlighted snippets, filter by project / date / role.
- **In-app transcript viewer** — read the full conversation as a clean chat; jump straight from a search hit to the exact message.

<div align="center"><img src="docs/feat-search.png" width="820" alt="Search across conversations and context" /></div>

### 🧠 Context
- See **what Claude remembers about you** — your memory files and global `CLAUDE.md`, grouped into About you / Preferences / Projects / References.

<div align="center"><img src="docs/feat-context.png" width="820" alt="Context — what Claude remembers about you" /></div>

### 🔁 Routines
- **Recurring Claude Code tasks on a schedule.** Each routine runs `claude -p "<your prompt>"` in a project (every N hours or daily at a time) and shows the result right in the app — a daily standup digest, a weekly retro, a README freshness check, a test/health sweep.
- Runs in **safe read-only mode by default**; an optional "autonomous" toggle (`--permission-mode acceptEdits`) lets a routine make changes. Per-routine model, enable/disable, and **Run now**.

<div align="center"><img src="docs/feat-routines.png" width="820" alt="Routines — recurring claude -p tasks" /></div>

### 🎛 Organize & polish
- **Tags** (client / personal / …) with a tag filter, **archive** to hide projects, **pin** favorites.
- **Dark mode**, first-run onboarding, and a privacy-first, **100% local** design — nothing leaves your machine (the only optional network call is AI summaries, if you add your own API key).

---

## 🔜 Coming soon

- **Command palette** (Ctrl-K) to jump anywhere from the keyboard.
- **Daily AI recap** — "what did I do today / this week" across all projects.
- **Git status on cards** — branch, dirty/clean, ahead/behind, last commit.
- **Real billed usage** via an Anthropic Admin API key (exact numbers for API/Console users).
- **macOS & Linux** builds.

---

## How it works

- All paths are derived from your home directory at runtime, so it works for **whoever installs it**.
- It reads `~/.claude/projects/**.jsonl` (your Claude Code session transcripts) to compute stats, and your memory folder + `~/.claude/CLAUDE.md` for the Context view.
- Cost is an **estimate** (tokens × public Claude pricing), labeled as such.
- **No telemetry. No account. No data leaves your machine.**

## Build from source

```bash
npm install
npm start        # run in dev
npm run dist     # build the Windows installer into dist/
```

## License

MIT
