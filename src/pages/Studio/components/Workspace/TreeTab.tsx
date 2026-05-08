import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, putImage, putMessage, putNode } from '../../../../services/db';
import { useUIStore } from '../../../../stores/uiStore';
import { isGeminiImageModel } from '../../../../data/models';
import { callGptImageGen, callGptImageEdit, callGeminiChatImage } from '../../../../services/api';
import { toast } from '../../../../lib/utils';
import type { GenNode } from '../../../../types';
import { CompareModal } from '../Modals/CompareModal';

const NODE_W = 100;
const NODE_H = 100;
const GAP_X  = 60;
const GAP_Y  = 30;

type Position = { x: number; y: number };

export function TreeTab() {
  const nodes  = useLiveQuery(() => db.nodes.toArray(),   [], []);
  const images = useLiveQuery(() => db.images.toArray(),  [], []);
  const selectedNodeIds = useUIStore((s) => s.selectedNodeIds);
  const setSelectedNodes = useUIStore((s) => s.setSelectedNodes);
  const setActiveImage  = useUIStore((s) => s.setActiveImage);
  const setTab          = useUIStore((s) => s.setTab);
  const [compareOpen, setCompareOpen] = useState(false);
  const [rerollingNodes, setRerollingNodes] = useState<Set<string>>(new Set());

  if ((nodes ?? []).length === 0) {
    return (
      <div className="text-muted text-center py-20 text-[13px]">
        <div className="font-display text-[22px] text-faint mb-3">尚无分支</div>
        生成第一张图后会自动出现分支
      </div>
    );
  }

  const imgMap = new Map((images ?? []).map((i) => [i.id, i]));
  const positions = computeLayout(nodes ?? []);
  const positionList = Array.from(positions.values());
  const maxX = (positionList.length ? Math.max(...positionList.map((p) => p.x)) : 0) + NODE_W + 20;
  const maxY = (positionList.length ? Math.max(...positionList.map((p) => p.y)) : 0) + NODE_H + 20;
  const childCount = new Map<string, number>();
  for (const n of nodes ?? []) {
    if (n.parentNodeId) childCount.set(n.parentNodeId, (childCount.get(n.parentNodeId) || 0) + 1);
  }

  function onNodeClick(e: React.MouseEvent, n: GenNode) {
    if (e.shiftKey) {
      if (selectedNodeIds.includes(n.id)) {
        setSelectedNodes(selectedNodeIds.filter((x) => x !== n.id));
      } else if (selectedNodeIds.length < 4) {
        setSelectedNodes([...selectedNodeIds, n.id]);
      } else {
        toast('最多对比 4 张');
      }
    } else {
      setSelectedNodes([n.id]);
      if (n.imageIds[0]) {
        setActiveImage(n.imageIds[0]);
        setTab('big');
      }
    }
  }

  async function onReroll(n: GenNode) {
    if (rerollingNodes.has(n.id)) { toast('该节点正在重新生成…'); return; }
    setRerollingNodes(new Set([...rerollingNodes, n.id]));
    try {
      const allMsgs = await db.messages.orderBy('createdAt').toArray();
      const failedMsg = allMsgs.find((m) => m.id === n.messageId);
      if (!failedMsg) { toast('找不到原始消息'); return; }
      const userMsg = allMsgs.slice(0, allMsgs.indexOf(failedMsg)).reverse().find((m) => m.role === 'user');
      if (!userMsg) { toast('找不到原始 prompt'); return; }

      // Resolve refs (silently skip missing — but warn user)
      const expectedRefs = (userMsg.refImageIds || []).length;
      const refDataUrls: string[] = [];
      for (const id of (userMsg.refImageIds || [])) {
        const img = await db.images.get(id);
        if (img) refDataUrls.push(img.dataUrl);
      }
      const missing = expectedRefs - refDataUrls.length;
      if (missing > 0) {
        if (refDataUrls.length === 0) {
          toast(`原始引用 ${expectedRefs} 张全部已被清理，无法重生`);
          return;
        }
        toast(`警告：${missing} 张原始引用已丢失，重生结果可能不一致`);
      }

      const aMsg = await putMessage({ role: 'assistant', text: '', model: failedMsg.model });
      try {
        const result = isGeminiImageModel(failedMsg.model)
          ? await callGeminiChatImage({ model: failedMsg.model, prompt: userMsg.text, refDataUrls })
          : refDataUrls.length > 0
            ? await callGptImageEdit({ model: failedMsg.model, prompt: userMsg.text, sourceImages: refDataUrls })
            : await callGptImageGen({ model: failedMsg.model, prompt: userMsg.text });
        const recs = await Promise.all(result.images.map((img) =>
          putImage({ dataUrl: img.dataUrl, model: failedMsg.model, prompt: userMsg.text, format: img.format }),
        ));
        const newNode = await putNode({
          parentNodeId: n.parentNodeId,         // SIBLING, not child
          kind: 'reroll',
          messageId: aMsg.id,
          imageIds: recs.map((r) => r.id),
        });
        aMsg.imageIds = recs.map((r) => r.id);
        aMsg.nodeId   = newNode.id;
        await db.messages.put(aMsg);
        await db.transaction('rw', db.images, async () => {
          await Promise.all(recs.map((r) =>
            db.images.update(r.id, { nodeId: newNode.id, parentId: n.parentNodeId }),
          ));
        });
        toast('重新生成完成');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        aMsg.error = msg;
        await db.messages.put(aMsg);
        toast(`重新生成失败：${msg}`);
      }
    } finally {
      setRerollingNodes((prev) => {
        const next = new Set(prev); next.delete(n.id); return next;
      });
    }
  }

  return (
    <div>
      <div className="mb-3.5 text-muted text-[11px]">
        单击选中 · <span className="text-ink-soft">Shift+单击</span> 多选（最多 4 张） · <span className="text-ink-soft">右键</span> 重新生成
      </div>
      {selectedNodeIds.length >= 2 && (
        <button
          onClick={() => setCompareOpen(true)}
          className="btn-primary mb-3.5 px-4.5 py-1.5 text-[13px]"
        >
          ▣ 并排对比 ({selectedNodeIds.length})
        </button>
      )}

      <svg
        width={maxX} height={maxY}
        className="bg-paper-warm border border-border rounded"
      >
        <defs>
          {(nodes ?? []).filter((n) => positions.has(n.id)).map((n) => (
            <clipPath id={`clip-${n.id}`} key={`clip-${n.id}`}>
              <rect x={positions.get(n.id)!.x + 4} y={positions.get(n.id)!.y + 4} width={NODE_W - 8} height={NODE_H - 8} rx={4} />
            </clipPath>
          ))}
        </defs>
        {/* 笔触风曲线连线 */}
        {(nodes ?? []).filter((n) => n.parentNodeId && positions.has(n.parentNodeId)).map((n) => {
          const p = positions.get(n.parentNodeId!)!;
          const c = positions.get(n.id)!;
          const x1 = p.x + NODE_W, y1 = p.y + NODE_H / 2;
          const x2 = c.x,           y2 = c.y + NODE_H / 2;
          const cx = (x1 + x2) / 2;
          return (
            <path
              key={`line-${n.id}`}
              d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
              fill="none" stroke="#a82828" strokeWidth={1.5} strokeOpacity={0.55} strokeLinecap="round"
            />
          );
        })}
        {/* 节点 */}
        {(nodes ?? []).filter((n) => positions.has(n.id)).map((n) => {
          const p = positions.get(n.id)!;
          const firstImg = imgMap.get(n.imageIds[0]);
          const isSelected = selectedNodeIds.includes(n.id);
          const isRerolling = rerollingNodes.has(n.id);
          const kindBadge: Record<string, string> = { root: '原', edit: '编', reroll: '重', gen: '生' };
          const badge = kindBadge[n.kind] || '?';
          const cc = childCount.get(n.id) || 0;
          return (
            <g
              key={n.id}
              onClick={(e) => onNodeClick(e, n)}
              onContextMenu={(e) => { e.preventDefault(); void onReroll(n); }}
              style={{ cursor: 'pointer', opacity: isRerolling ? 0.5 : 1 }}
            >
              <rect
                x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={6}
                fill="#ffffff"
                stroke={isSelected ? '#a82828' : '#e6dec8'}
                strokeWidth={isSelected ? 3 : 1.5}
                filter="drop-shadow(0 4px 6px rgba(80,50,20,0.06))"
              />
              {firstImg && (
                <image
                  href={firstImg.dataUrl}
                  x={p.x + 4} y={p.y + 4}
                  width={NODE_W - 8} height={NODE_H - 8}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#clip-${n.id})`}
                />
              )}
              <rect
                x={p.x + 4} y={p.y + 4} width={20} height={20} rx={4}
                fill={isSelected ? '#a82828' : 'rgba(168,40,40,0.85)'}
              />
              <text
                x={p.x + 14} y={p.y + 18}
                fill="#fff" fontSize={11} fontWeight={600}
                fontFamily="'Noto Serif SC',serif"
                textAnchor="middle"
              >
                {badge}
              </text>
              {cc > 0 && (
                <text
                  x={p.x + NODE_W - 6} y={p.y + NODE_H - 6}
                  textAnchor="end"
                  fill="#fff" fontSize={10} fontWeight={700}
                  style={{ textShadow: '0 0 3px rgba(0,0,0,0.8)' }}
                >
                  {cc}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {compareOpen && (
        <CompareModal
          nodeIds={selectedNodeIds}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </div>
  );
}

// ===== Layout: depth → x, sibling order → y, parent at midpoint of children =====
function computeLayout(nodes: GenNode[]): Map<string, Position> {
  const byParent = new Map<string, GenNode[]>();
  for (const n of nodes) {
    const k = n.parentNodeId || '__root__';
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(n);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.createdAt - b.createdAt);

  const positions = new Map<string, Position>();
  let nextRow = 0;

  function place(node: GenNode, depth: number) {
    const children = byParent.get(node.id) || [];
    if (children.length === 0) {
      positions.set(node.id, {
        x: depth * (NODE_W + GAP_X),
        y: nextRow * (NODE_H + GAP_Y),
      });
      nextRow++;
    } else {
      const childRowsStart = nextRow;
      children.forEach((c) => place(c, depth + 1));
      const childRowsEnd = nextRow - 1;
      const midY = ((childRowsStart + childRowsEnd) / 2) * (NODE_H + GAP_Y);
      positions.set(node.id, { x: depth * (NODE_W + GAP_X), y: midY });
    }
  }
  for (const root of (byParent.get('__root__') || [])) place(root, 0);

  // Orphan nodes (parent points to nothing) — anchor as additional roots
  for (const n of nodes) {
    if (!positions.has(n.id)) place(n, 0);
  }
  return positions;
}

