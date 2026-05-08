import { useUIStore, type TabId } from '../../../../stores/uiStore';
import { modelById } from '../../../../data/models';
import { BigImageTab } from './BigImageTab';
import { TreeTab } from './TreeTab';
import { LibraryTab } from './LibraryTab';
import { MaskTab } from './MaskTab';
import { TemplatesTab } from './TemplatesTab';

const ALL_TABS: { id: TabId; label: string; modelGated?: boolean }[] = [
  { id: 'big',       label: '大图' },
  { id: 'tree',      label: '分支树' },
  { id: 'library',   label: '图库' },
  { id: 'templates', label: '模板库' },
  { id: 'mask',      label: '区域编辑', modelGated: true },
];

export function Workspace() {
  const activeTab     = useUIStore((s) => s.activeTab);
  const setTab        = useUIStore((s) => s.setTab);
  const selectedModel = useUIStore((s) => s.selectedModel);
  const supportsMask  = !!modelById(selectedModel)?.supportsMask;
  const tabs = ALL_TABS.filter((t) => !t.modelGated || supportsMask);

  return (
    <section className="flex flex-col min-h-0 bg-bg/50">
      <div className="flex gap-8 border-b border-border px-8 bg-paper-warm pt-1 shadow-sm relative z-10">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative pb-3 pt-2.5 font-display text-[15px] tracking-wider transition-colors outline-none ${
              t.id === activeTab ? 'text-accent font-bold' : 'text-muted hover:text-ink'
            }`}
          >
            {t.label}
            {t.id === activeTab && (
              <span className="absolute left-0 right-0 -bottom-px h-[3px] bg-accent rounded-t-md" />
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-6 relative z-0">
        {activeTab === 'big'     && <BigImageTab />}
        {activeTab === 'tree'    && <TreeTab />}
        {activeTab === 'library'   && <LibraryTab />}
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'mask'      && <MaskTab />}
      </div>
    </section>
  );
}
