import { useState } from 'react';
import { useUIStore } from '../../../../stores/uiStore';
import { isGeminiImageModel } from '../../../../data/models';
import { putMessage, putNode, putImage, db } from '../../../../services/db';
import { callGptImageGen, callGeminiChatImage } from '../../../../services/api';
import { toast } from '../../../../lib/utils';

export function InputArea() {
  const selectedModel = useUIStore((s) => s.selectedModel);
  const [prompt, setPrompt]   = useState('');
  const [count,  setCount]    = useState(1);
  const [size,   setSize]     = useState('1024x1024');
  const [aspect, setAspect]   = useState('1:1');
  const [resolution, setResolution] = useState('1K');
  const [busy, setBusy] = useState(false);

  const isGem = isGeminiImageModel(selectedModel);

  async function onSend() {
    const text = prompt.trim();
    if (!text) { toast('请输入提示词'); return; }
    if (busy) return;
    setBusy(true);
    try {
      // Persist user message + placeholder assistant message
      await putMessage({ role: 'user', text, model: selectedModel });
      const aMsg = await putMessage({ role: 'assistant', text: '', model: selectedModel });
      try {
        const result = isGem
          ? (await Promise.all(
              Array.from({ length: count }, () =>
                callGeminiChatImage({ model: selectedModel, prompt: text, aspectRatio: aspect, resolution })
                  .catch((e) => ({ error: e as Error })),
              ),
            )).reduce<{ images: { dataUrl: string; format: string }[] }>(
              (acc, s) => ('error' in s ? acc : { images: acc.images.concat(s.images) }),
              { images: [] },
            )
          : await callGptImageGen({ model: selectedModel, prompt: text, n: count, size });

        if (result.images.length === 0) throw new Error('全部失败');

        const recs = await Promise.all(
          result.images.map((img) =>
            putImage({ dataUrl: img.dataUrl, model: selectedModel, prompt: text, format: img.format }),
          ),
        );
        const node = await putNode({
          parentNodeId: null,
          kind: 'root',
          messageId: aMsg.id,
          imageIds: recs.map((r) => r.id),
        });
        aMsg.imageIds = recs.map((r) => r.id);
        aMsg.nodeId   = node.id;
        await db.messages.put(aMsg);
        await db.transaction('rw', db.images, async () => {
          await Promise.all(recs.map((r) => db.images.update(r.id, { nodeId: node.id })));
        });
        setPrompt('');
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
      <div className="relative">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="描述你想要的图像，Cmd/Ctrl+Enter 发送"
          className="field-textarea w-full resize-y leading-relaxed"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault(); void onSend();
            }
          }}
          disabled={busy}
        />
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
        <button onClick={() => void onSend()} disabled={busy} className="btn-primary px-6">
          {busy ? '生成中…' : '发送'}
        </button>
      </div>
    </div>
  );
}
