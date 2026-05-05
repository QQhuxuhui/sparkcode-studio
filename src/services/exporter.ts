// Export / import the entire IndexedDB session as a single JSON bundle.
// Backup-on-import goes to localStorage (NOT IDB) to avoid version migrations.

import { db } from './db';
import type { ImageRecord, Message, GenNode } from '../types';

const BACKUP_KEY_PREFIX = 'conv_image_backup_';
const BACKUP_TTL_MS     = 7 * 86400_000;    // 7 days

type Bundle = {
  version: 1;
  exportedAt: number;
  images:   ImageRecord[];
  messages: Message[];
  nodes:    GenNode[];
};

export async function exportSession(): Promise<void> {
  const [images, messages, nodes] = await Promise.all([
    db.images.toArray(),
    db.messages.orderBy('createdAt').toArray(),
    db.nodes.toArray(),
  ]);
  const bundle: Bundle = {
    version: 1,
    exportedAt: Date.now(),
    images, messages, nodes,
  };
  const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  // Format YYYYMMDD-HHMM without using a regex char class that Tailwind's
  // content scanner mistakes for an arbitrary class.
  const iso  = new Date().toISOString();
  const date = iso.slice(0, 10).split('-').join('');
  const time = iso.slice(11, 16).split(':').join('');
  const stamp = `${date}-${time}`;
  a.href = url;
  a.download = `conv-image-${stamp}-${nodes.length}nodes.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export type ImportResult = {
  bundle: Bundle;
  backupKey: string;
};

export async function importBundle(file: File): Promise<ImportResult> {
  const text = await file.text();
  let bundle: Bundle;
  try {
    bundle = JSON.parse(text) as Bundle;
  } catch {
    throw new Error('文件格式错误（不是 JSON）');
  }
  if (bundle.version !== 1) {
    throw new Error(`不支持的版本 v${bundle.version}（当前支持 v1）`);
  }

  const backupKey = await backupCurrent();

  try {
    await db.transaction('rw', db.images, db.messages, db.nodes, async () => {
      await db.images.clear();
      await db.messages.clear();
      await db.nodes.clear();
      if (bundle.images?.length)   await db.images.bulkPut(bundle.images);
      if (bundle.messages?.length) await db.messages.bulkPut(bundle.messages);
      if (bundle.nodes?.length)    await db.nodes.bulkPut(bundle.nodes);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`导入失败：${msg}。备份保留在 localStorage[${backupKey}]，可手动恢复`);
  }

  return { bundle, backupKey };
}

async function backupCurrent(): Promise<string> {
  const ts  = Date.now();
  const key = `${BACKUP_KEY_PREFIX}${ts}`;
  const [images, messages, nodes] = await Promise.all([
    db.images.toArray(),
    db.messages.orderBy('createdAt').toArray(),
    db.nodes.toArray(),
  ]);
  const backup = { ts, images, messages, nodes };
  try {
    localStorage.setItem(key, JSON.stringify(backup));
  } catch (e) {
    console.warn('[conv-image] backup setItem failed (storage full?)', e);
  }
  // Cleanup expired backups (older than 7 days)
  const cutoff = ts - BACKUP_TTL_MS;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k?.startsWith(BACKUP_KEY_PREFIX)) continue;
    const t = parseInt(k.slice(BACKUP_KEY_PREFIX.length), 10);
    if (Number.isFinite(t) && t < cutoff) localStorage.removeItem(k);
  }
  return key;
}
