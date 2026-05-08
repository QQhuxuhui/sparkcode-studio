import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, IMAGE_CAPACITY } from '../../../../services/db';
import { useRefStore } from '../../../../stores/refStore';
import { useUIStore } from '../../../../stores/uiStore';
import { toast } from '../../../../lib/utils';

type Filter = {
  source: 'all' | 'generated' | 'uploads';
  model:  string;          // 'all' | concrete model id
  branch: 'all' | 'with-children';
};

export function LibraryTab() {
  const [filter, setFilter] = useState<Filter>({ source: 'all', model: 'all', branch: 'all' });
  const all   = useLiveQuery(() => db.images.orderBy('createdAt').reverse().toArray(), [], []);
  const nodes = useLiveQuery(() => db.nodes.toArray(), [], []);
  const addRef         = useRefStore((s) => s.add);
  const setActiveImage = useUIStore((s) => s.setActiveImage);
  const setSelected    = useUIStore((s) => s.setSelectedNodes);
  const setTab         = useUIStore((s) => s.setTab);

  const childCount = new Map<string, number>();
  for (const n of nodes ?? []) {
    if (n.parentNodeId) childCount.set(n.parentNodeId, (childCount.get(n.parentNodeId) || 0) + 1);
  }
  const byImageNodeId = new Map((nodes ?? []).map((n) => [n.id, n]));

  const usedModels = Array.from(new Set((all ?? []).map((i) => i.model)));

  const filtered = (all ?? []).filter((img) => {
    if (filter.model !== 'all' && img.model !== filter.model) return false;
    if (filter.source === 'uploads'   && !img.shortId.startsWith('u')) return false;
    if (filter.source === 'generated' && !img.shortId.startsWith('g')) return false;
    if (filter.branch === 'with-children') {
      if (!img.nodeId) return false;
      const node = byImageNodeId.get(img.nodeId);
      if (!node || !childCount.has(node.id)) return false;
    }
    return true;
  });

  const chip = (active: boolean): string => active
    ? 'cursor-pointer px-3 py-1 rounded-sm text-[11px] bg-accent text-white tracking-wide font-medium'
    : 'cursor-pointer px-3 py-1 rounded-sm text-[11px] bg-paper text-ink-soft border border-border tracking-wide';

  async function onDownload(id: string) {
    const img = await db.images.get(id);
    if (!img) return;
    const a = document.createElement('a');
    a.href = img.dataUrl; a.download = `${img.shortId}.${img.format}`;
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function onShowInTree(id: string) {
    const img = await db.images.get(id);
    if (img?.nodeId) {
      setSelected([img.nodeId]);
      setTab('tree');
    }
  }
  async function onDelete(id: string) {
    const img = await db.images.get(id);
    if (!confirm(`删除 ${img?.shortId || id.slice(0,8)}？该操作不可撤销`)) return;
    await db.images.delete(id);
  }
  function onZoom(id: string) {
    setActiveImage(id);
    setTab('big');
  }

  return (
    <div>
      {/* Filter chips */}
      <div className="flex gap-1.5 flex-wrap mb-[18px] items-center pb-3.5 border-b border-border-soft">
        <span className="text-muted text-[11px] tracking-wide">来源</span>
        {(['all', 'generated', 'uploads'] as const).map((v) => (
          <span
            key={v}
            onClick={() => setFilter({ ...filter, source: v })}
            className={chip(filter.source === v)}
          >
            {v === 'all' ? '全部' : v === 'generated' ? '生成' : '上传'}
          </span>
        ))}
        <span className="ml-3.5 text-muted text-[11px] tracking-wide">模型</span>
        {['all', ...usedModels].map((v) => (
          <span
            key={v}
            onClick={() => setFilter({ ...filter, model: v })}
            className={chip(filter.model === v)}
          >
            {v === 'all' ? '全部' : v}
          </span>
        ))}
        <span className="ml-3.5 text-muted text-[11px] tracking-wide">分支</span>
        {(['all', 'with-children'] as const).map((v) => (
          <span
            key={v}
            onClick={() => setFilter({ ...filter, branch: v })}
            className={chip(filter.branch === v)}
          >
            {v === 'all' ? '全部' : '有子分支'}
          </span>
        ))}
        <span className="ml-auto text-muted text-[11px] font-mono">
          {(all ?? []).length} / {IMAGE_CAPACITY}
        </span>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {filtered.map((img) => (
          <div
            key={img.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/conv-image-ref', img.id)}
            onClick={() => onZoom(img.id)}
            className="relative aspect-square bg-paper border border-border-soft rounded-lg overflow-hidden group cursor-pointer hover:border-accent hover:shadow-md transition-all duration-200"
            style={{ boxShadow: 'var(--shadow-img)' }}
          >
            <img
              src={img.dataUrl}
              draggable={false}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <span
              className="absolute bottom-1.5 left-1.5 text-white/90 text-[10px] px-1.5 py-0.5 rounded-[3px] font-mono tracking-wide pointer-events-none drop-shadow"
            >
              {img.shortId}
            </span>
            <div
              className="absolute inset-0 hidden group-hover:flex flex-col items-center justify-center gap-2 backdrop-blur-[2px]"
              style={{ background: 'rgba(20,12,8,0.4)' }}
            >
              <div className="flex gap-1.5">
                <button onClick={(e) => { e.stopPropagation(); addRef(img.id); toast(`引用了 ${img.shortId}`); }}
                  title="引用" className="bg-accent hover:bg-accent-deep text-white border-0 w-7 h-7 flex items-center justify-center rounded-md cursor-pointer text-[12px] transition-colors shadow-sm">↩</button>
                <button onClick={(e) => { e.stopPropagation(); void onShowInTree(img.id); }}
                  title="在树中查看" className="bg-white/20 hover:bg-white/30 text-white border-0 w-7 h-7 flex items-center justify-center rounded-md cursor-pointer text-[12px] transition-colors shadow-sm">🌳</button>
              </div>
              <div className="flex gap-1.5">
                <button onClick={(e) => { e.stopPropagation(); void onDownload(img.id); }}
                  title="下载" className="bg-white/20 hover:bg-white/30 text-white border-0 w-7 h-7 flex items-center justify-center rounded-md cursor-pointer text-[12px] transition-colors shadow-sm">⬇</button>
                <button onClick={(e) => { e.stopPropagation(); void onDelete(img.id); }}
                  title="删除" className="bg-error/80 hover:bg-error text-white border-0 w-7 h-7 flex items-center justify-center rounded-md cursor-pointer text-[12px] transition-colors shadow-sm">🗑</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="text-muted text-center py-20 text-[13px]">
          <div className="font-display text-[22px] text-faint mb-3">空空如也</div>
          {(all ?? []).length === 0 ? '尚未生成任何图像' : '当前筛选条件下没有结果'}
        </div>
      )}
    </div>
  );
}
