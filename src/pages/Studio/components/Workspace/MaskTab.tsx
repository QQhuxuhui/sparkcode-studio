import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db, putImage, putMessage, putNode } from '../../../../services/db';
import { callGptImageEdit, nearestEditSize } from '../../../../services/api';
import { isGeminiImageModel, modelById } from '../../../../data/models';
import { useUIStore } from '../../../../stores/uiStore';
import { useMaskStore, type Stroke } from '../../../../stores/maskStore';
import { toast } from '../../../../lib/utils';

export function MaskTab() {
  const selectedModel = useUIStore((s) => s.selectedModel);
  const setActiveImage = useUIStore((s) => s.setActiveImage);
  const setTab        = useUIStore((s) => s.setTab);

  const sourceId    = useMaskStore((s) => s.sourceImageId);
  const setSource   = useMaskStore((s) => s.setSource);
  const brushSize   = useMaskStore((s) => s.brushSize);
  const setBrush    = useMaskStore((s) => s.setBrushSize);
  const history     = useMaskStore((s) => s.history);
  const pushStroke  = useMaskStore((s) => s.pushStroke);
  const popStroke   = useMaskStore((s) => s.popStroke);
  const clearStrokes = useMaskStore((s) => s.clearStrokes);

  // Picker source list (gpt-image only)
  const candidates = useLiveQuery(
    () => db.images.orderBy('createdAt').reverse().limit(30).toArray(),
    [],
    [],
  );
  const candidateList = (candidates ?? []).filter((i) => !isGeminiImageModel(i.model));

  // Active source image
  const src = useLiveQuery(
    async () => (sourceId ? db.images.get(sourceId) : undefined),
    [sourceId],
  );

  if (!modelById(selectedModel)?.supportsMask) {
    return (
      <div className="text-muted text-center py-20 text-[13px]">
        <div className="font-display text-[16px] text-ink-soft mb-2">当前模型不支持区域编辑</div>
        Gemini 系列没有 mask 接口，请在提示词中描述要修改的位置
      </div>
    );
  }

  if (!sourceId || !src) {
    return (
      <div>
        <div className="text-muted mb-3.5 text-[12px]">从图库选择一张作为源图</div>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))' }}>
          {candidateList.map((img) => (
            <img
              key={img.id}
              src={img.dataUrl}
              onClick={() => setSource(img.id)}
              className="w-full aspect-square object-cover rounded-[3px] cursor-pointer border border-border hover:border-accent transition-colors"
              style={{ boxShadow: 'var(--shadow-img)' }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <MaskCanvas
      src={src}
      brushSize={brushSize}
      setBrush={setBrush}
      history={history}
      pushStroke={pushStroke}
      popStroke={popStroke}
      clearStrokes={clearStrokes}
      onRepick={() => setSource(null)}
      model={selectedModel}
      onApplied={(newImageId) => {
        clearStrokes();
        setActiveImage(newImageId);
        setTab('big');
      }}
    />
  );
}

// ===== Inner canvas component =====
type CanvasProps = {
  src: import('../../../../types').ImageRecord;
  brushSize: number;
  setBrush: (n: number) => void;
  history: Stroke[];
  pushStroke: (s: Stroke) => void;
  popStroke: () => void;
  clearStrokes: () => void;
  onRepick: () => void;
  model: string;
  onApplied: (newImageId: string) => void;
};

function MaskCanvas({ src, brushSize, setBrush, history, pushStroke, popStroke, clearStrokes, onRepick, model, onApplied }: CanvasProps) {
  const baseImgRef = useRef<HTMLImageElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [mode, setMode]       = useState<'paint' | 'erase'>('paint');
  const [prompt, setPrompt]   = useState('');
  const [busy, setBusy]       = useState(false);

  // Set canvas dims to match natural / displayed image
  useEffect(() => {
    const baseImg = baseImgRef.current;
    const canvas  = canvasRef.current;
    if (!baseImg || !canvas) return;

    const setup = () => {
      canvas.width  = baseImg.naturalWidth;
      canvas.height = baseImg.naturalHeight;
      canvas.style.width  = baseImg.width + 'px';
      canvas.style.height = baseImg.height + 'px';
      // Replay history
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const stroke of history) drawStroke(ctx, stroke);
    };

    if (baseImg.complete) setup();
    else baseImg.onload = setup;
  }, [src.dataUrl, history]);

  // Pointer painting
  useEffect(() => {
    const canvas = canvasRef.current;
    const baseImg = baseImgRef.current;
    if (!canvas || !baseImg) return;
    const ctx = canvas.getContext('2d')!;

    let drawing = false;
    let stroke: Stroke | null = null;

    function pointerPos(e: PointerEvent) {
      if (!canvas) return { x: 0, y: 0 };
      const r = canvas.getBoundingClientRect();
      const sx = canvas.width / r.width;
      const sy = canvas.height / r.height;
      return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
    }
    function paint(p: { x: number; y: number }) {
      ctx.globalCompositeOperation = stroke?.mode === 'erase' ? 'destination-out' : 'source-over';
      ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, (stroke?.brush || brushSize) / 2, 0, 2 * Math.PI);
      ctx.fill();
    }

    const onDown = (e: PointerEvent) => {
      if (!canvas || !baseImg) return;
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      stroke = {
        mode,
        brush: brushSize * (canvas.width / baseImg.width),
        points: [],
      };
      const p = pointerPos(e);
      stroke.points.push(p);
      paint(p);
    };
    const onMove = (e: PointerEvent) => {
      if (!drawing || !stroke) return;
      const p = pointerPos(e);
      stroke.points.push(p);
      paint(p);
    };
    const onEnd = (e: PointerEvent) => {
      if (drawing && stroke?.points.length) pushStroke(stroke);
      drawing = false; stroke = null;
      if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener('pointerdown',   onDown);
    canvas.addEventListener('pointermove',   onMove);
    canvas.addEventListener('pointerup',     onEnd);
    canvas.addEventListener('pointercancel', onEnd);
    return () => {
      canvas.removeEventListener('pointerdown',   onDown);
      canvas.removeEventListener('pointermove',   onMove);
      canvas.removeEventListener('pointerup',     onEnd);
      canvas.removeEventListener('pointercancel', onEnd);
    };
  }, [mode, brushSize, pushStroke]);

  async function onApply() {
    const txt = prompt.trim();
    if (!txt) { toast('请输入修改描述'); return; }
    if (history.length === 0) { toast('请先涂出要修改的区域'); return; }
    if (busy) return;
    setBusy(true);

    try {
      const canvas = canvasRef.current!;
      const w = canvas.width, h = canvas.height;
      // Build mask PNG: alpha=0 in painted area, alpha=255 elsewhere
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = w; maskCanvas.height = h;
      const mctx = maskCanvas.getContext('2d')!;
      mctx.fillStyle = 'rgb(0,0,0)';
      mctx.fillRect(0, 0, w, h);
      const overlayData = canvas.getContext('2d')!.getImageData(0, 0, w, h).data;
      const maskImg = mctx.getImageData(0, 0, w, h);
      for (let i = 0; i < overlayData.length; i += 4) {
        // > 32 threshold to ignore anti-aliasing fringe → cleaner binary mask
        if (overlayData[i + 3] > 32) maskImg.data[i + 3] = 0;
      }
      mctx.putImageData(maskImg, 0, 0);
      const maskDataUrl = maskCanvas.toDataURL('image/png');

      // Persist user-msg + assistant placeholder (user FIRST so chat order is right)
      await putMessage({
        role: 'user', text: `[mask] ${txt}`, model, refImageIds: [src.id],
      });
      const aMsg = await putMessage({ role: 'assistant', text: '', model });

      try {
        const result = await callGptImageEdit({
          model, prompt: txt,
          sourceImages: [src.dataUrl], maskDataUrl,
          n: 1, size: nearestEditSize(w, h),
        });
        const recs = await Promise.all(result.images.map((img) =>
          putImage({ dataUrl: img.dataUrl, model, prompt: txt, format: img.format }),
        ));
        const node = await putNode({
          parentNodeId: src.nodeId,
          kind: 'edit',
          messageId: aMsg.id,
          imageIds: recs.map((r) => r.id),
        });
        aMsg.imageIds = recs.map((r) => r.id);
        aMsg.nodeId   = node.id;
        await db.messages.put(aMsg);
        await db.transaction('rw', db.images, async () => {
          await Promise.all(recs.map((r) =>
            db.images.update(r.id, { nodeId: node.id, parentId: src.nodeId }),
          ));
        });
        toast('编辑完成');
        if (recs[0]) onApplied(recs[0].id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        aMsg.error = msg;
        await db.messages.put(aMsg);
        toast(`编辑失败：${msg}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2 items-center mb-3.5 pb-3 border-b border-border-soft">
        <label className="text-[12px] text-muted inline-flex items-center gap-1.5">
          笔刷
          <input
            type="range" min={5} max={100} value={brushSize}
            onChange={(e) => setBrush(parseInt(e.target.value, 10))}
            className="align-middle"
            style={{ accentColor: '#a82828' }}
          />
        </label>
        <button onClick={() => setMode((m) => (m === 'erase' ? 'paint' : 'erase'))}
          className="btn-ghost py-1 px-3 text-[12px]">
          {mode === 'erase' ? '橡皮（点击切回笔刷）' : '橡皮'}
        </button>
        <button onClick={popStroke}    className="btn-ghost py-1 px-3 text-[12px]">撤销</button>
        <button onClick={clearStrokes} className="btn-ghost py-1 px-3 text-[12px]">清空</button>
        <button onClick={onRepick}     className="btn-ghost py-1 px-3 text-[12px] ml-auto">换源图</button>
      </div>
      <div
        className="relative inline-block bg-bg-2 border border-border rounded-[3px] overflow-hidden"
        style={{ boxShadow: 'var(--shadow-img)' }}
      >
        <img
          ref={baseImgRef}
          src={src.dataUrl}
          className="block max-w-full"
          style={{ maxHeight: '60vh' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-crosshair"
          style={{ touchAction: 'none' }}
        />
      </div>
      <div className="mt-3.5 flex gap-2.5">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="描述要修改的内容（如：换成花瓶）"
          className="field-input flex-1"
          disabled={busy}
        />
        <button onClick={() => void onApply()} disabled={busy} className="btn-primary">
          {busy ? '生成中…' : '🎨 应用编辑'}
        </button>
      </div>
    </div>
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  ctx.globalCompositeOperation = stroke.mode === 'erase' ? 'destination-out' : 'source-over';
  ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
  for (const p of stroke.points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, stroke.brush / 2, 0, 2 * Math.PI);
    ctx.fill();
  }
}
