// landing.js — Tab switching, sample chips, API key, analyze action

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initUploadZone();
  restoreApiKey();
});

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });
}

function restoreApiKey() {
  const saved = sessionStorage.getItem('groqKey');
  const input = document.getElementById('api-key');
  if (saved && input) input.value = saved;
}

function initUploadZone() {
  const zone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  if (!zone) return;
  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.style.borderColor = 'var(--teal)';
    zone.style.background = 'var(--teal-pale)';
  });
  zone.addEventListener('dragleave', () => {
    zone.style.borderColor = '';
    zone.style.background = '';
  });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.style.borderColor = '';
    zone.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file) {
      window._droppedFile = file;
      // Also assign to file input if possible
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
      } catch(_) {}
      updateZoneLabel(file.name);
    }
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) updateZoneLabel(fileInput.files[0].name);
  });
}

function updateZoneLabel(name) {
  const text = document.querySelector('.upload-text');
  if (text) text.innerHTML = `<strong>${name}</strong><br><span>Ready to analyze</span>`;
}

window.setRepo = function(url) {
  const input = document.getElementById('repo-url');
  if (input) {
    input.value = url;
    input.focus();
    document.querySelector('.tab[data-tab="url"]')?.click();
  }
};

window.analyzeRepo = function() {
  const urlInput = document.getElementById('repo-url');
  const keyInput = document.getElementById('api-key');
  const url = urlInput?.value.trim() || '';
  const key = keyInput?.value.trim() || '';

  if (!url) {
    urlInput?.focus();
    urlInput?.closest('.url-input-wrap')?.classList.add('error');
    return;
  }
  if (!key) {
    alert('Please enter your Groq API key to analyze a repo.');
    keyInput?.focus();
    return;
  }

  sessionStorage.setItem('repoUrl', url);
  sessionStorage.setItem('groqKey', key);
  window.location.href = 'pages/loading.html';
};

// Enter key in URL input
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('repo-url');
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') window.analyzeRepo(); });
});

// ── UPLOAD PIPELINE ──
const SKIP_DIRS_UPLOAD = ['node_modules', '.git', 'dist', 'build', '.next', 'out', '__pycache__', '.cache', 'coverage', 'vendor', 'target', 'bin', 'obj'];
const IMPORTANT_EXTS   = ['.ts','.tsx','.js','.jsx','.py','.go','.rs','.java','.cs','.cpp','.c','.rb','.php','.swift','.kt','.vue','.svelte','.astro'];
const PRIORITY_NAMES   = ['README.md','package.json','tsconfig.json','requirements.txt','go.mod','Cargo.toml','Dockerfile','docker-compose.yml','.env.example','CONTRIBUTING.md','vite.config.ts','vite.config.js','next.config.js','next.config.ts','pyproject.toml'];

