import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * เทสของ resolveChatScope + intersectScopedShopIds (feature 00037)
 *
 * สองข้อที่ต้องมีเทสจริง ๆ เพราะ "พังเงียบ" ทั้งคู่ (tsc/build/หน้าจอไม่ฟ้อง):
 *  1. ขอบเขตร้านผิด → ผู้ใช้เห็นแชทของร้านที่ไม่ควรเห็น หรือไม่เห็นร้านที่ควรเห็น
 *  2. ตัวกรองร้านที่ client ส่งมานอกขอบเขต → ถ้าเผลอเพิกเฉยแล้วคืนทั้งขอบเขต จะกลายเป็น
 *     "กรองแล้วแต่ได้ทุกร้าน" ซึ่งดูเหมือนทำงานปกติจนกว่าจะมีคนสังเกตว่าตัวเลขไม่ตรง
 *
 * mock prisma ทั้งหมด — ห้ามต่อ DB จริงในเทส (HR13)
 */

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  shop: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  shopMember: { findUnique: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { resolveChatScope, intersectScopedShopIds, normalizeChatScopeMode } from "@/lib/chat-scope";

const USER = "user-1";
const PERSONAL = "shop-personal";
const BIZ_A = "shop-biz-a";
const BIZ_B = "shop-biz-b";

/** จัด mock ให้ resolveActiveShopContext (lib/shop-context) resolve ได้ตามร้านที่ระบุ */
function mockActiveShop(shopId: string, kind: "PERSONAL" | "BUSINESS" = "BUSINESS") {
  prismaMock.shop.findUnique.mockResolvedValue({
    id: shopId,
    kind,
    userId: USER,
    packageLockedAt: null,
    packageLockReason: null,
    deletedAt: null,
  });
  prismaMock.shopMember.findUnique.mockResolvedValue({ role: "OWNER" });
}

/** จัด mock ให้ listAccessibleShopIds คืนร้านตามที่ระบุ (owned + membership) */
function mockAccessible(owned: string[], memberOf: string[] = []) {
  prismaMock.shop.findMany.mockResolvedValue(owned.map((id) => ({ id })));
  prismaMock.shopMember.findMany.mockResolvedValue(memberOf.map((shopId) => ({ shopId })));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveChatScope", () => {
  it("SINGLE — ขอบเขตเป็นร้านที่ active ร้านเดียว และไม่ไปถามรายชื่อร้านทั้งหมด", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ chatScopeMode: "SINGLE" });
    mockActiveShop(BIZ_A);

    const scope = await resolveChatScope({ user: { id: USER, activeShopId: BIZ_A } });

    expect(scope).not.toBeNull();
    expect(scope!.mode).toBe("SINGLE");
    expect(scope!.shopIds).toEqual([BIZ_A]);
    expect(scope!.activeShopId).toBe(BIZ_A);
    // NFR: โหมดเดิมต้องไม่เพิ่ม query — ห้ามไปไล่ listAccessibleShopIds ทิ้งเปล่า
    expect(prismaMock.shop.findMany).not.toHaveBeenCalled();
    expect(prismaMock.shopMember.findMany).not.toHaveBeenCalled();
  });

  it("UNIFIED — ครอบทั้งร้านที่เป็นเจ้าของและร้านที่ถูกเชิญ โดย activeShopId ไม่ขยับ", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ chatScopeMode: "UNIFIED" });
    mockActiveShop(BIZ_A);
    mockAccessible([PERSONAL, BIZ_A], [BIZ_A, BIZ_B]); // BIZ_A ซ้ำ 2 ฝั่ง (owner ของ BUSINESS มีแถว member ด้วย)

    const scope = await resolveChatScope({ user: { id: USER, activeShopId: BIZ_A } });

    expect(scope!.mode).toBe("UNIFIED");
    expect([...scope!.shopIds].sort()).toEqual([BIZ_A, BIZ_B, PERSONAL].sort());
    expect(scope!.shopIds).toHaveLength(3); // dedupe แล้ว ไม่ใช่ 4
    expect(scope!.activeShopId).toBe(BIZ_A); // BR-UNI-07 — โหมดรวมห้ามขยับร้านที่ active
  });

  it("UNIFIED แต่เข้าถึงร้านเดียว → ลดเป็น SINGLE ตั้งแต่ที่ resolve (UI ข้างบนเช็คที่เดียวพอ)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ chatScopeMode: "UNIFIED" });
    mockActiveShop(PERSONAL, "PERSONAL");
    mockAccessible([PERSONAL], []);

    const scope = await resolveChatScope({ user: { id: USER, activeShopId: PERSONAL } });

    expect(scope!.mode).toBe("SINGLE"); // โหมดที่ "มีผลจริง"
    expect(scope!.storedMode).toBe("UNIFIED"); // แต่ยังจำได้ว่าผู้ใช้ตั้งอะไรไว้
    expect(scope!.shopIds).toEqual([PERSONAL]);
  });

  it("ร้านที่ active ถูกลบ/หลุดสิทธิ์ → คืน null (ห้าม fallback เงียบ ๆ ไป PERSONAL)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ chatScopeMode: "UNIFIED" });
    prismaMock.shop.findUnique.mockResolvedValue({
      id: BIZ_A,
      kind: "BUSINESS",
      userId: "someone-else",
      packageLockedAt: null,
      packageLockReason: null,
      deletedAt: new Date("2026-08-01"),
    });

    const scope = await resolveChatScope({ user: { id: USER, activeShopId: BIZ_A } });
    expect(scope).toBeNull();
  });

  it("ไม่มี session → null", async () => {
    expect(await resolveChatScope(null)).toBeNull();
    expect(await resolveChatScope({ user: { id: null } })).toBeNull();
  });

  it("ค่าประหลาดในคอลัมน์ → ตกเป็น SINGLE (fail-closed)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ chatScopeMode: "ALL_SHOPS_PLEASE" });
    mockActiveShop(BIZ_A);

    const scope = await resolveChatScope({ user: { id: USER, activeShopId: BIZ_A } });
    expect(scope!.mode).toBe("SINGLE");
    expect(scope!.shopIds).toEqual([BIZ_A]);
  });

  it("แถว User หายไป (race กับการลบบัญชี) → ยังตอบได้แบบ SINGLE ไม่ throw", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    mockActiveShop(BIZ_A);

    const scope = await resolveChatScope({ user: { id: USER, activeShopId: BIZ_A } });
    expect(scope!.mode).toBe("SINGLE");
  });

  it("สถานะ package lock ของร้าน active ถูกส่งต่อ (โหมดรวมห้ามปลดล็อกให้ใคร)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ chatScopeMode: "SINGLE" });
    prismaMock.shop.findUnique.mockResolvedValue({
      id: BIZ_A,
      kind: "BUSINESS",
      userId: USER,
      packageLockedAt: new Date("2026-08-01"),
      packageLockReason: "RENEWAL_FAILED",
      deletedAt: null,
    });
    prismaMock.shopMember.findUnique.mockResolvedValue({ role: "ADMIN" });

    const scope = await resolveChatScope({ user: { id: USER, activeShopId: BIZ_A } });
    expect(scope!.activeLocked).toBe(true);
    expect(scope!.activeLockReason).toBe("RENEWAL_FAILED");
    expect(scope!.activeRole).toBe("ADMIN");
  });
});

