import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../client";
import { FlashError } from "../errors";
import { signParams } from "../sign";

const KEY = "k".repeat(20) + "SECRETKEY99";
const SIGN64 = "A".repeat(64);
const cred = { mchId: "AB123", secretKey: KEY };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
const ok = (data: unknown = {}) => json({ code: 1, message: "success", data });

let fetchMock: ReturnType<typeof vi.fn>;
let logs: string[];
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NODE_ENV", "test");
  logs = [];
  for (const m of ["log", "error", "warn", "info"] as const) vi.spyOn(console, m).mockImplementation((...a) => void logs.push(a.join(" ")));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const sent = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, form: new URLSearchParams(init.body as string), headers: init.headers as Record<string, string> };
};

describe("flashCall — คำขอ", () => {
  it("form-urlencoded + sign ตรงกับ signParams + header + base URL", async () => {
    vi.stubEnv("OPEN_FLASH_EXPRESS", "uat");
    fetchMock.mockResolvedValue(ok({ x: 1 }));
    await expect(client.flashCall(cred, "/open/v3/orders", { outTradeNo: "T1", zero: 0, blank: " ", dstName: "สมชาย" })).resolves.toEqual({ x: 1 });
    const { url, init, form, headers } = sent();
    expect(url).toBe("https://open-api-tra.flashexpress.com/open/v3/orders");
    expect(init.method).toBe("POST");
    expect(headers["content-type"]).toBe("application/x-www-form-urlencoded; charset=UTF-8");
    expect(headers["accept-language"]).toBe("th");
    expect(headers.accept).toBe("application/json");
    const p = Object.fromEntries(form);
    expect(p.mchId).toBe("AB123");
    expect(p.nonceStr).toMatch(/^[0-9a-f]{32}$/);
    expect(p.dstName).toBe("สมชาย");
    expect(p.blank).toBe(" "); // ค่าว่างยังส่ง
    const { sign, ...rest } = p;
    expect(sign).toBe(signParams(rest, KEY));
    expect(init.body as string).not.toContain(KEY);
  });

  it("OPEN_FLASH_EXPRESS=prod = production", async () => {
    vi.stubEnv("OPEN_FLASH_EXPRESS", "prod");
    fetchMock.mockResolvedValue(ok());
    await client.warehouses(cred);
    expect(sent().url).toBe("https://open-api.flashexpress.com/open/v1/warehouses");
  });

  it("path var ไม่เข้าลายเซ็น/body และถูก encode", async () => {
    fetchMock.mockResolvedValue(ok());
    await client.routes(cred, "TH 01/x");
    const { url, form } = sent();
    expect(url).toContain("/open/v1/orders/TH%2001%2Fx/routes");
    expect([...form.keys()].sort()).toEqual(["mchId", "nonceStr", "sign"]);
  });

  it("routesBatch ต่อ pnos ด้วย comma", async () => {
    fetchMock.mockResolvedValue(ok());
    await client.routesBatch(cred, ["A", "B"]);
    expect(sent().form.get("pnos")).toBe("A,B");
  });
});

describe("flashCall — ข้อผิดพลาด", () => {
  const cases: [number, string][] = [
    [1001, "MERCHANT_NOT_FOUND"], [1002, "SIGN_INVALID"], [1003, "DUPLICATE_ORDER"], [1004, "SENDER_ADDRESS_INVALID"],
    [1005, "RECEIVER_ADDRESS_INVALID"], [1006, "PARCEL_NOT_FOUND"], [1008, "COD_NOT_ENABLED"], [1010, "PICKUP_PENDING"],
    [1011, "PICKUP_NOT_CANCELLABLE"], [1015, "NOT_CANCELLABLE"], [1018, "INVALID_REQUEST"], [1019, "NOT_MERCHANT_PARCEL"],
    [1021, "POSTCODE_INVALID"], [1022, "SENDER_OUT_OF_AREA"], [0, "UPSTREAM_ERROR"], [1000, "UPSTREAM_ERROR"], [9999, "UNKNOWN_CODE"],
  ];
  it.each(cases)("code %i → %s", async (code, expected) => {
    fetchMock.mockResolvedValue(json({ code, message: "boom" }));
    await expect(client.warehouses(cred)).rejects.toMatchObject({ name: "FlashError", code: expected, flashCode: String(code) });
  });

  it("non-JSON → UPSTREAM_ERROR", async () => {
    fetchMock.mockResolvedValue(new Response("<html>bad gateway</html>", { status: 200 }));
    await expect(client.warehouses(cred)).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });

  it("HTTP 5xx แม้เป็น JSON code=1 → UPSTREAM_ERROR", async () => {
    fetchMock.mockResolvedValue(json({ code: 1, data: {} }, 503));
    await expect(client.warehouses(cred)).rejects.toMatchObject({ code: "UPSTREAM_ERROR", httpStatus: 503 });
  });

  it("network error → UPSTREAM_ERROR โดยไม่แนบ error ดิบ", async () => {
    fetchMock.mockRejectedValue(new TypeError(`fetch failed https://x?key=${KEY}`));
    const e = (await client.warehouses(cred).catch((x) => x)) as FlashError;
    expect(e.code).toBe("UPSTREAM_ERROR");
    expect(JSON.stringify([e.message, e.upstreamMessage])).not.toContain(KEY);
  });

  it("timeout → UPSTREAM_TIMEOUT (read 10s)", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_u: string, init: RequestInit) => new Promise((_r, rej) => {
      init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const p = client.warehouses(cred).catch((x) => x);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(await p).toMatchObject({ code: "UPSTREAM_TIMEOUT" });
  });

  it("timeoutMs override (webhook verify 5s)", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_u: string, init: RequestInit) => new Promise((_r, rej) => {
      init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" })));
    }));
    const p = client.routes(cred, "P1", { timeoutMs: 5_000 }).catch((x) => x);
    await vi.advanceTimersByTimeAsync(5_001);
    expect(await p).toMatchObject({ code: "UPSTREAM_TIMEOUT" });
  });

  it("redaction: key / sign 64-hex ไม่โผล่ใน error และ console", async () => {
    fetchMock.mockResolvedValue(json({ code: 1002, message: `bad sign=${SIGN64} key=${KEY} {"sign":"${SIGN64}"}` }));
    const e = (await client.createOrder(cred, { outTradeNo: "T" }).catch((x) => x)) as FlashError;
    const all = JSON.stringify([e.message, e.upstreamMessage, e.userMessage, logs]);
    expect(e.upstreamMessage).toContain("[redacted]");
    expect(all).not.toContain(KEY);
    expect(all).not.toContain(SIGN64);
    expect(logs).toEqual([]);
  });
});

