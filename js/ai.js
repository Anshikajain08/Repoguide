// ai.js — Groq API integration with RAG context
// Generates structured JSON for each of the 5 result tabs
// Free tier: https://console.groq.com — very generous limits, no credit card

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const API_URL    = 'https://api.groq.com/openai/v1/chat/completions';

// Token budget per call — keeps us well under 12k TPM limit
// Input prompts are ~1200 tokens each; output capped at 1800
const MAX_OUTPUT_TOKENS = 1800;

export class RepoAI {
  constructor(ragEngine) {
    this.rag = ragEngine;
  }

  // Master function: generate all 5 tabs
  // Run overview first (biggest), then the other 4 in parallel with a stagger
  async generateAll(repoData, onProgress) {
    const { meta, treeSummary, fileContents, stats, languages, commits } = repoData;
    const repoContext = buildRepoContext(meta, treeSummary, stats, languages, commits);

    onProgress('Generating architecture overview…', 78);
    const overview = await this._generateOverview(repoContext, repoData);
    onProgress('Analyzing key files, gotchas & glossary…', 84);

    // Run remaining 4 in parallel with 400ms stagger to avoid TPM burst
    const [keyFiles, gotchas, startHere, glossary] = await Promise.all([
      this._generateKeyFiles(repoContext, repoData),
      this._delay(400).then(() => this._generateGotchas(repoContext, repoData)),
      this._delay(800).then(() => this._generateStartHere(repoContext, repoData)),
      this._delay(1200).then(() => this._generateGlossary(repoContext, repoData)),
    ]);

    onProgress('Done!', 100);
    return { overview, keyFiles, gotchas, startHere, glossary };
  }

  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Retryable fetch with exponential backoff for 429/503
  async _call(systemPrompt, userPrompt, retries = 5) {
    const apiKey = sessionStorage.getItem('groqKey') || '';
    const body = JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    for (let attempt = 0; attempt <= retries; attempt++) {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body,
      });

