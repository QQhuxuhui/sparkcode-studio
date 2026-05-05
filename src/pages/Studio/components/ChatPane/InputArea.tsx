import { useRef, useState } from 'react';
import { useUIStore } from '../../../../stores/uiStore';
import { useRefStore } from '../../../../stores/refStore';
import { isGeminiImageModel } from '../../../../data/models';
import { putMessage, putNode, putImage, db } from '../../../../services/db';
import { callGptImageGen, callGptImageEdit, callGeminiChatImage } from '../../../../services/api';
import { toast, fileToDataUrl } from '../../../../lib/utils';
import { RefPills } from './RefPills';
import { MentionPopover } from './MentionPopover';
import type { GeneratedImage } from '../../../../types';

export function InputArea() {
  const selectedModel = useUIStore((s) => s.selectedModel);
  const refIds        = useRefStore((s) => s.imageIds);
  const addRef        = useRefStore((s) => s.add);
  const clearRefs     = useRefStore((s) => s.clear);

  const [prompt, setPrompt]   = useState('');
  const [count,  setCount]    = useState(1);
  const [size,   setSize]     = useState('1024x1024');
  const [aspect, setAspect]   = useState('1:1');
  const [resolution, setResolution] = useState('1K');
  const [busy, setBusy] = useState(false);

  const taRef       = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="border-t border-border px-5 py-4 bg-paper">
      <RefPills />
      <div className="relative">
        <textarea
          ref={taRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="描述你想要的图像，Cmd/Ctrl+Enter 发送；@ 提及历史图"
          className="field-textarea w-full resize-y leading-relaxed"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault(); void onSend();
            }
          }}
          disabled={busy}
        />
        <MentionPopover textareaRef={taRef} onPick={(img) => addRef(img.id)} />
      </div>
      <div className="flex gap-2 items-center mt-2.5 flex-wrap">
        <label className="text-[12px] text-muted inline-flex items-center gap-1">
          数量
          <input
            type="number"
            min={1} max={4}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(4, parseInt(e.target.value, 10) || 1)))}
            className="field-input w-14 px-2 py-1 text-[12.5px]"
          />
        </label>
        {isGem ? (
          <>
            <label className="text-[12px] text-muted inline-flex items-center gap-1">
              比例
              <select value={aspect} onChange={(e) => setAspect(e.target.value)} className="field-select px-2 py-1 text-[12.5px]">
                <option>1:1</option><option>16:9</option><option>9:16</option><option>4:3</option><option>3:4</option>
              </select>
            </label>
            <label className="text-[12px] text-muted inline-flex items-center gap-1">
              分辨率
              <select value={resolution} onChange={(e) => setResolution(e.target.value)} className="field-select px-2 py-1 text-[12.5px]">
                <option>1K</option><option>2K</option><option>4K</option>
              </select>
            </label>
          </>
        ) : (
          <label className="text-[12px] text-muted inline-flex items-center gap-1">
            尺寸
            <select value={size} onChange={(e) => setSize(e.target.value)} className="field-select px-2 py-1 text-[12.5px]">
              <option>1024x1024</option><option>1536x1024</option><option>1024x1536</option>
            </select>
          </label>
        )}
        <span className="ml-auto" />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="上传参考图（也可以拖拽到页面）"
          className="btn-upload"
        >
          <span className="text-[14px]">📎</span>
          <span>上传图片</span>
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
        <button onClick={() => void onSend()} disabled={busy} className="btn-primary px-6">
          {busy ? '生成中…' : '发送'}
        </button>
      </div>
    </div>
  );
}
