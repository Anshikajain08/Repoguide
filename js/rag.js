// rag.js — In-browser RAG engine
// Chunks file contents, builds TF-IDF index, retrieves relevant chunks per query

export class RAGEngine {
  constructor() {
    this.chunks = [];      // { id, filePath, content, tokens }
    this.idf = {};         // term → idf score
    this.tfidf = [];       // parallel to chunks: term → tf-idf score map
  }

  // Ingest all file contents into the vector store
  ingest(fileContents) {
    this.chunks = [];

    for (const [filePath, content] of Object.entries(fileContents)) {
      if (!content || typeof content !== 'string') continue;

      // Split into overlapping chunks of ~400 tokens (~1600 chars)
      const chunkSize = 1600;
      const overlap   = 200;
      let start = 0;

      while (start < content.length) {
        const text = content.slice(start, start + chunkSize);
        this.chunks.push({
          id: this.chunks.length,
          filePath,
          content: text,
          tokens: tokenize(text),
        });
        if (start + chunkSize >= content.length) break;
        start += chunkSize - overlap;
      }
    }

    this._buildIDF();
    this._buildTFIDF();
    return this.chunks.length;
  }

  // Retrieve top-k most relevant chunks for a query
  retrieve(query, topK = 8) {
    if (this.chunks.length === 0) return [];

    const queryTokens = tokenize(query);
    const queryTF = computeTF(queryTokens);

    // Score each chunk by cosine similarity with query
    const scores = this.chunks.map((chunk, i) => {
      const score = cosineSim(queryTF, this.tfidf[i], this.idf);
      return { chunk, score };
    });

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter(s => s.score > 0)
      .map(s => s.chunk);
  }

  // Build a context string from retrieved chunks for a specific query
  buildContext(query, topK = 6) {
    const chunks = this.retrieve(query, topK);
    if (chunks.length === 0) return '';

    // Deduplicate by file, prefer diverse files
    const seen = new Set();
    const deduped = [];
    for (const chunk of chunks) {
      const key = chunk.filePath;
      if (!seen.has(key) || deduped.length < 3) {
        deduped.push(chunk);
        seen.add(key);
      }
      if (deduped.length >= topK) break;
    }

    return deduped
      .map(c => `### ${c.filePath}\n\`\`\`\n${c.content.slice(0, 1200)}\n\`\`\``)
      .join('\n\n');
  }

  _buildIDF() {
    const N = this.chunks.length;
    const df = {}; // term → doc count

    for (const chunk of this.chunks) {
      const unique = new Set(chunk.tokens);
      for (const term of unique) {
        df[term] = (df[term] || 0) + 1;
      }
    }

    this.idf = {};
    for (const [term, count] of Object.entries(df)) {
      this.idf[term] = Math.log((N + 1) / (count + 1)) + 1; // smooth IDF
    }
  }

  _buildTFIDF() {
    this.tfidf = this.chunks.map(chunk => {
      const tf = computeTF(chunk.tokens);
      const tfidfVec = {};
      for (const [term, tfScore] of Object.entries(tf)) {
        tfidfVec[term] = tfScore * (this.idf[term] || 1);
      }
      return tfidfVec;
    });
  }
}

// ── Helpers ──

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_$./\-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && t.length < 40)
    .filter(t => !STOPWORDS.has(t));
}

function computeTF(tokens) {
  const freq = {};
  for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
  const max = Math.max(...Object.values(freq), 1);
  const tf = {};
  for (const [t, f] of Object.entries(freq)) tf[t] = f / max;
  return tf;
}

function cosineSim(vecA, vecB, idf) {
  // Only iterate terms in vecA (the query)
  let dot = 0, normA = 0, normB = 0;

  for (const [term, a] of Object.entries(vecA)) {
    const idfScore = idf[term] || 1;
    const wa = a * idfScore;
    const wb = (vecB[term] || 0) * idfScore;
    dot   += wa * wb;
    normA += wa * wa;
  }
  for (const [term, b] of Object.entries(vecB)) {
    normB += (b * (idf[term] || 1)) ** 2;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

const STOPWORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with',
  'by','from','up','about','into','through','is','are','was','were',
  'be','been','being','have','has','had','do','does','did','will','would',
  'could','should','may','might','this','that','these','those','it','its',
  'not','no','nor','so','yet','both','either','neither','each','few','more',
  'most','other','some','such','than','then','when','where','which','who',
  'how','all','any','can','just','as','if','else','return','import','export',
  'const','let','var','function','class','new','true','false','null','undefined',
]);
