import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * เทสของ resolveChatScope + ตระกูลเดียวกัน (feature 00037 + 00071 P3 S-13)
 *
 * สิ่งที่ต้องมีเทสจริง ๆ เพราะ "พังเงียบ" (tsc/build/หน้าจอไม่ฟ้อง):
 *  1. ขอบเขตร้านผิด → เห็นแชทร้านที่ไม่ควรเห็น หรือไม่เห็นร้านที่ควรเห็น
 *  2. ตัวกรองร้านที่ client ส่งมานอกขอบเขต → ห้ามเพิกเฉยแล้วคืนทั้งก้อน
 *  3. (00071) ร้านที่ผู้ใช้เป็น BILLING/TECHNICIAN ต้องไม่เข้าขอบเขตแชทเลย — ทั้งโหมดร้านเดียว/รวม, ทั้งที่ shopId ถูกยิงมาตรง ๆ
 *
 * mock prisma ทั้งหมด — ห้ามต่อ DB จริง (HR13) · "โลกจำลอง" ด้านล่างให้ทุก query ตอบสอดคล้องกัน
 * (ร้านเดียวถูกอ่านผ่าน findUnique/findMany/shopMember คนละทางได้ค่าเดียวกัน) เพื่อไม่ให้เทสเขียวเพราะ mock ไม่ตรงกัน
 */

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  shop: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  shopMember: { findUnique: vi.fn(), findMany: vi.fn() },
  conversation: { findFirst: vi.fn(), findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  resolveChatScope,
  resolveScopedShopId,
  resolveConversationShopId,
  chatScopeOrDeny,
  userIdsHoldingCap,
  assertShopsHoldCap,
  intersectScopedShopIds,
  normalizeChatScopeMode,
} from "@/lib/chat-scope";

const USER = "user-1";
const PERSONAL = "shop-personal";
const SHOP_A = "shop-a";
const SHOP_B = "shop-b";
const SHOP_C = "shop-c";

type World = Record<
  string,
  { kind: "PERSONAL" | "BUSINESS"; vertical: string; owner: string; role?: "OWNER" | "ADMIN"; roles?: string[]; locked?: boolean }
>;

/** จัดโลกจำลอง: ผู้ใช้ USER เป็นสมาชิกร้านไหนด้วยบทบาทอะไร (ไม่อยู่ใน world = ไม่ใช่สมาชิก) */
function setWorld(world: World, mode: "SINGLE" | "UNIFIED" = "SINGLE") {
  prismaMock.user.findUnique.mockResolvedValue({ chatScopeMode: mode });
  prismaMock.shop.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const w = world[where.id];
    return w
      ? {
          id: where.id, kind: w.kind, userId: w.owner, vertical: w.vertical,
          packageLockedAt: w.locked ? new Date("2026-08-01") : null,
          packageLockReason: w.locked ? "RENEWAL_FAILED" : null, deletedAt: null,
        }
      : null;
  });
  prismaMock.shop.findFirst.mockImplementation(async () => {
    const id = Object.keys(world).find((k) => world[k].kind === "PERSONAL");
    return id ? { id, vertical: world[id].vertical } : null;
  });
  prismaMock.shopMember.findUnique.mockImplementation(async ({ where }: { where: { shopId_userId: { shopId: string } } }) => {
    const w = world[where.shopId_userId.shopId];
    return w && w.kind === "BUSINESS" ? { role: w.role ?? "ADMIN", roles: w.roles ?? [] } : null;
  });
  prismaMock.shop.findMany.mockImplementation(async () =>
    Object.entries(world).map(([id, w]) => ({
      id, userId: w.owner, kind: w.kind, vertical: w.vertical,
      members: w.kind === "BUSINESS" ? [{ role: w.role ?? "ADMIN", roles: w.roles ?? [] }] : [],
    })),
  );
}

const ses = (activeShopId: string | null) => ({ user: { id: USER, activeShopId } });

/** ร้านบริการ (BILLING ยังมีผล) / ร้านทั่วไป (BILLING ถูกตัดทิ้ง BR-RP-07) */
const SVC = "SERVICE_QUEUE";
const GEN = "ONLINE_SALES";

