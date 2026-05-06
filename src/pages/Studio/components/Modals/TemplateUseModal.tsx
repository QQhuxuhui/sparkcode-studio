import { useEffect, useMemo, useRef, useState } from 'react';
import type { StyleTemplate } from '../../../../types';
import { callMergePrompt, callFillTemplate } from '../../../../services/api';
import { extractPlaceholders, fillPlaceholders, pickTemplateBody } from '../../../../services/templates';
import { toast } from '../../../../lib/utils';

type Props = {
  template: StyleTemplate;
  currentInput: string;            // user's current text in the chat input — used by AI-merge
  onApplyMechanical: (text: string) => void;   // mechanical concat with current input
  onApplyMerged: (mergedFinalPrompt: string) => void;  // replace current input with LLM-merged
  onClose: () => void;
};

export function TemplateUseModal({
  template, currentInput, onApplyMechanical, onApplyMerged, onClose,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const body = useMemo(() => pickTemplateBody(template), [template]);
  const placeholders = useMemo(() => extractPlaceholders(body), [body]);

  // C: per-placeholder form values (only relevant when placeholders.length > 0)
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(placeholders.map((p) => [p, ''])));
  const [intent, setIntent] = useState('');
  const [fillBusy, setFillBusy] = useState(false);

  // A: merge-with-AI
  const [mergeBusy, setMergeBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The "filled body" — what we'll actually apply when no AI is involved.
  const filledBody = useMemo(() => fillPlaceholders(body, values), [body, values]);
  const stillHasUnfilled = placeholders.some((p) => !values[p]?.trim());

  async function onAiFill() {
    if (!intent.trim()) { toast('请先用一句话描述你想做什么'); return; }
    if (!placeholders.length) return;
    setFillBusy(true);
    try {
      const map = await callFillTemplate(intent.trim(), body, placeholders);
      setValues((prev) => ({ ...prev, ...map }));
      const filled = Object.keys(map).length;
      toast(filled === placeholders.length ? `AI 已填好全部 ${filled} 项` : `AI 填了 ${filled}/${placeholders.length} 项，剩余手动`);
    } catch (e) {
      toast(`AI 填空失败：${(e as Error).message}`);
    } finally {
      setFillBusy(false);
    }
  }

  async function onAiMerge() {
    setMergeBusy(true);
    try {
      // Use filled body if there are placeholders, raw body otherwise.
      const templateText = placeholders.length > 0 ? filledBody : body;
      const merged = await callMergePrompt(currentInput.trim(), templateText);
      onApplyMerged(merged);
      onClose();
    } catch (e) {
      toast(`AI 融合失败：${(e as Error).message}`);
    } finally {
      setMergeBusy(false);
    }
  }

  function onMechanical() {
    const text = placeholders.length > 0 ? filledBody : body;
    onApplyMechanical(text);
    onClose();
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[1000] flex items-center justify-center p-8 backdrop-blur-[2px]"
      style={{ background: 'rgba(28,20,12,0.55)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="bg-paper border border-border rounded-md p-7 w-[min(960px,95vw)] max-h-[90vh] overflow-auto"
        style={{ boxShadow: 'var(--shadow-modal)' }}
      >
        <div className="flex justify-between items-baseline mb-[18px] pb-3 border-b border-border-soft">
          <span className="font-display text-[18px] font-semibold text-ink tracking-wide">使用模板</span>
          <button onClick={onClose} className="bg-transparent border-0 text-muted text-[20px] leading-none cursor-pointer hover:text-ink">✕</button>
        </div>

        <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(240px, 320px) 1fr' }}>
          {/* Left: example image + meta */}
          <div>
            {template.fullExampleUrl || template.thumbnailUrl ? (
              <img
                src={template.fullExampleUrl || template.thumbnailUrl || ''}
                className="w-full aspect-square object-cover rounded border border-border"
                style={{ boxShadow: 'var(--shadow-img)' }}
              />
            ) : (
              <div className="w-full aspect-square bg-bg-2 border border-border rounded flex items-center justify-center text-faint text-[12px]">
                无示例图
              </div>
            )}
            <div className="mt-3 font-display text-[16px] text-ink truncate">{template.name}</div>
            <div className="text-[11px] text-muted mt-1">{template.category}</div>
            {template.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {template.tags.map((tag) => (
                  <span key={tag} className="bg-bg-2 text-faint text-[10px] px-2 py-0.5 rounded">{tag}</span>
                ))}
              </div>
            )}
          </div>

          {/* Right: prompt body / placeholder form */}
          <div className="min-w-0">
            <div className="text-[11px] text-muted mb-2 tracking-wide uppercase">模板原文</div>
            <div className="bg-bg border border-border p-3 rounded-sm text-[13px] whitespace-pre-wrap leading-relaxed text-ink-soft mb-4 max-h-[180px] overflow-auto">
              {body || <span className="text-faint">该模板没有可应用的 prompt 内容</span>}
            </div>

            {placeholders.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] text-accent tracking-wide uppercase font-semibold">
                    填空 · {placeholders.length} 项
                  </div>
                  {stillHasUnfilled && (
                    <span className="text-[10px] text-faint">未填项会保留 [xxx] 原样</span>
                  )}
                </div>

                {/* AI-fill assist */}
                <div className="bg-accent/[0.04] border border-accent/[0.15] rounded p-2.5 mb-3">
                  <div className="text-[11px] text-ink-soft mb-1.5">✨ 一句话描述意图，让 AI 填好全部字段</div>
                  <div className="flex gap-2">
                    <input
                      value={intent}
                      onChange={(e) => setIntent(e.target.value)}
                      placeholder="例：做一个外卖 App 的开屏页，主色橙红"
                      className="field-input flex-1 text-[13px]"
                      onKeyDown={(e) => { if (e.key === 'Enter' && !fillBusy) void onAiFill(); }}
                    />
                    <button
                      onClick={() => void onAiFill()}
                      disabled={fillBusy || !intent.trim()}
                      className="btn-primary text-[12px] px-3 whitespace-nowrap"
                    >
                      {fillBusy ? 'AI 填写中…' : '✨ AI 帮我填'}
                    </button>
                  </div>
                </div>

                {/* Per-field inputs */}
                <div className="grid gap-2">
                  {placeholders.map((p) => (
                    <div key={p}>
                      <div className="text-[11px] text-muted mb-1">[{p}]</div>
                      <input
                        value={values[p] || ''}
                        onChange={(e) => setValues((prev) => ({ ...prev, [p]: e.target.value }))}
                        placeholder={`填入「${p}」的值`}
                        className="field-input w-full text-[13px]"
                      />
                    </div>
                  ))}
                </div>

                {/* Filled-preview */}
                <details className="mt-3 text-[12px] text-muted">
                  <summary className="cursor-pointer hover:text-ink">预览替换后的 prompt</summary>
                  <div className="mt-2 bg-bg border border-border-soft p-2.5 rounded-sm whitespace-pre-wrap text-[12px] text-ink-soft leading-relaxed">
                    {filledBody}
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2.5 justify-end mt-5 pt-4 border-t border-border-soft">
          <button onClick={onClose} className="btn-ghost">取消</button>
          <button
            onClick={onMechanical}
            disabled={!body}
            className="btn-ghost"
            title={currentInput.trim() ? '把模板内容追加到当前输入框' : '把模板内容写到输入框'}
          >
            直接应用
          </button>
          <button
            onClick={() => void onAiMerge()}
            disabled={!body || mergeBusy}
            className="btn-primary"
            title="用 AI 把你的输入和模板风格融合成连贯的 prompt"
          >
            {mergeBusy ? 'AI 融合中…' : '✨ AI 融合应用'}
          </button>
        </div>
      </div>
    </div>
  );
}
