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
      <div className="text-muted text-center py-20 text-[13px]">
        <div className="font-display text-[22px] text-faint mb-3">尚无图像</div>
        在左侧输入提示词后开始生成
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center h-full p-2">
      <img
        src={img.dataUrl}
        className="max-w-full max-h-full rounded-[3px] bg-paper"
        style={{ boxShadow: 'var(--shadow-modal)' }}
      />
    </div>
  );
}
