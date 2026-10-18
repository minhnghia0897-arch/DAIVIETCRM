import { describe, expect, it, vi } from "vitest";

import { AiError, aiErrorMessage, createMessage, getModel } from "@/lib/ai/anthropic";
import { describePolicy, nextShiftText } from "@/lib/ai/catalog-text";
import { EMAIL_MARK, PHONE_MARK, redactForAi } from "@/lib/ai/mask";
import { aiCost, aiModel } from "@/lib/ai/models";
import { buildData, buildTurnPrompt, DECISION_SCHEMA, parseDecision } from "@/lib/ai/prompt";
import type { Policy } from "@/lib/sales/pricing";

// AI tự trả lời tin nhắn (Owner chốt 12/10/2026): che số trước khi gửi mô hình, luật cứng sau khi mô hình trả lời
// (để số là chuyển người và tạo lead), chi phí theo bảng giá, gọi API đúng mẫu tài liệu.

const NOW = new Date("2026-10-12T03:00:00Z"); // 10:00 thứ Hai giờ VN

describe("redactForAi", () => {
  it("che số điện thoại VN, Hàn, có dấu cách, chấm, gạch; che email", () => {
    for (const raw of ["0912 345 678", "+84 912.345.678", "010-1234-5678", "+821012345678", "84912345678"]) {
      const r = redactForAi(`Số chị là ${raw} nhé`);
      expect(r.hasPhone, raw).toBe(true);
      expect(r.text).toBe(`Số chị là ${PHONE_MARK} nhé`);
    }
    expect(redactForAi("mail: chi.hoa@gmail.com").text).toBe(`mail: ${EMAIL_MARK}`);
  });

  it("không che giá tiền, mã đơn, số ngắn", () => {
    for (const raw of ["Ghế 45.900.000đ", "Đơn Q4-2610-0012", "giao 3 ngày", "2 ghế"]) {
      const r = redactForAi(raw);
      expect(r.hasPhone, raw).toBe(false);
      expect(r.text).toBe(raw);
    }
  });
});

describe("buildTurnPrompt", () => {
  it("ghi rõ ai nói, che số, báo tin cuối có số", () => {
    const r = buildTurnPrompt(
      [
        { who: "customer", text: "Ghế DV-X9 giá bao nhiêu?", files: 0, at: NOW },
        { who: "ai", text: "Dạ 45.900.000 đ ạ", files: 0, at: NOW },
        { who: "customer", text: "Gọi chị số 0912345678", files: 1, at: NOW },
      ],
      { now: NOW, channel: "messenger", onDuty: false, nextShift: "16:30 thứ Hai 12/10" },
    );
    expect(r.lastHasPhone).toBe(true);
    expect(r.text).toContain("[Khách 12/10 10:00] Ghế DV-X9 giá bao nhiêu?");
    expect(r.text).toContain("[Trợ lý AI 12/10 10:00] Dạ 45.900.000 đ ạ");
    expect(r.text).toContain(`Gọi chị số ${PHONE_MARK} [gửi 1 ảnh hoặc tệp]`);
    expect(r.text).not.toContain("0912345678");
    expect(r.text).toContain("KHÔNG có nhân viên trực lúc này. Ca kế tiếp bắt đầu 16:30 thứ Hai 12/10.");
    expect(r.text).toContain("10:00 thứ Hai 12/10/2026");
  });
});

