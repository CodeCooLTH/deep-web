import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { toE164Thai, sendOtpViaSms } from "@/lib/otp";

// ─── toE164Thai (pure function, no side-effects) ──────────────────────────────

describe("toE164Thai", () => {
  it('แปลง "0812345678" → "+66812345678"', () => {
    expect(toE164Thai("0812345678")).toBe("+66812345678");
  });

  it('แปลง "0920791649" → "+66920791649"', () => {
    expect(toE164Thai("0920791649")).toBe("+66920791649");
  });

  it("throw INVALID_THAI_PHONE เมื่อขาด 0 นำหน้า (9 หลัก)", () => {
    expect(() => toE164Thai("812345678")).toThrow("INVALID_THAI_PHONE");
  });

  it("throw INVALID_THAI_PHONE เมื่อยาวเกิน 10 หลัก (11 หลัก)", () => {
    expect(() => toE164Thai("08123456789")).toThrow("INVALID_THAI_PHONE");
  });

  it("throw INVALID_THAI_PHONE เมื่อ input มาในรูป E.164 อยู่แล้ว", () => {
    expect(() => toE164Thai("+66812345678")).toThrow("INVALID_THAI_PHONE");
  });

  it("throw INVALID_THAI_PHONE เมื่อ input เป็น string ว่าง", () => {
    expect(() => toE164Thai("")).toThrow("INVALID_THAI_PHONE");
  });

  it("throw INVALID_THAI_PHONE เมื่อ input มีตัวอักษร", () => {
    expect(() => toE164Thai("0abcdefghi")).toThrow("INVALID_THAI_PHONE");
  });
});

// ─── sendOtpViaSms (mock global.fetch) ───────────────────────────────────────