describe("labelPdf", () => {
  it("PDF จริง → Buffer + Accept: application/pdf + path ตามขนาด", async () => {
    fetchMock.mockResolvedValue(new Response(Buffer.from("%PDF-1.4 hello"), { status: 200 }));
    const buf = await client.labelPdf(cred, "TH1", "SMALL");
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    const { url, headers } = sent();
    expect(url).toContain("/open/v1/orders/TH1/small/pre_print");
    expect(headers.accept).toBe("application/pdf");
  });
  it("BIG → /pre_print", async () => {
    fetchMock.mockResolvedValue(new Response("%PDF-", { status: 200 }));
    await client.labelPdf(cred, "TH1");
    expect(sent().url).toMatch(/\/orders\/TH1\/pre_print$/);
  });
  it("ไม่ใช่ PDF + envelope error → FlashError ตามรหัส", async () => {
    fetchMock.mockResolvedValue(json({ code: 1006, message: "not found" }));
    await expect(client.labelPdf(cred, "TH1")).rejects.toMatchObject({ code: "PARCEL_NOT_FOUND" });
  });
  it("ไม่ใช่ PDF และไม่ใช่ JSON → UPSTREAM_ERROR", async () => {
    fetchMock.mockResolvedValue(new Response("garbage", { status: 200 }));
    await expect(client.labelPdf(cred, "TH1")).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });
  it("code=1 แต่ไม่ใช่ PDF → UPSTREAM_ERROR (ไม่ส่งไฟล์เสีย)", async () => {
    fetchMock.mockResolvedValue(ok());
    await expect(client.labelPdf(cred, "TH1")).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });
  it("timeout 30s", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_u: string, init: RequestInit) => new Promise((_r, rej) => {
      init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" })));
    }));
    const p = client.labelPdf(cred, "TH1").catch((x) => x);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await p).toMatchObject({ code: "UPSTREAM_TIMEOUT" });
  });
});

describe("dry-run (TFR-FLASH-022)", () => {
  it("FLASH_DRY_RUN=1 นอก production: createOrder/notify ไม่ยิง คืน FLDRY…", async () => {
    vi.stubEnv("FLASH_DRY_RUN", "1");
    expect((await client.createOrder(cred, {})).pno).toMatch(/^FLDRY[0-9A-F]+$/);
    expect(String((await client.notify(cred, {})).ticketPickupId)).toMatch(/^FLDRY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("read-only ยังยิงจริงใน dry-run", async () => {
    vi.stubEnv("FLASH_DRY_RUN", "1");
    fetchMock.mockResolvedValue(ok([]));
    await client.warehouses(cred);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("production ไม่เข้า dry-run แม้ตั้ง env", async () => {
    vi.stubEnv("FLASH_DRY_RUN", "1");
    vi.stubEnv("NODE_ENV", "production");
    fetchMock.mockResolvedValue(ok({ pno: "TH9" }));
    expect((await client.createOrder(cred, {})).pno).toBe("TH9");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("ไม่ตั้ง env: ยิงจริง", async () => {
    fetchMock.mockResolvedValue(ok({ pno: "TH1" }));
    await client.createOrder(cred, {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
