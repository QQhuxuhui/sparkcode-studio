// API client for the 4 upstream calls. The `apiAuth` helper is the only
// auth surface — when integrating with new-api session auth later, swap
// `apiAuth` to also include the new-api session cookie/token, no other
// changes needed.

import type { GenerationResult } from '../types';
import { apiAuth } from './keys';
import {
  POLISH_MODEL,
  MERGE_MODEL,
  RECOMMEND_MODEL,
  RECOMMEND_PREFILTER_MODEL,
  RECOMMEND_PREFILTER_TOP_N,
  FILL_MODEL,
} from '../data/models';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || 'https://api.sparkcode.top/v1';

// ===== gpt-image-2 generation =====
type GenInput = {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: string;
  background?: string;
  format?: string;
};

export async function callGptImageGen(input: GenInput): Promise<GenerationResult> {
  const {
    model, prompt, n = 1, size = '1024x1024',
    quality = 'high', background = 'auto', format = 'png',
  } = input;
  const body = { model, prompt, n, size, quality, background,
                 response_format: 'b64_json', output_format: format };
  const res = await fetch(`${API_BASE}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...apiAuth(model) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 240)}`);
  }
  const data = await res.json();
  if (!data.data?.length) throw new Error('API 未返回图像数据');
  return {
    images: data.data.map((d: { b64_json: string }) => ({
      dataUrl: `data:image/${format};base64,${d.b64_json}`,
      format,
    })),
  };
}

// ===== gpt-image-2 edit (multipart, optional mask) =====
type EditInput = {
  model: string;
  prompt: string;
  sourceImages: string[];      // dataUrl array
  maskDataUrl?: string | null;
  n?: number;
  size?: string;
};

export function nearestEditSize(w: number, h: number): string {
  const ratio = w / h;
  if (ratio > 1.2)  return '1536x1024';
  if (ratio < 0.83) return '1024x1536';
  return '1024x1024';
}

export async function callGptImageEdit(input: EditInput): Promise<GenerationResult> {
  const { model, prompt, sourceImages, maskDataUrl = null, n = 1, size = '1024x1024' } = input;
  const fd = new FormData();
  fd.append('model', model);
  fd.append('prompt', prompt);
  fd.append('n', String(n));
  fd.append('size', size);
  fd.append('response_format', 'b64_json');
  if (sourceImages.length === 1) {
    fd.append('image', dataUrlToBlob(sourceImages[0]), 'source.png');
  } else {
    sourceImages.forEach((u, i) => fd.append('image[]', dataUrlToBlob(u), `source_${i}.png`));
  }
  if (maskDataUrl) fd.append('mask', dataUrlToBlob(maskDataUrl), 'mask.png');

  const res = await fetch(`${API_BASE}/images/edits`, {
    method: 'POST',
    headers: { ...apiAuth(model) },        // do NOT set Content-Type — browser sets multipart boundary
    body: fd,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 240)}`);
  }
  const data = await res.json();
  if (!data.data?.length) throw new Error('API 未返回图像数据');
  return {
    images: data.data.map((d: { b64_json: string }) => ({
      dataUrl: `data:image/png;base64,${d.b64_json}`,
      format: 'png',
    })),
  };
}

// ===== Gemini chat-completions multimodal image gen =====
type GeminiInput = {
  model: string;
  prompt: string;
  refDataUrls?: string[];
  aspectRatio?: string;
  resolution?: string;
};

type ChatChoice = { message?: { content?: unknown } };

export async function callGeminiChatImage(input: GeminiInput): Promise<GenerationResult> {
  const { model, prompt, refDataUrls = [], aspectRatio = '1:1', resolution = '1K' } = input;
  type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
  let content: string | Part[];
  if (refDataUrls.length > 0) {
    const arr: Part[] = [];
    if (prompt) arr.push({ type: 'text', text: prompt });
    for (const url of refDataUrls) arr.push({ type: 'image_url', image_url: { url } });
    content = arr;
  } else {
    content = prompt;
  }
  const body = {
    model,
    messages: [{ role: 'user', content }],
    modalities: ['image', 'text'],
    stream: false,
    extra_body: {
      generationConfig: {
        imageConfig:  { aspectRatio,           imageSize:  resolution },
        image_config: { aspect_ratio: aspectRatio, image_size: resolution },
      },
    },
  };
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...apiAuth(model) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 240)}`);
  }
  const data = await res.json();
  const choice: ChatChoice | undefined = data.choices?.[0];
  if (!choice) {
    const upstream = data.error?.message || data.msg || data.message;
    throw new Error(upstream
      ? `chat 响应空 choices：${upstream}`
      : 'chat 响应无 choices（上游可能余额不足或限流）');
  }
  const dataUrl = extractGeminiImage(choice.message);
  if (!dataUrl) throw new Error('chat 响应未携带图像');
  return { images: [{ dataUrl, format: 'png' }] };
}

