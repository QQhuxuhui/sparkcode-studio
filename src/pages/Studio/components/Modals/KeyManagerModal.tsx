import { useEffect, useRef, useState } from 'react';
import { KEY_GROUPS, loadGroupKeys, saveKeyForGroup } from '../../../../services/keys';
import { toast } from '../../../../lib/utils';

type Props = { firstRun: boolean; onClose: () => void };

export function KeyManagerModal({ firstRun, onClose }: Props) {
  const stored = loadGroupKeys();
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...stored }));
  const [shown,  setShown]  = useState<Record<string, boolean>>({});
  const overlayRef = useRef<HTMLDivElement>(null);

  // Esc + backdrop dismiss (firstRun blocks both)
  useEffect(() => {
    if (firstRun) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [firstRun, onClose]);

  function onSave() {
    let any = false;
    for (const g of KEY_GROUPS) {
      const v = (values[g.id] || '').trim();
      saveKeyForGroup(g.id, v);
      if (v) any = true;
    }
    if (firstRun && !any) { toast('请至少填写一个分组的令牌'); return; }
    toast('令牌已保存');
    onClose();
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[1000] flex items-center justify-center p-8 backdrop-blur-[2px]"
      style={{ background: 'rgba(28,20,12,0.55)' }}
      onClick={(e) => { if (!firstRun && e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="bg-paper border border-border rounded-md p-7 w-[min(640px,95vw)] max-h-[90vh] overflow-auto"
        style={{ boxShadow: 'var(--shadow-modal)' }}
      >
        <div className="flex justify-between items-baseline mb-2 pb-3.5 border-b border-border-soft">
          <span className="font-display text-[18px] font-semibold text-ink tracking-wide">⚙ 令牌管理</span>
          {firstRun
            ? <span className="text-[11px] text-accent font-semibold">首次配置</span>
            : <button onClick={onClose} className="bg-transparent border-0 text-muted text-xl leading-none cursor-pointer hover:text-ink">✕</button>}
        </div>
        <div className="my-3.5 mb-[18px] bg-accent/[0.06] border border-accent/30 rounded-md px-4 py-3 leading-relaxed">
          <div className="text-[14px] text-ink font-semibold flex items-center gap-2">
            <span className="text-[16px]">🔑</span>
            <span>
              如果还没有令牌，请前往{' '}
              <a
                href="https://sparkcode.top"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline decoration-accent/50 underline-offset-2 hover:decoration-accent transition-colors font-bold"
              >
                https://sparkcode.top
              </a>
              {' '}登录创建。
            </span>
          </div>
          {firstRun && (
            <div className="text-[12px] text-muted mt-2">
              请至少填写一个分组的令牌才能开始使用。两个都填则可同时调用 GPT 和 Gemini 模型。
            </div>
          )}
        </div>

        {KEY_GROUPS.map((g) => {
          const cur = values[g.id] || '';
          return (
            <div key={g.id} className="bg-paper-warm border border-border rounded p-4 mb-3">
              <div className="flex items-baseline gap-2.5 mb-1">
                <span className="font-display text-[15px] font-semibold text-ink tracking-wide">{g.label}</span>
                <span className={`text-[11px] tracking-tight ${cur ? 'text-success' : 'text-warn'}`}>
                  {cur ? '● 已配置' : '○ 未配置'}
                </span>
              </div>
              <div className="text-[11.5px] text-muted mb-2">{g.hint}</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {g.models.map((m) => (
                  <code key={m} className="bg-bg-2 px-2 py-px rounded-sm text-[10.5px] text-ink-soft font-mono">{m}</code>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type={shown[g.id] ? 'text' : 'password'}
                  value={cur}
                  onChange={(e) => setValues({ ...values, [g.id]: e.target.value })}
                  placeholder="sk-..."
                  spellCheck={false}
                  autoComplete="off"
                  className="field-input flex-1 font-mono text-[12px]"
                />
                <button
                  onClick={() => setShown({ ...shown, [g.id]: !shown[g.id] })}
                  className="btn-ghost py-1.5 px-2.5"
                  title="显示/隐藏"
                >
                  👁
                </button>
              </div>
            </div>
          );
        })}

        <div className="flex gap-2.5 justify-end mt-[18px]">
          {!firstRun && <button onClick={onClose} className="btn-ghost">取消</button>}
          <button onClick={onSave} className="btn-primary">保 存</button>
        </div>
      </div>
    </div>
  );
}
