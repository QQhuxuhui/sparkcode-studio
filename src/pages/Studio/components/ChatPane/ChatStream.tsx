import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef } from 'react';
import { db } from '../../../../services/db';
import { fmtTime, toast } from '../../../../lib/utils';
import { isGeminiImageModel, modelById } from '../../../../data/models';
import { useRefStore } from '../../../../stores/refStore';
import { useUIStore } from '../../../../stores/uiStore';

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
    // F4 will wire maskStore here. For now just stash + switch tab.
    useUIStore.setState({ activeImageId: id });
    setTab('mask');
  }

  return (
    <div ref={streamRef} className="flex-1 overflow-y-auto px-5 py-6">
      {(messages ?? []).length === 0 && (
        <div className="text-center text-muted text-[13px] py-20">
          <div className="font-display text-[22px] text-faint mb-3">空白画卷</div>
          在下方输入提示词后开始生成
        </div>
      )}
      {(messages ?? []).map((m) => {
        if (m.role === 'user') {
          return (
            <div key={m.id} className="mb-[18px]">
              <div className="text-[10px] text-muted mb-1.5 tracking-wide font-medium">
                你 · {fmtTime(m.createdAt)}
              </div>
              <div
                className="bg-paper border border-border border-l-[3px] border-l-accent rounded px-3.5 py-2.5 leading-relaxed text-ink"
                style={{ boxShadow: '0 1px 0 rgba(80,50,20,0.03)' }}
              >
                {m.text}
              </div>
            </div>
          );
        }

        // Assistant
        const isGptImage = !isGeminiImageModel(m.model);
        return (
          <div key={m.id} className="mb-[18px]">
            <div className="text-[10px] text-muted mb-1.5 tracking-wide font-medium">
              <span className="font-mono text-ink-soft">{m.model}</span> · {fmtTime(m.createdAt)}
            </div>
            <div>
              {m.imageIds.length > 0 ? (
                m.imageIds.map((id) => {
                  const img = imgMap.get(id);
                  if (!img) return null;
                  return (
                    <div key={id} className="relative inline-block m-[3px] group">
                      <img
                        src={img.dataUrl}
                        onClick={() => onZoom(id)}
                        className="w-[84px] h-[84px] object-cover rounded-[3px] cursor-zoom-in border border-border"
                        style={{ boxShadow: 'var(--shadow-img)' }}
                      />
                      <span
                        className="absolute bottom-1 left-1 text-white text-[10px] px-1.5 py-px rounded-[2px] font-medium tracking-wide pointer-events-none"
                        style={{ background: 'rgba(20,15,10,0.72)' }}
                      >
                        {img.shortId}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onEngageRef(id, img.shortId); }}
                        title="作为引用"
                        className="absolute top-1 right-1 text-white text-[11px] leading-none px-1.5 py-1 rounded-[2px] border-0 cursor-pointer"
                        style={{ background: 'rgba(20,15,10,0.7)' }}
                      >
                        ↩
                      </button>
                      {isGptImage && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onEngageMask(id); }}
                          title="区域编辑"
                          className="absolute top-1 right-7 text-white text-[11px] leading-none px-1.5 py-1 rounded-[2px] border-0 cursor-pointer"
                          style={{ background: 'rgba(20,15,10,0.7)' }}
                        >
                          🖌
                        </button>
                      )}
                    </div>
                  );
                })
              ) : m.error ? (
                <span className="text-error text-[12px]">⚠ {m.error}</span>
              ) : (
                <span className="text-muted text-[12px]">生成中…</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
