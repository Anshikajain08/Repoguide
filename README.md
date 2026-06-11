# RepoGuide — Codebase Onboarding AI

A clean, professional multi-page UI for an AI-powered codebase tour generator.

## Project Structure

```
repoguide/
├── index.html          ← Landing page (paste GitHub URL / upload)
├── results.html        ← Redirect shortcut
├── pages/
│   ├── loading.html    ← Animated analysis progress screen
│   └── results.html    ← 5-tab results view
├── css/
│   ├── base.css        ← Design tokens, shared components, nav
│   ├── landing.css     ← Hero, input card, how-it-works section
│   ├── loading.css     ← Progress, pulse ring, skeleton preview
│   └── results.css     ← Tab bar, overview, key files, gotchas, start-here, glossary
└── js/
    ├── landing.js      ← Tab switching, drag-drop, sample chips
    ├── loading.js      ← Animated step sequence + progress bar
    └── results.js      ← Tab switching, expandable file cards, glossary search
```

## Pages

### 1. Landing (`index.html`)
- GitHub URL input with Enter key support
- File upload with drag-and-drop
- Sample repo chips (Next.js, Supabase, shadcn/ui, Excalidraw)
- "How it works" 3-step section
- Stats banner
- Navigates to `pages/loading.html` on submit

### 2. Loading (`pages/loading.html`)
- Animated pulse ring
- 6-step progress checklist with spinner → checkmark transitions
- Smooth progress bar fill
- Skeleton preview panel
- Auto-navigates to `pages/results.html` after sequence

### 3. Results (`pages/results.html`)
- Sticky tab bar with 5 sections:
  - 🏗️ **Overview** — summary, architecture diagram, tech stack, folder tree, AI summary
  - 📍 **Key Files** — expandable cards with role, importance rating, key functions
  - ⚠️ **Gotchas** — severity-banded pitfall cards (Critical → Low)
  - 🚀 **Start Here** — numbered onboarding path with time estimates + first PR suggestion
  - 📖 **Glossary** — searchable project terminology

## Design System
- **Font:** Plus Jakarta Sans (300–800)
- **Accent:** Teal (`#0d9488`)
- **Theme:** Warm white (`#fafaf9`) + slate tones
- **Monospace:** SF Mono / Fira Code (code snippets)

## To integrate with real AI
Replace the static content in `pages/results.html` with dynamic data fetched from the Anthropic API (or your backend). The `sessionStorage.getItem('repoUrl')` pattern in `loading.js` passes the URL between pages.