beforeEach(() => {
  vi.resetAllMocks();
  prismaMock.conversation.findFirst.mockResolvedValue(null);
  prismaMock.conversation.findUnique.mockResolvedValue(null);
});

describe("resolveChatScope — โหมดและขอบเขตพื้นฐาน (00037)", () => {
  it("SINGLE — ขอบเขตเป็นร้านที่ active ร้านเดียว และไม่ไปถามรายชื่อร้านทั้งหมด", async () => {
    setWorld({ [SHOP_A]: { kind: "BUSINESS", vertical: GEN, owner: "x", role: "OWNER" } });
    const scope = await resolveChatScope(ses(SHOP_A), "H1");
    expect(scope!.mode).toBe("SINGLE");
    expect(scope!.shopIds).toEqual([SHOP_A]);
    expect(scope!.activeShopId).toBe(SHOP_A);
    // NFR: โหมดเดิมต้องไม่เพิ่ม query — ห้ามไล่ listAccessibleShopIds ทิ้งเปล่า
    expect(prismaMock.shop.findMany).not.toHaveBeenCalled();
  });

  it("UNIFIED — ครอบทุกร้านที่ถือ cap โดย activeShopId ไม่ขยับ (BR-UNI-07)", async () => {
    setWorld(
      {
        [PERSONAL]: { kind: "PERSONAL", vertical: GEN, owner: USER },
        [SHOP_A]: { kind: "BUSINESS", vertical: GEN, owner: "x", role: "OWNER" },
        [SHOP_B]: { kind: "BUSINESS", vertical: GEN, owner: "y", role: "ADMIN", roles: ["MANAGER"] },
      },
      "UNIFIED",
    );
    const scope = await resolveChatScope(ses(SHOP_A), "H1");
    expect(scope!.mode).toBe("UNIFIED");
    expect([...scope!.shopIds].sort()).toEqual([PERSONAL, SHOP_A, SHOP_B].sort());
    expect(scope!.activeShopId).toBe(SHOP_A);
  });

  it("UNIFIED แต่เข้าถึงร้านเดียว → ลดเป็น SINGLE (UI ข้างบนเช็คที่เดียวพอ)", async () => {
    setWorld({ [PERSONAL]: { kind: "PERSONAL", vertical: GEN, owner: USER } }, "UNIFIED");
    const scope = await resolveChatScope(ses(PERSONAL), "H1");
    expect(scope!.mode).toBe("SINGLE");
    expect(scope!.storedMode).toBe("UNIFIED");
    expect(scope!.shopIds).toEqual([PERSONAL]);
  });

  it("ร้านที่ active ถูกลบ/หลุดสิทธิ์ → null (ห้าม fallback เงียบ ๆ ไป PERSONAL)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ chatScopeMode: "UNIFIED" });
    prismaMock.shop.findUnique.mockResolvedValue({
      id: SHOP_A, kind: "BUSINESS", userId: "x", vertical: GEN, packageLockedAt: null, packageLockReason: null,
      deletedAt: new Date("2026-08-01"),
    });
    expect(await resolveChatScope(ses(SHOP_A), "H1")).toBeNull();
  });

  it("ไม่มี session → null", async () => {
    expect(await resolveChatScope(null, "H1")).toBeNull();
    expect(await resolveChatScope({ user: { id: null } }, "H1")).toBeNull();
  });

  it("ค่าประหลาดในคอลัมน์ → ตกเป็น SINGLE (fail-closed)", async () => {
    setWorld({ [SHOP_A]: { kind: "BUSINESS", vertical: GEN, owner: "x", role: "OWNER" } });
    prismaMock.user.findUnique.mockResolvedValue({ chatScopeMode: "ALL_SHOPS_PLEASE" });
    const scope = await resolveChatScope(ses(SHOP_A), "H1");
    expect(scope!.mode).toBe("SINGLE");
    expect(scope!.shopIds).toEqual([SHOP_A]);
  });

  it("แถว User หายไป (race กับการลบบัญชี) → ยังตอบได้แบบ SINGLE ไม่ throw", async () => {
    setWorld({ [SHOP_A]: { kind: "BUSINESS", vertical: GEN, owner: "x", role: "OWNER" } });
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect((await resolveChatScope(ses(SHOP_A), "H1"))!.mode).toBe("SINGLE");
  });

  it("สถานะ package lock ของร้าน active ถูกส่งต่อ (โหมดรวมห้ามปลดล็อกให้ใคร)", async () => {
    setWorld({ [SHOP_A]: { kind: "BUSINESS", vertical: GEN, owner: USER, role: "ADMIN", roles: ["MANAGER"], locked: true } });
    const scope = await resolveChatScope(ses(SHOP_A), "H1");
    expect(scope!.activeLocked).toBe(true);
    expect(scope!.activeLockReason).toBe("RENEWAL_FAILED");
    expect(scope!.activeRole).toBe("ADMIN");
  });
});

