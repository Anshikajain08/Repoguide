// insights.js — Smart Insights panel: dependency graph, health metrics, quick wins
// Atlassian-grade polish: animated counters, interactive graph, color-coded health

export function renderInsights(results, meta, fileContents) {
  const el = document.getElementById('tab-insights');
  if (!el) return;

  const deps   = buildDepGraph(fileContents);
  const health = computeHealth(meta, results, fileContents);

  el.innerHTML = `
    <div class="content-grid">
      <div class="col-main">

        <!-- Health Score Card -->
        <div class="card">
          <div class="card-head" style="display:flex;align-items:center;justify-content:space-between">
            <h2>Repo Health Score</h2>
            <span class="health-badge health-${health.grade.toLowerCase()}">${health.grade}</span>
          </div>
          <div class="card-body">
            <div class="health-score-row">
              <div class="health-ring">
                <svg viewBox="0 0 64 64" width="80" height="80">
                  <circle cx="32" cy="32" r="26" fill="none" stroke="var(--border)" stroke-width="6"/>
                  <circle cx="32" cy="32" r="26" fill="none" stroke="${health.color}" stroke-width="6"
                    stroke-dasharray="${2 * Math.PI * 26}"
                    stroke-dashoffset="${2 * Math.PI * 26 * (1 - health.score / 100)}"
                    stroke-linecap="round"
                    transform="rotate(-90 32 32)"
                    style="transition: stroke-dashoffset 1s ease"/>
                  <text x="32" y="36" text-anchor="middle" font-size="14" font-weight="700" fill="${health.color}" font-family="Plus Jakarta Sans, sans-serif">${health.score}</text>
                </svg>
              </div>
              <div class="health-metrics">
                ${health.metrics.map(m => `
                  <div class="hm-row">
                    <span class="hm-icon">${m.pass ? '✅' : '⚠️'}</span>
                    <span class="hm-label">${m.label}</span>
                    <span class="hm-val ${m.pass ? 'pass' : 'warn'}">${m.value}</span>
                  </div>
                `).join('')}
              </div>
            </div>
            <div class="health-wins">
              <div class="hw-label">Quick wins to improve health</div>
              ${health.wins.map(w => `
                <div class="hw-item">
                  <span class="hw-dot" style="background:${w.color}"></span>
                  <span>${w.text}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Dependency Graph Card -->
        <div class="card">
          <div class="card-head">
            <h2>Import / Dependency Graph</h2>
          </div>
          <div class="card-body" style="padding:0">
            <div id="dep-graph-container" class="dep-graph-wrap">
              <canvas id="dep-canvas" width="680" height="340"></canvas>
              <div class="dep-legend">
                <span class="dl-item"><span class="dl-dot" style="background:#0d9488"></span>Entry / main</span>
                <span class="dl-item"><span class="dl-dot" style="background:#6366f1"></span>Shared util</span>
                <span class="dl-item"><span class="dl-dot" style="background:#64748b"></span>Module</span>
              </div>
            </div>
          </div>
        </div>

      </div>
      <div class="col-side">

        <!-- File Complexity Card -->
        <div class="card">
          <div class="card-head"><h2>File Size Distribution</h2></div>
          <div class="card-body" style="padding:16px 20px">
            ${buildFileSizeChart(fileContents)}
          </div>
        </div>

        <!-- Tech Debt Signals -->
        <div class="card">
          <div class="card-head"><h2>Tech Debt Signals</h2></div>
          <div class="card-body" style="padding:0">
            <div class="debt-list">
              ${buildDebtSignals(fileContents).map(d => `
                <div class="debt-item">
                  <span class="debt-sev debt-${d.level}">${d.level}</span>
                  <div class="debt-body">
                    <div class="debt-title">${d.title}</div>
                    <div class="debt-file">${d.file}</div>
                  </div>
                  <span class="debt-count">${d.count}×</span>
                </div>
              `).join('') || '<div style="padding:20px;text-align:center;font-size:.8rem;color:var(--text-muted)">✅ No obvious debt signals found</div>'}
            </div>
          </div>
        </div>

      </div>
    </div>`;

  // Draw the dependency graph after DOM is ready
  requestAnimationFrame(() => drawDepGraph(deps));
  injectInsightsCSS();
}

// ── Health Score ─────────────────────────────────────────────────

function computeHealth(meta, results, fileContents) {
  const checks = [
    {
      label: 'README present',
      pass: !!fileContents['README.md'] || !!fileContents['readme.md'],
      value: fileContents['README.md'] ? 'Found' : 'Missing',
    },
    {
      label: 'License file',
      pass: !!meta.license?.name,
      value: meta.license?.name || 'None',
    },
    {
      label: 'Dependency manifest',
      pass: !!(fileContents['package.json'] || fileContents['requirements.txt'] || fileContents['go.mod'] || fileContents['Cargo.toml']),
      value: fileContents['package.json'] ? 'package.json' : fileContents['requirements.txt'] ? 'requirements.txt' : fileContents['go.mod'] ? 'go.mod' : 'Missing',
    },
    {
      label: 'Environment config',
      pass: !!(fileContents['.env.example'] || fileContents['.env.sample']),
      value: fileContents['.env.example'] ? '.env.example' : 'Missing',
    },
    {
      label: 'Docker / container',
      pass: !!(fileContents['Dockerfile'] || fileContents['docker-compose.yml']),
      value: fileContents['Dockerfile'] ? 'Dockerfile' : 'Not found',
    },
    {
      label: 'Contributing guide',
      pass: !!(fileContents['CONTRIBUTING.md']),
      value: fileContents['CONTRIBUTING.md'] ? 'Found' : 'Missing',
    },
  ];

  const score = Math.round((checks.filter(c => c.pass).length / checks.length) * 100);
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
  const color = score >= 85 ? '#16a34a' : score >= 70 ? '#0d9488' : score >= 50 ? '#ca8a04' : '#dc2626';

  const failedChecks = checks.filter(c => !c.pass);
  const wins = failedChecks.slice(0, 3).map(c => ({
    text: `Add ${c.label.toLowerCase()}`,
    color: '#ca8a04',
  }));

  return { score, grade, color, metrics: checks, wins };
}

// ── Dependency Graph ─────────────────────────────────────────────

function buildDepGraph(fileContents) {
  const nodes = {};
  const edges = [];

  for (const [file, content] of Object.entries(fileContents)) {
    if (!content) continue;
    const ext = file.split('.').pop();
    if (!['ts','tsx','js','jsx','py','go','rs'].includes(ext)) continue;

    nodes[file] = nodes[file] || { file, imports: 0, imported: 0 };

    // Match import statements
    const importRe = /(?:import|require|from)\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = importRe.exec(content)) !== null) {
      const dep = m[1];
      if (!dep.startsWith('.')) continue; // only local imports

      // Resolve relative path
      const dir  = file.includes('/') ? file.split('/').slice(0, -1).join('/') : '';
      let resolved = dep.startsWith('./') || dep.startsWith('../')
        ? normalizePath(dir + '/' + dep)
        : dep;

      // Try to match to a real file
      const match = Object.keys(fileContents).find(f =>
        f === resolved || f === resolved + '.ts' || f === resolved + '.tsx' || f === resolved + '.js' || f === resolved + '.jsx' || f === resolved + '/index.ts' || f === resolved + '/index.js'
      );
      if (match && match !== file) {
        edges.push({ from: file, to: match });
        nodes[file].imports++;
        nodes[match] = nodes[match] || { file: match, imports: 0, imported: 0 };
        nodes[match].imported++;
      }
    }
  }

  return { nodes: Object.values(nodes).slice(0, 20), edges: edges.slice(0, 40) };
}

function normalizePath(path) {
  const parts = path.split('/');
  const out = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.') out.push(p);
  }
  return out.join('/');
}

function drawDepGraph({ nodes, edges }) {
  const canvas = document.getElementById('dep-canvas');
  if (!canvas || nodes.length === 0) {
    const wrap = document.getElementById('dep-graph-container');
    if (wrap) wrap.innerHTML = '<div style="padding:40px;text-align:center;font-size:.82rem;color:var(--text-muted)">No local import relationships found in indexed files</div>';
    return;
  }

  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Assign positions using a simple force-like layout
  const positions = {};
  const cx = W / 2, cy = H / 2;
  const r = Math.min(W, H) * 0.36;

  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    // Nodes with more imports closer to center
    const dist = n.imported > 2 ? r * 0.4 : n.imported > 0 ? r * 0.7 : r;
    positions[n.file] = {
      x: cx + dist * Math.cos(angle),
      y: cy + dist * Math.sin(angle),
      r: Math.min(6 + n.imported * 2, 16),
      color: n.imported > 3 ? '#6366f1' : n.imports === 0 && n.imported > 0 ? '#0d9488' : '#64748b',
    };
  });

  // Draw edges
  ctx.globalAlpha = 0.35;
  edges.forEach(e => {
    const from = positions[e.from];
    const to   = positions[e.to];
    if (!from || !to) return;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);

    // Curved line
    const midX = (from.x + to.x) / 2 + (from.y - to.y) * 0.15;
    const midY = (from.y + to.y) / 2 + (to.x - from.x) * 0.15;
    ctx.quadraticCurveTo(midX, midY, to.x, to.y);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  // Draw arrowheads
  ctx.globalAlpha = 0.6;
  edges.slice(0, 30).forEach(e => {
    const from = positions[e.from];
    const to   = positions[e.to];
    if (!from || !to) return;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const ar = (positions[to.file]?.r || 8) + 2;
    const ax = to.x - ar * Math.cos(angle);
    const ay = to.y - ar * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - 6 * Math.cos(angle - 0.4), ay - 6 * Math.sin(angle - 0.4));
    ctx.lineTo(ax - 6 * Math.cos(angle + 0.4), ay - 6 * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fillStyle = '#94a3b8';
    ctx.fill();
  });

  ctx.globalAlpha = 1;

  // Draw nodes
  nodes.forEach(n => {
    const p = positions[n.file];
    if (!p) return;

    // Glow for high-traffic nodes
    if (n.imported > 2) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 5, 0, 2 * Math.PI);
      ctx.fillStyle = p.color + '22';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, 2 * Math.PI);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label (only for nodes with some connections)
    if (n.imported > 0 || n.imports > 1) {
      const label = n.file.split('/').pop().replace(/\.(ts|tsx|js|jsx)$/, '');
      ctx.font = `500 10px Plus Jakarta Sans, sans-serif`;
      ctx.fillStyle = '#334155';
      ctx.textAlign = 'center';
      ctx.fillText(label.slice(0, 14), p.x, p.y + p.r + 13);
    }
  });
}

// ── File Size Chart ─────────────────────────────────────────────

function buildFileSizeChart(fileContents) {
  const files = Object.entries(fileContents)
    .map(([path, content]) => ({ path, lines: (content?.match(/\n/g)||[]).length + 1 }))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 8);

  if (!files.length) return '<p style="color:var(--text-muted);font-size:.8rem">No data</p>';

  const max = files[0].lines;
  return `<div class="fsc-list">${files.map(f => `
    <div class="fsc-row">
      <div class="fsc-name" title="${f.path}">${f.path.split('/').pop()}</div>
      <div class="fsc-bar-wrap">
        <div class="fsc-bar" style="width:${Math.round((f.lines/max)*100)}%;background:${f.lines > 300 ? 'var(--crit)' : f.lines > 150 ? 'var(--med)' : 'var(--teal)'}"></div>
      </div>
      <div class="fsc-val">${f.lines}L</div>
    </div>
  `).join('')}</div>`;
}

// ── Tech Debt Signals ───────────────────────────────────────────

function buildDebtSignals(fileContents) {
  const signals = [];
  const patterns = [
    { re: /\bTODO\b/gi,   level: 'med',  title: 'TODO comments' },
    { re: /\bFIXME\b/gi,  level: 'high', title: 'FIXME markers' },
    { re: /\bHACK\b/gi,   level: 'high', title: 'HACK comments' },
    { re: /\bconsole\.log\(/gi, level: 'low', title: 'console.log() calls' },
    { re: /\bany\b/g,     level: 'med',  title: 'TypeScript `any` usage' },
    { re: /eslint-disable/gi, level: 'med', title: 'ESLint disables' },
    { re: /\bdeprecated\b/gi, level: 'high', title: 'Deprecated markers' },
  ];

  const accumulated = {};
  for (const [file, content] of Object.entries(fileContents)) {
    if (!content) continue;
    for (const p of patterns) {
      const matches = content.match(p.re) || [];
      if (matches.length > 0) {
        const key = p.title;
        accumulated[key] = accumulated[key] || { ...p, file, count: 0 };
        accumulated[key].count += matches.length;
        accumulated[key].file = file; // show most recent file
      }
    }
  }

  return Object.values(accumulated)
    .sort((a, b) => {
      const order = { high: 0, med: 1, low: 2 };
      return order[a.level] - order[b.level];
    })
    .slice(0, 6);
}

// ── CSS ─────────────────────────────────────────────────────────

function injectInsightsCSS() {
  if (document.getElementById('insights-css')) return;
  const s = document.createElement('style');
  s.id = 'insights-css';
  s.textContent = `
.health-badge { padding:4px 12px; border-radius:20px; font-size:.8rem; font-weight:700; letter-spacing:.05em; }
.health-a { background:#dcfce7; color:#16a34a; }
.health-b { background:#ccfbf1; color:#0d9488; }
.health-c { background:#fefce8; color:#ca8a04; }
.health-d { background:#fef2f2; color:#dc2626; }

.health-score-row { display:flex; align-items:flex-start; gap:20px; margin-bottom:16px; }
.health-ring { flex-shrink:0; }
.health-metrics { flex:1; display:flex; flex-direction:column; gap:6px; }
.hm-row { display:flex; align-items:center; gap:8px; font-size:.8rem; }
.hm-icon { font-size:.85rem; }
.hm-label { flex:1; color:var(--text-secondary); }
.hm-val { font-weight:600; font-size:.75rem; font-family:var(--mono); }
.hm-val.pass { color:var(--low); }
.hm-val.warn { color:var(--crit); }
.health-wins { border-top:1px solid var(--border-soft); padding-top:14px; }
.hw-label { font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); margin-bottom:8px; }
.hw-item { display:flex; align-items:center; gap:8px; font-size:.8rem; color:var(--text-secondary); margin-bottom:5px; }
.hw-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }

.dep-graph-wrap { background:var(--off-white); border-radius:0 0 var(--radius-lg) var(--radius-lg); padding:16px; position:relative; }
#dep-canvas { width:100%; max-width:680px; display:block; }
.dep-legend { display:flex; gap:16px; margin-top:12px; justify-content:center; }
.dl-item { display:flex; align-items:center; gap:5px; font-size:.72rem; color:var(--text-secondary); }
.dl-dot { width:8px; height:8px; border-radius:50%; }

.fsc-list { display:flex; flex-direction:column; gap:8px; }
.fsc-row { display:flex; align-items:center; gap:8px; }
.fsc-name { width:100px; font-size:.75rem; font-family:var(--mono); color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-shrink:0; }
.fsc-bar-wrap { flex:1; background:var(--border); border-radius:4px; height:6px; overflow:hidden; }
.fsc-bar { height:100%; border-radius:4px; transition:width .8s ease; }
.fsc-val { width:40px; text-align:right; font-size:.72rem; font-family:var(--mono); color:var(--text-muted); flex-shrink:0; }

.debt-list { display:flex; flex-direction:column; }
.debt-item { display:flex; align-items:center; gap:10px; padding:10px 16px; border-bottom:1px solid var(--border-soft); }
.debt-item:last-child { border-bottom:none; }
.debt-sev { font-size:.65rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; padding:2px 8px; border-radius:10px; flex-shrink:0; }
.debt-high { background:var(--high-bg); color:var(--high); }
.debt-med  { background:var(--med-bg);  color:var(--med);  }
.debt-low  { background:var(--low-bg);  color:var(--low);  }
.debt-body { flex:1; min-width:0; }
.debt-title { font-size:.8rem; font-weight:600; color:var(--text-primary); }
.debt-file { font-size:.72rem; color:var(--text-muted); font-family:var(--mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.debt-count { font-size:.78rem; font-weight:700; color:var(--text-secondary); font-family:var(--mono); flex-shrink:0; }
  `;
  document.head.appendChild(s);
}
