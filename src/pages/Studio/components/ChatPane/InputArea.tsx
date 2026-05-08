import { useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../../../stores/uiStore';
import { useRefStore } from '../../../../stores/refStore';
import { isGeminiImageModel } from '../../../../data/models';
import { putMessage, putNode, putImage, db } from '../../../../services/db';
import { callGptImageGen, callGptImageEdit, callGeminiChatImage, callPolishPrompt } from '../../../../services/api';
import { toast, fileToDataUrl } from '../../../../lib/utils';
import { RefPills } from './RefPills';
import { MentionPopover } from './MentionPopover';
import { PolishModal } from '../Modals/PolishModal';
import type { GeneratedImage } from '../../../../types';

export function InputArea() {
  const selectedModel  = useUIStore((s) => s.selectedModel);
  const setPromptDraft = useUIStore((s) => s.setPromptDraft);
  const refIds         = useRefStore((s) => s.imageIds);
  const addRef         = useRefStore((s) => s.add);
  const clearRefs      = useRefStore((s) => s.clear);

  const [prompt, setPrompt]   = useState('');
  const [count,  setCount]    = useState(1);
  const [size,   setSize]     = useState('1024x1024');
  const [aspect, setAspect]   = useState('1:1');
  const [resolution, setResolution] = useState('1K');
  const [busy, setBusy] = useState(false);
  const [polishBusy,   setPolishBusy]   = useState(false);
  const [polishModal,  setPolishModal]  = useState<{ original: string; polished: string } | null>(null);

  const taRef       = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Apply-template events fired from TemplatesTab. Two modes:
  //   append  — concat to current prompt (mechanical "X · Y")
  //   replace — overwrite the textarea with the AI-merged final prompt
  useEffect(() => {
    function onApply(e: Event) {
      const detail = (e as CustomEvent<{ text: string; mode: 'append' | 'replace' }>).detail;
      const text = detail?.text?.trim();
      if (!text) return;
      if (detail.mode === 'replace') {
        setPrompt(text);
      } else {
        setPrompt((cur) => (cur.trim() ? `${cur.trim()} · ${text}` : text));
      }
    }
    window.addEventListener('sparkcode:apply-template', onApply as EventListener);
    return () => window.removeEventListener('sparkcode:apply-template', onApply as EventListener);
  }, []);

  // Mirror prompt → uiStore.promptDraft so TemplatesTab's modal can read the
  // user's current input when AI-merging without coupling components.
  useEffect(() => { setPromptDraft(prompt); }, [prompt, setPromptDraft]);

  async function onPolish() {
    const original = prompt.trim();
    if (!original) { toast('请先输入要润色的提示词'); return; }
    if (polishBusy) return;
    setPolishBusy(true);
    try {
      const polished = await callPolishPrompt(original);
      setPolishModal({ original, polished });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast(`润色失败：${msg}`);
    } finally {
      setPolishBusy(false);
    }
  }

  const isGem = isGeminiImageModel(selectedModel);

  async function ingestFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    const dataUrl = await fileToDataUrl(file);
    const rec = await putImage({
      dataUrl, model: '(uploaded)', prompt: '', isUserUpload: true,
      format: file.type.split('/')[1] || 'png',
    });
    addRef(rec.id);
    toast(`已上传 ${rec.shortId}`);
  }

  async function onSend() {
    const text = prompt.trim();
    if (!text) { toast('请输入提示词'); return; }
    if (busy) return;
    setBusy(true);

    try {
      // Resolve refs (and prune any that have been LRU-evicted)
      const refDataUrls: string[] = [];
      const refIdsSnap = [...refIds];
      for (const id of refIdsSnap) {
        const img = await db.images.get(id);
        if (!img) {
          useRefStore.setState({ imageIds: useRefStore.getState().imageIds.filter((x) => x !== id) });
          toast('引用图已被清理，已自动移除');
          return;
        }
        refDataUrls.push(img.dataUrl);
      }

      await putMessage({ role: 'user', text, model: selectedModel, refImageIds: refIdsSnap });
      const aMsg = await putMessage({ role: 'assistant', text: '', model: selectedModel });

      try {
        let result: { images: GeneratedImage[] };
        if (isGem) {
          const settled = await Promise.all(
            Array.from({ length: count }, () =>
              callGeminiChatImage({
                model: selectedModel, prompt: text,
                refDataUrls, aspectRatio: aspect, resolution,
              }).catch((e) => ({ error: e as Error })),
            ),
          );
          const ok = settled.filter((s): s is { images: GeneratedImage[] } => !('error' in s));
          if (ok.length === 0) {
            const first = settled.find((s): s is { error: Error } => 'error' in s);
            throw first?.error ?? new Error('全部失败');
          }
          result = { images: ok.flatMap((s) => s.images) };
        } else if (refDataUrls.length > 0) {
          result = await callGptImageEdit({
            model: selectedModel, prompt: text,
            sourceImages: refDataUrls, n: count, size,
          });
        } else {
          result = await callGptImageGen({ model: selectedModel, prompt: text, n: count, size });
        }

        // Persist images
        const recs = await Promise.all(result.images.map((img) =>
          putImage({ dataUrl: img.dataUrl, model: selectedModel, prompt: text, format: img.format }),
        ));

        // Branching: refs ⇒ child (kind='edit') of first ref's node; else new root
        let parentNodeId: string | null = null;
        let kind: 'root' | 'edit' = 'root';
        if (refIdsSnap.length > 0) {
          const firstRef = await db.images.get(refIdsSnap[0]);
          if (firstRef?.nodeId) { parentNodeId = firstRef.nodeId; kind = 'edit'; }
        }

        const node = await putNode({
          parentNodeId, kind, messageId: aMsg.id,
          imageIds: recs.map((r) => r.id),
        });
        aMsg.imageIds = recs.map((r) => r.id);
        aMsg.nodeId   = node.id;
        await db.messages.put(aMsg);
        await db.transaction('rw', db.images, async () => {
          await Promise.all(recs.map((r) =>
            db.images.update(r.id, { nodeId: node.id, parentId: parentNodeId }),
          ));
        });

        setPrompt('');
        clearRefs();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        aMsg.error = msg;
        await db.messages.put(aMsg);
        toast(`生成失败：${msg}`);
      }
    } finally {
      setBusy(false);
    }
  }

  // Tailwind class shorthands kept inline so the JSX scans cleanly. Selects
  // need explicit widths because the native control sizes to its widest option;
  // a long Chinese preset name would otherwise expand the box and shove
  // siblings out of the row.
  const toolBtn  = 'inline-flex items-center gap-1 h-8 px-2.5 rounded text-[12px] text-ink-soft bg-paper border border-border-soft hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0';
  const toolSel  = 'h-8 px-2 rounded text-[12px] text-ink-soft bg-paper border border-border-soft hover:border-accent focus:outline-none focus:border-accent transition-colors';
  const numInput = 'h-7 w-12 px-1.5 rounded text-[12px] text-ink bg-paper border border-border-soft text-center focus:outline-none focus:border-accent';
  const fieldLbl = 'text-[11px] text-muted inline-flex items-center gap-1.5 shrink-0';

  return (
    <div className="border-t border-border px-5 py-4 bg-paper-warm flex flex-col gap-2">
      <RefPills />
      <div className="bg-paper rounded-xl border border-border-soft shadow-sm focus-within:border-accent focus-within:shadow-md transition-all duration-200">
        {/* Textarea */}
        <div className="relative">
          <textarea
            ref={taRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="描述你想要的图像，Cmd/Ctrl+Enter 发送；@ 提及历史图"
            className="w-full resize-y outline-none text-[13px] bg-transparent placeholder-muted leading-relaxed px-4 py-3 min-h-[80px]"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault(); void onSend();
              }
            }}
            onDragOver={(e) => {
              if (Array.from(e.dataTransfer.types).includes('text/conv-image-ref')) e.preventDefault();
            }}
            onDrop={(e) => {
              const id = e.dataTransfer.getData('text/conv-image-ref');
              if (id) {
                e.preventDefault(); e.stopPropagation();
                addRef(id);
              }
            }}
            disabled={busy}
          />
          <MentionPopover textareaRef={taRef} onPick={(img) => addRef(img.id)} />
        </div>

        {/* Row A — helpers (operate on the prompt / refs) */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-border-soft/50">
          <button
            onClick={() => void onPolish()}
            disabled={polishBusy || !prompt.trim()}
            title={prompt.trim() ? 'AI智能润色' : '请先在下方输入框写点内容再润色'}
            className={toolBtn}
          >
            {polishBusy ? '✨ 润色中…' : '✨ AI一键润色'}
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            title="上传参考图（也可以拖拽到页面任意位置）"
            className={toolBtn}
          >
            📎 上传参考图
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              for (const file of Array.from(e.target.files ?? [])) await ingestFile(file);
              e.target.value = '';
            }}
          />
        </div>

        {/* Row B — gen params (left) + send (right) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 border-t border-border-soft/50 bg-bg/30 rounded-b-xl">
          {isGem ? (
            <>
              <label className={fieldLbl}>
                比例
                <select value={aspect} onChange={(e) => setAspect(e.target.value)} className={`${toolSel} w-[80px]`}>
                  <option>1:1</option><option>16:9</option><option>9:16</option><option>4:3</option><option>3:4</option>
                </select>
              </label>
              <label className={fieldLbl}>
                分辨率
                <select value={resolution} onChange={(e) => setResolution(e.target.value)} className={`${toolSel} w-[70px]`}>
                  <option>1K</option><option>2K</option><option>4K</option>
                </select>
              </label>
            </>
          ) : (
            <label className={fieldLbl}>
              尺寸
              <select value={size} onChange={(e) => setSize(e.target.value)} className={`${toolSel} w-[120px]`}>
                <option>1024x1024</option><option>1536x1024</option><option>1024x1536</option>
              </select>
            </label>
          )}

          <label className={fieldLbl}>
            数量
            <input
              type="number"
              min={1} max={4}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(4, parseInt(e.target.value, 10) || 1)))}
              className={numInput}
            />
          </label>

          <span className="ml-auto" />

          <button
            onClick={() => void onSend()}
            disabled={busy}
            className="btn-primary h-8 px-5 text-[13px] shrink-0"
          >
            {busy ? '生成中…' : '发送 ↗'}
          </button>
        </div>
      </div>

      {polishModal && (
        <PolishModal
          original={polishModal.original}
          polished={polishModal.polished}
          onAdopt={(text)     => { setPrompt(text); setPolishModal(null); }}
          onAdoptEdit={(text) => { setPrompt(text); setPolishModal(null); taRef.current?.focus(); }}
          onClose={()         => setPolishModal(null)}
        />
      )}
    </div>
  );
}
