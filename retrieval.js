// Local full-document search. No book text is discarded to meet API limits.
const Retrieval = {
  cache: new WeakMap(),
  normalize(text) { return text.normalize('NFKC').replace(/\s+/gu, ' ').trim(); },
  terms(text) {
    const stop = new Set('a an the and or of to in on at for from by is are was were be been it this that what which who how why when where do does did can could please tell me about explain'.split(' '));
    return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(t => !stop.has(t));
  },
  index(source) {
    if (this.cache.has(source)) return this.cache.get(source);
    if (source.text?.includes('[Document trimmed due to length...]')) throw new Error('This saved book was truncated by the old version. Upload it again to search every chapter.');
    const pages = source.pages || [{ number: null, text: source.text || '' }];
    const chunks = [];
    for (const page of pages) {
      const text = this.normalize(page.text);
      for (let start = 0; start < text.length;) {
        let end = Math.min(start + 1600, text.length);
        if (end < text.length) {
          const boundary = text.lastIndexOf(' ', end);
          if (boundary > start + 800) end = boundary;
        }
        chunks.push({ id: `S${chunks.length + 1}`, page: page.number, text: text.slice(start, end) });
        if (end === text.length) break;
        start = Math.max(start + 1, end - 240);
      }
    }
    const frequency = new Map();
    const rows = chunks.map(chunk => {
      const words = this.terms(chunk.text);
      const counts = new Map();
      for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
      for (const word of counts.keys()) frequency.set(word, (frequency.get(word) || 0) + 1);
      return { chunk, counts, length: words.length };
    });
    const result = { chunks, rows, frequency, average: rows.reduce((n, r) => n + r.length, 0) / (rows.length || 1) };
    this.cache.set(source, result);
    return result;
  },
  search(source, question, previousQuestion = '') {
    const index = this.index(source);
    if (!index.chunks.length) throw new Error('Upload a document with readable text first.');
    const budget = 14000;
    if (index.chunks.reduce((n, c) => n + c.text.length, 0) <= budget) return { chunks: index.chunks, partial: false };
    const followup = /\b(it|its|they|them|that|those|more|continue)\b/i.test(question);
    const terms = [...new Set(this.terms(question + (followup ? ' ' + previousQuestion : '')))];
    const scored = index.rows.map((row, position) => {
      let score = 0;
      for (const term of terms) {
        const tf = row.counts.get(term) || 0;
        if (!tf) continue;
        const df = index.frequency.get(term) || 0;
        const idf = Math.log(1 + (index.rows.length - df + 0.5) / (df + 0.5));
        score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * row.length / (index.average || 1)));
      }
      return { position, score };
    }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
    const selected = new Set();
    let used = 0;
    const add = position => {
      const chunk = index.chunks[position];
      if (!chunk || selected.has(position) || used + chunk.text.length > budget) return;
      selected.add(position); used += chunk.text.length;
    };
    for (const row of scored.slice(0, 6)) add(row.position);
    for (const row of scored.slice(0, 6)) { add(row.position - 1); add(row.position + 1); }
    return { chunks: [...selected].sort((a, b) => a - b).map(i => index.chunks[i]), partial: true };
  }
};
