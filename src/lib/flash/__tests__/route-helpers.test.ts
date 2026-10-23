import { describe, expect, it, vi } from "vitest";
import { IShipServiceError } from "@/services/iship.service";
import { FlashError, FlashServiceError, type FlashErrorCode, type FlashServiceErrorCode } from "../errors";
import { mapFlashError } from "../route-helpers";
import { FlashUnitError } from "../units";

const run = async (e: unknown, ctx?: { context?: string }) => {
  const r = mapFlashError(e, ctx);
  return { status: r.status, cache: r.headers.get("cache-control"), body: await r.json() };
};

describe("mapFlashError — FlashError", () => {
  const table: [FlashErrorCode, number][] = [
    ["MERCHANT_NOT_FOUND", 409], ["SIGN_INVALID", 409], ["DUPLICATE_ORDER", 409], ["SENDER_ADDRESS_INVALID", 422],
    ["RECEIVER_ADDRESS_INVALID", 422], ["PARCEL_NOT_FOUND", 404], ["INVALID_REQUEST", 422], ["COD_NOT_ENABLED", 422],
    ["PICKUP_PENDING", 409], ["PICKUP_NOT_CANCELLABLE", 409], ["NOT_CANCELLABLE", 409], ["NOT_MERCHANT_PARCEL", 422],
    ["POSTCODE_INVALID", 422], ["SENDER_OUT_OF_AREA", 422], ["UPSTREAM_ERROR", 502], ["UPSTREAM_TIMEOUT", 504], ["UNKNOWN_CODE", 502],
  ];
  it.each(table)("%s → %i", async (code, status) => {
    const r = await run(new FlashError(code, { upstreamMessage: "RAW-UPSTREAM" }));
    expect(r.status).toBe(status);
    expect(r.cache).toBe("private, no-store");
    expect(r.body.error.code).toBe(code);
    expect(JSON.stringify(r.body)).not.toContain("RAW-UPSTREAM");
    expect(r.body.error.retryable).toBe(code === "UPSTREAM_ERROR" || code === "UPSTREAM_TIMEOUT");
  });
  it("context=connection: 1001/1002 → 422 เฉพาะสองรหัสนี้", async () => {
    expect((await run(new FlashError("SIGN_INVALID"), { context: "connection" })).status).toBe(422);
    expect((await run(new FlashError("MERCHANT_NOT_FOUND"), { context: "connection" })).status).toBe(422);
    expect((await run(new FlashError("UPSTREAM_TIMEOUT"), { context: "connection" })).status).toBe(504);
  });
});

describe("mapFlashError — FlashServiceError / อื่น ๆ", () => {
  const svc: [FlashServiceErrorCode, number][] = [
    ["NOT_CONNECTED", 409], ["FEATURE_DISABLED", 404], ["SHIPMENT_EXISTS", 409], ["NEEDS_REVIEW", 409], ["INCOMPLETE_DATA", 422],
    ["NOT_ELIGIBLE", 403], ["NOT_FOUND", 404], ["INVALID_STATE", 409], ["MERCHANT_IN_USE", 409],
    ["MERCHANT_CHANGE_NOT_ALLOWED", 409], ["PNO_TAKEN", 409], ["INVALID_INPUT", 400],
  ];
  it.each(svc)("%s → %i", async (code, status) => {
    const r = await run(new FlashServiceError(code, "ข้อความไทย"));
    expect(r.status).toBe(status);
    expect(r.body).toEqual({ error: { code, message: "ข้อความไทย" } });
  });
  it("INCOMPLETE_DATA แนบ missing[]", async () => {
    const r = await run(new FlashServiceError("INCOMPLETE_DATA", "ไม่ครบ", ["dstPhone"]));
    expect(r.body.error.missing).toEqual(["dstPhone"]);
  });
  it("IShipServiceError → ตัวแมปของ iShip", async () => {
    const r = await run(new IShipServiceError("NOT_CONNECTED", "ยังไม่เชื่อม"));
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("NOT_CONNECTED");
  });
  it("FlashUnitError → 422 INCOMPLETE_DATA", async () => {
    expect((await run(new FlashUnitError("baht: x"))).status).toBe(422);
  });
  it("error ไม่รู้จัก → 500 ไม่รั่วรายละเอียด และ log แบบ redact", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await run(new Error("db down key=SUPERSECRET"));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("db down");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("SUPERSECRET");
    spy.mockRestore();
  });
});