describe("resolveChatScope — บทบาท × capability (00071 S-13)", () => {
  const one = (role: "OWNER" | "ADMIN", roles: string[], vertical = GEN): World => ({
    [SHOP_A]: { kind: "BUSINESS", vertical, owner: "x", role, roles },
  });

  it.each([
    ["เจ้าของ", "OWNER", [], GEN, true],
    ["ผู้ดูแล MANAGER", "ADMIN", ["MANAGER"], GEN, true],
    ["ผู้ดูแล CHAT", "ADMIN", ["CHAT"], GEN, true],
    ["ผู้ดูแล BILLING (ร้านบริการ)", "ADMIN", ["BILLING"], SVC, false],
    ["ผู้ดูแล TECHNICIAN", "ADMIN", ["TECHNICIAN"], SVC, false],
    ["ผู้ดูแล BILLING ในร้านที่ขายบริการไม่ได้ (บทบาทถูกตัดทิ้ง)", "ADMIN", ["BILLING"], GEN, false],
    ["ผู้ดูแลที่ roles ว่าง (ไม่มีค่าตั้งต้นที่เปิด)", "ADMIN", [], GEN, false],
  ] as const)("H1 · %s → ถือ cap = %s", async (_n, role, roles, vertical, has) => {
    setWorld(one(role, [...roles], vertical));
    const scope = await resolveChatScope(ses(SHOP_A), "H1");
    expect(scope!.activeHasCap).toBe(has);
    expect(scope!.shopIds).toEqual(has ? [SHOP_A] : []);
  });

  it("H3: CHAT ไม่ถือ (ตั้งค่า/เชื่อมช่องทางเป็นของเจ้าของ+ผู้ดูแล) · MANAGER ถือ", async () => {
    setWorld(one("ADMIN", ["CHAT"]));
    expect((await resolveChatScope(ses(SHOP_A), "H3"))!.activeHasCap).toBe(false);
    setWorld(one("ADMIN", ["MANAGER"]));
    expect((await resolveChatScope(ses(SHOP_A), "H3"))!.activeHasCap).toBe(true);
  });

  it("ร้านส่วนตัว (PERSONAL) = เจ้าของเสมอ ถือทุก cap", async () => {
    setWorld({ [PERSONAL]: { kind: "PERSONAL", vertical: GEN, owner: USER } });
    for (const cap of ["H1", "H2", "H3", "X2", "X3"] as const) {
      expect((await resolveChatScope(ses(PERSONAL), cap))!.activeHasCap).toBe(true);
    }
  });

  it("[blocker] UNIFIED: CHAT ที่ร้าน A · BILLING ที่ร้าน B · MANAGER ที่ร้าน C → ขอบเขตมีแค่ A กับ C", async () => {
    const world: World = {
      [SHOP_A]: { kind: "BUSINESS", vertical: GEN, owner: "x", role: "ADMIN", roles: ["CHAT"] },
      [SHOP_B]: { kind: "BUSINESS", vertical: SVC, owner: "y", role: "ADMIN", roles: ["BILLING"] },
      [SHOP_C]: { kind: "BUSINESS", vertical: GEN, owner: "z", role: "ADMIN", roles: ["MANAGER"] },
    };
    setWorld(world, "UNIFIED");
    const fromA = await resolveChatScope(ses(SHOP_A), "H1");
    expect([...fromA!.shopIds].sort()).toEqual([SHOP_A, SHOP_C]);
    expect(fromA!.activeHasCap).toBe(true);
    expect(fromA!.mode).toBe("UNIFIED");

    // active อยู่ร้าน B (ที่ไม่ถือ cap): ขอบเขตยังเป็น A,C แต่ activeHasCap = false → ห้ามใช้ B เป็นค่าตั้งต้นของ action ใด ๆ
    const fromB = await resolveChatScope(ses(SHOP_B), "H1");
    expect([...fromB!.shopIds].sort()).toEqual([SHOP_A, SHOP_C]);
    expect(fromB!.activeHasCap).toBe(false);
  });

  it("[blocker] SINGLE + ร้าน active ไม่ถือ cap → shopIds ว่าง (ไม่แอบใส่ร้าน active)", async () => {
    setWorld(one("ADMIN", ["TECHNICIAN"], SVC), "SINGLE");
    const scope = await resolveChatScope(ses(SHOP_A), "H1");
    expect(scope!.shopIds).toEqual([]);
    expect(scope!.activeHasCap).toBe(false);
  });

  it("[blocker] UNIFIED + ร้าน active ไม่ถือ cap และไม่มีร้านไหนถือ → ว่าง (ไม่ยัด active กลับเข้ามาแบบเดิม)", async () => {
    setWorld({ [SHOP_B]: { kind: "BUSINESS", vertical: SVC, owner: "y", role: "ADMIN", roles: ["BILLING"] } }, "UNIFIED");
    const scope = await resolveChatScope(ses(SHOP_B), "H1");
    expect(scope!.shopIds).toEqual([]);
  });
});

