// github.js — Real GitHub API integration
// Fetches repo metadata, file tree, and key file contents

const GITHUB_API = 'https://api.github.com';

// Files we always try to fetch for context
const PRIORITY_FILES = [
  'README.md', 'readme.md', 'README.mdx',
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'tsconfig.json', 'jsconfig.json',
  'webpack.config.js', 'vite.config.js', 'vite.config.ts', 'rollup.config.js',
  'next.config.js', 'next.config.ts',
  'docker-compose.yml', 'Dockerfile',
  '.env.example', '.env.sample',
  'CONTRIBUTING.md', 'ARCHITECTURE.md', 'DESIGN.md',
  'go.mod', 'Cargo.toml', 'requirements.txt', 'pyproject.toml', 'setup.py',
  'Makefile', 'turbo.json', 'nx.json', 'lerna.json',
];

const IMPORTANT_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
  '.cs', '.cpp', '.c', '.rb', '.php', '.swift', '.kt',
  '.vue', '.svelte', '.astro',
];

const SKIP_DIRS = [
  'node_modules', '.git', 'dist', 'build', '.next', 'out',
  '__pycache__', '.cache', 'coverage', '.nyc_output', 'vendor',
  '.turbo', '.vercel', 'target', 'bin', 'obj',
];

export class GitHubClient {
  constructor(token = null) {
    this.token = token;
    this.headers = {
      'Accept': 'application/vnd.github.v3+json',
      ...(token ? { 'Authorization': `token ${token}` } : {}),
    };
  }

  async fetchJSON(url) {
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub API error: ${res.status} ${url}`);
    }
    return res.json();
  }

  async fetchText(url) {
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return null;
    return res.text();
  }

  // Parse "https://github.com/owner/repo" → { owner, repo }
  static parseUrl(url) {
    url = url.trim().replace(/\/$/, '').replace(/\.git$/, '');
    const match = url.match(/github\.com[:/]([^/]+)\/([^/]+)/);
    if (!match) throw new Error('Invalid GitHub URL. Expected: https://github.com/owner/repo');
    return { owner: match[1], repo: match[2] };
  }

  // Main entry: fetch everything we need about a repo
  async analyzeRepo(repoUrl, onProgress) {
    const { owner, repo } = GitHubClient.parseUrl(repoUrl);
    onProgress('Fetching repository metadata…', 5);

    // 1. Repo metadata
    const meta = await this.fetchJSON(`${GITHUB_API}/repos/${owner}/${repo}`);

    onProgress('Fetching file tree…', 15);

    // 2. Full file tree (recursive)
    let tree = [];
    try {
      const branch = meta.default_branch || 'main';
      const treeData = await this.fetchJSON(
        `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
      );
      tree = treeData.tree || [];
    } catch (e) {
      console.warn('Tree fetch failed:', e.message);
    }

    onProgress('Reading priority files…', 30);

    // 3. Fetch priority file contents
    const fileContents = {};
    const branch = meta.default_branch || 'main';
    const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;

    // Fetch priority files
    const priorityFetches = PRIORITY_FILES.map(async (fname) => {
      const treeEntry = tree.find(f => f.path === fname || f.path.endsWith('/' + fname));
      if (!treeEntry) return;
      const text = await this.fetchText(`${rawBase}/${treeEntry.path}`);
      if (text) fileContents[treeEntry.path] = text.slice(0, 8000); // cap at 8KB each
    });
    await Promise.allSettled(priorityFetches);

    onProgress('Sampling source files…', 50);

    // 4. Sample important source files (top-level + key dirs)
    const sourceFiles = tree
      .filter(f => f.type === 'blob')
      .filter(f => !SKIP_DIRS.some(d => f.path.startsWith(d + '/')))
      .filter(f => IMPORTANT_EXTENSIONS.some(ext => f.path.endsWith(ext)))
      .filter(f => f.size && f.size < 50000) // skip huge files
      .sort((a, b) => {
        // Prefer shorter paths (closer to root) and smaller depth
        const depthA = (a.path.match(/\//g) || []).length;
        const depthB = (b.path.match(/\//g) || []).length;
        return depthA - depthB;
      })
      .slice(0, 25); // top 25 source files

    const sourceFetches = sourceFiles.map(async (f) => {
      if (fileContents[f.path]) return; // already fetched
      const text = await this.fetchText(`${rawBase}/${f.path}`);
      if (text) fileContents[f.path] = text.slice(0, 6000);
    });
    await Promise.allSettled(sourceFetches);

    onProgress('Computing repo statistics…', 65);

    // 5. Language stats
    let languages = {};
    try {
      languages = await this.fetchJSON(`${GITHUB_API}/repos/${owner}/${repo}/languages`);
    } catch (e) {}

    // 6. Recent commits (for activity signal)
    let commits = [];
    try {
      commits = await this.fetchJSON(`${GITHUB_API}/repos/${owner}/${repo}/commits?per_page=10`);
    } catch (e) {}

    // 7. Contributors
    let contributors = [];
    try {
      contributors = await this.fetchJSON(`${GITHUB_API}/repos/${owner}/${repo}/contributors?per_page=5`);
    } catch (e) {}

    // 8. Build tree summary
    const treeSummary = buildTreeSummary(tree);

    onProgress('Preparing context for AI…', 75);

    return {
      meta,
      owner,
      repo,
      branch,
      tree,
      treeSummary,
      fileContents,
      languages,
      commits,
      contributors,
      stats: computeStats(tree, languages),
    };
  }
}

function computeStats(tree, languages) {
  const files = tree.filter(f => f.type === 'blob');
  const dirs = tree.filter(f => f.type === 'tree');
  const totalBytes = files.reduce((s, f) => s + (f.size || 0), 0);
  const topLang = Object.entries(languages).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
  return {
    fileCount: files.length,
    dirCount: dirs.length,
    totalKB: Math.round(totalBytes / 1024),
    topLanguage: topLang,
    languageCount: Object.keys(languages).length,
  };
}

function buildTreeSummary(tree) {
  // Build a compact folder overview (depth ≤ 3, skip noise dirs)
  const lines = [];
  const seen = new Set();

  tree
    .filter(f => f.type === 'tree')
    .filter(f => !SKIP_DIRS.some(d => f.path.startsWith(d)))
    .filter(f => (f.path.match(/\//g) || []).length < 3)
    .slice(0, 40)
    .forEach(f => {
      const depth = (f.path.match(/\//g) || []).length;
      lines.push('  '.repeat(depth) + '📁 ' + f.path.split('/').pop() + '/');
    });

  // Add top-level files
  tree
    .filter(f => f.type === 'blob' && !f.path.includes('/'))
    .slice(0, 15)
    .forEach(f => lines.push('📄 ' + f.path));

  return lines.join('\n');
}
