type Props = {
  status: string;
  onOpenKeys: () => void;
};

export function Header({ status, onOpenKeys }: Props) {
  return (
    <header className="flex items-center gap-3.5 px-6 bg-paper-warm border-b border-border relative">
      <span className="inline-flex items-center gap-3 font-sans text-[19px] font-semibold text-ink">
        <span
          className="inline-flex items-center justify-center w-8 h-8 bg-accent text-white font-display font-bold text-base rounded"
          style={{
            boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.18), 0 1px 2px rgba(120,20,20,0.25)',
            transform: 'rotate(-4deg)',
          }}
        >
          图
        </span>
        SparkCode
        <span className="inline-block w-1 h-1 rounded-full bg-accent translate-y-1.5" />
      </span>
      <span className="text-[11px] text-muted font-normal">{status}</span>
      <span className="ml-auto" />
      <button onClick={onOpenKeys} className="btn-ghost py-1.5 px-3.5 text-[12.5px]">
        ⚙ 令牌
      </button>
      <button disabled title="导出（即将上线）" className="btn-ghost py-1.5 px-3.5 text-[12.5px] opacity-50">
        ⬇ 导出
      </button>
      <button disabled title="导入（即将上线）" className="btn-ghost py-1.5 px-3.5 text-[12.5px] opacity-50">
        ⬆ 导入
      </button>
      {/* 装订线 */}
      <span
        className="absolute left-6 right-6 -bottom-px h-0.5 opacity-50"
        style={{ background: 'linear-gradient(90deg, transparent 0%, #a82828 18%, #a82828 82%, transparent 100%)' }}
      />
    </header>
  );
}
