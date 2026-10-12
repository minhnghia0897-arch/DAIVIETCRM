// Thanh tiến trình chuyển màn (components/crm/nav-progress.tsx) tự bắt đầu khi bấm link. Code tự chuyển trang
// (router.push) thì gọi navStart() ngay trước để người dùng thấy máy đã nhận lệnh.

export const NAV_START_EVENT = "crm:nav-start";

export function navStart() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NAV_START_EVENT));
}
