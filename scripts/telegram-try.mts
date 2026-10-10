// Thử bot Telegram thật từ máy làm việc, chưa cần server, chưa cần database (docs/integrations/telegram_bot.md).
// Đọc token từ biến môi trường TELEGRAM_BOT_TOKEN, không bao giờ in token ra màn hình.
//
//   node scripts/telegram-try.mts            # kiểm bot, chờ anh chị bấm Start, gửi tin mẫu, chờ bấm nút
//
// Tin mẫu viết bằng đúng hàm formatNotify của CRM, dữ liệu giả, không có số điện thoại.

import { formatNotify, type NotifyButton, type NotifyFacts } from "../lib/notify/events.ts";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Thiếu biến môi trường TELEGRAM_BOT_TOKEN.");
  process.exit(1);
}
const DEMO = "https://minhnghia0897-arch.github.io/DAIVIETCRM";

async function api<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`${method}: ${json.description ?? res.status}`);
  return json.result;
}

type Update = {
  update_id: number;
  message?: { chat: { id: number; first_name?: string }; text?: string };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
};

const keyboard = (buttons: NotifyButton[]) => ({
  inline_keyboard: [
    buttons.map((b) =>
      b.kind === "open"
        ? { text: b.label, url: `${DEMO}${b.path.startsWith("/m") ? `/m/${b.path.slice(2)}` : b.path}` }
        : { text: b.label, callback_data: `${b.kind}:${b.taskId}` },
    ),
  ],
});

const me = await api<{ username: string }>("getMe");
console.log(
  `Bot @${me.username} đang chạy. Mở Telegram, tìm @${me.username}, bấm Start (chờ tối đa 3 phút)...`,
);

let offset = 0;
let chatId: number | undefined;
const deadline = Date.now() + 180_000;
while (!chatId && Date.now() < deadline) {
  const ups = await api<Update[]>("getUpdates", { offset, timeout: 25 });
  for (const u of ups) {
    offset = u.update_id + 1;
    if (u.message?.text?.startsWith("/start")) chatId = u.message.chat.id;
  }
}
if (!chatId) {
  console.error("Hết 3 phút mà chưa thấy ai bấm Start.");
  process.exit(1);
}
console.log("Đã nhận Start, gửi tin mẫu.");

const base = { to: "Thảo", at: "09:12" };
const samples: [NotifyFacts, "short" | "detail"][] = [
  [
    {
      ...base,
      event: "lead_assigned",
      customer: "Nguyễn Thị Thu",
      market: "KR",
      product: "Ghế DV-X9",
      due: "09:17",
      path: "/m?tab=lead&id=o1",
    },
    "short",
  ],
  [
    {
      ...base,
      event: "lead_assigned",
      customer: "Nguyễn Thị Thu",
      market: "KR",
      product: "Ghế DV-X9",
      due: "09:17",
      path: "/m?tab=lead&id=o1",
    },
    "detail",
  ],
  [
    {
      ...base,
      event: "callback_due",
      customer: "Trần Văn Bình",
      market: "VN",
      due: "10:00",
      taskId: "t1",
      path: "/m?tab=viec",
    },
    "detail",
  ],
  [
    {
      ...base,
      event: "approval_needed",
      what: "Giảm giá đơn",
      orderCode: "Q4-2610-0007",
      path: "/m?tab=duyet",
    },
    "detail",
  ],
];
for (const [facts, level] of samples) {
  const { text, buttons } = formatNotify(facts, level);
  await api("sendMessage", {
    chat_id: chatId,
    text: `${level === "short" ? "[Rút gọn] " : "[Chi tiết] "}${text}`,
    reply_markup: keyboard(buttons),
  });
}
console.log("Đã gửi 4 tin. Bấm thử nút Xong hoặc Hẹn lại 1 giờ trong 2 phút...");

const until = Date.now() + 120_000;
while (Date.now() < until) {
  const ups = await api<Update[]>("getUpdates", { offset, timeout: 25 });
  for (const u of ups) {
    offset = u.update_id + 1;
    const cb = u.callback_query;
    if (!cb) continue;
    const done = cb.data?.startsWith("task_done");
    await api("answerCallbackQuery", {
      callback_query_id: cb.id,
      text: done ? "Đã đánh dấu xong" : "Đã hẹn lại 1 giờ",
    });
    console.log(`Nhận nút: ${done ? "Xong" : "Hẹn lại"}`);
  }
}
console.log("Kết thúc thử.");