const DATA_URL_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/;

export function extractGeminiImage(message: unknown): string | null {
  const m = message as { content?: unknown } | undefined;
  if (!m) return null;
  // Array content
  if (Array.isArray(m.content)) {
    for (const part of m.content as Array<Record<string, unknown>>) {
      const url = (part?.image_url as { url?: string } | undefined)?.url;
      if (url) return url;
      if (typeof part?.text === 'string') {
        const match = DATA_URL_RE.exec(part.text);
        if (match) return match[0];
      }
    }
  }
  // String content
  if (typeof m.content === 'string') {
    const match = DATA_URL_RE.exec(m.content);
    if (match) return match[0];
  }
  return null;
}

// ===== Polish helper (single-shot LLM rewrite) =====
export async function callPolishPrompt(originalPrompt: string): Promise<string> {
  const body = {
    model: POLISH_MODEL,
    messages: [
      { role: 'system', content: '你是 image generation prompt 优化助手。优化用户给的 prompt：增加视觉细节、保持原意、保持简洁。仅输出优化后的 prompt，不要加任何说明、引号或前缀。' },
      { role: 'user', content: originalPrompt },
    ],
    temperature: 0.6,
  };
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...apiAuth(POLISH_MODEL) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 240)}`);
  }
  const data = await res.json();
  const out = data.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error('润色 LLM 无返回');
  return out;
}

// ===== Templates: AI merge / recommend / fill =====
//
// Three single-shot LLM calls for the templates feature. All reuse the same
// chat-completions endpoint + POLISH_MODEL (gpt-5.5) so they go through the
// codex key group. Keep prompts terse — the gateway charges by token.

/**
 * A. Fuse the user's free-text intent with a template's prompt content into
 * a single coherent generation prompt — replaces the mechanical "X · Y" concat.
 * `userInput` may be empty; in that case the model produces a representative
 * prompt that demonstrates the template's style on a generic subject.
 */
export async function callMergePrompt(userInput: string, templateContent: string): Promise<string> {
  const body = {
    model: MERGE_MODEL,
    messages: [
      { role: 'system', content: '你是 image generation prompt 工程师。把"用户意图"和"模板风格"融合成一段连贯、自然、可直接喂给文生图模型的 prompt。要保留模板的视觉特征（构图、色调、材质、镜头、风格关键词），用户意图作为主体内容嵌入其中；如果用户意图为空，就用一个能体现该模板风格的代表性主体即可。仅输出最终 prompt，不要说明、不要引号、不要前缀。' },
      { role: 'user', content: `【用户意图】\n${userInput || '(未提供)'}\n\n【模板风格】\n${templateContent}` },
    ],
    temperature: 0.6,
  };
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...apiAuth(POLISH_MODEL) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 240)}`);
  }
  const data = await res.json();
  const out = data.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error('AI 融合无返回');
  return out;
}

/**
 * B. Given a user query and a compact template catalog, return the top-3
 * template ids with a one-line reason each. Catalog is summarized to keep
 * prompt small (id + name + category + first 80 chars of suffix).
 */
export type TemplateCatalogItem = { id: string; name: string; category: string; brief: string };
export type TemplateRecommendation = { id: string; reason: string };

