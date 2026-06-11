// chat.js — RAG-powered chat with the repo, Atlassian-polished UI

import { RAGEngine } from './rag.js';

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// Suggested starter questions shown in the chat panel
const STARTER_QUESTIONS = [
  'How does authentication work?',
  'What happens when a user submits a form?',
  'Where is the database layer?',
  'How do I run tests?',
  'What is the main entry point?',
  'Where should I add a new API endpoint?',
  'Explain the state management approach',
  'What are the main data models?',
];

export class RepoChat {
  constructor(ragEngine, repoMeta) {
    this.rag      = ragEngine;
    this.meta     = repoMeta;
    this.history  = [];   // { role, content }
    this.el       = null;
    this.open     = false;
  }

  mount() {
    this._injectCSS();
    this._buildDOM();
    this._bindEvents();
  }

  // ── DOM ──────────────────────────────────────────────

  _buildDOM() {
    // FAB trigger
    const fab = document.createElement('button');
    fab.id = 'chat-fab';
    fab.setAttribute('aria-label', 'Chat with repo');
    fab.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span class="fab-label">Ask AI</span>
      <span class="fab-badge" id="fab-badge" style="display:none">!</span>`;
    document.body.appendChild(fab);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'chat-panel';
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
      <div class="cp-header">
        <div class="cp-title">
          <span class="cp-icon">⬡</span>
          <div>
            <div class="cp-name">Ask about this repo</div>
            <div class="cp-sub">${this.meta.fullName || 'Repository'} · powered by Groq</div>
          </div>
        </div>
        <button class="cp-close" id="chat-close" aria-label="Close chat">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="cp-body" id="chat-body">
        <div class="cp-welcome">
          <p class="cw-intro">I've read this codebase. Ask me anything about how it works.</p>
          <div class="cw-chips" id="starter-chips">
            ${STARTER_QUESTIONS.slice(0, 6).map(q =>
              `<button class="chip" onclick="window._repoChat.send(this.textContent)">${q}</button>`
            ).join('')}
          </div>
        </div>
      </div>

      <div class="cp-footer">
        <div class="cp-input-row">
          <textarea id="chat-input" class="cp-input" placeholder="e.g. How does auth work?" rows="1"></textarea>
          <button class="cp-send" id="chat-send" aria-label="Send">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <div class="cp-disclaimer">Responses grounded in actual repo files via RAG</div>
      </div>`;
    document.body.appendChild(panel);

    this.el = panel;
    window._repoChat = this;
  }

