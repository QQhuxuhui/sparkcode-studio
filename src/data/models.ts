import type { ModelDef, KeyGroup } from '../types';

export const MODELS: ModelDef[] = [
  { id: 'gpt-image-2',                    label: 'GPT Image 2',            supportsMask: true  },
  { id: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image', supportsMask: false },
  { id: 'gemini-3-pro-image-preview',     label: 'Gemini 3 Pro Image',     supportsMask: false },
];

// Per-task LLM models. All go through the codex key group on the new-api gateway.
// Default to gpt-5.5 (high quality, has thinking) for tasks that produce user-
// facing text. The recommendation flow is split into two steps because feeding
// the full 387-template catalog (~12k tokens) to gpt-5.5 is too slow — let
// gpt-5.4-mini do the bulk filter, then gpt-5.5 picks the final top-3.
export const POLISH_MODEL              = 'gpt-5.5';        // 提示词润色
export const MERGE_MODEL               = 'gpt-5.5';        // A 模板智能融合应用
export const FILL_MODEL                = 'gpt-5.5';        // C 占位符 AI 填空
export const RECOMMEND_MODEL           = 'gpt-5.5';        // B 步骤 2：从预过滤结果选 top-3 + 理由
export const RECOMMEND_PREFILTER_MODEL = 'gpt-5.4-mini';   // B 步骤 1：从 387 候选粗筛 ~20 条
export const RECOMMEND_PREFILTER_TOP_N = 20;

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
    hint: 'GPT 系列：gpt-image-2 出图、gpt-5.5 / gpt-5.4-mini ✨ 提示词润色与模板智能化',
    models: ['gpt-image-2', 'gpt-5.5', 'gpt-5.4-mini'],
    // Catch-all for future GPT model ids the gateway might expose (gpt-5.5-mini, gpt-4.1, ...)
    pattern: /^gpt[-.\d]/i,
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
