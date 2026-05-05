import { MODELS } from '../../../../data/models';
import { useUIStore } from '../../../../stores/uiStore';

type Props = { onNewChat: () => void };

export function ComposerToolbar({ onNewChat }: Props) {
  const selectedModel = useUIStore((s) => s.selectedModel);
  const setModel       = useUIStore((s) => s.setModel);

  return (
    <div className="flex items-center gap-2.5 px-5 py-2.5 bg-paper-warm border-t border-border">
      <label className="text-[11px] text-muted tracking-wide font-medium">模型</label>
      <select
        value={selectedModel}
        onChange={(e) => setModel(e.target.value)}
        className="min-w-[220px] bg-paper border border-border text-ink font-sans text-[13px] px-3 py-1.5 rounded cursor-pointer hover:border-accent transition-colors"
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>
      <span className="ml-auto" />
      <button onClick={onNewChat} className="btn-ghost py-1.5 px-3.5 text-[12.5px]">
        + 新对话
      </button>
    </div>
  );
}