describe("parseDecision", () => {
  const j = (o: object) => JSON.stringify(o);
  const base = { reply: "Dạ ghế còn hàng ạ", handoff_reason: "none", create_lead: false, summary: "Hỏi tồn" };

  it("trả lời thường: giữ nguyên, bỏ markdown", () => {
    const d = parseDecision(j({ ...base, action: "reply", reply: "**Dạ** ghế còn hàng ạ" }), false);
    expect(d).toEqual({
      action: "reply",
      reply: "Dạ ghế còn hàng ạ",
      reason: null,
      createLead: false,
      summary: "Hỏi tồn",
    });
  });

  it("tin cuối có số điện thoại thì luôn chuyển người, tạo lead, kể cả khi mô hình định trả lời", () => {
    const d = parseDecision(j({ ...base, action: "reply" }), true);
    expect(d?.action).toBe("handoff");
    expect(d?.reason).toBe("call_request");
    expect(d?.createLead).toBe(true);
  });

  it("chuyển vì muốn mua thì luôn tạo lead; vì sức khỏe thì không; viết hoa enum vẫn đọc được", () => {
    expect(parseDecision(j({ ...base, action: "Handoff", handoff_reason: "PURCHASE" }), false)).toMatchObject(
      {
        action: "handoff",
        reason: "purchase",
        createLead: true,
      },
    );
    expect(parseDecision(j({ ...base, action: "handoff", handoff_reason: "health" }), false)).toMatchObject({
      reason: "health",
      createLead: false,
    });
  });

  it("chuyển mà thiếu lý do là unknown; trả lời rỗng thì chuyển người; không cần trả lời thì không gửi gì", () => {
    expect(parseDecision(j({ ...base, action: "handoff" }), false)?.reason).toBe("unknown");
    expect(parseDecision(j({ ...base, action: "reply", reply: "  " }), false)).toMatchObject({
      action: "handoff",
      reason: "unknown",
    });
    expect(parseDecision(j({ ...base, action: "none" }), false)).toMatchObject({ action: "none", reply: "" });
  });

  it("sai mẫu thì null; tóm tắt bị che số", () => {
    expect(parseDecision("không phải JSON", false)).toBeNull();
    expect(parseDecision(j({ ...base, action: "bay" }), false)).toBeNull();
    expect(parseDecision(j({ ...base, action: "reply", summary: "Số 0912345678" }), false)?.summary).toBe(
      `Số ${PHONE_MARK}`,
    );
  });

  it("mẫu JSON gửi mô hình: mọi trường bắt buộc, không thêm trường", () => {
    expect(DECISION_SCHEMA.required).toEqual(Object.keys(DECISION_SCHEMA.properties));
    expect(DECISION_SCHEMA.additionalProperties).toBe(false);
  });
});

describe("dữ liệu cho AI", () => {
  it("sản phẩm, giá, tồn, ưu đãi; chưa có thì dặn chuyển nhân viên", () => {
    const text = buildData([{ title: "Giờ mở cửa", body: "8:30 tới 21:00" }], {
      products: [
        {
          sku: "DVX9",
          name: "Ghế DV-X9",
          price: 45_900_000,
          warrantyMonths: 60,
          installation: true,
          available: 0,
        },
      ],
      offers: ['Khuyến mãi "20/10": giảm 5%'],
    });
    expect(text).toContain("# Giờ mở cửa\n8:30 tới 21:00");
    expect(text).toContain(
      "Ghế DV-X9 (mã DVX9): 45.900.000 đ · bảo hành 60 tháng · có lắp đặt tại nhà · tạm hết",
    );
    expect(text).toContain('- Khuyến mãi "20/10": giảm 5%');
    expect(buildData([], { products: [], offers: [] })).toContain("hỏi giá thì chuyển nhân viên");
  });

  it("khuyến mãi, giao lắp, cọc viết thành câu; giới hạn giảm (nội bộ) không có câu nào", () => {
    const names = { variant: () => "Gối massage cổ", category: () => "Ghế massage", combo: () => "Combo" };
    const common = {
      id: "p",
      version: 1,
      status: "active",
      validFrom: "2026-10-01",
      channels: null,
      priority: 0,
    } as const;
    const promo = {
      ...common,
      name: "Quà 20/10",
      validTo: "2026-10-20",
      stackable: false,
      type: "promotion",
      rules: { scope: { categoryIds: ["c"] }, benefit: { giftVariantIds: ["g"], freeInstallation: true } },
    } as Policy;
    expect(describePolicy(promo, names)[0]).toBe(
      'Khuyến mãi "Quà 20/10": tặng Gối massage cổ, miễn phí lắp đặt; điều kiện: áp cho nhóm Ghế massage (đến hết 20/10/2026); không cộng dồn với khuyến mãi khác',
    );
    const deposit = {
      ...common,
      name: "Cọc",
      validTo: null,
      stackable: true,
      type: "deposit",
      rules: { minAmount: 10_000_000, minPercent: 0, holdDays: 14 },
    } as Policy;
    expect(describePolicy(deposit, names)).toEqual(["Đặt cọc: tối thiểu 10.000.000 đ"]);
    const limit = {
      ...common,
      name: "Giới hạn",
      validTo: null,
      stackable: true,
      type: "discount_limit",
      rules: { byRole: { telesale: 5 } },
    } as Policy;
    expect(describePolicy(limit, names)).toEqual([]);
  });

  it("ca kế tiếp: hôm nay nếu chưa tới giờ, không thì ngày có ca gần nhất", () => {
    const shifts = [
      { days: [1, 2, 3, 4, 5, 6], start_time: "08:30:00" },
      { days: [1, 2, 3, 4, 5], start_time: "16:30:00" },
    ];
    expect(nextShiftText(shifts, NOW)).toBe("16:30 thứ Hai 12/10");
    // 22:00 thứ Bảy 17/10 giờ VN: Chủ nhật không có ca, ca kế tiếp là thứ Hai.
    expect(nextShiftText(shifts, new Date("2026-10-17T15:00:00Z"))).toBe("08:30 thứ Hai 19/10");
    expect(nextShiftText([], NOW)).toBeNull();
  });
});