export async function callRecommendTemplates(
  userQuery: string,
  catalog: TemplateCatalogItem[],
): Promise<TemplateRecommendation[]> {
  // ── Step 1: prefilter the full catalog (~387 items, ~12k tokens) down to
  // RECOMMEND_PREFILTER_TOP_N candidates using the fast non-thinking mini.
  // Output is just an id array — keeps the response small.
  const fullText = catalog
    .map((t) => `- ${t.id} | ${t.category} | ${t.name} | ${t.brief}`)
    .join('\n');
  const prefilterRes = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...apiAuth(RECOMMEND_PREFILTER_MODEL) },
    body: JSON.stringify({
      model: RECOMMEND_PREFILTER_MODEL,
      messages: [
        { role: 'system', content: `你是模板检索助手。给定用户意图和模板目录，挑出最相关的最多 ${RECOMMEND_PREFILTER_TOP_N} 条模板 id。宁可多选不漏掉相关项，也不要漏选潜在相关。仅输出 JSON 字符串数组：["id1","id2",...]，不要 markdown 包裹、不要解释。` },
        { role: 'user', content: `【用户意图】\n${userQuery}\n\n【模板目录】\n${fullText}` },
      ],
      temperature: 0.2,
    }),
  });
  if (!prefilterRes.ok) {
    const text = await prefilterRes.text();
    throw new Error(`预过滤 ${prefilterRes.status}: ${text.slice(0, 240)}`);
  }
  const prefilterData = await prefilterRes.json();
  const prefilterRaw = prefilterData.choices?.[0]?.message?.content?.trim() || '';
  const prefilterJson = extractJson(prefilterRaw);
  if (!Array.isArray(prefilterJson)) throw new Error('预过滤返回不是数组');
  const known = new Set(catalog.map((t) => t.id));
  const candidateIds = (prefilterJson as unknown[])
    .map((x) => String(x))
    .filter((id) => known.has(id))
    .slice(0, RECOMMEND_PREFILTER_TOP_N);
  if (candidateIds.length === 0) throw new Error('AI 预过滤未找到匹配项');

  // ── Step 2: gpt-5.5 picks the final top-3 from the small candidate set,
  // including a one-line reason per pick.
  const candidateMap = new Map(catalog.map((t) => [t.id, t]));
  const candidateText = candidateIds
    .map((id) => candidateMap.get(id))
    .filter((t): t is TemplateCatalogItem => !!t)
    .map((t) => `- ${t.id} | ${t.category} | ${t.name} | ${t.brief}`)
    .join('\n');
  const finalRes = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...apiAuth(RECOMMEND_MODEL) },
    body: JSON.stringify({
      model: RECOMMEND_MODEL,
      messages: [
        { role: 'system', content: '你是图像生成模板推荐助手。从给定的候选模板里选最契合用户意图的 3 条，仅输出 JSON 数组 [{"id":"...","reason":"一句中文推荐理由"},...]。reason 不超过 30 字，要说出"为什么这条匹配"。不要 markdown 包裹、不要其他文字。' },
        { role: 'user', content: `【用户意图】\n${userQuery}\n\n【候选模板】\n${candidateText}` },
      ],
      temperature: 0.3,
    }),
  });
  if (!finalRes.ok) {
    const text = await finalRes.text();
    throw new Error(`${finalRes.status} ${finalRes.statusText}: ${text.slice(0, 240)}`);
  }
  const finalData = await finalRes.json();
  const finalRaw = finalData.choices?.[0]?.message?.content?.trim() || '';
  const finalJson = extractJson(finalRaw);
  if (!Array.isArray(finalJson)) throw new Error('最终推荐返回不是数组');
  return (finalJson as Array<Record<string, unknown>>)
    .map((it) => ({ id: String(it.id || ''), reason: String(it.reason || '').slice(0, 60) }))
    .filter((it) => known.has(it.id))
    .slice(0, 3);
}

/**
 * C. Given a placeholder template and a user one-liner intent, fill each
 * placeholder. Returns a {placeholder: value} map. Placeholders are the raw
 * text inside [...] brackets (caller has already extracted them).
 */
export async function callFillTemplate(
  userIntent: string,
  templateText: string,
  placeholders: string[],
): Promise<Record<string, string>> {
  const body = {
    model: FILL_MODEL,
    messages: [
      { role: 'system', content: '你是模板填空助手。根据用户一句话意图，给定模板里每个 [占位符] 填一个合适的中文短语。仅输出 JSON 对象 {"占位符原文": "填入值", ...}，不要 markdown、不要解释。占位符原文必须 100% 匹配输入。' },
      { role: 'user', content: `【用户意图】\n${userIntent}\n\n【模板原文】\n${templateText}\n\n【需要填的占位符】\n${placeholders.map((p) => `- ${p}`).join('\n')}` },
    ],
    temperature: 0.4,
  };
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...apiAuth(POLISH_MODEL) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 240)}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || '';
  const json = extractJson(raw);
  if (!json || typeof json !== 'object') throw new Error('AI 返回不是对象');
  const out: Record<string, string> = {};
  for (const p of placeholders) {
    const v = (json as Record<string, unknown>)[p];
    if (typeof v === 'string' && v.trim()) out[p] = v.trim();
  }
  return out;
}

// LLMs sometimes wrap JSON in ```json ... ``` despite instructions. Strip it.
function extractJson(raw: string): unknown {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(s);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  // Fallback: find first { or [ and last matching closer.
  const first = s.search(/[\[{]/);
  const last  = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'));
  if (first >= 0 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)); } catch { /* give up */ }
  }
  return null;
}

// ===== Helpers =====
export function dataUrlToBlob(dataUrl: string): Blob {
  const idx = dataUrl.indexOf(',');
  const head = dataUrl.substring(0, idx);
  const b64  = dataUrl.substring(idx + 1);
  const mime = head.match(/data:([^;]+)/)?.[1] || 'image/png';
  const bin  = atob(b64);
  const arr  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export { API_BASE };
