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
