import { useEffect, useMemo, useState } from 'react';
import { listTemplates, listCategories, pickTemplateBody } from '../../../../services/templates';
import { useUIStore } from '../../../../stores/uiStore';
import { toast } from '../../../../lib/utils';
import { callRecommendTemplates, type TemplateRecommendation } from '../../../../services/api';
import { TemplateUseModal } from '../Modals/TemplateUseModal';
import type { StyleTemplate, TemplateCategory } from '../../../../types';

/**
 * Template browser with three layers of discovery, in order of effort:
 *   1. Category sidebar — browse by topic
 *   2. Keyword search   — substring match on name / suffix / tags
 *   3. ✨ AI recommend  — describe the goal, gpt-5.5 picks top-3
 *
 * Card click opens TemplateUseModal (preview + AI fill / merge), no longer
 * dumps raw template text into the input.
 */
export function TemplatesTab() {
  const [templates,  setTemplates]  = useState<StyleTemplate[]>([]);
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const setTab        = useUIStore((s) => s.setTab);
  const promptDraft   = useUIStore((s) => s.promptDraft);

  const [selected, setSelected] = useState<StyleTemplate | null>(null);

  // AI recommend state
  const [aiQuery, setAiQuery] = useState('');
  const [aiBusy,  setAiBusy]  = useState(false);
  const [aiResults, setAiResults] = useState<TemplateRecommendation[] | null>(null);

  useEffect(() => {
    void Promise.all([listTemplates(), listCategories()])
      .then(([items, cats]) => {
        setTemplates(items);
        setCategories(cats);
        setActiveCategory(cats[0]?.name ?? 'all');
        setLoading(false);
      })
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, []);

  // Resolve recommendation ids back to full template objects, preserving order.
  const aiResolved = useMemo(() => {
    if (!aiResults) return null;
    return aiResults
      .map((r) => {
        const t = templates.find((x) => x.id === r.id);
        return t ? { template: t, reason: r.reason } : null;
      })
      .filter((x): x is { template: StyleTemplate; reason: string } => x !== null);
  }, [aiResults, templates]);

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

  async function onAiRecommend() {
    const q = aiQuery.trim();
    if (!q) { toast('请描述你想做什么图'); return; }
    if (aiBusy) return;
    setAiBusy(true);
    try {
      // Build a compact catalog: only fields the LLM needs to decide.
      const catalog = templates.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        brief: (t.promptSuffix || t.promptTemplate || '').slice(0, 80).replace(/\s+/g, ' '),
      }));
      const recs = await callRecommendTemplates(q, catalog);
      if (recs.length === 0) toast('AI 没找到合适的模板，可换个描述再试');
      setAiResults(recs);
    } catch (e) {
      toast(`推荐失败：${(e as Error).message}`);
    } finally {
      setAiBusy(false);
    }
  }

  function clearAiResults() {
    setAiResults(null);
    setAiQuery('');
  }

  function openModal(t: StyleTemplate) {
    if (!pickTemplateBody(t)) {
      toast('该模板没有可应用的内容');
      return;
    }
    setSelected(t);
  }

  function applyMechanical(text: string) {
    window.dispatchEvent(new CustomEvent('sparkcode:apply-template', { detail: { text, mode: 'append' } }));
    toast(selected ? `已应用「${selected.name}」` : '已应用模板');
    setTab('big');
  }

  function applyMerged(merged: string) {
    window.dispatchEvent(new CustomEvent('sparkcode:apply-template', { detail: { text: merged, mode: 'replace' } }));
    toast(selected ? `已用 AI 融合「${selected.name}」` : '已 AI 融合模板');
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
    <>
      {/* AI recommend bar */}
      <div className="bg-accent/[0.04] border border-accent/[0.18] rounded-md p-3.5 mb-4">
        <div className="text-[11px] text-ink-soft mb-2 tracking-wide">
          ✨ <span className="font-semibold">AI 模板推荐</span> · 一句话描述你想做的图
        </div>
        <div className="flex gap-2">
          <input
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            placeholder="例：想给我的咖啡店做张极简风格菜单海报"
            className="field-input flex-1 text-[13px]"
            onKeyDown={(e) => { if (e.key === 'Enter' && !aiBusy) void onAiRecommend(); }}
          />
          <button
            onClick={() => void onAiRecommend()}
            disabled={aiBusy || !aiQuery.trim()}
            className="btn-primary text-[12px] px-4 whitespace-nowrap"
          >
            {aiBusy ? 'AI 思考中…' : '✨ 推荐'}
          </button>
          {aiResults && (
            <button onClick={clearAiResults} className="btn-ghost text-[12px] px-3 whitespace-nowrap">清除</button>
          )}
        </div>

        {aiResolved && aiResolved.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] text-muted mb-2">AI 推荐 · top {aiResolved.length}</div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {aiResolved.map(({ template, reason }) => (
                <RecommendCard key={template.id} template={template} reason={reason} onClick={() => openModal(template)} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main two-column layout */}
      <div className="grid gap-5" style={{ gridTemplateColumns: '180px 1fr' }}>
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
                <TemplateCard key={t.id} template={t} onClick={() => openModal(t)} />
              ))}
            </div>
          )}
        </main>
      </div>

      {selected && (
        <TemplateUseModal
          template={selected}
          currentInput={promptDraft}
          onApplyMechanical={applyMechanical}
          onApplyMerged={applyMerged}
          onClose={() => setSelected(null)}
        />
      )}
    </>
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

function TemplateCard({ template, onClick }: { template: StyleTemplate; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-paper border border-border rounded overflow-hidden cursor-pointer hover:border-accent transition-colors group"
      style={{ boxShadow: 'var(--shadow-img)' }}
    >
      <div className="aspect-square bg-bg-2 flex items-center justify-center overflow-hidden relative">
        {template.thumbnailUrl ? (
          <img
            src={template.thumbnailUrl}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="font-display text-faint text-[14px] text-center px-3">
            {template.name}
          </div>
        )}
        <div className="absolute inset-0 bg-accent/0 group-hover:bg-accent/[0.08] transition-colors flex items-center justify-center pointer-events-none">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-accent text-white text-[11px] px-3 py-1 rounded">
            查看 / 应用
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

function RecommendCard(
  { template, reason, onClick }: { template: StyleTemplate; reason: string; onClick: () => void },
) {
  return (
    <div
      onClick={onClick}
      className="bg-paper border border-accent/[0.3] rounded overflow-hidden cursor-pointer hover:border-accent transition-colors group flex"
      style={{ boxShadow: 'var(--shadow-img)' }}
    >
      <div className="w-[80px] h-[80px] bg-bg-2 flex-shrink-0 overflow-hidden">
        {template.thumbnailUrl ? (
          <img src={template.thumbnailUrl} className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-faint text-[10px] text-center px-1">
            {template.category}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 px-3 py-2">
        <div className="text-[13px] font-medium text-ink truncate">{template.name}</div>
        <div className="text-[10px] text-muted mt-0.5">{template.category}</div>
        <div className="text-[11px] text-accent mt-1 line-clamp-2 leading-snug">✨ {reason}</div>
      </div>
    </div>
  );
}
