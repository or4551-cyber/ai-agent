// Embeddings client — wraps Voyage AI's voyage-3-lite (cheap, multilingual,
// supports Hebrew well). Opt-in: only active if VOYAGE_API_KEY is set in .env.
//
// Why Voyage and not OpenAI: cheaper, no extra account beyond Anthropic,
// excellent on non-English. Why not local ONNX: too heavy on a phone.
//
// If VOYAGE_API_KEY is absent, callers fall back to keyword search (already
// implemented in memory-search.ts) — graceful degradation, no setup pain.

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3-lite'; // 512 dims, fast, multilingual
const BATCH_SIZE = 64; // Voyage allows up to 128 inputs per call

export interface EmbedOptions {
  inputType?: 'document' | 'query'; // Voyage uses different prompts for each
}

export class EmbeddingsClient {
  private apiKey: string | null;
  private cache = new Map<string, number[]>(); // hash → vector
  private readonly maxCache = 1000;

  constructor() {
    this.apiKey = process.env.VOYAGE_API_KEY || null;
  }

  isAvailable(): boolean {
    return this.apiKey !== null;
  }

  // Embed a single string. Returns null if no API key (caller falls back).
  async embed(text: string, opts: EmbedOptions = {}): Promise<number[] | null> {
    if (!this.apiKey) return null;
    const cached = this.cache.get(this.hash(text));
    if (cached) return cached;

    const result = await this.embedBatch([text], opts);
    return result[0] || null;
  }

  // Batch embed — much cheaper per item. Returns array aligned with input.
  // Items that fail return zero-vectors (won't match anything but won't crash).
  async embedBatch(texts: string[], opts: EmbedOptions = {}): Promise<(number[] | null)[]> {
    if (!this.apiKey || texts.length === 0) return texts.map(() => null);

    const results: (number[] | null)[] = [];

    // Voyage caps batch size, so chunk.
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const chunk = texts.slice(i, i + BATCH_SIZE);
      try {
        const vectors = await this.callVoyage(chunk, opts.inputType || 'document');
        for (let j = 0; j < chunk.length; j++) {
          const v = vectors[j];
          if (v) {
            this.cacheSet(chunk[j], v);
            results.push(v);
          } else {
            results.push(null);
          }
        }
      } catch (err) {
        console.error('[Embeddings] Batch failed (non-fatal):', (err as Error).message);
        for (let j = 0; j < chunk.length; j++) results.push(null);
      }
    }
    return results;
  }

  private async callVoyage(texts: string[], inputType: 'document' | 'query'): Promise<(number[] | null)[]> {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const r = await fetch(VOYAGE_API_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          input: texts,
          model: VOYAGE_MODEL,
          input_type: inputType,
          truncation: true,
        }),
      });
      if (!r.ok) {
        const errText = await r.text().catch(() => '');
        throw new Error(`Voyage API ${r.status}: ${errText.slice(0, 200)}`);
      }
      const json = await r.json() as { data?: { embedding: number[]; index: number }[] };
      const out: (number[] | null)[] = texts.map(() => null);
      for (const d of json.data || []) {
        out[d.index] = d.embedding;
      }
      return out;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Cheap deterministic hash for cache keys.
  private hash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return `${h}_${s.length}`;
  }

  private cacheSet(text: string, vec: number[]): void {
    if (this.cache.size >= this.maxCache) {
      // Drop oldest (first inserted) — Map iterates insertion order.
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(this.hash(text), vec);
  }
}

// Cosine similarity — assumes both vectors are non-zero.
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// Singleton — one client for the whole process.
export const embeddings = new EmbeddingsClient();
