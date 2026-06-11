// loading.js — Real pipeline: GitHub fetch → RAG index → AI generation

import { GitHubClient } from './github.js';
import { RAGEngine }    from './rag.js';
import { RepoAI }       from './ai.js';

const STEP_IDS = ['step-1','step-2','step-3','step-4','step-5','step-6'];

document.addEventListener('DOMContentLoaded', () => {
  const repoUrl = sessionStorage.getItem('repoUrl') || '';
  const label = document.getElementById('loading-repo-url');
  if (label) label.textContent = repoUrl.replace('local://', '') || 'No repo URL found';

  // Check if this is a local upload (ZIP mode)
  const uploadData = sessionStorage.getItem('uploadRepoData');
  if (repoUrl.startsWith('local://') && uploadData) {
    runUploadPipeline(JSON.parse(uploadData));
    return;
  }

  if (!repoUrl) {
    showError('No repository URL provided. Go back and enter a GitHub URL.');
    return;
  }

  runPipeline(repoUrl);
});

async function runPipeline(repoUrl) {
  try {
    const github = new GitHubClient(); // no token = public repos only, 60 req/hr
    const rag    = new RAGEngine();

    // ── Step 1-2: GitHub fetch ──
    markStep(0, 'active');
    const repoData = await github.analyzeRepo(repoUrl, (msg, pct) => {
      updateProgress(pct, msg);
      if (pct >= 30 && pct < 50) { markStep(0,'done'); markStep(1,'active'); }
      if (pct >= 50 && pct < 65) { markStep(1,'done'); markStep(2,'active'); }
      if (pct >= 65)             { markStep(2,'done'); markStep(3,'active'); }
    });

    // ── Step 3: RAG index ──
    markStep(3, 'active');
    updateProgress(76, 'Building RAG index…');
    const chunkCount = rag.ingest(repoData.fileContents);
    console.log(`RAG: indexed ${chunkCount} chunks from ${Object.keys(repoData.fileContents).length} files`);
    markStep(3, 'done');

    // ── Steps 4-6: AI generation ──
    markStep(4, 'active');
    const ai = new RepoAI(rag);
    const results = await ai.generateAll(repoData, (msg, pct) => {
      updateProgress(pct, msg);
      if (pct >= 83) { markStep(4,'done'); markStep(5,'active'); }
    });
    markStep(5, 'done');
    updateProgress(100, 'Complete!');

    // ── Store and navigate ──
    sessionStorage.setItem('repoResults', JSON.stringify(results));
    // Persist a slim version of fileContents for chat RAG (cap per file)
    const slimContents = {};
    for (const [k, v] of Object.entries(repoData.fileContents)) {
      slimContents[k] = typeof v === 'string' ? v.slice(0, 4000) : v;
    }
    sessionStorage.setItem('repoMeta', JSON.stringify({
      fullName: repoData.meta.full_name,
      description: repoData.meta.description,
      owner: repoData.owner,
      repo: repoData.repo,
      stars: repoData.meta.stargazers_count,
      language: repoData.meta.language,
      topics: repoData.meta.topics || [],
      stats: repoData.stats,
      languages: repoData.languages,
      _fileContents: slimContents,
    }));

    setTimeout(() => { window.location.href = 'results.html'; }, 600);

  } catch (err) {
    console.error('Pipeline error:', err);
    showError(err.message);
  }
}

async function runUploadPipeline(repoData) {
  try {
    const rag = new RAGEngine();

    markStep(0, 'done');
    markStep(1, 'done');
    markStep(2, 'done');
    updateProgress(72, 'ZIP extracted — building index…');

    // RAG index
    markStep(3, 'active');
    const chunkCount = rag.ingest(repoData.fileContents);
    console.log(`RAG: indexed ${chunkCount} chunks from ${Object.keys(repoData.fileContents).length} files`);
    markStep(3, 'done');

    // AI generation
    markStep(4, 'active');
    updateProgress(78, 'Generating analysis…');
    const ai = new RepoAI(rag);
    const results = await ai.generateAll(repoData, (msg, pct) => {
      updateProgress(pct, msg);
      if (pct >= 83) { markStep(4,'done'); markStep(5,'active'); }
    });
    markStep(5, 'done');
    updateProgress(100, 'Complete!');

    sessionStorage.setItem('repoResults', JSON.stringify(results));
    const slimContents2 = {};
    for (const [k, v] of Object.entries(repoData.fileContents)) {
      slimContents2[k] = typeof v === 'string' ? v.slice(0, 4000) : v;
    }
    sessionStorage.setItem('repoMeta', JSON.stringify({
      fullName: repoData.meta.full_name,
      description: repoData.meta.description,
      owner: repoData.owner,
      repo: repoData.repo,
      stars: 0,
      language: repoData.meta.language,
      topics: repoData.meta.topics || [],
      stats: repoData.stats,
      languages: repoData.languages,
      _fileContents: slimContents2,
    }));
    sessionStorage.removeItem('uploadRepoData');

    setTimeout(() => { window.location.href = 'results.html'; }, 600);

  } catch (err) {
    console.error('Upload pipeline error:', err);
    showError(err.message);
  }
}

function updateProgress(pct, msg) {
  const bar = document.getElementById('progress-fill');
  if (bar) bar.style.width = Math.min(pct, 100) + '%';

  const title = document.querySelector('.loading-title');
  if (title && msg) title.textContent = msg;
}

function markStep(index, state) {
  const el = document.getElementById(STEP_IDS[index]);
  if (!el) return;

  el.classList.remove('done','active');
  el.classList.add(state);

  const indicator = el.querySelector('.step-check, .step-spinner, .step-dot');
  if (!indicator) return;

  if (state === 'done') {
    indicator.outerHTML = '<span class="step-check">✓</span>';
  } else if (state === 'active') {
    indicator.outerHTML = '<span class="step-spinner"></span>';
  }
}

function showError(msg) {
  const card = document.querySelector('.loading-card');
  if (!card) return;
  card.innerHTML = `
    <div style="text-align:center; padding: 20px 0;">
      <div style="font-size:2.5rem; margin-bottom:16px;">⚠️</div>
      <h2 style="font-size:1.1rem; font-weight:700; margin-bottom:10px; color:var(--crit)">Analysis Failed</h2>
      <p style="font-size:.875rem; color:var(--text-secondary); margin-bottom:20px; line-height:1.6">${msg}</p>
      <a href="../index.html" style="display:inline-block; padding:10px 22px; background:var(--teal); color:#fff; border-radius:8px; font-weight:600; text-decoration:none; font-size:.875rem;">← Try another repo</a>
      <p style="font-size:.75rem; color:var(--text-muted); margin-top:14px;">Note: Only public GitHub repos are supported without an API token.</p>
    </div>
  `;
}
