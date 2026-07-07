import { describe, it, expect } from "vitest";
import { resolveOrderAccess, type OrderAccessInput, type SessionInput } from "../order-access.service";

// feature 00015 (Order Claim & Forced Login) — resolveOrderAccess เป็น pure function
// ไม่ต้อง mock Prisma ตาม NFR-Maintainability (SRS §6)

function baseOrder(overrides: Partial<OrderAccessInput> = {}): OrderAccessInput {
  return {
    orderId: "order-1",
    buyerUserId: null,
    buyerContact: null,
    status: "PENDING",
    ...overrides,
  };
}

function baseSession(overrides: Partial<SessionInput> = {}): SessionInput {
  return {
    userId: "user-1",
    phone: null,
    justAuthedViaPhoneOtp: false,
    ...overrides,
  };
}

describe("resolveOrderAccess", () => {
  it("NO_SESSION — ไม่มี session เลย", () => {
    const decision = resolveOrderAccess(baseOrder(), baseSession({ userId: null }));
    expect(decision).toEqual({ kind: "NO_SESSION" });
  });

  it("OWNER_MATCH — buyerUserId ตั้งแล้วตรงกับ session", () => {
    const decision = resolveOrderAccess(
      baseOrder({ buyerUserId: "user-1" }),
      baseSession({ userId: "user-1" }),
    );
    expect(decision).toEqual({ kind: "OWNER_MATCH" });
  });

  it("OWNER_MISMATCH — buyerUserId ตั้งแล้วแต่ไม่ตรง session", () => {
    const decision = resolveOrderAccess(
      baseOrder({ buyerUserId: "user-2" }),
      baseSession({ userId: "user-1" }),
    );
    expect(decision).toEqual({ kind: "OWNER_MISMATCH" });
  });

  it("OPEN_CLAIM — buyerUserId ว่าง, buyerContact ว่าง, status PENDING", () => {
    const decision = resolveOrderAccess(
      baseOrder({ buyerUserId: null, buyerContact: null, status: "PENDING" }),
      baseSession(),
    );
    expect(decision).toEqual({ kind: "OPEN_CLAIM" });
  });

  it("LEGACY_NO_CLAIM — buyerContact เป็นอีเมล (normalizePhone ล้มเหลว)", () => {
    const decision = resolveOrderAccess(
      baseOrder({ buyerUserId: null, buyerContact: "buyer@example.com", status: "PENDING" }),
      baseSession(),
    );
    expect(decision).toEqual({ kind: "LEGACY_NO_CLAIM" });
  });

  it("LEGACY_NO_CLAIM — buyerContact null แต่ status ไม่ใช่ PENDING (defensive)", () => {
    const decision = resolveOrderAccess(
      baseOrder({ buyerUserId: null, buyerContact: null, status: "SHIPPED" }),
      baseSession(),
    );
    expect(decision).toEqual({ kind: "LEGACY_NO_CLAIM" });
  });

  it("OTP_CLAIM_BLOCKED — session ไม่มีเบอร์เลย", () => {
    const decision = resolveOrderAccess(
      baseOrder({ buyerUserId: null, buyerContact: "0812345678" }),
      baseSession({ phone: null }),
    );
    expect(decision).toEqual({ kind: "OTP_CLAIM_BLOCKED" });
  });

  it("OTP_CLAIM_BLOCKED — session มีเบอร์แต่ไม่ตรงกับ buyerContact", () => {
    const decision = resolveOrderAccess(
      baseOrder({ buyerUserId: null, buyerContact: "0812345678" }),
      baseSession({ phone: "0899999999" }),
    );
    expect(decision).toEqual({ kind: "OTP_CLAIM_BLOCKED" });
  });

  it("PHONE_MATCH_AUTO_CLAIM — เบอร์ตรงและอยู่ใน skip-window", () => {
    const decision = resolveOrderAccess(
      baseOrder({ buyerUserId: null, buyerContact: "0812345678" }),
      baseSession({ phone: "0812345678", justAuthedViaPhoneOtp: true }),
    );
    expect(decision).toEqual({ kind: "PHONE_MATCH_AUTO_CLAIM" });
  });

  it("OTP_CLAIM_REQUIRED — เบอร์ตรงแต่นอก skip-window", () => {
    const decision = resolveOrderAccess(
      baseOrder({ buyerUserId: null, buyerContact: "0812345678" }),
      baseSession({ phone: "0812345678", justAuthedViaPhoneOtp: false }),
    );
    expect(decision).toEqual({ kind: "OTP_CLAIM_REQUIRED", targetPhone: "0812345678" });
  });
});
