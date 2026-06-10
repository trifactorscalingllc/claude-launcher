# Claude Helm

Electron desktop app (plain JS, no bundler) that monitors Claude Code sessions, launches projects, and previews their apps/sites. Main process: `main.js` (+ `preview.js`, `share.js`, `partner.js`, `agents.js`, `indexer.js`). Renderer: `renderer.js` + `styles.css` + `index.html`. Tests are plain Node scripts: `npm test` runs `test-preview.js` and `test-partner.js`.

Version lives in `package.json` only (3-digit semver). Releases ship as direct commits to `main` in the form `Feature summary; vX.Y.Z`, then a GitHub Release built with `npm run dist`.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke context-save / context-restore
- Code quality, health check → invoke health
