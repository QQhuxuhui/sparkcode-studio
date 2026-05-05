import { useEffect, useState } from 'react';
import { db } from '../../../../services/db';
import type { GenNode, ImageRecord, Message } from '../../../../types';

type Props = { nodeIds: string[]; onClose: () => void };

type Cell = {
  node: GenNode;
  img:  ImageRecord | undefined;
  msg:  Message | undefined;
  userText: string;
};

export function CompareModal({ nodeIds, onClose }: Props) {
  const [cells, setCells] = useState<Cell[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    void (async () => {
      const [allNodes, allMsgs] = await Promise.all([db.nodes.toArray(), db.messages.orderBy('createdAt').toArray()]);
      const out: Cell[] = [];
      for (const nid of nodeIds) {
        const node = allNodes.find((n) => n.id === nid);
        if (!node) continue;
        const img = await db.images.get(node.imageIds[0]);
        const msg = allMsgs.find((m) => m.id === node.messageId);
        const idx = msg ? allMsgs.indexOf(msg) : -1;
        const userMsg = idx > 0
          ? allMsgs.slice(0, idx).reverse().find((m) => m.role === 'user')
          : undefined;
        out.push({ node, img, msg, userText: userMsg?.text || '' });
      }
      setCells(out);
    })();
  }, [nodeIds]);

  return (
    <div
      className="fixed inset-0 z-[1000] flex flex-col p-10 backdrop-blur-[2px]"
      style={{ background: 'rgba(28,20,12,0.55)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex justify-between items-baseline mb-4">
        <span className="font-display text-[18px] text-white tracking-wide">并排对比 · {nodeIds.length} 张</span>
        <button onClick={onClose} className="bg-transparent border-0 text-white/70 text-[22px] cursor-pointer leading-none">✕</button>
      </div>
      <div
        className="flex-1 grid gap-3.5 overflow-auto"
        style={{ gridTemplateColumns: `repeat(${nodeIds.length}, 1fr)` }}
      >
        {cells.map((cell) => (
          <div
            key={cell.node.id}
            className="flex flex-col bg-paper border border-border rounded p-3.5"
            style={{ boxShadow: 'var(--shadow-modal)' }}
          >
            <img
              src={cell.img?.dataUrl || ''}
              className="w-full h-[60vh] object-contain rounded-sm bg-bg-2"
            />
            <div className="mt-2.5 text-[11px] text-muted">
              <div>
                <span className="text-accent font-semibold">{cell.node.kind}</span>
                {' · '}
                <span className="font-mono">{cell.img?.shortId || ''}</span>
                {' · '}
                {cell.msg?.model || ''}
              </div>
              <div className="mt-1.5 text-ink text-[13px] leading-relaxed">{cell.userText}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