describe("chatScopeOrDeny", () => {
  it("null → 404 · ว่าง → 403 FORBIDDEN_ROLE · มีร้าน → scope", async () => {
    const nf = chatScopeOrDeny(null);
    expect("response" in nf && nf.response.status).toBe(404);

    setWorld({ [SHOP_A]: { kind: "BUSINESS", vertical: SVC, owner: "x", role: "ADMIN", roles: ["BILLING"] } });
    const denied = chatScopeOrDeny(await resolveChatScope(ses(SHOP_A), "H1"));
    expect("response" in denied && denied.response.status).toBe(403);
    expect("response" in denied && (await denied.response.json())).toEqual({ error: "FORBIDDEN_ROLE" });

    setWorld({ [SHOP_A]: { kind: "BUSINESS", vertical: GEN, owner: "x", role: "OWNER" } });
    const ok = chatScopeOrDeny(await resolveChatScope(ses(SHOP_A), "H1"));
    expect("scope" in ok && ok.scope.shopIds).toEqual([SHOP_A]);
  });
});

describe("resolveScopedShopId (00071)", () => {
  const world: World = {
    [SHOP_A]: { kind: "BUSINESS", vertical: GEN, owner: "x", role: "ADMIN", roles: ["CHAT"] },
    [SHOP_B]: { kind: "BUSINESS", vertical: SVC, owner: "y", role: "ADMIN", roles: ["BILLING"] },
  };

  it("ไม่ส่ง shopId + ร้าน active ถือ cap → ใช้ร้าน active", async () => {
    setWorld(world, "UNIFIED");
    const r = await resolveScopedShopId(ses(SHOP_A), null, "X2");
    expect(r && !("denied" in r) && r.shopId).toBe(SHOP_A);
  });

  it("[blocker] ไม่ส่ง shopId + ร้าน active ไม่ถือ cap → denied (ห้ามใช้ร้าน active เป็นค่าตั้งต้น แม้ผู้ใช้ถือ cap ที่ร้านอื่น)", async () => {
    setWorld(world, "UNIFIED");
    expect(await resolveScopedShopId(ses(SHOP_B), undefined, "X2")).toEqual({ denied: true });
  });

  it("[blocker] ส่ง ?shopId= ของร้านที่เป็นสมาชิกแต่ไม่ถือ cap → denied (403) แม้อยู่โหมดรวม", async () => {
    setWorld(world, "UNIFIED");
    expect(await resolveScopedShopId(ses(SHOP_A), SHOP_B, "X2")).toEqual({ denied: true });
  });

  it("ส่ง ?shopId= ของร้านที่ไม่ใช่สมาชิกเลย → null (404 ไม่ยืนยันว่าร้านมีจริง)", async () => {
    setWorld(world, "UNIFIED");
    expect(await resolveScopedShopId(ses(SHOP_A), "shop-stranger", "X2")).toBeNull();
  });

  it("ส่ง ?shopId= ร้านที่ถือ cap อยู่ในขอบเขต → ใช้ร้านนั้น", async () => {
    setWorld(
      { ...world, [SHOP_C]: { kind: "BUSINESS", vertical: GEN, owner: "z", role: "ADMIN", roles: ["MANAGER"] } },
      "UNIFIED",
    );
    const r = await resolveScopedShopId(ses(SHOP_A), SHOP_C, "X2");
    expect(r && !("denied" in r) && r.shopId).toBe(SHOP_C);
  });
});

