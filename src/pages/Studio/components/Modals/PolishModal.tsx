import { useEffect, useRef, useState } from 'react';

type Props = {
  original: string;
  polished: string;
  onAdopt: (text: string) => void;       // text = current textarea value at click
  onAdoptEdit: (text: string) => void;
  onClose: () => void;
};

export function PolishModal({ original, polished, onAdopt, onAdoptEdit, onClose }: Props) {
  const [edited, setEdited] = useState(polished);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[1000] flex items-center justify-center p-8 backdrop-blur-[2px]"
      style={{ background: 'rgba(28,20,12,0.55)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="bg-paper border border-border rounded-md p-7 w-[min(820px,95vw)]"
        style={{ boxShadow: 'var(--shadow-modal)' }}
      >
        <div className="flex justify-between items-baseline mb-[18px] pb-3 border-b border-border-soft">
          <span className="font-display text-[18px] font-semibold text-ink tracking-wide">✨ 提示词润色</span>
          <button onClick={onClose} className="bg-transparent border-0 text-muted text-[20px] leading-none cursor-pointer hover:text-ink">✕</button>
        </div>
        <div className="grid gap-[18px] mb-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <div className="text-[11px] text-muted mb-2 tracking-wide">原文</div>
            <div className="bg-bg border border-border p-3.5 rounded-sm min-h-[140px] text-[13px] whitespace-pre-wrap leading-relaxed text-ink-soft">
              {original}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-accent mb-2 tracking-wide font-semibold">润色后 · 可编辑</div>
            <textarea
              value={edited}
              onChange={(e) => setEdited(e.target.value)}
              className="field-textarea w-full min-h-[140px] text-[13px] leading-relaxed"
              style={{ borderColor: 'rgba(168,40,40,0.14)' }}
            />
          </div>
        </div>
        <div className="flex gap-2.5 justify-end">
          <button onClick={onClose} className="btn-ghost">取消</button>
          <button onClick={() => onAdoptEdit(edited)} className="btn-ghost">编辑后采纳</button>
          <button onClick={() => onAdopt(edited)}     className="btn-primary">采纳并替换</button>
        </div>
      </div>
    </div>
  );
}
