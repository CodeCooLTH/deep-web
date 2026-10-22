import { describe, expect, it } from "vitest";
import { hashWebhookSecret } from "../credential";
import { classifyWebhookUrl, inferFlashWebhookKind, parseWebhookBody } from "../webhook-parse";

describe("parseWebhookBody", () => {
  const data = { pno: "TH1", state: "5" };
  it("JSON data เป็น object", () => {
    const p = parseWebhookBody("application/json", JSON.stringify({ mchId: "m", nonceStr: "n", sign: "S", data }))!;
    expect(p).toMatchObject({ mchId: "m", nonceStr: "n", sign: "S", data });
  });
  it("JSON data เป็นสตริง", () => {
    expect(parseWebhookBody("application/json; charset=utf-8", JSON.stringify({ mchId: 7, data: JSON.stringify(data) }))!.data).toEqual(data);
    expect(parseWebhookBody("application/json", JSON.stringify({ mchId: 7, data: "{bad" }))!.data).toBeNull();
  });
  it("form-urlencoded", () => {
    const body = new URLSearchParams({ mchId: "m", nonceStr: "n", sign: "S", data: JSON.stringify(data) }).toString();
    expect(parseWebhookBody("application/x-www-form-urlencoded", body)).toMatchObject({ mchId: "m", sign: "S", data });
  });
  it("content-type ผิดแต่ body เป็น JSON ก็อ่านได้", () => {
    expect(parseWebhookBody("text/plain", '{"mchId":"m"}')!.mchId).toBe("m");
  });
  it.each(["", "not json", "[1,2]", "null", "123"])("parse ไม่ได้ %j -> null", (t) => expect(parseWebhookBody("application/json", t)).toBeNull());
});

describe("inferFlashWebhookKind", () => {
  it.each([
    [{ pno: "a", state: "1", stateDate: "1" }, "status"],
    [{ pno: "a", state: "1", routedAction: "X", routedAt: "1" }, "routes"],
    [{ pno: "a", routeAction: "X" }, "routes"],
    [{ pno: "a", weight: "100", length: "1", weightTime: "1" }, "weight"],
    [{ pno: "a", freightPrice: "1", codFee: "0" }, "price"],
    [{ ticketPickupId: "1", state: "2" }, "courier"],
  ])("%j -> %s", (d, k) => expect(inferFlashWebhookKind(d)).toBe(k));
  it("ไม่ชัด -> hint หรือ null", () => {
    expect(inferFlashWebhookKind({ foo: 1 })).toBeNull();
    expect(inferFlashWebhookKind({ foo: 1 }, "2")).toBe("price");
    expect(inferFlashWebhookKind(null, "courier")).toBe("courier");
    expect(inferFlashWebhookKind({ foo: 1 }, "zzz")).toBeNull();
  });
});

describe("classifyWebhookUrl", () => {
  const ours = { base: "https://deep.example.com", secretHash: hashWebhookSecret("sec1") };
  it("จำแนก 5 แบบ", () => {
    expect(classifyWebhookUrl("", ours).state).toBe("EMPTY");
    expect(classifyWebhookUrl(null, ours).state).toBe("EMPTY");
    expect(classifyWebhookUrl("https://deep.example.com/api/webhooks/flash/sec1?k=0", ours).state).toBe("OURS");
    expect(classifyWebhookUrl("https://deep.example.com/api/webhooks/flash/other", ours).state).toBe("OTHER_DEEP");
    expect(classifyWebhookUrl("https://x.example.org/hook", ours)).toEqual({ state: "EXTERNAL", host: "x.example.org" });
    expect(classifyWebhookUrl("https://deep.example.com/else", ours).state).toBe("EXTERNAL");
    expect(classifyWebhookUrl("not a url", ours).state).toBe("UNKNOWN");
  });
});
