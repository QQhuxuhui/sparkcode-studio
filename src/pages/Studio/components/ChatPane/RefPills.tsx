import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../../services/db';
import { useRefStore } from '../../../../stores/refStore';

export function RefPills() {
  const imageIds = useRefStore((s) => s.imageIds);
  const remove   = useRefStore((s) => s.remove);
  const clear    = useRefStore((s) => s.clear);

  const imgs = useLiveQuery(
    () => Promise.all(imageIds.map((id) => db.images.get(id))),
    [imageIds.join('|')],
    [],
  );

  if (imageIds.length === 0) return null;

  return (
    <div className="flex gap-1.5 flex-wrap mb-2.5">
      {(imgs ?? []).map((img, idx) => {
        const id = imageIds[idx];
        if (!img) {
          return (
            <div key={id} className="inline-flex items-center gap-1.5 bg-bg-2 border border-border rounded px-2 py-1 text-[11px] text-muted">
              {id.slice(0, 8)} <span className="opacity-60">[已清理]</span>
              <span onClick={() => remove(id)} className="cursor-pointer text-muted ml-0.5">✕</span>
            </div>
          );
        }
        return (
          <div
            key={id}
            className="inline-flex items-center gap-1.5 bg-accent/[0.06] border border-accent/[0.14] rounded pl-1 pr-2 py-1"
          >
            <img src={img.dataUrl} className="w-[22px] h-[22px] object-cover rounded-sm" />
            <span className="text-[11px] text-accent font-semibold tracking-tight">{img.shortId}</span>
            <span
              onClick={() => remove(id)}
              className="cursor-pointer text-accent opacity-60 text-[13px] leading-none px-0.5 hover:opacity-100"
            >
              ✕
            </span>
          </div>
        );
      })}
      <span
        onClick={clear}
        className="cursor-pointer text-muted text-[11px] self-center underline ml-1"
      >
        清空全部
      </span>
    </div>
  );
}
