"use client";

import { useSyncExternalStore } from "react";

import { Switch } from "@/components/ui/switch";

// Xem thử phong cách Telegram trên một màn (giữ nguyên bố cục, chỉ đổi kiểu chữ, màu, thẻ bo tròn, nút): bọc nội dung
// trong .tgx (crm.css). Bật tắt để so với phong cách hiện tại; lựa chọn nhớ trong trình duyệt.
const KEY = "dv_tg_preview";

const EVENT = "dv-tg-preview";
const read = () => {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true; // Trình duyệt chặn bộ nhớ: giữ mặc định bật.
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

export function TelegramPreview({ children }: { children: React.ReactNode }) {
  // Đọc lựa chọn đã nhớ mà không lệch lúc dựng trang sẵn (server luôn coi là bật).
  const on = useSyncExternalStore(subscribe, read, () => true);
  const set = (v: boolean) => {
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      // Không lưu được thì thôi; công tắc vẫn đổi qua sự kiện dưới.
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return (
    <>
      <div className="tgx-bar">
        <span>
          <b>Xem thử phong cách Telegram</b> · giữ nguyên bố cục, đổi kiểu chữ, màu, thẻ bo tròn và nút. Tắt
          để so với phong cách hiện tại.
        </span>
        <Switch checked={on} onCheckedChange={set} label="Phong cách Telegram" />
      </div>
      <div className={on ? "tgx" : undefined}>{children}</div>
    </>
  );
}
