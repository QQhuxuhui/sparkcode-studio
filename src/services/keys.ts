// Group-based API key store. Keys live in localStorage ONLY — never sent to
// any backend other than the upstream API. Future user-auth integration (with
// new-api) should NOT touch this file; add a separate auth module instead.

import { KEY_GROUPS, getGroupForModel } from '../data/models';

const GROUP_KEY_STORE = 'conv_image_group_keys';
const LEGACY_KEY_STORE = 'gpt_image_apikeys';   // sole migration source

export type GroupKeys = Record<string, string>;

export function loadGroupKeys(): GroupKeys {
  try { return JSON.parse(localStorage.getItem(GROUP_KEY_STORE) || '{}'); }
  catch { return {}; }
}

export function getKeyForModel(model: string): string {
  const g = getGroupForModel(model);
  if (!g) return '';
  return loadGroupKeys()[g.id] || '';
}

export function saveKeyForGroup(groupId: string, key: string): void {
  const all = loadGroupKeys();
  if (key) all[groupId] = key; else delete all[groupId];
  localStorage.setItem(GROUP_KEY_STORE, JSON.stringify(all));
}

export function hasAnyKey(): boolean {
  return Object.values(loadGroupKeys()).some((v) => v);
}

// One-shot migration from sibling per-model store. Run on bootstrap.
export function migrateLegacyKeys(): void {
  const cur = loadGroupKeys();
  if (Object.keys(cur).length > 0) return;
  let legacy: Record<string, string> = {};
  try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY_STORE) || '{}'); }
  catch { return; }
  if (!legacy || Object.keys(legacy).length === 0) return;
  const migrated: GroupKeys = {};
  for (const [model, key] of Object.entries(legacy)) {
    if (!key) continue;
    const g = getGroupForModel(model);
    if (g && !migrated[g.id]) migrated[g.id] = key;
  }
  if (Object.keys(migrated).length > 0) {
    localStorage.setItem(GROUP_KEY_STORE, JSON.stringify(migrated));
  }
}

export function apiAuth(model: string): { Authorization: string } {
  const key = getKeyForModel(model);
  if (!key) {
    const g = getGroupForModel(model);
    const groupHint = g ? `${g.label} 分组` : model;
    throw new Error(`未找到 ${groupHint} 的 API Key，请在顶栏「⚙ 令牌」中配置`);
  }
  return { Authorization: `Bearer ${key}` };
}

// Re-export so callers can read group metadata without dipping into data/
export { KEY_GROUPS };