describe("sendOtpViaSms", () => {
  const VALID_PHONE = "0812345678";
  const VALID_OTP = "123456";

  // เก็บค่า env เดิมไว้ restore หลัง test
  let originalApiKey: string | undefined;
  let originalApiSecret: string | undefined;
  let originalSender: string | undefined;

  beforeEach(() => {
    originalApiKey = process.env.APITEL_API_KEY;
    originalApiSecret = process.env.APITEL_API_SECRET;
    originalSender = process.env.APITEL_SENDER_NAME;
    // set ค่า env ครบก่อนทุก test — test ที่ต้องการ "ไม่ครบ" จะ delete เอง
    process.env.APITEL_API_KEY = "test-api-key";
    process.env.APITEL_API_SECRET = "test-api-secret";
    process.env.APITEL_SENDER_NAME = "TESTSENDER";
  });

  afterEach(() => {
    // restore env เดิม
    if (originalApiKey === undefined) {
      delete process.env.APITEL_API_KEY;
    } else {
      process.env.APITEL_API_KEY = originalApiKey;
    }
    if (originalApiSecret === undefined) {
      delete process.env.APITEL_API_SECRET;
    } else {
      process.env.APITEL_API_SECRET = originalApiSecret;
    }
    if (originalSender === undefined) {
      delete process.env.APITEL_SENDER_NAME;
    } else {
      process.env.APITEL_SENDER_NAME = originalSender;
    }
    vi.restoreAllMocks();
  });

  it("reject ด้วย APITEL_NOT_CONFIGURED เมื่อ env ไม่ครบ (ไม่มี APITEL_API_KEY)", async () => {
    delete process.env.APITEL_API_KEY;
    // fetch ต้องไม่ถูกเรียก — mock เพื่อ detect
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendOtpViaSms(VALID_PHONE, VALID_OTP)).rejects.toThrow("APITEL_NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("reject ด้วย APITEL_NOT_CONFIGURED เมื่อ env ไม่ครบ (ไม่มี APITEL_API_SECRET)", async () => {
    delete process.env.APITEL_API_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendOtpViaSms(VALID_PHONE, VALID_OTP)).rejects.toThrow("APITEL_NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("happy path — fetch ถูกเรียกด้วย payload ถูกต้อง และ resolve ปกติ", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendOtpViaSms(VALID_PHONE, VALID_OTP)).resolves.toBeUndefined();

    // assert fetch ถูกเรียก 1 ครั้ง
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];

    // URL ต้องชี้ apitel (default หรือ env)
    expect(calledUrl).toMatch(/apitel/);

    // method POST
    expect(calledInit.method).toBe("POST");

    // parse body
    const body = JSON.parse(calledInit.body as string);

    // to ต้องเป็น E.164
    expect(body.to).toBe("+66812345678");

    // from ต้องตรงกับ APITEL_SENDER_NAME ที่ตั้งไว้
    expect(body.from).toBe("TESTSENDER");

    // text ต้องมี OTP
    expect(body.text).toContain(VALID_OTP);

    // ttl = 600 วินาที
    expect(body.ttl).toBe(600);

    // apiKey/apiSecret ถูกส่งใน body
    expect(body.apiKey).toBe("test-api-key");
    expect(body.apiSecret).toBe("test-api-secret");

    vi.unstubAllGlobals();
  });

  it("omit field from เมื่อ APITEL_SENDER_NAME ว่าง — ใช้ default sender ของ account", async () => {
    // ทำไม: ส่ง from ที่ apitel ไม่ approve → 400 Sender Name Invalid.
    // เว้นว่าง ต้อง omit field ไปเลย (ไม่ใช่ส่ง "" หรือ hardcode) เพื่อให้
    // apitel ใช้ default sender ของ account
    delete process.env.APITEL_SENDER_NAME;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendOtpViaSms(VALID_PHONE, VALID_OTP)).resolves.toBeUndefined();

    const [, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(calledInit.body as string);
    expect("from" in body).toBe(false);
    // field อื่นยังครบ
    expect(body.to).toBe("+66812345678");
    expect(body.apiKey).toBe("test-api-key");

    vi.unstubAllGlobals();
  });

  it("omit field from เมื่อ APITEL_SENDER_NAME เป็น whitespace ล้วน", async () => {
    process.env.APITEL_SENDER_NAME = "   ";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await sendOtpViaSms(VALID_PHONE, VALID_OTP);

    const [, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(calledInit.body as string);
    expect("from" in body).toBe(false);

    vi.unstubAllGlobals();
  });

  it("reject ด้วย error ที่มี HTTP status เมื่อ fetch ตอบ ok:false (400)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);

    let caughtError: Error | undefined;
    try {
      await sendOtpViaSms(VALID_PHONE, VALID_OTP);
    } catch (e) {
      caughtError = e as Error;
    }

    expect(caughtError).toBeDefined();
    // error message ต้องมี status code
    expect(caughtError!.message).toContain("400");

    // ต้องไม่ leak apiKey, apiSecret, หรือ OTP ใน error message — security hard rule
    expect(caughtError!.message).not.toContain("test-api-key");
    expect(caughtError!.message).not.toContain("test-api-secret");
    expect(caughtError!.message).not.toContain(VALID_OTP);

    vi.unstubAllGlobals();
  });

  it("reject (propagate) เมื่อ fetch throw network error", async () => {
    const networkError = new Error("Network connection refused");
    const fetchMock = vi.fn().mockRejectedValue(networkError);
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendOtpViaSms(VALID_PHONE, VALID_OTP)).rejects.toThrow("Network connection refused");

    vi.unstubAllGlobals();
  });

  it("error path (ok:false) ไม่ leak secret/otp ใน error message", async () => {
    // ทำไม: verify security invariant แยก test เพื่อให้ชัดเจนใน CI report
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    let errorMsg = "";
    try {
      await sendOtpViaSms(VALID_PHONE, VALID_OTP);
    } catch (e) {
      errorMsg = (e as Error).message;
    }

    expect(errorMsg).not.toContain("test-api-key");
    expect(errorMsg).not.toContain("test-api-secret");
    expect(errorMsg).not.toContain(VALID_OTP);

    vi.unstubAllGlobals();
  });
});
