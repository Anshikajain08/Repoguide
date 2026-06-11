⬡ RepoGuide — AI-Powered Codebase Onboarding

> Drop a GitHub URL. Get a full interactive codebase tour in ~30 seconds.

RepoGuide helps engineers understand any codebase instantly — without spending days reading through files. Powered by a custom in-browser RAG engine and Groq's LLM API.

![RepoGuide Banner](https://drive.google.com/file/d/1U7mhJPjmaBgcR0e6_NR8qFMCk32Sib9Z/view?usp=sharing)

---

## 🚀 Live Demo

> Paste any public GitHub URL and get an AI-generated codebase tour in seconds.

Try it with:
- [Fastify](https://github.com/fastify/fastify)
- [shadcn/ui](https://github.com/shadcn-ui/ui)
- [Excalidraw](https://github.com/excalidraw/excalidraw)
- [FastAPI](https://github.com/tiangolo/fastapi)

---

## ✨ What You Get

After analyzing a repo, RepoGuide generates **6 interactive tabs**:

| Tab | What it contains |
|-----|-----------------|
| 🏗️ **Overview** | Architecture pattern, tech stack, language breakdown, folder structure |
| 📍 **Key Files** | The 5-6 most important files with role, functions, and insider tips |
| ⚠️ **Gotchas** | Pitfalls that would bite a new engineer, ranked by severity |
| 🚀 **Start Here** | Step-by-step onboarding path with real commands and time estimates |
| 📖 **Glossary** | Searchable project-specific terminology you won't find in the docs |
| ⚡ **Insights** | Complexity scores, contributor stats, and analytical views |

---

## 🧠 How It Works

```
GitHub URL
    ↓
GitHub API → fetch metadata, file tree, source files
    ↓
RAG Engine → chunk files, build TF-IDF index
    ↓
Groq LLM → 5 parallel AI calls with relevant context
    ↓
Results Page → interactive 6-tab interface
```

The key innovation is the **in-browser RAG (Retrieval-Augmented Generation) pipeline** — instead of dumping the entire codebase into the AI, RepoGuide first finds the most relevant file chunks for each question, then sends only those. This keeps costs low, stays within token limits, and produces more accurate answers.

---

## 🔧 Tech Stack

- **Frontend** — Vanilla JavaScript (ES Modules), HTML5, CSS3
- **AI** — [Groq API](https://console.groq.com) with `llama-3.3-70b-versatile`
- **Search** — Custom TF-IDF vector search engine (built from scratch, no libraries)
- **Data** — GitHub REST API (public repos, no token required)
- **ZIP support** — JSZip for local/private repo uploads
- **No backend** — Everything runs in the browser. No server, no database.

---

## 📁 Project Structure

```
repoguide/
├── index.html              ← Landing page (URL input / ZIP upload)
├── pages/
│   ├── loading.html        ← Animated pipeline progress screen
│   └── results.html        ← 6-tab results interface
├── css/
│   ├── base.css            ← Design tokens, shared components, nav
│   ├── landing.css         ← Hero, input card, how-it-works section
│   ├── loading.css         ← Pulse ring, progress bar, skeleton loaders
│   └── results.css         ← Tab bar, all result layouts, chat panel
└── js/
    ├── landing.js          ← Tab switching, drag-drop, ZIP extraction
    ├── loading.js          ← Pipeline orchestration & progress updates
    ├── github.js           ← GitHub REST API client
    ├── rag.js              ← In-browser TF-IDF RAG engine
    ├── ai.js               ← Groq API client & prompt engineering
    ├── results.js          ← Dynamic renderer for all 6 tabs
    ├── chat.js             ← Ask-anything chat widget
    └── insights.js         ← Insights tab renderer
```

---

## ⚙️ Getting Started

### Prerequisites
- A free [Groq API key](https://console.groq.com) (no credit card required)
- Any modern browser
- A local server (e.g. VS Code Live Server)

### Running Locally

```bash
# Clone the repo
git clone https://github.com/yourusername/repoguide.git
cd repoguide

# Open with Live Server (VS Code extension)
# Or use any static file server:
npx serve .

# Navigate to http://localhost:3000
```

### Usage

1. Open `index.html` in your browser
2. Paste a public GitHub URL (e.g. `https://github.com/fastify/fastify`)
3. Enter your Groq API key
4. Click **Analyze** and wait ~30 seconds
5. Explore the 6-tab results

> **ZIP Upload**: You can also upload a `.zip` of any local or private repo using the Upload tab.

---

## 🏗️ Architecture Deep Dive

### In-Browser RAG Pipeline (`rag.js`)

The RAG engine is built entirely from scratch with no external libraries:

1. **Ingestion** — File contents are split into overlapping 1600-character chunks (200-char overlap to avoid boundary gaps)
2. **TF-IDF Indexing** — Each chunk gets a term frequency-inverse document frequency score. Rare but meaningful words score higher than common ones
3. **Retrieval** — At query time, the query is tokenized and compared against all chunks using cosine similarity
4. **Context Building** — Top-k chunks are deduplicated by file and formatted as markdown code blocks for the AI prompt

### AI Generation (`ai.js`)

Five prompts run in parallel (with 400ms stagger to respect rate limits):
- Each prompt gets a repo summary + RAG-retrieved code context
- All prompts request structured JSON output for reliable parsing
- Exponential backoff handles rate limit errors automatically

### Data Flow

sessionStorage acts as the bridge between pages — no backend needed:

```
landing.js   →  sessionStorage(repoUrl, groqKey)
loading.js   →  sessionStorage(repoResults, repoMeta)
results.js   ←  sessionStorage(repoResults, repoMeta)
```

---

## 🔑 API Key & Privacy

- Your Groq API key is stored in **sessionStorage only** — it disappears when you close the tab
- It is sent **only to the Groq API** — never logged or stored anywhere else
- No analytics, no tracking, no backend

---

## ⚠️ Limitations

- **Public repos only** when using GitHub URL (no token). Upload ZIP for private repos.
- **GitHub rate limit**: 60 requests/hour without a personal access token
- **Large repos** (5000+ files) may hit token limits — the engine samples the most important files
- RAG uses TF-IDF, not embeddings — semantic similarity is limited compared to production RAG systems

---

## 🛣️ What I'd Improve in Production

- Replace TF-IDF with dense embeddings (e.g. `text-embedding-3-small`) for better semantic retrieval
- Add a Node.js backend to handle GitHub tokens securely and cache results
- Stream AI responses instead of waiting for full completion
- Add unit tests for the RAG engine, GitHub URL parser, and AI output parsers
- Support private repos via GitHub OAuth
- Add export to PDF / Notion / Confluence

---

## 📄 License

MIT — free to use, modify, and distribute.

---

> *Built for engineers who value their time.*
