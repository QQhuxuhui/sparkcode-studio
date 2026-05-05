import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../../services/db';
import type { ImageRecord } from '../../../../types';

type Props = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onPick: (img: ImageRecord) => void;
};

/**
 * Renders a fixed-position popover when the textarea has `@xxx` immediately
 * before the caret. Filters recent (last 30) images by shortId prefix.
 * Closes on caret-not-after-@ or blur (with delay so click registers).
 */
export function MentionPopover({ textareaRef, onPick }: Props) {
  const [filter,   setFilter]   = useState<string | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [tokenStart, setTokenStart] = useState<number | null>(null);

  const recent = useLiveQuery(
    () => db.images.orderBy('createdAt').reverse().limit(30).toArray(),
    [],
    [],
  );

  // Listen to textarea input + selection changes
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const handle = () => {
      const v = ta.value;
      const cursor = ta.selectionStart ?? v.length;
      const before = v.slice(0, cursor);
      const m = before.match(/@(\w*)$/);
      if (!m) {
        setFilter(null); setPosition(null); setTokenStart(null);
        return;
      }
      const r = ta.getBoundingClientRect();
      setPosition({ top: r.bottom + 4, left: r.left });
      setFilter(m[1].toLowerCase());
      setTokenStart(cursor - m[0].length);
    };
    const onBlur = () => setTimeout(() => setFilter(null), 200);
    ta.addEventListener('input',  handle);
    ta.addEventListener('keyup',  handle);
    ta.addEventListener('click',  handle);
    ta.addEventListener('blur',   onBlur);
    return () => {
      ta.removeEventListener('input',  handle);
      ta.removeEventListener('keyup',  handle);
      ta.removeEventListener('click',  handle);
      ta.removeEventListener('blur',   onBlur);
    };
  }, [textareaRef]);

  if (filter === null || !position) return null;
  const matched = (recent ?? []).filter((img) =>
    img.shortId.toLowerCase().startsWith(filter),
  ).slice(0, 12);
  if (matched.length === 0) return null;

  function handlePick(img: ImageRecord) {
    const ta = textareaRef.current;
    if (!ta || tokenStart === null) return;
    // Replace the current @xxx token with @<shortId>
    const v = ta.value;
    const before = v.slice(0, tokenStart);
    const after  = v.slice(ta.selectionStart ?? v.length);
    const newVal = `${before}@${img.shortId}${after}`;
    // Update value via native setter so React's onChange fires
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(ta, newVal);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    setFilter(null); setPosition(null);
    onPick(img);
    ta.focus();
  }

  return (
    <div
      className="fixed bg-paper border border-border rounded p-1.5 z-50 max-h-60 overflow-auto"
      style={{ top: position.top, left: position.left, boxShadow: 'var(--shadow-modal)' }}
    >
      {matched.map((img) => (
        <div
          key={img.id}
          onMouseDown={(e) => { e.preventDefault(); handlePick(img); }}
          className="flex items-center gap-2 p-1 cursor-pointer rounded hover:bg-accent/[0.06]"
        >
          <img src={img.dataUrl} className="w-8 h-8 object-cover rounded-sm" />
          <span className="text-[12px] text-ink font-mono">{img.shortId}</span>
        </div>
      ))}
    </div>
  );
}
