/** 00084 T7b — route webhook + cron ของ Flash (mock service; พิสูจน์ด่านของ route เอง) */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signParams } from "@/lib/flash/sign";

const { load, handle, runCron, afterFn } = vi.hoisted(() => ({
  load: vi.fn(), handle: vi.fn(), runCron: vi.fn(), afterFn: vi.fn(),
}));
vi.mock("@/services/flash-account", () => ({ loadFlashAccountByWebhookSecret: load }));
vi.mock("@/services/flash-status.service", () => ({ handleFlashWebhook: handle, runFlashStatusSyncCron: runCron }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: afterFn }));

import { POST } from "@/app/api/webhooks/flash/[secret]/route";
import { GET } from "@/app/api/cron/flash-status-sync/route";

const KEY = "k".repeat(32);
const loaded = { account: { shopId: "s1" }, cred: { mchId: "AB1234", secretKey: KEY }, webhookSecret: "w" };
const SUCCESS = '{"errorCode":"1","state":"success"}';

function body(over: Record<string, unknown> = {}, mch = "AB1234") {
  const nonceStr = "n1";
  return JSON.stringify({ mchId: mch, nonceStr, sign: signParams({ mchId: mch, nonceStr }, KEY), data: { pno: "TH1", state: "5" }, ...over });
}
const call = (b: string, secret = "sec") =>
  POST(new Request("http://x/api/webhooks/flash/" + secret, { method: "POST", headers: { "content-type": "application/json" }, body: b }) as never,
    { params: Promise.resolve({ secret }) });

beforeEach(() => {
  vi.clearAllMocks();
  load.mockResolvedValue(loaded);
  handle.mockResolvedValue({ outcome: "APPLIED" });
});

describe("POST /api/webhooks/flash/[secret]", () => {
  it("สำเร็จ: body ตรงตัว + header", async () => {
    const r = await call(body());
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(SUCCESS);
    expect(r.headers.get("content-type")).toBe("application/json");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(handle).toHaveBeenCalledTimes(1);
  });
  it("after ถูกส่งเข้า after()", async () => {
    const fn = async () => {};
    handle.mockResolvedValue({ outcome: "APPLIED", after: fn });
    await call(body());
    expect(afterFn).toHaveBeenCalledWith(fn);
  });
  it("secret ไม่รู้จัก → 404 ว่าง ไม่เขียน", async () => {
    load.mockResolvedValue(null);
    const r = await call(body());
    expect(r.status).toBe(404);
    expect(await r.text()).toBe("");
    expect(handle).not.toHaveBeenCalled();
  });
  it("mchId ไม่ตรงร้าน (เซ็นถูกด้วย key เดียวกัน) → 401 ไม่เขียน", async () => {
    const r = await call(body({}, "ZZ9999"));
    expect(r.status).toBe(401);
    expect(await r.text()).toBe('{"errorCode":"0","state":"unauthorized"}');
    expect(handle).not.toHaveBeenCalled();
  });
  it("sign ผิด → 401 ไม่เขียน", async () => {
    const r = await call(body({ sign: "A".repeat(64) }));
    expect(r.status).toBe(401);
    expect(handle).not.toHaveBeenCalled();
  });
  it("RETRY → 503", async () => {
    handle.mockResolvedValue({ outcome: "RETRY" });
    const r = await call(body());
    expect(r.status).toBe(503);
    expect(await r.text()).toBe('{"errorCode":"0","state":"retry"}');
  });
  it("service โยน → 503 retry", async () => {
    handle.mockRejectedValue(new Error("db"));
    expect((await call(body())).status).toBe(503);
  });
  it("loader โยน → 503 retry", async () => {
    load.mockRejectedValue(new Error("db"));
    expect((await call(body())).status).toBe(503);
  });
  it("TOKEN_INVALID → 200 success", async () => {
    handle.mockResolvedValue({ outcome: "TOKEN_INVALID" });
    const r = await call(body());
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(SUCCESS);
  });
  it("body เกิน 256KB → 200 ไม่เขียน", async () => {
    const r = await call(body({ pad: "x".repeat(300 * 1024) }));
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(SUCCESS);
    expect(handle).not.toHaveBeenCalled();
  });
  it("parse ไม่ได้ → 200 ไม่เขียน", async () => {
    const r = await call("not-json");
    expect(r.status).toBe(200);
    expect(handle).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/flash-status-sync", () => {
  const get = (auth?: string) => GET(new Request("http://x", { headers: auth ? { authorization: auth } : {} }));
  it("ไม่มี env → 401", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await get("Bearer ")).status).toBe(401);
    expect(runCron).not.toHaveBeenCalled();
  });
  it("header ผิด/ไม่มี → 401", async () => {
    vi.stubEnv("CRON_SECRET", "cs");
    expect((await get("Bearer nope")).status).toBe(401);
    expect((await get()).status).toBe(401);
    expect(runCron).not.toHaveBeenCalled();
  });
  it("ผ่าน → 200 ผลลัพธ์", async () => {
    vi.stubEnv("CRON_SECRET", "cs");
    runCron.mockResolvedValue({ shops: 1, shopsChanged: 1, rowsChanged: 2, failed: 0 });
    const r = await get("Bearer cs");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ shops: 1, shopsChanged: 1, rowsChanged: 2, failed: 0 });
  });
  it("ล้ม → 500", async () => {
    vi.stubEnv("CRON_SECRET", "cs");
    runCron.mockRejectedValue(new Error("x"));
    const r = await get("Bearer cs");
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "internal_error" });
  });
});
