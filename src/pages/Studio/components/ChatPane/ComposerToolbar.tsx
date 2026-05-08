import { MODELS } from '../../../../data/models';
import { useUIStore } from '../../../../stores/uiStore';

type Props = { onNewChat: () => void };

export function ComposerToolbar({ onNewChat }: Props) {
  const selectedModel = useUIStore((s) => s.selectedModel);
  const setModel       = useUIStore((s) => s.setModel);

  return (
    <div className="flex items-center gap-2.5 px-5 py-2.5 bg-paper-warm/50">
      <label className="text-[11px] text-muted tracking-wide font-medium px-1">模型</label>
      <select
        value={selectedModel}
        onChange={(e) => setModel(e.target.value)}
        className="min-w-[180px] bg-paper border border-border-soft text-ink font-sans text-[12px] px-2 py-1.5 rounded-md cursor-pointer hover:border-accent transition-colors shadow-sm outline-none"
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>
      <span className="ml-auto" />
      <button onClick={onNewChat} className="text-muted hover:text-accent py-1 px-2.5 text-[12px] font-medium transition-colors bg-transparent border-none cursor-pointer flex items-center gap-1">
        <span className="text-[14px] leading-none">+</span> 新对话
      </button>
    </div>
  );
}