describe("chi phí", () => {
  it("theo bảng giá mô hình: input, output, ghi và đọc bộ nhớ đệm", () => {
    // Sonnet 5.5: 1.000 token vào × 2 + 500 token ra × 10 + 2.000 ghi đệm × 2,5 + 10.000 đọc đệm × 0,1 phần triệu USD.
    const c = aiCost(
      "claude-sonnet-5-5",
      { input_tokens: 1000, output_tokens: 500, cache_write_tokens: 2000, cache_read_tokens: 10000 },
      26_500,
    );
    expect(c.usdMicros).toBe(2000 + 5000 + 5000 + 1000);
    expect(c.vnd).toBe(Math.ceil((13_000 * 26_500) / 1_000_000));
    expect(aiModel("không có").id).toBe("claude-sonnet-5-5");
    expect(
      aiCost(
        "claude-haiku-5-5",
        { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 },
        0,
      ),
    ).toEqual({
      usdMicros: 0,
      vnd: 0,
    });
  });
});

describe("Messages API", () => {
  it("gửi đúng đường, header, mẫu JSON; khóa không lọt vào câu lỗi", async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
      const h = init?.headers as Record<string, string>;
      expect(h["x-api-key"]).toBe("sk-bi-mat");
      expect(h["anthropic-version"]).toBe("2023-06-01");
      const body = JSON.parse(String(init?.body));
      expect(body.output_config.format.type).toBe("json_schema");
      return Response.json({ content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: {} });
    });
    const r = await createMessage(
      "sk-bi-mat",
      {
        model: "claude-sonnet-5-5",
        max_tokens: 10,
        system: [{ type: "text", text: "x" }],
        messages: [{ role: "user", content: "y" }],
        output_config: { format: { type: "json_schema", schema: DECISION_SCHEMA } },
      },
      fetchImpl as typeof fetch,
    );
    expect(r.stop_reason).toBe("end_turn");

    const denied = vi.fn(async () =>
      Response.json(
        { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } },
        { status: 401 },
      ),
    );
    const err = await getModel("sk-bi-mat", "claude-sonnet-5-5", denied as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.status).toBe(401);
    expect(String(err.message)).not.toContain("sk-bi-mat");
    expect(aiErrorMessage(err)).toContain("API key");
  });

  it("quá tải thì thử lại một lần", async () => {
    let n = 0;
    const flaky = vi.fn(async () => {
      n++;
      return n === 1
        ? Response.json({ type: "error", error: { type: "overloaded_error" } }, { status: 529 })
        : Response.json({ content: [], stop_reason: "end_turn" });
    });
    vi.useFakeTimers();
    const p = createMessage(
      "k",
      { model: "m", max_tokens: 1, system: [], messages: [{ role: "user", content: "x" }] },
      flaky as typeof fetch,
    );
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(p).resolves.toMatchObject({ stop_reason: "end_turn" });
    vi.useRealTimers();
    expect(n).toBe(2);
  });
});