describe("intersectScopedShopIds (BR-UNI-02)", () => {
  const scope = [BIZ_A, BIZ_B];

  it("ไม่ส่งตัวกรองมา → ได้ทั้งขอบเขต", () => {
    expect(intersectScopedShopIds(scope)).toEqual(scope);
    expect(intersectScopedShopIds(scope, null)).toEqual(scope);
    expect(intersectScopedShopIds(scope, "")).toEqual(scope);
    expect(intersectScopedShopIds(scope, [])).toEqual(scope);
  });

  it("กรองร้านที่อยู่ในขอบเขต → ได้เฉพาะร้านนั้น", () => {
    expect(intersectScopedShopIds(scope, BIZ_B)).toEqual([BIZ_B]);
    expect(intersectScopedShopIds(scope, [BIZ_A, BIZ_B])).toEqual([BIZ_A, BIZ_B]);
  });

  it("ยิงรหัสร้านที่ไม่มีสิทธิ์ → ผลว่าง ไม่ใช่ทั้งขอบเขต และไม่ใช่ร้านนั้น", () => {
    // ถ้าเผลอ return scope ทั้งก้อนเมื่อ intersect ว่าง จะกลายเป็น "กรองแล้วได้ทุกร้าน"
    // ซึ่งดูเหมือนทำงานปกติจนกว่าจะมีคนสังเกตว่าตัวเลขไม่ตรง
    expect(intersectScopedShopIds(scope, "shop-ที่ไม่ใช่ของเรา")).toEqual([]);
    expect(intersectScopedShopIds(scope, [PERSONAL, "another-stranger"])).toEqual([]);
  });

  it("ส่งมาปนกันทั้งในและนอกขอบเขต → เหลือเฉพาะที่อยู่ในขอบเขต", () => {
    expect(intersectScopedShopIds(scope, [BIZ_A, "stranger"])).toEqual([BIZ_A]);
  });
});

describe("normalizeChatScopeMode", () => {
  it("รับเฉพาะ UNIFIED ตรงตัว ที่เหลือเป็น SINGLE", () => {
    expect(normalizeChatScopeMode("UNIFIED")).toBe("UNIFIED");
    expect(normalizeChatScopeMode("SINGLE")).toBe("SINGLE");
    expect(normalizeChatScopeMode("unified")).toBe("SINGLE"); // case-sensitive โดยตั้งใจ
    expect(normalizeChatScopeMode(undefined)).toBe("SINGLE");
    expect(normalizeChatScopeMode(null)).toBe("SINGLE");
    expect(normalizeChatScopeMode(1)).toBe("SINGLE");
  });
});
