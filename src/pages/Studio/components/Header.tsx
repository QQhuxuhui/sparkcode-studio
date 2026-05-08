type Props = {
  status: string;
  onOpenKeys: () => void;
  onExport:   () => void;
  onImport:   () => void;
};

export function Header({ status, onOpenKeys, onExport, onImport }: Props) {
  return (
    <header className="flex items-center gap-3.5 px-6 bg-paper/90 backdrop-blur-md border-b border-border shadow-sm relative z-20">
      <span className="inline-flex items-center gap-3 font-sans text-[19px] font-semibold text-ink">
        <span
          className="inline-flex items-center justify-center w-8 h-8 bg-accent text-white font-display font-bold text-base rounded-md"
          style={{
            boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.18), 0 2px 4px rgba(168,40,40,0.3)',
            transform: 'rotate(-4deg)',
          }}
        >
          图
        </span>
        <span className="tracking-tight">SparkCode</span>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent translate-y-1.5 opacity-80" />
      </span>
      <span className="text-[12px] text-muted font-normal ml-2">{status}</span>
      <span className="ml-auto" />
      <button onClick={onOpenKeys} className="btn-ghost py-1.5 px-3.5 text-[12.5px] rounded-full hover:shadow-sm">
        ⚙ 令牌
      </button>
      <button onClick={onExport} className="btn-ghost py-1.5 px-3.5 text-[12.5px] rounded-full hover:shadow-sm">
        ⬇ 导出
      </button>
      <button onClick={onImport} className="btn-ghost py-1.5 px-3.5 text-[12.5px] rounded-full hover:shadow-sm">
        ⬆ 导入
      </button>
      {/* 装订线 */}
      <span
        className="absolute left-6 right-6 -bottom-px h-[2px] opacity-40"
        style={{ background: 'linear-gradient(90deg, transparent 0%, #a82828 20%, #a82828 80%, transparent 100%)' }}
      />
    </header>
  );
}