      if ((resp.status === 429 || resp.status === 503) && attempt < retries) {
        // Parse retry-after if available
        let wait = (2 ** attempt) * 3000 + Math.random() * 1000;
        try {
          const errBody = await resp.clone().json();
          const match = errBody?.error?.message?.match(/try again in ([\d.]+)s/i);
          if (match) wait = Math.ceil(parseFloat(match[1]) * 1000) + 500;
        } catch (_) {}
        console.warn(`Groq rate limit (${resp.status}), waiting ${Math.round(wait/1000)}s… (attempt ${attempt + 1}/${retries})`);
        await this._delay(wait);
        continue;
      }

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error ${resp.status}`);
      }

      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content || '';
      return text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    }
    throw new Error('Max retries exceeded. Please wait a minute and try again.');
  }

  async _generateOverview(repoContext, repoData) {
    // Reduced RAG topK from 8 → 5 to shrink prompt
    const ragContext = this.rag.buildContext(
      'architecture overview design patterns project structure main purpose technology stack', 5
    );

    const system = `You are an expert software architect analyzing codebases for new engineers.
Return ONLY valid JSON, no other text.`;

    const prompt = `Analyze this repo and return a JSON object:
{
  "summary": "2-3 sentence description",
  "architecturePattern": "e.g. MVC, Microservices, JAMstack",
  "architectureExplanation": "2-3 sentences",
  "layers": [{"name":"Layer","items":["item1","item2"]}],
  "techStack": [{"icon":"emoji","name":"Tech","role":"What it does"}],
  "folderNotes": [{"path":"folder/","note":"what it contains","isKey":true}],
  "complexityScore": 7.5,
  "complexityLabel": "High",
  "aiInsight": "2-3 sentences for a new engineer"
}
Rules: layers 2-4, techStack 4-6 items, folderNotes 4-8 entries, keep strings SHORT.

REPO:
${repoContext}

CODE CONTEXT:
${ragContext}`;

    const raw = await this._call(system, prompt);
    return JSON.parse(raw);
  }

  async _generateKeyFiles(repoContext, repoData) {
    const ragContext = this.rag.buildContext(
      'entry point main file index router server handler configuration', 4
    );

    const system = `You are an expert software engineer. Return ONLY valid JSON.`;

    const prompt = `List the 5-6 most important files a new engineer should read first.
Return: {"files":[{"path":"exact/path.ts","language":"TypeScript","importance":"Critical","role":"one sentence","detail":"2 sentences","keyFunctions":[{"name":"fn()","desc":"what it does"}],"tip":"insider tip or null"}]}
importance: Critical|High|Medium. keyFunctions: 2-3 items. Sort by importance.

REPO:
${repoContext}

CODE CONTEXT:
${ragContext}`;

    const raw = await this._call(system, prompt);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed
      : (parsed.files || parsed.keyFiles || parsed.data
         || (Array.isArray(Object.values(parsed)[0]) ? Object.values(parsed)[0] : null)
         || parsed);
  }

  async _generateGotchas(repoContext, repoData) {
    const ragContext = this.rag.buildContext(
      'warning gotcha pitfall bug workaround hack todo fixme deprecated', 4
    );

    const system = `You are a senior engineer sharing honest warnings. Return ONLY valid JSON.`;

    const prompt = `Identify 4-6 gotchas that would bite a new engineer.
Return: {"gotchas":[{"severity":"Critical","title":"short title","description":"2-3 sentences","tip":"concrete advice"}]}
severity: Critical|High|Medium|Low. Be specific to THIS repo. Sort by severity.

REPO:
${repoContext}

CODE CONTEXT:
${ragContext}`;

    const raw = await this._call(system, prompt);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed
      : (parsed.gotchas || parsed.data
         || (Array.isArray(Object.values(parsed)[0]) ? Object.values(parsed)[0] : null)
         || parsed);
  }

  async _generateStartHere(repoContext, repoData) {
    const ragContext = this.rag.buildContext(
      'setup install getting started development contributing environment', 4
    );

    const system = `You are a staff engineer writing an onboarding guide. Return ONLY valid JSON.`;

    const prompt = `Create an onboarding path for a new engineer.
Return: {"totalTime":"X-Y hours","steps":[{"num":1,"title":"Step","time":"~30 min","description":"2 sentences","commands":["cmd"],"tip":"tip or null"}],"firstPR":{"title":"PR title","description":"2 sentences","rationale":"1 sentence"}}
4-5 steps: setup, explore, understand core, run tests, make a change. Use real commands from repo.

REPO:
${repoContext}

CODE CONTEXT:
${ragContext}`;

    const raw = await this._call(system, prompt);
    return JSON.parse(raw);
  }

  async _generateGlossary(repoContext, repoData) {
    const ragContext = this.rag.buildContext(
      'terminology acronym abbreviation jargon domain concept internal name', 4
    );

    const system = `You are documenting project-specific terminology. Return ONLY valid JSON.`;

    const prompt = `Extract 6-10 project-specific terms a new engineer needs to know.
Return: {"glossary":[{"term":"TERM","definition":"2 sentence definition in context of THIS project"}]}
Only project-specific terms — not generic programming terms. Sort alphabetically.

REPO:
${repoContext}

CODE CONTEXT:
${ragContext}`;

    const raw = await this._call(system, prompt);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed
      : (parsed.glossary || parsed.terms || parsed.data
         || (Array.isArray(Object.values(parsed)[0]) ? Object.values(parsed)[0] : null)
         || parsed);
  }
}

// ── Context builder (trimmed to reduce token count) ──────────────
function buildRepoContext(meta, treeSummary, stats, languages, commits) {
  const topLangs = Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang, bytes]) => `${lang}(${Math.round(bytes / 1024)}KB)`)
    .join(', ');

  const recentCommits = commits
    .slice(0, 3)
    .map(c => `- ${c.commit?.message?.split('\n')[0]?.slice(0, 60)}`)
    .join('\n');

  // Trim tree summary to avoid bloating the prompt
  const trimmedTree = (treeSummary || '').split('\n').slice(0, 30).join('\n');

  return `REPO: ${meta.full_name}
DESC: ${(meta.description || 'No description').slice(0, 120)}
LANG: ${meta.language || 'Unknown'} | ALL: ${topLangs || 'Unknown'}
FILES: ${stats.fileCount} | SIZE: ${stats.totalKB}KB
TOPICS: ${(meta.topics || []).join(', ') || 'none'}

STRUCTURE:
${trimmedTree}

COMMITS:
${recentCommits || 'N/A'}`.trim();
}
