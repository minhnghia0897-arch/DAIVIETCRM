"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

// Ô tìm nhanh kiểu Ctrl/⌘ + K của Slack: gõ tên khách, mã đơn, tên hộ hoặc tên màn hình rồi Enter để mở.
// Chỉ liệt kê những gì người dùng được xem; danh sách do shell truyền vào theo quyền.

export interface QuickItem {
  id: string;
  label: string;
  hint: string;
  group: "Màn hình" | "Lead" | "Đơn hàng" | "Hộ gia đình" | "Khách";
  run: () => void;
}

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();

export const SHORTCUTS: [string, string][] = [
  ["Ctrl/⌘ K", "Mở ô tìm nhanh"],
  ["/", "Vào ô tìm kiếm trên đầu trang"],
  ["G rồi H", "Trang chủ"],
  ["G rồi T", "Việc cần làm"],
  ["G rồi C", "Cơ hội"],
  ["G rồi D", "Đơn hàng"],
  ["G rồi K", "Khách"],
  ["G rồi I", "Hội thoại"],
  ["?", "Xem bảng phím tắt"],
  ["Esc", "Đóng"],
];

export function QuickSwitcher({
  items,
  showHelp,
  onClose,
}: {
  items: QuickItem[];
  showHelp: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const results = useMemo(() => {
    const t = fold(q);
    const list = t
      ? items.filter((i) => fold(i.label).includes(t) || fold(i.hint).includes(t))
      : items.filter((i) => i.group === "Màn hình");
    return list.slice(0, 12);
  }, [q, items]);
  const current = Math.min(active, Math.max(0, results.length - 1));

  function choose(i: QuickItem | undefined) {
    if (!i) return;
    onClose();
    i.run();
  }

  return (
    <div className="c-qs-scrim" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tìm nhanh"
        className="c-qs"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(results[current]);
          }
        }}
      >
        <div className="c-qs-in">
          <Search size={16} aria-hidden />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls="c-qs-list"
            aria-activedescendant={results[current] ? `qs-${results[current].id}` : undefined}
            aria-label="Tìm nhanh khách, đơn, hộ, màn hình"
            placeholder="Tìm khách, mã đơn, hộ hoặc màn hình…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        {showHelp && !q ? (
          <div className="c-qs-help" aria-label="Phím tắt">
            <b>Phím tắt</b>
            <dl>
              {SHORTCUTS.map(([k, v]) => (
                <div key={k}>
                  <dt>
                    <kbd>{k}</kbd>
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <ul id="c-qs-list" role="listbox" aria-label="Kết quả" className="c-qs-list">
            {results.map((r, i) => (
              <li
                key={r.id}
                id={`qs-${r.id}`}
                role="option"
                aria-selected={i === current}
                className={i === current ? "is-on" : undefined}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(r);
                }}
              >
                <span className="c-qs-g">{r.group}</span>
                <b>{r.label}</b>
                <span className="c-lbl truncate">{r.hint}</span>
              </li>
            ))}
            {results.length === 0 ? (
              <li className="c-qs-empty">Không thấy “{q}”. Thử tên khác hoặc mã đơn.</li>
            ) : null}
          </ul>
        )}
        <p className="c-qs-foot">
          <kbd>↑</kbd> <kbd>↓</kbd> chọn · <kbd>Enter</kbd> mở · <kbd>?</kbd> phím tắt
        </p>
      </div>
    </div>
  );
}
