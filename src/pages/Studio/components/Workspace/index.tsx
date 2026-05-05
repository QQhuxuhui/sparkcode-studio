import { useUIStore, type TabId } from '../../../../stores/uiStore';
import { modelById } from '../../../../data/models';
import { BigImageTab } from './BigImageTab';
import { TreeTab } from './TreeTab';
import { LibraryTab } from './LibraryTab';

const ALL_TABS: { id: TabId; label: string; modelGated?: boolean }[] = [
  { id: 'big',     label: '大图' },
  { id: 'tree',    label: '分支树' },
  { id: 'library', label: '图库' },
  { id: 'mask',    label: '区域编辑', modelGated: true },
];

export function Workspace() {
  const activeTab     = useUIStore((s) => s.activeTab);
  const setTab        = useUIStore((s) => s.setTab);
  const selectedModel = useUIStore((s) => s.selectedModel);
  const supportsMask  = !!modelById(selectedModel)?.supportsMask;
  const tabs = ALL_TABS.filter((t) => !t.modelGated || supportsMask);

  return (
    <section className="flex flex-col min-h-0 bg-bg">
      <div className="flex gap-0 border-b border-border px-6 bg-paper-warm">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative px-5 py-3.5 font-display text-[14px] tracking-wider transition-colors ${
              t.id === activeTab ? 'text-accent font-semibold' : 'text-muted hover:text-ink'
            }`}
          >
            {t.label}
            {t.id === activeTab && (
              <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-accent rounded-sm" />
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'big'     && <BigImageTab />}
        {activeTab === 'tree'    && <TreeTab />}
        {activeTab === 'library' && <LibraryTab />}
        {activeTab === 'mask'    && <Placeholder name="区域编辑" />}
      </div>
    </section>
  );
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="text-muted text-center py-20 text-[13px]">
      <div className="font-display text-[22px] text-faint mb-3">{name}</div>
      该功能即将上线（已在路线图）
    </div>
  );
}
