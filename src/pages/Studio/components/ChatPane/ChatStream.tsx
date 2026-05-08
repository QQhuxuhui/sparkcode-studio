import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef } from 'react';
import { db } from '../../../../services/db';
import { fmtTime, toast } from '../../../../lib/utils';
import { isGeminiImageModel, modelById } from '../../../../data/models';
import { useRefStore } from '../../../../stores/refStore';
import { useUIStore } from '../../../../stores/uiStore';
import { useMaskStore } from '../../../../stores/maskStore';

export function ChatStream() {
  const messages = useLiveQuery(() => db.messages.orderBy('createdAt').toArray(), [], []);
  const images   = useLiveQuery(() => db.images.toArray(), [], []);
  const streamRef = useRef<HTMLDivElement>(null);

  const addRef         = useRefStore((s) => s.add);
  const setActiveImage = useUIStore((s) => s.setActiveImage);
  const setTab         = useUIStore((s) => s.setTab);
  const selectedModel  = useUIStore((s) => s.selectedModel);

  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  const imgMap = new Map((images ?? []).map((i) => [i.id, i]));

  function onZoom(id: string) {
    setActiveImage(id);
    setTab('big');
  }
  function onEngageRef(id: string, shortId: string) {
    addRef(id);
    toast(`引用了 ${shortId}`);
  }
  function onEngageMask(id: string) {
    if (!modelById(selectedModel)?.supportsMask) {
      toast('当前模型不支持区域编辑，请切到 gpt-image-2');
      return;
    }
    useMaskStore.getState().setSource(id);
    setTab('mask');
  }

  return (
    <div ref={streamRef} className="flex-1 overflow-y-auto px-5 py-6">
      {(messages ?? []).length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-muted text-[13px] py-10 opacity-70">
          <div className="w-16 h-16 mb-4 rounded-full bg-accent/[0.05] flex items-center justify-center">
            <span className="text-2xl opacity-50">✨</span>
          </div>
          <div className="font-display text-[22px] text-ink-soft mb-2">空白画卷</div>
          <div className="text-faint">在下方输入提示词后开始生成</div>
        </div>
      )}
      {(messages ?? []).map((m) => {
        if (m.role === 'user') {
          return (
            <div key={m.id} className="mb-6 flex flex-col items-end">
              <div className="text-[10px] text-muted mb-1 tracking-wide font-medium">
                你 · {fmtTime(m.createdAt)}
              </div>
              <div
                className="bg-accent/[0.04] border border-accent/[0.15] rounded-2xl rounded-tr-sm px-4 py-2.5 leading-relaxed text-ink max-w-[90%]"
                style={{ boxShadow: '0 2px 8px rgba(168,40,40,0.02)' }}
              >
                {m.text}
              </div>
            </div>
          );
        }

        // Assistant
        const isGptImage = !isGeminiImageModel(m.model);
        return (
          <div key={m.id} className="mb-6 flex flex-col items-start">
            <div className="text-[10px] text-muted mb-1 tracking-wide font-medium flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-accent flex items-center justify-center text-white text-[8px] font-bold">A</span>
              <span className="font-mono text-ink-soft">{m.model}</span> · {fmtTime(m.createdAt)}
            </div>
            <div className="bg-paper border border-border-soft rounded-2xl rounded-tl-sm p-3 shadow-sm max-w-[100%]">
              {m.imageIds.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {m.imageIds.map((id) => {
                    const img = imgMap.get(id);
                    if (!img) return null;
                    return (
                      <div key={id} className="relative group overflow-hidden rounded-md border border-border-soft">
                        <img
                          src={img.dataUrl}
                          onClick={() => onZoom(id)}
                          className="w-[96px] h-[96px] object-cover cursor-zoom-in hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <span
                          className="absolute bottom-1.5 left-1.5 text-white/90 text-[10px] px-1.5 font-mono tracking-wide pointer-events-none drop-shadow-md"
                        >
                          {img.shortId}
                        </span>
                        <div className="absolute top-1.5 right-1.5 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <a
                            href={img.dataUrl}
                            download={`${img.shortId}.${img.format || 'png'}`}
                            onClick={(e) => e.stopPropagation()}
                            title="下载图片"
                            className="w-6 h-6 flex items-center justify-center rounded bg-black/50 text-white text-[12px] hover:bg-accent backdrop-blur-sm transition-colors no-underline"
                          >
                            ⬇
                          </a>
                          {isGptImage && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onEngageMask(id); }}
                              title="区域编辑"
                              className="w-6 h-6 flex items-center justify-center rounded bg-black/50 text-white text-[12px] hover:bg-accent backdrop-blur-sm transition-colors border-0 cursor-pointer"
                            >
                              🖌
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); onEngageRef(id, img.shortId); }}
                            title="作为引用"
                            className="w-6 h-6 flex items-center justify-center rounded bg-black/50 text-white text-[12px] hover:bg-accent backdrop-blur-sm transition-colors border-0 cursor-pointer"
                          >
                            ↩
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : m.error ? (
                <div className="text-error text-[12px] flex items-center gap-1.5">
                  <span className="text-[14px]">⚠</span> {m.error}
                </div>
              ) : (
                <div className="text-muted text-[12px] flex items-center gap-2 px-2 py-1">
                  <div className="w-1.5 h-1.5 bg-accent/60 rounded-full animate-ping" />
                  生成中…
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
