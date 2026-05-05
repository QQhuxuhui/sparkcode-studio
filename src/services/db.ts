// Dexie wrapper around IndexedDB. Replaces the raw `idb` calls from the
// HTML version. Dexie's `useLiveQuery` hook makes React components auto-
// rerender when these tables change — much nicer than manually re-fetching.

import Dexie, { type Table } from 'dexie';
import type { ImageRecord, Message, GenNode } from '../types';

const IMAGE_CAPACITY = 200;
const LRU_GRACE_MS = 5000;     // protect anything created in the last N seconds

class StudioDB extends Dexie {
  images!:   Table<ImageRecord,  string>;
  messages!: Table<Message,      string>;
  nodes!:    Table<GenNode,      string>;

  constructor() {
    super('convImageStudio');                // share name with HTML version
    this.version(1).stores({
      images:   'id, shortId, createdAt, nodeId',
      messages: 'id, createdAt, nodeId, role',
      nodes:    'id, parentNodeId, createdAt',
    });
  }
}

export const db = new StudioDB();

// ===== Short-ID allocator (g1, g2... / u1, u2...) =====
export async function nextShortId(prefix: 'g' | 'u'): Promise<string> {
  let max = 0;
  await db.images.each((rec) => {
    if (rec.shortId?.startsWith(prefix)) {
      const n = parseInt(rec.shortId.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  });
  return `${prefix}${max + 1}`;
}

// ===== Image storage =====
type PutImageInput = {
  dataUrl: string;
  model: string;
  prompt: string;
  parentId?: string | null;
  nodeId?: string | null;
  width?: number;
  height?: number;
  format?: string;
  isUserUpload?: boolean;
};

export async function putImage(input: PutImageInput): Promise<ImageRecord> {
  const id      = crypto.randomUUID();
  const shortId = await nextShortId(input.isUserUpload ? 'u' : 'g');
  const rec: ImageRecord = {
    id,
    shortId,
    dataUrl:   input.dataUrl,
    model:     input.model,
    prompt:    input.prompt,
    parentId:  input.parentId ?? null,
    nodeId:    input.nodeId ?? null,
    width:     input.width ?? 0,
    height:    input.height ?? 0,
    format:    input.format ?? 'png',
    createdAt: Date.now(),
  };
  await db.images.put(rec);
  // Async eviction — never blocks the insert
  queueMicrotask(() => { void evictLRU(); });
  return rec;
}

export async function evictLRU(): Promise<number> {
  const all = await db.images.orderBy('createdAt').toArray();
  if (all.length <= IMAGE_CAPACITY) return 0;

  const nodes = await db.nodes.toArray();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childCount = new Map<string, number>();
  for (const n of nodes) {
    if (n.parentNodeId) childCount.set(n.parentNodeId, (childCount.get(n.parentNodeId) || 0) + 1);
  }
  // Walk from leaves to root; cycle-guarded
  const protectedNodes = new Set<string>();
  const leaves = nodes.filter((n) => !childCount.has(n.id));
  for (const leaf of leaves) {
    let cur: GenNode | undefined = leaf;
    while (cur && !protectedNodes.has(cur.id)) {
      protectedNodes.add(cur.id);
      cur = cur.parentNodeId ? byId.get(cur.parentNodeId) : undefined;
    }
  }
  const protectedImageIds = new Set(
    nodes.filter((n) => protectedNodes.has(n.id)).flatMap((n) => n.imageIds),
  );

  const cutoff = Date.now() - LRU_GRACE_MS;
  const removable = all.filter(
    (img) => !protectedImageIds.has(img.id) && img.createdAt < cutoff,
  );
  const toRemove = removable.slice(0, all.length - IMAGE_CAPACITY);
  await db.images.bulkDelete(toRemove.map((i) => i.id));
  return toRemove.length;
}

// ===== Message storage =====
type PutMessageInput = {
  role: 'user' | 'assistant';
  text?: string;
  imageIds?: string[];
  refImageIds?: string[];
  nodeId?: string | null;
  model?: string;
  error?: string | null;
};

export async function putMessage(input: PutMessageInput): Promise<Message> {
  const rec: Message = {
    id:         crypto.randomUUID(),
    role:       input.role,
    text:       input.text       ?? '',
    imageIds:   input.imageIds   ?? [],
    refImageIds: input.refImageIds ?? [],
    nodeId:     input.nodeId     ?? null,
    model:      input.model      ?? '',
    error:      input.error      ?? null,
    createdAt:  Date.now(),
  };
  await db.messages.put(rec);
  return rec;
}

// ===== Node storage =====
type PutNodeInput = {
  parentNodeId?: string | null;
  kind: GenNode['kind'];
  messageId: string;
  imageIds?: string[];
  label?: string;
};

export async function putNode(input: PutNodeInput): Promise<GenNode> {
  const rec: GenNode = {
    id:           crypto.randomUUID(),
    parentNodeId: input.parentNodeId ?? null,
    kind:         input.kind,
    messageId:    input.messageId,
    imageIds:     input.imageIds ?? [],
    label:        input.label ?? '',
    createdAt:    Date.now(),
  };
  await db.nodes.put(rec);
  return rec;
}

// ===== Convenience clear =====
export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.images, db.messages, db.nodes, async () => {
    await db.images.clear();
    await db.messages.clear();
    await db.nodes.clear();
  });
}

export { IMAGE_CAPACITY };
