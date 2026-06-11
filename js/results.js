// results.js — Renders dynamic AI + RAG output into the results page
import { RAGEngine }    from './rag.js';
import { RepoChat }     from './chat.js';
import { renderInsights } from './insights.js';

document.addEventListener('DOMContentLoaded', () => {
  initResultsTabs();

  const resultsRaw = sessionStorage.getItem('repoResults');
  const metaRaw    = sessionStorage.getItem('repoMeta');

  if (!resultsRaw || !metaRaw) {
    // No data — show demo mode notice
    showDemoNotice();
    initStaticFallback();
    return;
  }

  try {
    const results = JSON.parse(resultsRaw);
    const meta    = JSON.parse(metaRaw);
    renderAll(results, meta);
  } catch (e) {
    console.error('Failed to parse results:', e);
    showDemoNotice();
    initStaticFallback();
  }
});

// ── TAB SWITCHING ──
function initResultsTabs() {
  document.querySelectorAll('.rtab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const content = document.getElementById('tab-' + tab.dataset.tab);
      if (content) content.classList.add('active');
    });
  });
}

// ── MASTER RENDER ──
function renderAll(results, meta) {
  renderHeader(meta);
  renderOverview(results.overview, meta);
  renderKeyFiles(results.keyFiles);
  renderGotchas(results.gotchas);
  renderStartHere(results.startHere);
  renderGlossary(results.glossary);
  renderInsights(results, meta, meta._fileContents || {});
  initChat(meta);
}

function initChat(meta) {
  try {
    const rag = new RAGEngine();
    // Re-ingest from stored results for the chat RAG context
    const fileContents = meta._fileContents || {};
    if (Object.keys(fileContents).length > 0) {
      rag.ingest(fileContents);
    } else {
      // Build minimal context from results text for chat
      const synth = {};
      if (meta.description) synth['README.md'] = meta.description;
      rag.ingest(synth);
    }
    const chat = new RepoChat(rag, meta);
    chat.mount();
  } catch(e) {
    console.warn('Chat init failed:', e);
  }
}

// ── HEADER ──
function renderHeader(meta) {
  const titleEl = document.getElementById('repo-title');
  const descEl  = document.getElementById('repo-desc');
  const tagsEl  = document.getElementById('repo-tags');
  const badgeEl = document.getElementById('repo-badge-name');

  if (titleEl) titleEl.textContent = meta.repo || meta.fullName;
  if (descEl)  descEl.textContent  = meta.description || '';
  if (badgeEl) badgeEl.textContent = meta.fullName || '';

  if (tagsEl) {
    const tags = [];
    if (meta.language) tags.push({ text: meta.language, green: false });
    (meta.topics || []).slice(0, 4).forEach(t => tags.push({ text: t, green: false }));
    if (meta.stats?.fileCount > 1000) tags.push({ text: 'Large Codebase', green: false });
    tags.push({ text: 'AI-analyzed', green: true });
    tagsEl.innerHTML = tags.map(t =>
      `<span class="tag${t.green ? ' green' : ''}">${t.text}</span>`
    ).join('');
  }

  // Stats
  const s = meta.stats || {};
  setText('stat-files',  s.fileCount?.toLocaleString() || '—');
  setText('stat-langs',  meta.languages ? Object.keys(meta.languages).length : '—');
  setText('stat-size',   s.totalKB ? `${s.totalKB}KB` : '—');
  setText('stat-stars',  meta.stars?.toLocaleString() || '—');
}