window.analyzeUpload = async function() {
  const fileInput = document.getElementById('file-input');
  const keyInput  = document.getElementById('api-key');
  const btn       = document.getElementById('upload-btn');

  const key = keyInput?.value.trim() || '';
  if (!key) {
    alert('Please enter your Groq API key.');
    keyInput?.focus();
    return;
  }

  const file = fileInput?.files[0] || window._droppedFile;
  if (!file) {
    alert('Please select or drop a ZIP file first.');
    return;
  }

  if (!window.JSZip) {
    alert('JSZip not loaded yet, please wait a moment and try again.');
    return;
  }

  sessionStorage.setItem('groqKey', key);
  sessionStorage.setItem('repoUrl', ''); // clear so loading.js knows it's upload mode

  // Show loading state on button
  if (btn) { btn.textContent = 'Reading ZIP…'; btn.disabled = true; }

  try {
    const zip = await JSZip.loadAsync(file);
    const allPaths = Object.keys(zip.files).filter(p => !zip.files[p].dir);

    // Detect root folder prefix (e.g. "myrepo-main/")
    const prefix = detectPrefix(allPaths);

    // Build file list stripping prefix
    const entries = allPaths.map(p => ({
      fullPath: p,
      path: prefix ? p.slice(prefix.length) : p,
      size: zip.files[p]._data?.uncompressedSize || 0,
    })).filter(e => e.path && !SKIP_DIRS_UPLOAD.some(d => e.path.startsWith(d + '/')));

    if (btn) btn.textContent = 'Extracting files…';

    // Read priority files + important source files (cap at 35 total)
    const priorityEntries = entries.filter(e => PRIORITY_NAMES.some(n => e.path === n || e.path.endsWith('/' + n)));
    const sourceEntries   = entries.filter(e => IMPORTANT_EXTS.some(x => e.path.endsWith(x)) && e.size < 50000)
      .sort((a, b) => (a.path.match(/\//g)||[]).length - (b.path.match(/\//g)||[]).length)
      .slice(0, 30);

    const toFetch = [...new Set([...priorityEntries, ...sourceEntries].map(e => e.fullPath))]
      .slice(0, 40);

    const fileContents = {};
    await Promise.all(toFetch.map(async fullPath => {
      try {
        const text = await zip.files[fullPath].async('text');
        const shortPath = prefix ? fullPath.slice(prefix.length) : fullPath;
        fileContents[shortPath] = text.slice(0, 8000);
      } catch (_) {}
    }));

    // Build fake meta from zip name + contents
    const repoName  = file.name.replace(/\.zip$/i, '').replace(/[_-](main|master|v?\d[\d.]*)?$/, '');
    const pkgJson   = fileContents['package.json'] ? safeJson(fileContents['package.json']) : null;
    const languages = detectLanguages(entries);

    const fakeRepoData = {
      meta: {
        full_name: repoName,
        description: pkgJson?.description || '',
        stargazers_count: 0,
        forks_count: 0,
        default_branch: 'main',
        created_at: new Date().toISOString(),
        language: Object.entries(languages).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'Unknown',
        topics: pkgJson?.keywords || [],
        open_issues_count: 0,
        license: null,
      },
      owner: 'local',
      repo: repoName,
      branch: 'main',
      tree: entries.map(e => ({ path: e.path, type: 'blob', size: e.size })),
      treeSummary: buildUploadTreeSummary(entries),
      fileContents,
      languages,
      commits: [],
      contributors: [],
      stats: {
        fileCount: entries.length,
        dirCount: 0,
        totalKB: Math.round(entries.reduce((s, e) => s + e.size, 0) / 1024),
        topLanguage: Object.entries(languages).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'Unknown',
        languageCount: Object.keys(languages).length,
      },
    };

    // Store and redirect to loading page (skip GitHub, run AI directly)
    sessionStorage.setItem('uploadRepoData', JSON.stringify(fakeRepoData));
    sessionStorage.setItem('repoUrl', 'local://' + repoName);
    window.location.href = 'pages/loading.html';

  } catch (err) {
    console.error('Upload error:', err);
    alert('Failed to read ZIP: ' + err.message);
    if (btn) { btn.textContent = 'Analyze Upload'; btn.disabled = false; }
  }
};

function detectPrefix(paths) {
  if (!paths.length) return '';
  const first = paths[0].split('/')[0] + '/';
  return paths.every(p => p.startsWith(first)) ? first : '';
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function detectLanguages(entries) {
  const extMap = {
    '.ts':'TypeScript','.tsx':'TypeScript','.js':'JavaScript','.jsx':'JavaScript',
    '.py':'Python','.go':'Go','.rs':'Rust','.java':'Java','.cs':'C#',
    '.cpp':'C++','.c':'C','.rb':'Ruby','.php':'PHP','.swift':'Swift',
    '.kt':'Kotlin','.vue':'Vue','.svelte':'Svelte','.astro':'Astro',
    '.html':'HTML','.css':'CSS','.scss':'SCSS','.md':'Markdown',
  };
  const counts = {};
  entries.forEach(e => {
    const ext = '.' + e.path.split('.').pop().toLowerCase();
    const lang = extMap[ext];
    if (lang) counts[lang] = (counts[lang] || 0) + e.size;
  });
  return counts;
}

function buildUploadTreeSummary(entries) {
  const dirs = new Set();
  entries.forEach(e => {
    const parts = e.path.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  });
  const lines = [...dirs]
    .filter(d => (d.match(/\//g)||[]).length < 3)
    .filter(d => !SKIP_DIRS_UPLOAD.some(s => d.startsWith(s)))
    .slice(0, 40)
    .map(d => '  '.repeat((d.match(/\//g)||[]).length) + '📁 ' + d.split('/').pop() + '/');
  entries.filter(e => !e.path.includes('/') && IMPORTANT_EXTS.concat(['.json','.md','.toml','.yaml','.yml']).some(x => e.path.endsWith(x)))
    .slice(0, 15).forEach(e => lines.push('📄 ' + e.path));
  return lines.join('\n');
}
