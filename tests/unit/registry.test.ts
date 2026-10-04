import { describe, expect, it } from "vitest";

import { getIntegration, groupLabels, integrations, phaseLabels } from "@/lib/integrations/registry";

describe("integration registry", () => {
  it("không trùng key", () => {
    const keys = integrations.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("mọi nhóm và giai đoạn đều có nhãn tiếng Việt", () => {
    for (const i of integrations) {
      expect(groupLabels[i.group]).toBeTruthy();
      expect(phaseLabels[i.phase]).toBeTruthy();
    }
  });

  it("có đủ ba đấu nối tháng 1 và cổng MCP tháng 2", () => {
    const month1 = integrations.filter((i) => i.phase === "month_1").map((i) => i.key);
    expect(month1).toEqual(expect.arrayContaining(["meta_lead_ads", "zalo_oa", "email_smtp"]));
    expect(getIntegration("mcp_server").phase).toBe("month_2");
  });

  it("chỉ kênh nhắn tin mới có chế độ trả lời", () => {
    for (const i of integrations) {
      if ("supportsReplyMode" in i && i.supportsReplyMode) {
        expect(i.capabilities).toContain("inbound_messages");
      }
    }
  });
});