// ── OVERVIEW ──
function renderOverview(ov, meta) {
  if (!ov) return;
  const el = document.getElementById('tab-overview');
  if (!el) return;

  // Language breakdown bar
  const langBar = Object.entries(meta.languages || {})
    .sort((a,b) => b[1]-a[1]).slice(0,6);
  const totalBytes = langBar.reduce((s,[,v]) => s+v, 0);
  const langBarHtml = langBar.map(([lang, bytes]) => {
    const pct = ((bytes/totalBytes)*100).toFixed(1);
    return `<div class="lang-seg" style="width:${pct}%;background:${langColor(lang)}" title="${lang}: ${pct}%"></div>`;
  }).join('');
  const langLabels = langBar.map(([lang, bytes]) => {
    const pct = ((bytes/totalBytes)*100).toFixed(1);
    return `<span class="lang-label"><span class="lang-dot" style="background:${langColor(lang)}"></span>${lang} <em>${pct}%</em></span>`;
  }).join('');

  el.innerHTML = `
  <div class="content-grid">
    <div class="col-main">
      <div class="card">
        <div class="card-head"><h2>Architecture Overview</h2></div>
        <div class="card-body">
          <p class="arch-summary">${ov.summary || ''}</p>
          <div class="arch-pattern">
            <div class="pattern-label">Architecture Pattern</div>
            <div class="pattern-badge">${ov.architecturePattern || ''}</div>
          </div>
          <p style="font-size:.875rem;color:var(--text-secondary);margin-bottom:20px;line-height:1.65">${ov.architectureExplanation || ''}</p>
          <div class="arch-diagram">
            ${(ov.layers || []).map((layer, i) => `
              ${i > 0 ? '<div class="arch-arrow">↓</div>' : ''}
              <div class="arch-layer ${i===0?'layer-1':i===1?'layer-2':'layer-3'}">
                <span class="layer-label">${layer.name}</span>
                <div class="layer-items">${(layer.items||[]).map(item=>`<span>${item}</span>`).join('')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Folder Structure</h2></div>
        <div class="card-body">
          <div class="folder-tree">
            ${(ov.folderNotes || []).map(f => `
              <div class="tree-item ${f.isKey ? 'key' : ''}" style="padding-left:${(f.path.match(/\//g)||[]).length * 16}px">
                📁 ${f.path.split('/').pop()}/
                <span class="tree-note">${f.note}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Languages</h2></div>
        <div class="card-body">
          <div class="lang-bar">${langBarHtml}</div>
          <div class="lang-labels">${langLabels}</div>
        </div>
      </div>
    </div>

    <div class="col-side">
      <div class="card">
        <div class="card-head"><h2>Tech Stack</h2></div>
        <div class="card-body">
          <div class="stack-list">
            ${(ov.techStack || []).map(t => `
              <div class="stack-item">
                <span class="stack-icon">${t.icon || '⚙️'}</span>
                <div><strong>${t.name}</strong><span>${t.role}</span></div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>AI Insight</h2></div>
        <div class="card-body ai-summary">
          <p>${ov.aiInsight || ''}</p>
          <div class="complexity-meter">
            <div class="cm-label">Complexity for new contributors</div>
            <div class="cm-bar"><div class="cm-fill" style="width:${(ov.complexityScore||5)*10}%"></div></div>
            <div class="cm-value">${ov.complexityLabel || ''} (${ov.complexityScore || '?'}/10)</div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

// ── KEY FILES ──
function renderKeyFiles(files) {
  const el = document.getElementById('tab-keyfiles');
  if (!el || !files) return;

  const impClass = imp => {
    if (imp === 'Critical') return 'imp-critical';
    if (imp === 'High')     return 'imp-high';
    return 'imp-medium';
  };

  el.innerHTML = `
    <div class="keyfiles-header">
      <h2>Key Files & Entry Points</h2>
      <p>The files that matter most. Start here to understand the codebase.</p>
    </div>
    <div class="keyfiles-grid">
      ${files.map(f => `
        <div class="file-card" onclick="toggleFile(this)">
          <div class="file-card-head">
            <div class="file-info">
              <span class="file-path">${f.path}</span>
              <div class="file-meta">
                <span class="file-lang">${f.language || ''}</span>
                <span class="importance ${impClass(f.importance)}">${f.importance}</span>
              </div>
            </div>
            <span class="file-chevron">›</span>
          </div>
          <div class="file-card-body">
            <p class="file-role"><strong>Role:</strong> ${f.role}</p>
            <p style="font-size:.85rem;color:var(--text-secondary);line-height:1.65;margin-bottom:12px">${f.detail || ''}</p>
            ${(f.keyFunctions||[]).length ? `
              <div class="fn-label">Key functions</div>
              <div class="fn-list">
                ${f.keyFunctions.map(fn => `
                  <span class="fn-item"><code>${fn.name}</code> — ${fn.desc}</span>
                `).join('')}
              </div>
            ` : ''}
            ${f.tip ? `<div class="file-tip">💡 ${f.tip}</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>`;

  // Open first card
  const first = el.querySelector('.file-card');
  if (first) first.classList.add('open');
}

// ── GOTCHAS ──
function renderGotchas(gotchas) {
  const el = document.getElementById('tab-gotchas');
  if (!el || !gotchas) return;

  const sevClass = s => {
    if (s==='Critical') return 'sev-critical';
    if (s==='High')     return 'sev-high';
    if (s==='Medium')   return 'sev-medium';
    return 'sev-low';
  };

  el.innerHTML = `
    <div class="gotchas-header">
      <h2>Gotchas & Pitfalls</h2>
      <p>Things that will bite you. Read before you touch anything.</p>
      <div class="severity-legend">
        <span class="sev sev-critical">Critical</span>
        <span class="sev sev-high">High</span>
        <span class="sev sev-medium">Medium</span>
        <span class="sev sev-low">Low</span>
      </div>
    </div>
    <div class="gotchas-list">
      ${gotchas.map(g => `
        <div class="gotcha-card">
          <div class="gotcha-sev ${sevClass(g.severity)}">${g.severity}</div>
          <div class="gotcha-body">
            <h3>${g.title}</h3>
            <p>${g.description}</p>
            ${g.tip ? `<div class="gotcha-tip"><strong>How to handle:</strong> ${g.tip}</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>`;
}

// ── START HERE ──
function renderStartHere(sh) {
  const el = document.getElementById('tab-starthere');
  if (!el || !sh) return;

  el.innerHTML = `
    <div class="starthere-header">
      <h2>Your Start Here Guide</h2>
      <p>A personalised onboarding path. Follow in order for the fastest ramp-up.</p>
      <div class="total-time">⏱ Estimated total: <strong>${sh.totalTime || '3-4 hours'}</strong></div>
    </div>
    <div class="onboarding-path">
      ${(sh.steps || []).map((step, i) => `
        <div class="onboard-step">
          <div class="os-num">${step.num || i+1}</div>
          <div class="os-body">
            <div class="os-head">
              <h3>${step.title}</h3>
              <span class="os-time">${step.time || ''}</span>
            </div>
            <p>${step.description}</p>
            ${(step.commands||[]).length ? `
              <div class="os-commands">
                ${step.commands.map(cmd => `<code>${escHtml(cmd)}</code>`).join('')}
              </div>
            ` : ''}
            ${step.tip ? `<div class="os-tip">💡 ${step.tip}</div>` : ''}
          </div>
        </div>
        ${i < (sh.steps.length-1) ? '<div class="path-connector"></div>' : ''}
      `).join('')}
    </div>
    ${sh.firstPR ? `
      <div class="first-pr-card">
        <div class="fpr-label">🎯 Suggested First PR</div>
        <h3>${sh.firstPR.title}</h3>
        <p>${sh.firstPR.description}</p>
        <div class="fpr-why"><strong>Why this?</strong> ${sh.firstPR.rationale}</div>
      </div>
    ` : ''}`;
}

// ── GLOSSARY ──
function renderGlossary(glossary) {
  const el = document.getElementById('tab-glossary');
  if (!el || !glossary) return;

  el.innerHTML = `
    <div class="glossary-header">
      <h2>Project Glossary</h2>
      <p>Terms unique to this codebase that'll confuse you if you don't know them.</p>
      <div class="glossary-search-wrap">
        <input type="text" id="glossary-search" class="glossary-search" placeholder="Search terms…" oninput="filterGlossary(this.value)" />
      </div>
    </div>
    <div class="glossary-list" id="glossary-list">
      ${glossary.map(g => `
        <div class="glossary-item">
          <div class="gterm">${g.term}</div>
          <div class="gdef">${g.definition}</div>
        </div>
      `).join('')}
    </div>`;
}

// ── GLOSSARY SEARCH ──
window.filterGlossary = function(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll('.glossary-item').forEach(item => {
    const term = item.querySelector('.gterm')?.textContent.toLowerCase() || '';
    const def  = item.querySelector('.gdef')?.textContent.toLowerCase() || '';
    item.classList.toggle('hidden', q !== '' && !term.includes(q) && !def.includes(q));
  });
};

// ── FILE CARDS ──
window.toggleFile = function(card) {
  card.classList.toggle('open');
};

// ── STICKY SHADOW ──
window.addEventListener('scroll', () => {
  const bar = document.getElementById('tab-bar');
  if (bar) bar.style.boxShadow = window.scrollY > 0 ? '0 2px 12px rgba(0,0,0,.07)' : 'none';
});

// ── DEMO NOTICE ──
function showDemoNotice() {
  const notice = document.createElement('div');
  notice.style.cssText = `
    position:fixed; bottom:20px; right:20px; z-index:999;
    background:var(--slate-900); color:#fff;
    padding:12px 18px; border-radius:10px;
    font-size:.8rem; font-weight:500;
    box-shadow: 0 4px 20px rgba(0,0,0,.3);
    max-width:280px; line-height:1.5;
  `;
  notice.innerHTML = `📋 <strong>Demo mode</strong> — showing sample data.<br>Enter a real GitHub URL to analyze live.
    <a href="../index.html" style="display:block;margin-top:8px;color:var(--teal-light);font-weight:700;text-decoration:none">← Analyze a real repo</a>`;
  document.body.appendChild(notice);
}

function initStaticFallback() {
  // The existing static HTML content stays as-is
  const first = document.querySelector('.file-card');
  if (first) first.classList.add('open');
}

// ── Utils ──
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function langColor(lang) {
  const map = {
    JavaScript:'#f7df1e', TypeScript:'#3178c6', Python:'#3572A5',
    Go:'#00ADD8', Rust:'#dea584', Java:'#b07219', 'C#':'#178600',
    'C++':'#f34b7d', C:'#555555', Ruby:'#701516', PHP:'#4F5D95',
    Swift:'#FA7343', Kotlin:'#A97BFF', HTML:'#e34c26', CSS:'#563d7c',
    Shell:'#89e051', Vue:'#41b883', Dart:'#00B4AB',
  };
  return map[lang] || '#8b949e';
}
