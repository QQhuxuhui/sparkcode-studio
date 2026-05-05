import type { ModelDef, KeyGroup } from '../types';

export const MODELS: ModelDef[] = [
  { id: 'gpt-image-2',                    label: 'GPT Image 2',            supportsMask: true  },
  { id: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image', supportsMask: false },
  { id: 'gemini-3-pro-image-preview',     label: 'Gemini 3 Pro Image',     supportsMask: false },
];

export const POLISH_MODEL = 'gpt-5.5';

export function modelById(id: string): ModelDef | undefined {
  return MODELS.find((m) => m.id === id);
}

export function isGeminiImageModel(model: string | undefined | null): boolean {
  if (!model) return false;
  const m = String(model).toLowerCase();
  if (m.includes('nano-banana')) return true;
  return /gemini[-.\d]*.*image/.test(m);
}

// 中转平台分组：每个 group 一个 token，组内模型共用
export const KEY_GROUPS: KeyGroup[] = [
  {
    id: 'codex',
    label: 'codex 分组',
    hint: 'GPT 系列：gpt-image-2 出图、gpt-5.5 ✨ 提示词润色',
    models: ['gpt-image-2', 'gpt-5.5'],
  },
  {
    id: 'banana',
    label: '大香蕉 分组',
    hint: 'Gemini 绘图：gemini-3.x-flash/pro-image-preview',
    models: ['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'],
    pattern: /(gemini[-.\d]*.*image|nano-banana)/i,
  },
];

export function getGroupForModel(model: string): KeyGroup | null {
  if (!model) return null;
  for (const g of KEY_GROUPS) if (g.models.includes(model)) return g;
  for (const g of KEY_GROUPS) if (g.pattern?.test(model)) return g;
  return null;
}
