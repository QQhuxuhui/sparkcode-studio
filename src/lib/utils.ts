// Tiny utilities. Pure functions only — no DOM, no React.

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Simple toast — no library, just a transient bottom-center notice.
let toastEl: HTMLDivElement | null = null;
let toastTimer: number | null = null;
export function toast(message: string, ms = 2500): void {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = [
      'fixed bottom-8 left-1/2 -translate-x-1/2',
      'bg-paper border border-border border-l-[3px] border-l-accent',
      'rounded text-[13px] text-ink px-4 py-3',
      'opacity-0 translate-y-2 transition-all duration-200',
      'z-[9999] pointer-events-none',
    ].join(' ');
    toastEl.style.boxShadow = 'var(--shadow-paper)';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.style.opacity = '1';
  toastEl.style.transform = 'translateX(-50%) translateY(0)';
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (!toastEl) return;
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateX(-50%) translateY(8px)';
  }, ms);
}