  _bindEvents() {
    document.getElementById('chat-fab').addEventListener('click', () => this.toggle());
    document.getElementById('chat-close').addEventListener('click', () => this.close());

    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');

    sendBtn.addEventListener('click', () => {
      const q = input.value.trim();
      if (q) this.send(q);
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const q = input.value.trim();
        if (q) this.send(q);
      }
    });

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Close on outside click
    document.addEventListener('click', e => {
      if (this.open && !this.el.contains(e.target) && e.target.id !== 'chat-fab' && !e.target.closest('#chat-fab')) {
        this.close();
      }
    });
  }

  // ── API ──────────────────────────────────────────────

  toggle() { this.open ? this.close() : this.open_(); }

  open_() {
    this.open = true;
    this.el.classList.add('visible');
    this.el.setAttribute('aria-hidden', 'false');
    document.getElementById('chat-input').focus();
    document.getElementById('fab-badge').style.display = 'none';
  }

  close() {
    this.open = false;
    this.el.classList.remove('visible');
    this.el.setAttribute('aria-hidden', 'true');
  }

  async send(question) {
    if (!question?.trim()) return;

    // Remove starter chips after first message
    document.getElementById('starter-chips')?.remove();
    document.querySelector('.cw-intro')?.remove();

    // Clear input
    const inputEl = document.getElementById('chat-input');
    if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; }

    // Add user bubble
    this._addBubble('user', question);
    this.history.push({ role: 'user', content: question });

    // Add thinking bubble
    const thinkId = 'think-' + Date.now();
    this._addThinking(thinkId);

    try {
      const answer = await this._ask(question);
      document.getElementById(thinkId)?.remove();
      this._addBubble('assistant', answer);
      this.history.push({ role: 'assistant', content: answer });
    } catch (err) {
      document.getElementById(thinkId)?.remove();
      this._addBubble('error', '⚠️ ' + err.message);
    }
  }

  async _ask(question) {
    const apiKey = sessionStorage.getItem('groqKey') || '';
    if (!apiKey) throw new Error('No Groq API key found. Go back to the home page and enter your key.');

    // RAG: retrieve relevant chunks
    const context = this.rag.buildContext(question, 8);

    const systemPrompt = `You are an expert engineer who has deeply read the "${this.meta.fullName}" codebase.
Answer questions concisely and precisely based on the actual code provided.
- Reference specific files, functions, or line patterns when relevant
- Use inline code formatting with backticks for file paths, function names, variables
- Keep answers focused — 3-6 sentences unless a detailed breakdown is needed
- If the code context doesn't cover the question, say so honestly
- Never make up function names or file paths that aren't in the provided context

Repo: ${this.meta.fullName}
Language: ${this.meta.language || 'Unknown'}
Description: ${this.meta.description || 'No description'}`;

    const userPrompt = context
      ? `RELEVANT CODE CONTEXT:\n${context}\n\nQUESTION: ${question}`
      : `QUESTION: ${question}\n\n(No matching code found in index for this query — answer from general knowledge about the repo.)`;

    // Build messages with history (keep last 6 turns for context)
    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.history.slice(-6).slice(0, -1), // prior history without current question
      { role: 'user', content: userPrompt },
    ];

    const resp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        max_tokens: 600,
        temperature: 0.3,
        stream: false,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Groq error ${resp.status}`);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim() || 'No response received.';
  }

  // ── Render helpers ───────────────────────────────────

  _addBubble(role, text) {
    const body = document.getElementById('chat-body');
    const div  = document.createElement('div');
    div.className = `cm cm-${role}`;

    if (role === 'assistant') {
      div.innerHTML = `
        <div class="cm-avatar">⬡</div>
        <div class="cm-content">${this._renderMarkdown(text)}</div>`;
    } else if (role === 'user') {
      div.innerHTML = `<div class="cm-content">${escHtml(text)}</div>`;
    } else {
      div.innerHTML = `<div class="cm-content cm-err">${text}</div>`;
    }

    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  _addThinking(id) {
    const body = document.getElementById('chat-body');
    const div  = document.createElement('div');
    div.id = id;
    div.className = 'cm cm-assistant cm-thinking';
    div.innerHTML = `
      <div class="cm-avatar">⬡</div>
      <div class="cm-content">
        <span class="think-dot"></span><span class="think-dot"></span><span class="think-dot"></span>
      </div>`;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  // Minimal markdown: bold, inline code, code blocks, line breaks
  _renderMarkdown(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
        `<pre class="chat-pre"><code>${code.trim()}</code></pre>`)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^#{1,3} (.+)$/gm, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  // ── CSS injection ────────────────────────────────────

  _injectCSS() {
    const style = document.createElement('style');
    style.textContent = `
/* ── Chat FAB ── */
#chat-fab {
  position: fixed;
  bottom: 28px;
  right: 28px;
  z-index: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: var(--slate-900);
  color: #fff;
  border: none;
  border-radius: 40px;
  font-family: var(--font);
  font-size: .875rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(0,0,0,.22), 0 1px 4px rgba(0,0,0,.12);
  transition: transform .15s, box-shadow .15s, background .15s;
  letter-spacing: -.01em;
}
#chat-fab:hover { background: var(--slate-700); transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,.28); }
.fab-label { white-space: nowrap; }
.fab-badge {
  position: absolute;
  top: -4px; right: -4px;
  width: 18px; height: 18px;
  background: var(--teal);
  color: #fff;
  border-radius: 50%;
  font-size: .65rem;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid #fff;
}

/* ── Chat Panel ── */
#chat-panel {
  position: fixed;
  bottom: 90px;
  right: 28px;
  z-index: 600;
  width: 420px;
  max-height: 620px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0,0,0,.18), 0 4px 16px rgba(0,0,0,.10);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  opacity: 0;
  transform: translateY(16px) scale(.97);
  pointer-events: none;
  transition: opacity .2s ease, transform .2s ease;
}
#chat-panel.visible {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: all;
}

/* ── Panel header ── */
.cp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  background: var(--slate-900);
  color: #fff;
  flex-shrink: 0;
}
.cp-title { display: flex; align-items: center; gap: 10px; }
.cp-icon { font-size: 1.2rem; color: var(--teal-light); }
.cp-name { font-size: .9rem; font-weight: 700; letter-spacing: -.02em; }
.cp-sub { font-size: .72rem; color: rgba(255,255,255,.5); margin-top: 1px; }
.cp-close {
  background: rgba(255,255,255,.1);
  border: none;
  color: #fff;
  width: 28px; height: 28px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background .15s;
  flex-shrink: 0;
}
.cp-close:hover { background: rgba(255,255,255,.2); }