describe("resolveConversationShopId (00071)", () => {
  const world: World = {
    [SHOP_A]: { kind: "BUSINESS", vertical: GEN, owner: "x", role: "ADMIN", roles: ["CHAT"] },
    [SHOP_B]: { kind: "BUSINESS", vertical: SVC, owner: "y", role: "ADMIN", roles: ["BILLING"] },
  };

  it("[blocker] scope สิทธิ์อยู่ใน WHERE — ร้านที่ไม่ถือ cap ไม่อยู่ใน shopId IN (...)", async () => {
    setWorld(world, "UNIFIED");
    await resolveConversationShopId(ses(SHOP_A), "conv-1", "H1");
    const where = prismaMock.conversation.findFirst.mock.calls[0][0].where as { shopId: { in: string[] } };
    expect(where.shopId.in).toEqual([SHOP_A]);
  });

  it("เธรดอยู่ร้านที่ถือ cap → ได้ shopId ของเธรด", async () => {
    setWorld(world, "UNIFIED");
    prismaMock.conversation.findFirst.mockResolvedValue({ shopId: SHOP_A });
    const r = await resolveConversationShopId(ses(SHOP_A), "conv-1", "H2");
    expect(r && !("denied" in r) && r.shopId).toBe(SHOP_A);
  });

  it("[blocker] เธรดอยู่ร้านที่เป็นสมาชิกแต่ไม่ถือ cap → denied (403 ไม่ใช่ 404)", async () => {
    setWorld(world, "UNIFIED");
    prismaMock.conversation.findUnique.mockResolvedValue({ shopId: SHOP_B });
    expect(await resolveConversationShopId(ses(SHOP_A), "conv-b", "H1")).toEqual({ denied: true });
  });

  it("เธรดอยู่ร้านที่ไม่ใช่สมาชิก / ไม่มีเธรด → null (404 ไม่รั่วว่ามีอยู่)", async () => {
    setWorld(world, "UNIFIED");
    prismaMock.conversation.findUnique.mockResolvedValue({ shopId: "shop-stranger" });
    expect(await resolveConversationShopId(ses(SHOP_A), "conv-x", "H1")).toBeNull();
    prismaMock.conversation.findUnique.mockResolvedValue(null);
    expect(await resolveConversationShopId(ses(SHOP_A), "conv-none", "H1")).toBeNull();
  });
});

describe("userIdsHoldingCap / assertShopsHoldCap (00071)", () => {
  it("เลือกเฉพาะผู้ใช้ที่ถือ cap ต่อร้าน · BILLING/TECHNICIAN ไม่ติด H1 · CHAT ไม่ติด H3", async () => {
    prismaMock.shop.findMany.mockResolvedValue([
      {
        id: SHOP_A, userId: "owner", kind: "BUSINESS", vertical: SVC,
        members: [
          { userId: "owner", role: "OWNER", roles: [] },
          { userId: "mgr", role: "ADMIN", roles: ["MANAGER"] },
          { userId: "chat", role: "ADMIN", roles: ["CHAT"] },
          { userId: "bill", role: "ADMIN", roles: ["BILLING"] },
          { userId: "tech", role: "ADMIN", roles: ["TECHNICIAN"] },
        ],
      },
      { id: SHOP_B, userId: "solo", kind: "PERSONAL", vertical: GEN, members: [] },
    ]);
    const h1 = await userIdsHoldingCap([SHOP_A, SHOP_B], "H1");
    expect([...h1.get(SHOP_A)!].sort()).toEqual(["chat", "mgr", "owner"]);
    expect([...h1.get(SHOP_B)!]).toEqual(["solo"]);
    const h3 = await userIdsHoldingCap([SHOP_A], "H3");
    expect([...h3.get(SHOP_A)!].sort()).toEqual(["mgr", "owner"]);
  });

  it("assertShopsHoldCap โยน ForbiddenRoleError (FORBIDDEN_ROLE) เมื่อมีร้านใดไม่ถือ cap", async () => {
    prismaMock.shop.findMany.mockResolvedValue([
      { id: SHOP_A, userId: "x", kind: "BUSINESS", vertical: GEN, members: [{ role: "ADMIN", roles: ["CHAT"] }] },
      { id: SHOP_B, userId: "y", kind: "BUSINESS", vertical: SVC, members: [{ role: "ADMIN", roles: ["BILLING"] }] },
    ]);
    await expect(assertShopsHoldCap([SHOP_A], USER, "H1")).resolves.toBeUndefined();
    const err = await assertShopsHoldCap([SHOP_A, SHOP_B], USER, "H1").catch((e) => e);
    expect(err.code).toBe("FORBIDDEN_ROLE");
    expect(err.message).toBe("FORBIDDEN");
  });
});

