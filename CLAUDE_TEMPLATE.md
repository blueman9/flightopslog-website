# [Project Name]

## Project Overview
[One-liner: what this project does and who it's for.]

## Tech Stack
- **Frontend**: [framework, language, bundler, CSS]
- **Backend**: [database, auth, API layer]
- **Deployment**: [hosting platform, CI/CD trigger]

## Project Structure
```
[key directories and what lives in them — keep it short]
```

## Key Commands
```bash
[install command]
[dev server command]
[build/compile command]
[deploy command if manual]
```

---

## Workflow Rules

### 1. Plan Before Building
For any task with 3+ steps or architectural decisions:
- Write the plan to `tasks/todo.md` with checkable items (`- [ ]`)
- Present the plan and **wait for approval** before implementing
- If something goes sideways mid-implementation, STOP and re-plan
- Mark items complete (`- [x]`) as you go

### 2. Pull Latest First
At the start of every session:
```bash
git pull origin main --rebase
```

### 3. Verify Before Declaring Done
- [Run the build/compile command — no errors]
- [If UI changed, describe what to check visually]
- [If data layer changed, describe how to verify]
- Ask yourself: "Would a senior engineer approve this?"

### 4. Simplicity First
- Make the smallest change that solves the problem
- Find root causes — no temporary fixes or workarounds
- Don't refactor adjacent code unless asked
- If a fix feels hacky, step back and find the clean solution

### 5. Capture Lessons
When a bug, gotcha, or correction comes up, add it to `tasks/lessons.md`. Write it as a rule that prevents the same mistake.

---

## Don't Do

- **Don't [project-specific anti-pattern]**
- **Don't add packages/dependencies without asking**
- **Don't commit secrets** — [list what's gitignored: .env, config.yaml, etc.]
- **Don't guess [data schema / API shape / config format]** — [how to check instead]

---

## Known Gotchas

### [Gotcha Title]
[What goes wrong, why, and how to avoid it. Add these as you discover them.]

---

## [Optional: Architecture Notes]
[Only if the project has non-obvious design decisions worth explaining — auth model, offline strategy, shared backend with another project, etc. Delete this section if not needed.]
