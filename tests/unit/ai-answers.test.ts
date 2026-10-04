import { describe, expect, it } from "vitest";

import { AI_SUGGESTIONS, aiAnswer, type AiContext, type AiView } from "@/lib/demo/ai-answers";
import { CONVERSATIONS, OPPORTUNITIES } from "@/lib/demo/crm-data";

// Trợ lý AI của bản demo: mọi câu hỏi gợi ý phải có câu trả lời riêng, không rơi vào câu mặc định.

const ctx = (view: AiView): AiContext => ({
  view,
  revenue: 186,
  minutes: "09:30",
  autoCount: 7,
  opps: OPPORTUNITIES,
  oppSel: "o1",
  houseSel: "h1",
  orders: [
    {
      id: "o-0012",
      code: "Q4-2610-0012",
      buyer: "Võ Thanh Tùng",
      recipient: "Võ Văn Hai",
      status: "Đã cọc",
      risks: ["giữ hàng đến 15/10"],
    },
    {
      id: "o-0009",
      code: "Q4-2609-0009",
      buyer: "Đặng Minh Khoa",
      recipient: "",
      status: "Hoàn tất",
      risks: [],
    },
  ],
  convs: CONVERSATIONS,
});

describe("aiAnswer", () => {
  for (const [view, questions] of Object.entries(AI_SUGGESTIONS) as [AiView, string[]][]) {
    for (const q of questions) {
      it(`${view}: ${q}`, () => {
        const a = aiAnswer(q, ctx(view));
        expect(a.paragraphs[0]).not.toMatch(/^Bản demo trả lời được/);
      });
    }
  }

  it("tóm tắt hội thoại cần người nói về hội thoại, không về hộ gia đình", () => {
    const a = aiAnswer("Tóm tắt hội thoại cần người", ctx("convos"));
    expect(a.paragraphs.join(" ")).toContain("Nguyễn Thị Thu (Zalo, Daegu)");
  });

  it("đơn có rủi ro đọc từ đơn hàng, chỉ liệt kê đơn có điều cần chú ý", () => {
    const a = aiAnswer("Đơn nào có rủi ro trước dịp lễ?", ctx("orders")).paragraphs.join(" ");
    expect(a).toContain("Q4-2610-0012 (Võ Thanh Tùng): Đã cọc, giữ hàng đến 15/10.");
    expect(a).not.toContain("Q4-2609-0009");
  });

  it("câu không nhận ra thì trả lời mặc định", () => {
    expect(aiAnswer("thời tiết hôm nay", ctx("home")).paragraphs[0]).toMatch(/^Bản demo trả lời được/);
  });
});