describe("intersectScopedShopIds (BR-UNI-02)", () => {
  const scope = [SHOP_A, SHOP_B];

  it("ไม่ส่งตัวกรองมา → ได้ทั้งขอบเขต", () => {
    expect(intersectScopedShopIds(scope)).toEqual(scope);
    expect(intersectScopedShopIds(scope, null)).toEqual(scope);
    expect(intersectScopedShopIds(scope, "")).toEqual(scope);
    expect(intersectScopedShopIds(scope, [])).toEqual(scope);
  });

  it("กรองร้านที่อยู่ในขอบเขต → ได้เฉพาะร้านนั้น", () => {
    expect(intersectScopedShopIds(scope, SHOP_B)).toEqual([SHOP_B]);
    expect(intersectScopedShopIds(scope, [SHOP_A, SHOP_B])).toEqual([SHOP_A, SHOP_B]);
  });

  it("ยิงรหัสร้านที่ไม่มีสิทธิ์ → ผลว่าง ไม่ใช่ทั้งขอบเขต และไม่ใช่ร้านนั้น", () => {
    expect(intersectScopedShopIds(scope, "shop-ที่ไม่ใช่ของเรา")).toEqual([]);
    expect(intersectScopedShopIds(scope, [PERSONAL, "another-stranger"])).toEqual([]);
  });

  it("ส่งมาปนกันทั้งในและนอกขอบเขต → เหลือเฉพาะที่อยู่ในขอบเขต", () => {
    expect(intersectScopedShopIds(scope, [SHOP_A, "stranger"])).toEqual([SHOP_A]);
  });

  it("[blocker 00071] ?shopId= ของร้านที่ไม่ถือ cap ไม่อยู่ในขอบเขตตั้งแต่ต้น → ผลว่าง (ไม่ผ่านด่านด้วยการระบุร้านตรง ๆ)", async () => {
    setWorld(
      {
        [SHOP_A]: { kind: "BUSINESS", vertical: GEN, owner: "x", role: "ADMIN", roles: ["CHAT"] },
        [SHOP_B]: { kind: "BUSINESS", vertical: SVC, owner: "y", role: "ADMIN", roles: ["BILLING"] },
      },
      "UNIFIED",
    );
    const s = await resolveChatScope(ses(SHOP_A), "H1");
    expect(intersectScopedShopIds(s!.shopIds, SHOP_B)).toEqual([]);
  });
});

describe("normalizeChatScopeMode", () => {
  it("รับเฉพาะ UNIFIED ตรงตัว ที่เหลือเป็น SINGLE", () => {
    expect(normalizeChatScopeMode("UNIFIED")).toBe("UNIFIED");
    expect(normalizeChatScopeMode("SINGLE")).toBe("SINGLE");
    expect(normalizeChatScopeMode("unified")).toBe("SINGLE");
    expect(normalizeChatScopeMode(undefined)).toBe("SINGLE");
    expect(normalizeChatScopeMode(null)).toBe("SINGLE");
    expect(normalizeChatScopeMode(1)).toBe("SINGLE");
  });
});
