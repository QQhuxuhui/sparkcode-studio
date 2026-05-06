// Frontend client for the templates API. Uses the shared `StyleTemplate` type
// so backend schema changes propagate at compile time.

import type { StyleTemplate, TemplateCategory } from '../../shared/types';

// During dev Vite proxies /api → http://localhost:3001 (vite.config.ts).
// In production the same Hono process serves both static + /api, so absolute
// path works there too.
const API_PREFIX = '/api/v1/templates';

let cache: { items: StyleTemplate[]; ts: number } | null = null;
const CACHE_MS = 5 * 60_000;     // 5 min

export async function listTemplates(opts?: { category?: string; force?: boolean }): Promise<StyleTemplate[]> {
  const now = Date.now();
  if (!opts?.force && !opts?.category && cache && now - cache.ts < CACHE_MS) {
    return cache.items;
  }
  const q = opts?.category ? `?category=${encodeURIComponent(opts.category)}` : '';
  const res = await fetch(`${API_PREFIX}${q}`);
  if (!res.ok) throw new Error(`templates list failed: ${res.status}`);
  const data = await res.json() as { items: StyleTemplate[] };
  if (!opts?.category) cache = { items: data.items, ts: now };
  return data.items;
}

export async function listCategories(): Promise<TemplateCategory[]> {
  const res = await fetch(`${API_PREFIX}/categories`);
  if (!res.ok) throw new Error(`categories failed: ${res.status}`);
  const data = await res.json() as { items: TemplateCategory[] };
  return data.items;
}

export function invalidateTemplatesCache() {
  cache = null;
}

/**
 * Pick the "applyable" body of a template — promptTemplate (with placeholders)
 * has priority because it's the most descriptive form; promptSuffix is a pure
 * style append. Either may be null.
 */
export function pickTemplateBody(t: { promptTemplate?: string | null; promptSuffix?: string | null }): string {
  return (t.promptTemplate ?? t.promptSuffix ?? '').trim();
}

/**
 * Extract unique [xxx] placeholder names from a template body. Bracket
 * content is preserved verbatim (e.g. "平台，如 iOS/Android/Web") because
 * the LLM-fill flow needs to map back by exact string.
 */
export function extractPlaceholders(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /\[([^\[\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const name = m[1].trim();
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * Replace each [xxx] in body with the corresponding value from `values` (keyed
 * by the same string returned from extractPlaceholders). Unmatched keys keep
 * the original [xxx] so the user can still see what's missing.
 */
export function fillPlaceholders(body: string, values: Record<string, string>): string {
  return body.replace(/\[([^\[\]]+)\]/g, (full, raw: string) => {
    const v = values[raw.trim()];
    return v && v.trim() ? v.trim() : full;
  });
}
