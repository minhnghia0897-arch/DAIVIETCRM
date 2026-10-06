// Chạy bot Telegram thật nối với database CRM, kiểu hỏi liên tục (getUpdates), chưa cần tên miền HTTPS.
// Dùng cho đợt chạy thử (kế hoạch đã duyệt 07/10/2026); bản thật dùng webhook /api/webhooks/telegram với cùng bộ xử lý.
//
//   node scripts/telegram-bot.mts run                  # chạy bot (nhận tin, gửi việc)
//   node scripts/telegram-bot.mts link <email>         # in link liên kết một lần cho một tài khoản CRM
//   node scripts/telegram-bot.mts demo-lead <email>    # tạo lead thử giao cho người đó + hẹn gọi lại sau 2 phút
//
// Đọc TELEGRAM_BOT_TOKEN từ biến môi trường; địa chỉ và khóa Supabase từ .env.local. Không in token.

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../lib/db/types.ts";
import { telegramApi } from "../lib/integrations/telegram_bot/api.ts";
import { handleUpdate } from "../lib/integrations/telegram_bot/inbound.ts";
import { initialCursor, pollOutbound } from "../lib/integrations/telegram_bot/outbound.ts";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const [cmd, arg] = process.argv.slice(2);

async function userByEmail(email: string) {
  const { data } = await db.auth.admin.listUsers();
  const u = data.users.find((x) => x.email === email);
  if (!u) throw new Error(`Không có tài khoản ${email}`);
  const { data: p } = await db.from("profiles").select("id, showroom_id, full_name").eq("id", u.id).single();
  return p!;
}

if (cmd === "link") {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const bot = token
    ? await telegramApi(token).call<{ username: string }>("getMe")
    : { username: "DAIVIETS4BOT" };
  const p = await userByEmail(arg);
  const code = randomBytes(16).toString("hex");
  await db
    .from("telegram_link_codes")
    .update({ expires_at: new Date().toISOString() })
    .eq("user_id", p.id)
    .is("used_at", null);
  const { error } = await db.from("telegram_link_codes").insert({
    showroom_id: p.showroom_id,
    user_id: p.id,
    code_hash: createHash("sha256").update(code).digest("hex"),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    created_by: p.id,
  });
  if (error) throw error;
  console.log(`Link liên kết cho ${p.full_name} (một lần, hết hạn sau 10 phút):`);
  console.log(`https://t.me/${bot.username}?start=${code}`);
} else if (cmd === "demo-lead") {
  const p = await userByEmail(arg);
  const { data: contact, error: ce } = await db
    .from("contacts")
    .insert({ showroom_id: p.showroom_id, full_name: "Trần Thị Mai (khách thử)", country_of_residence: "KR" })
    .select("id")
    .single();
  if (ce) throw ce;
  const { data: lead, error: le } = await db
    .from("leads")
    .insert({
      showroom_id: p.showroom_id,
      contact_id: contact.id,
      source: "meta_lead_ads",
      assigned_to: p.id,
      sla_due_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (le) throw le;
  const { error: te } = await db.from("tasks").insert({
    showroom_id: p.showroom_id,
    type: "callback",
    title: "Gọi lại khách thử Mai",
    contact_id: contact.id,
    lead_id: lead.id,
    assigned_to: p.id,
    due_at: new Date(Date.now() + 2 * 60_000).toISOString(),
  });
  if (te) throw te;
  console.log(`Đã tạo lead thử ${lead.id} giao cho ${p.full_name}, hẹn gọi lại sau 2 phút.`);
} else if (cmd === "run") {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Thiếu biến môi trường TELEGRAM_BOT_TOKEN");
  const api = telegramApi(token);
  const me = await api.call<{ username: string }>("getMe");
  console.log(`Bot @${me.username} đang chạy, nối với database ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);

  let cursor = await initialCursor(db);
  setInterval(async () => {
    try {
      cursor = await pollOutbound(db, api, cursor);
    } catch (e) {
      console.error("Gửi tin lỗi:", e instanceof Error ? e.message : e);
    }
  }, 5_000);

  let offset = 0;
  for (;;) {
    try {
      const updates = await api.call<{ update_id: number }[]>("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message", "callback_query", "my_chat_member"],
      });
      for (const u of updates) {
        offset = u.update_id + 1;
        await handleUpdate(db, api, me.username, u);
        console.log(`Đã xử lý tin ${u.update_id}`);
      }
    } catch (e) {
      console.error("Nhận tin lỗi:", e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
} else {
  console.log("Lệnh: run | link <email> | demo-lead <email>");
}
