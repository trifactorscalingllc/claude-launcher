<div align="center">

<img src="build/icon.png" width="116" alt="Claude Helm" />

# Claude Helm

**Mission control for Claude Code.**
Monitor every session, launch every project, rescue every context — and share work with clients and partners. All local, self-updating.

[![Latest release](https://img.shields.io/github/v/release/trifactorscalingllc/claude-helm?color=d97757&label=download)](https://github.com/trifactorscalingllc/claude-helm/releases/latest)
![Platform](https://img.shields.io/badge/platform-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-444)
![Local only](https://img.shields.io/badge/data-100%25%20local-4f7d5b)
![License](https://img.shields.io/badge/license-MIT-444)

**[Website](https://trifactorscalingllc.github.io/claude-helm/)** · **[Download](https://github.com/trifactorscalingllc/claude-helm/releases/latest)**

</div>

---

Claude Helm reads your local Claude Code history (`~/.claude`) and turns it into a real dashboard: how much time and money each project costs, what you worked on, which sessions are live right now — plus one-click ways to jump back in, run the app you just built, dispatch headless tasks, and share work with the people who need to see it. It runs entirely on your machine.

## Download

**[⬇ Get the latest release](https://github.com/trifactorscalingllc/claude-helm/releases/latest)**

| Platform | File | First-run note |
|---|---|---|
| **Windows** | `Claude-Helm-Setup-*.exe` | SmartScreen → **More info → Run anyway**. After that it **updates itself silently** in the tray. |
| **macOS (Apple Silicon)** | `Claude-Helm-*-arm64.dmg` | Drag to **Applications**, then run the one-line unblock below. |
| **macOS (Intel)** | `Claude-Helm-*-x64.dmg` | Same as above. |
| **Linux** | `Claude-Helm-*.AppImage` | `chmod +x` then run. |

### macOS first run — "Claude Helm is damaged and can't be opened"

Not corruption — the app isn't code-signed yet, so macOS quarantines the download. Strip the flag once:

```bash
xattr -dr com.apple.quarantine "/Applications/Claude Helm.app"
```

Update behavior while unsigned: **Windows auto-updates silently in place.** macOS detects new versions and hands you the new dmg (macOS refuses to auto-swap unsigned apps); Linux re-downloads.

---

## Features

### 🖥 Live mission control
- **Every live session, named** — the ambient line shows each running Claude session (each clickable), what it's doing, whether it's waiting on you, and how full its context window is.
- **"Waiting for you" pings** — when a session finishes its turn and sits idle, you get a desktop notification and a tray badge. No more stalled sessions in background windows.
- **Context guard** — when a session's context passes 85%, a card explains the problem in plain words and offers a one-click rescue: a fork of the conversation (full memory intact) writes `HANDOFF.md`, then **Start fresh session** opens a new 200K-context session that begins by reading it. You never lose context.
- **Session-finished and budget notifications**, plus a system-tray summary of today's time and cost.

### 🚀 Launch anything
- **Open in Claude** — a terminal already in the project, running `claude`. Cross-platform: Windows Terminal, macOS Terminal/iTerm, every common Linux terminal. Per-launch model overrides (Opus / Sonnet / Haiku).
- **Launch the app or website inside any project** — anything with an `index.html` (served by a built-in local server) or a `dev`/`start`/`serve` script (spawned with automatic localhost-URL capture) gets a Launch button. Detection walks the whole project tree. Opens in an in-app preview window with reload + browser pop-out.
- **Share a running preview with a client** — one click opens a Cloudflare quick tunnel: a public https link + QR code they can open on a phone. The link dies when you stop the preview.
- **Quick tasks** — dispatch a headless `claude -p` task into any project from its card ("fix the mobile nav overlap"). A tasks strip tracks progress; desktop ping on completion.
- **Resume or branch any past session**, create projects from the app, open in editor or file explorer.

### 🔍 Search everything
- **One search across projects, conversations, and Claude's memory** — word-AND matching, so any description finds the thing ("roofing client site" matches even when those words never sit together).
- **Project results pull the project right up** — open it in Claude or jump to its details from the result row.
- **Suggested searches mined from your usage** — recurring session themes, recent projects, most-edited files, top tools. The empty search tab recommends what you were probably about to type.
- **In-app transcript viewer** — read any conversation as a clean chat, then Resume or Branch it (`--resume … --fork-session`, original untouched).

### 📊 Analytics & money
- **Per-project time, cost, tokens, tools, files, and models** — live-updating cards with sparklines, a live "● active" dot, git status, and a deep-dive detail view with per-day charts.
- **Recap** — what you did today or this week across every project, with an optional AI-written narrative.
- **Spend by model, MCP usage, busiest-hours heatmap, project compare, CSV export.**
- **Budgets** — weekly/monthly limits with 80% and 100% notifications. Costs are honest estimates from token usage (subscriptions aren't billed per token); an optional org Admin API key pulls your actual billed numbers.

### 👥 Clients & Partners
- **Clients** — assign any project to a client; hours and estimated cost roll up per client per month, exportable to CSV for billing.
- **Partners** — share a project and your partner receives the files **and your Claude context** on their machine via a partner code. Both sides auto-sync continuously through a private GitHub repo: save a file here, it appears there. Everything syncs — including `.env` files — and conflicts pause sync with a notification instead of clobbering anyone's work.
- **Pipeline self-test** — dry-runs the entire sharing chain with a dummy project (tooling, local engine, real private repo, partner code, clone-back, two-way sync) and logs every step before you share anything real.

### 🤖 Agent maker
- Build Claude Code **subagents in-app** — global (`~/.claude/agents`) or per-project, with tool pickers, model selection, and optional AI-drafted system prompts. They appear in Claude Code automatically.

### 🧠 Context & account
- **Context tab** — what Claude remembers about you and your projects (memory files + global `CLAUDE.md`), grouped and searchable.
- **Claude account & plan** — your real signed-in plan (e.g. Claude Max 20×), read locally from Claude Code's own session. Your login token is never read or transmitted.

### 🎨 Personalization
- **8 gradient accent themes** — Clay, Lagoon, Aubergine, Jade, Sunset, Cobalt, Ember, Mist — each with a signature gradient painted across the whole UI, layered on light or dark.
- **Floating glass dashboard** — translucent panels over accent washes; content floats instead of sitting in boxes. (The burst logo stays Claude-orange in every theme.)
- **Global summon hotkey**, redact mode for screen-sharing, launch-at-login with start-hidden, ⌘K command palette.

### 🔁 Automation & updates
- **Routines** — recurring headless Claude tasks on a schedule (daily standup digest, repo health sweep), safe read-only by default with an opt-in autonomous mode.
- **Silent self-updates on Windows** — Chrome-style: new versions download in the tray and install themselves while the app is idle. Toggle in Settings.

## Privacy

Everything is local. Claude Helm reads `~/.claude` on your machine; transcripts never leave it. No telemetry, no account. Optional API keys are encrypted with your OS keychain. The only network calls are the ones you ask for: update checks against GitHub Releases, optional AI summaries, preview-share tunnels, and partner-project git sync.

## Develop

```bash
git clone https://github.com/trifactorscalingllc/claude-helm
cd claude-helm
npm install
npm start        # dev (close the installed app first — single-instance lock)
npm test         # launch-preview + partner-sync test suites
npm run dist     # Windows installer
npm run dist:mac # macOS dmg + zip (on a Mac; CI builds all platforms on every tag)
```

Releases: bump `version` in package.json → create a `v*` release/tag → CI builds Windows, macOS, and Linux and attaches them — that same release is the auto-update feed.

## License

MIT © TriFactor Scaling
