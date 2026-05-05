// API client for the 4 upstream calls. The `apiAuth` helper is the only
// auth surface — when integrating with new-api session auth later, swap
// `apiAuth` to also include the new-api session cookie/token, no other
// changes needed.

import type { GenerationResult } from '../types';
import { apiAuth } from './keys';
import { POLISH_MODEL } from '../data/models';

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
