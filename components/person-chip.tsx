// Tên người kèm avatar tròn chữ cái đầu, như tên người gửi trong Slack. Màu suy từ tên để mỗi người một màu cố định.
const COLORS = ["#1264a3", "#e07a2e", "#6b2bd9", "#007a5a", "#c4184f", "#0b7285", "#8a5300", "#3e4a59"];

function colorOf(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function PersonChip({ name, weak }: { name: string; weak?: boolean }) {
  if (!name) return <span className="text-text-weak">Chưa phân</span>;
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span
        aria-hidden
        className="inline-grid size-5 shrink-0 place-items-center rounded-full text-[10.5px] font-extrabold text-white"
        style={{ background: colorOf(name) }}
      >
        {name.trim().slice(0, 1).toUpperCase()}
      </span>
      <span className={weak ? "text-text-weak" : undefined}>{name}</span>
    </span>
  );
}
