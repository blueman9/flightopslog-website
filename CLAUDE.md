# FlightOps Log Website

## Project Overview

Marketing and information website for **FlightOps Log**, a professional iOS pilot logbook app for military and civilian pilots. Built as a React SPA deployed on Cloudflare Pages.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Deployment**: Cloudflare Pages (auto-deploy from GitHub `main` branch)
- **Version Control**: GitHub

## Project Structure

```
src/
├── components/        # Reusable UI components
├── pages/             # Top-level page components
├── assets/            # Images, icons, app screenshots
├── styles/            # Global styles, Tailwind config
└── App.tsx            # Root component with routing
public/                # Static assets (favicon, etc.)
tasks/                 # Plans and lessons learned
```

## Key Commands

```bash
npm install            # Install dependencies
npm run dev            # Start dev server (Vite)
npm run build          # Production build
npm run preview        # Preview production build locally
```

## Design Tokens (from iOS App)

The website mirrors the FlightOps Log iOS app color palette:

| Token           | Light Hex | Dark Hex  | Usage                        |
|-----------------|-----------|-----------|------------------------------|
| Primary         | `#2C3E50` | `#E8E4DF` | Headlines, primary text      |
| Action          | `#1B365D` | `#2A4F80` | Buttons, CTAs, links         |
| Accent          | `#E67E22` | `#E67E22` | Badges, highlights, pills    |
| Success         | `#27AE60` | `#27AE60` | Status indicators            |
| Error           | `#E74C3C` | `#E74C3C` | Alerts, destructive actions  |
| Warning         | `#E67E22` | `#E67E22` | Pending states               |
| Surface         | `#F4F4F2` | `#141414` | Page backgrounds             |
| Card            | `#FFFFFF` | `#1C1C1E` | Elevated card backgrounds    |
| Secondary Text  | `#8A8A85` | `#7A7A75` | Captions, labels             |

These should be defined in the Tailwind config as custom colors under `theme.extend.colors`.

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
- Run `npm run build` — no errors or warnings
- If UI changed, start dev server and check in browser
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

- **Don't add packages/dependencies without asking**
- **Don't commit secrets** — `.env` files are gitignored
- **Don't deviate from the iOS app's color palette** — the website should feel like a natural extension of the app
- **Don't add heavy JavaScript frameworks** — keep the bundle small; this is a marketing site

---

## Track Work in Linear

Use Linear (via MCP) for all task and issue tracking. Team: **FlightOpsLog**.

**Creating issues:**
- When a bug or feature is identified as a TODO, create a Linear issue for it
- Apply labels as appropriate: `Bug`, `Feature`, `Improvement`, `refactor`, `docs`
- **Never use `\n` escape sequences in issue descriptions** — use actual line breaks in the string content. Escaped `\n` gets double-escaped to `\\n` during JSON serialization

**Reading issues:**
- Always read comments when reviewing an issue — they contain context, decisions, and status updates that may not be in the description

**Completing issues:**
- When marking an issue done, add a comment with a brief explanation of what was done (no need for full code details — just a clear summary)

---

## Known Gotchas

### Cloudflare Pages SPA Routing
Cloudflare Pages needs a `_redirects` file or `/* /index.html 200` rule in `public/_redirects` so client-side routing works on direct URL access or page refresh.

---

## Architecture Notes

This is a static marketing site — no backend, no auth, no database. Content is hardcoded in React components. The site should:
- Showcase FlightOps Log features and screenshots
- Provide App Store download link
- Present a professional, aviation-themed aesthetic consistent with the iOS app
- Load fast and score well on Core Web Vitals
