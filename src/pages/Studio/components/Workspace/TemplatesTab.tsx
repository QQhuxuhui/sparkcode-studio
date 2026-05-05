import { useEffect, useMemo, useState } from 'react';
import { listTemplates, listCategories } from '../../../../services/templates';
import { useUIStore } from '../../../../stores/uiStore';
import { toast } from '../../../../lib/utils';
import type { StyleTemplate, TemplateCategory } from '../../../../types';

/**
 * Template browser. Loads all templates + categories on mount, filters
 * client-side (categories list is small, ~10 entries; full list might be
 * 100-500 entries — fine to keep in memory). Click a card → applies
 * promptSuffix to the chat input via UI store side-channel.
 */
export function TemplatesTab() {
  const [templates,  setTemplates]  = useState<StyleTemplate[]>([]);
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const setTab = useUIStore((s) => s.setTab);

  useEffect(() => {
    void Promise.all([listTemplates(), listCategories()])
      .then(([items, cats]) => {
        setTemplates(items);
        setCategories(cats);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    let arr = templates;
    if (activeCategory !== 'all') arr = arr.filter((t) => t.category === activeCategory);
    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        (t.promptSuffix?.toLowerCase().includes(q) ?? false) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    return arr;
  }, [templates, activeCategory, search]);

  function applyTemplate(t: StyleTemplate) {
    if (!t.promptSuffix && !t.promptTemplate) {
      toast('该模板没有可应用的内容');
      return;
    }
    // Side-channel: emit a CustomEvent so InputArea can append to its current text
    // without us holding a ref to the InputArea component.
    window.dispatchEvent(new CustomEvent('sparkcode:apply-template', { detail: t }));
    toast(`已应用「${t.name}」到输入框`);
    setTab('big');
  }

  if (loading) return <div className="text-muted text-center py-20 text-[13px]">载入中…</div>;
  if (err) return (
    <div className="text-error text-center py-20 text-[13px]">
      <div className="font-display text-[16px] text-ink-soft mb-2">模板加载失败</div>
      {err}
    </div>
  );
  if (templates.length === 0) return (
    <div className="text-muted text-center py-20 text-[13px]">
      <div className="font-display text-[22px] text-faint mb-3">暂无模板</div>
      待管理员通过 import 脚本导入
    </div>
  );

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: '180px 1fr' }}>
      {/* Sidebar — category nav */}
      <aside className="border-r border-border-soft pr-4">
        <div className="text-[11px] text-muted tracking-wide mb-2 uppercase">分类</div>
        <SidebarItem
          name="全部"
          count={templates.length}
          active={activeCategory === 'all'}
          onClick={() => setActiveCategory('all')}
        />
        {categories.map((c) => (
          <SidebarItem
            key={c.name}
            name={c.name}
            count={c.count}
            active={activeCategory === c.name}
            onClick={() => setActiveCategory(c.name)}
          />
        ))}
      </aside>

      {/* Main — search + grid */}
      <main>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索模板名称、关键词、标签…"
          className="field-input w-full mb-4"
        />
        {filtered.length === 0 ? (
          <div className="text-muted text-center py-12 text-[13px]">没有匹配结果</div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {filtered.map((t) => (
              <TemplateCard key={t.id} template={t} onApply={() => applyTemplate(t)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function SidebarItem(
  { name, count, active, onClick }: { name: string; count: number; active: boolean; onClick: () => void },
) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 rounded text-[13px] mb-0.5 transition-colors flex items-center justify-between ${
        active ? 'bg-accent/[0.08] text-accent font-semibold' : 'text-ink-soft hover:bg-bg-2'
      }`}
    >
      <span>{name}</span>
      <span className={`text-[10px] font-mono ${active ? 'text-accent' : 'text-faint'}`}>{count}</span>
    </button>
  );
}

function TemplateCard({ template, onApply }: { template: StyleTemplate; onApply: () => void }) {
  return (
    <div
      onClick={onApply}
      className="bg-paper border border-border rounded overflow-hidden cursor-pointer hover:border-accent transition-colors group"
      style={{ boxShadow: 'var(--shadow-img)' }}
    >
      <div className="aspect-square bg-bg-2 flex items-center justify-center overflow-hidden relative">
        {template.thumbnailUrl ? (
          <img src={template.thumbnailUrl} className="w-full h-full object-cover" />
        ) : (
          <div className="font-display text-faint text-[14px] text-center px-3">
            {template.name}
          </div>
        )}
        <div className="absolute inset-0 bg-accent/0 group-hover:bg-accent/[0.08] transition-colors flex items-center justify-center pointer-events-none">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-accent text-white text-[11px] px-3 py-1 rounded">
            点击应用
          </span>
        </div>
      </div>
      <div className="px-3 py-2">
        <div className="text-[13px] font-medium text-ink truncate">{template.name}</div>
        <div className="text-[10px] text-muted mt-0.5">{template.category}</div>
      </div>
    </div>
  );
}