/* ── Body ── */
.cp-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.cp-body::-webkit-scrollbar { width: 4px; }
.cp-body::-webkit-scrollbar-thumb { background: var(--slate-200); border-radius: 2px; }

/* ── Welcome state ── */
.cp-welcome { display: flex; flex-direction: column; gap: 12px; }
.cw-intro {
  font-size: .825rem;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 12px 14px;
  background: var(--teal-pale);
  border: 1px solid var(--teal-mid);
  border-radius: 10px;
  border-left: 3px solid var(--teal);
}
.cw-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  padding: 5px 11px;
  background: var(--off-white);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-family: var(--font);
  font-size: .76rem;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all .12s;
  text-align: left;
}
.chip:hover { background: var(--teal-pale); border-color: var(--teal); color: var(--teal); }

/* ── Messages ── */
.cm { display: flex; gap: 8px; animation: fadeUp .2s ease both; }
.cm-user { flex-direction: row-reverse; }
.cm-user .cm-content {
  background: var(--slate-900);
  color: #fff;
  border-radius: 16px 16px 4px 16px;
  padding: 10px 14px;
  font-size: .84rem;
  line-height: 1.55;
  max-width: 85%;
  word-break: break-word;
}
.cm-avatar {
  width: 28px; height: 28px;
  background: var(--teal);
  color: #fff;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: .8rem;
  flex-shrink: 0;
  margin-top: 2px;
}
.cm-assistant .cm-content {
  background: var(--off-white);
  border: 1px solid var(--border);
  border-radius: 4px 16px 16px 16px;
  padding: 10px 14px;
  font-size: .84rem;
  line-height: 1.6;
  max-width: calc(100% - 40px);
  word-break: break-word;
}
.cm-assistant .cm-content code {
  font-size: .78rem;
  background: var(--slate-100);
  padding: 1px 5px;
  border-radius: 3px;
}
.cm-assistant .cm-content .chat-pre {
  background: var(--slate-900);
  color: #e2e8f0;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: .76rem;
  overflow-x: auto;
  margin: 8px 0;
  font-family: var(--mono);
  line-height: 1.5;
}
.cm-assistant .cm-content .chat-pre code {
  background: none;
  color: inherit;
  padding: 0;
  font-size: inherit;
}
.cm-err { color: var(--crit); font-size: .82rem; }

/* ── Thinking dots ── */
.cm-thinking .cm-content {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
}
.think-dot {
  width: 6px; height: 6px;
  background: var(--slate-400);
  border-radius: 50%;
  animation: think-bounce .8s ease-in-out infinite;
}
.think-dot:nth-child(2) { animation-delay: .15s; }
.think-dot:nth-child(3) { animation-delay: .3s; }
@keyframes think-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: .5; }
  40%            { transform: translateY(-6px); opacity: 1; }
}

/* ── Footer ── */
.cp-footer {
  padding: 12px 14px 14px;
  border-top: 1px solid var(--border-soft);
  flex-shrink: 0;
  background: var(--surface);
}
.cp-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--off-white);
  border: 1.5px solid var(--border);
  border-radius: 12px;
  padding: 8px 8px 8px 14px;
  transition: border-color .15s;
}
.cp-input-row:focus-within { border-color: var(--teal); }
.cp-input {
  flex: 1;
  border: none;
  background: none;
  font-family: var(--font);
  font-size: .84rem;
  color: var(--text-primary);
  resize: none;
  outline: none;
  line-height: 1.5;
  min-height: 22px;
  max-height: 120px;
}
.cp-input::placeholder { color: var(--text-muted); }
.cp-send {
  width: 32px; height: 32px;
  background: var(--teal);
  border: none;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  color: #fff;
  flex-shrink: 0;
  transition: background .12s, transform .1s;
}
.cp-send:hover { background: var(--teal-light); transform: scale(1.05); }
.cp-disclaimer {
  font-size: .68rem;
  color: var(--text-muted);
  text-align: center;
  margin-top: 8px;
  letter-spacing: .01em;
}

/* ── Responsive ── */
@media (max-width: 480px) {
  #chat-panel { width: calc(100vw - 24px); right: 12px; bottom: 80px; }
  #chat-fab { right: 16px; bottom: 20px; padding: 10px 16px; }
}
    `;
    document.head.appendChild(style);
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
