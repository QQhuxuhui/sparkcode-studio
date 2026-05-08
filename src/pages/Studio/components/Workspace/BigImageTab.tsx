import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../../services/db';
import { useUIStore } from '../../../../stores/uiStore';

export function BigImageTab() {
  const activeImageId = useUIStore((s) => s.activeImageId);
  const img = useLiveQuery(async () => {
    if (activeImageId) return db.images.get(activeImageId);
    return db.images.orderBy('createdAt').last();
  }, [activeImageId]);

  if (!img) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted text-[13px] opacity-70">
        <div className="w-16 h-16 mb-4 rounded-full bg-border/[0.3] flex items-center justify-center">
          <span className="text-2xl opacity-50">🖼</span>
        </div>
        <div className="font-display text-[22px] text-ink-soft mb-2">尚无图像</div>
        <div className="text-faint">在左侧输入提示词后开始生成</div>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center h-full p-6">
      <div className="bg-paper p-3 rounded-md border border-border-soft" style={{ boxShadow: 'var(--shadow-modal)' }}>
        <img
          src={img.dataUrl}
          className="max-w-full max-h-[85vh] rounded-[2px] bg-bg"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)' }}
        />
      </div>
    </div>
  );
}
