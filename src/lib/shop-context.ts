import { prisma } from "@/lib/prisma";

/** getPersonalShop — SSOT helper แทน `user.shop` singular หลัง Phase 2 cutover
 *  ก่อน Phase 2: prisma.shop.findUnique({where:{userId}}) ก็ได้ผลเดียวกัน (userId ยัง @unique เต็ม)
 *  หลัง Phase 2: userId ไม่ unique เต็มอีกต่อไป — ต้องกรอง kind='PERSONAL' เสมอ (partial-unique DB constraint
 *  รับประกันว่า findFirst จะได้ไม่เกิน 1 แถวจริง) — ใช้ signature เดียวกันได้ทั้ง 2 ช่วง ไม่ต้องแก้ call-site ซ้ำ
 */
export async function getPersonalShop(userId: string) {
  return prisma.shop.findFirst({ where: { userId, kind: "PERSONAL" } });
}

export async function isShopMember(shopId: string, userId: string): Promise<boolean> {
  const m = await prisma.shopMember.findUnique({
    where: { shopId_userId: { shopId, userId } },
    select: { shopId: true },
  });
  return m !== null;
}

/** canAccessShop — user เข้าถึงร้านนี้ได้ไหม: เป็นเจ้าของ (PERSONAL/BUSINESS owner ที่อาจไม่มีแถว
 *  ShopMember) หรือเป็นสมาชิก (BUSINESS admin/staff) — ครอบทั้งสองกรณีในที่เดียว
 *  ใช้เป็น ownership guard ของฟีเจอร์แชท (feature 00018): เดิม assertParticipant/sendOutboundMessage
 *  เช็คแค่ shop.userId === actorUserId = "เจ้าของเท่านั้น" → BUSINESS admin (ไม่ใช่ owner) เปิด/ตอบ
 *  แชทของร้านตัวเองไม่ได้ (bug จริงบน prod: เพจถูกย้ายไปร้าน BUSINESS แล้ว user เป็น ADMIN) */
export async function canAccessShop(shopId: string, userId: string): Promise<boolean> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { userId: true } });
  if (!shop) return false;
  if (shop.userId === userId) return true; // เจ้าของร้าน (PERSONAL หรือ BUSINESS owner)
  return isShopMember(shopId, userId); // BUSINESS admin/staff
}

/**
 * listAccessibleShopIds — ทุกร้านที่ user เข้าถึงได้ (เจ้าของ + ที่ถูกเชิญเป็นสมาชิก)
 *
 * ทำไมต้องมี: canAccessShop() ตอบได้แค่ "ร้านนี้เข้าได้ไหม" ซึ่งใช้เป็น post-check เท่านั้น
 * บางเคสต้องค้นของ "ข้ามร้าน" โดยยังคง scope สิทธิ์ไว้ใน WHERE ตั้งแต่ query แรก
 * (feedback_rsc_dal_authz — ห้ามดึงมาก่อนแล้วค่อยเช็ค) เช่นการหาว่าเธรดแชทที่กดมาจาก
 * notification เป็นของร้านไหน ทั้งที่ยังไม่รู้ว่าร้านไหน
 *
 * กรอง deletedAt/purgedAt ออก — ร้านที่ถูกลบไม่ควรถูกค้นเจอผ่านทางไหนทั้งสิ้น
 * (มิเรอร์ตัวกรองเดียวกับ shop.service.ts บรรทัด 77/158)
 */
export async function listAccessibleShopIds(userId: string): Promise<string[]> {
  const [owned, memberships] = await Promise.all([
    prisma.shop.findMany({
      where: { userId, deletedAt: null, purgedAt: null },
      select: { id: true },
    }),
    prisma.shopMember.findMany({
      where: { userId, shop: { deletedAt: null, purgedAt: null } },
      select: { shopId: true },
    }),
  ]);
  // Set — owner ของร้าน BUSINESS มีแถว ShopMember ของตัวเองด้วย จะซ้ำถ้าไม่ dedupe
  return [...new Set([...owned.map((s) => s.id), ...memberships.map((m) => m.shopId)])];
}

export interface ActiveShopContext {
  shopId: string;
  kind: "PERSONAL" | "BUSINESS";
  role: "OWNER" | "ADMIN";
  locked: boolean;
  lockReason: string | null;
}

/** resolveActiveShopContext — ใช้ใน page/route ที่ต้อง operate บน "shop ปัจจุบัน" ของ session
 *  ไม่ trust session.user.activeShopId เปล่า ๆ — re-verify membership เสมอ (defense-in-depth, TFR-013)
 */
export async function resolveActiveShopContext(session: {
  user: { id: string; activeShopId?: string | null };
}): Promise<ActiveShopContext | null> {
  const shopId = session.user.activeShopId;
  if (!shopId) {
    const personal = await getPersonalShop(session.user.id);
    if (!personal) return null;
    return { shopId: personal.id, kind: "PERSONAL", role: "OWNER", locked: false, lockReason: null };
  }
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, kind: true, userId: true, packageLockedAt: true, packageLockReason: true, deletedAt: true },
  });
  if (!shop || shop.deletedAt) return null; // soft-deleted/ไม่มี → fallback caller ควรพากลับ Personal
  if (shop.kind === "PERSONAL") {
    if (shop.userId !== session.user.id) return null; // ไม่ควรเกิด (Personal เป็นของ user เดียวเสมอ) — defense
    return { shopId: shop.id, kind: "PERSONAL", role: "OWNER", locked: false, lockReason: null };
  }
  // BUSINESS — verify membership จริง (ไม่ trust JWT เพียงอย่างเดียว)
  const member = await prisma.shopMember.findUnique({
    where: { shopId_userId: { shopId: shop.id, userId: session.user.id } },
    select: { role: true },
  });
  if (!member) return null;
  return {
    shopId: shop.id, kind: "BUSINESS", role: member.role as "OWNER" | "ADMIN",
    locked: shop.packageLockedAt !== null, lockReason: shop.packageLockReason,
  };
}

type ShopRow = NonNullable<Awaited<ReturnType<typeof getPersonalShop>>>;

export interface ActiveShop {
  /** Shop row เต็ม (id/shopName/logo/slug/... ) ของ active context — ใช้แทน getShopByUserId เดิม */
  shop: ShopRow;
  kind: "PERSONAL" | "BUSINESS";
  role: "OWNER" | "ADMIN";
  /** true = Business ถูก package lock (read-only) — page/route ต้อง gate mutation */
  locked: boolean;
  lockReason: string | null;
}

/** requireActiveShop — Phase 4: resolve "shop ที่ active อยู่" ของ seller (Personal หรือ Business ตาม
 *  session.user.activeShopId + verify membership) แล้วคืน Shop row เต็ม เพื่อใช้แทน `getShopByUserId(userId)` เดิม.
 *  - active context resolve ไม่ได้ (activeShopId ชี้ shop ที่ถูกลบ/หลุด membership) → fallback Personal (fail-closed)
 *  - ไม่มี Personal shop เลย (seller ใหม่ก่อน layout auto-create) → null (caller redirect/handle)
 *  - คืน `locked` ให้ page/route gate การสร้าง/แก้ (Business ที่โดน package lock = read-only)
 *  หมายเหตุ: ใช้เฉพาะหน้า "workspace ของ seller" — billing/onboarding/public ต้องคง getPersonalShop (Phase 4 KEEP-PERSONAL)
 */
export async function requireActiveShop(
  // permissive: รับ Session ตรง ๆ ได้ (NextAuth Session.user ไม่ประกาศ id/activeShopId — project ไม่มี d.ts
  // augmentation) โดยไม่ต้อง cast ที่ caller. extract แบบ null-safe ภายใน
  session: { user?: { id?: string | null; activeShopId?: string | null } | null } | null,
): Promise<ActiveShop | null> {
  const userId = session?.user?.id;
  if (!userId) return null;
  const ctx = await resolveActiveShopContext({
    user: { id: userId, activeShopId: session?.user?.activeShopId ?? null },
  });
  let meta = ctx;
  if (!meta) {
    // fallback → Personal (เช่น activeShopId ชี้ business ที่หลุด membership/ถูกลบ)
    const personal = await getPersonalShop(userId);
    if (!personal) return null;
    meta = { shopId: personal.id, kind: "PERSONAL", role: "OWNER", locked: false, lockReason: null };
  }
  const shop = await prisma.shop.findUnique({ where: { id: meta.shopId } });
  if (!shop) return null;
  return { shop, kind: meta.kind, role: meta.role, locked: meta.locked, lockReason: meta.lockReason };
}

/** ensurePersonalShop — invariant "ทุก seller มี Personal shop" (D1). resolve Personal, ถ้าไม่มี → สร้าง.
 *  แยกจาก requireActiveShop เพื่อให้ layout เรียกก่อน (guarantee Personal มีอยู่) แล้วค่อย resolve active.
 *  หมายเหตุ: auto-create เฉพาะ PERSONAL — Business ไม่เคย auto-create (สร้างผ่าน createBusinessShop เท่านั้น)
 */
export async function ensurePersonalShop(userId: string): Promise<ShopRow> {
  const existing = await getPersonalShop(userId);
  if (existing) return existing;
  // ตรง pattern auto-create เดิมของ seller layout (shopName = "ร้านของ {displayName}")
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
  return prisma.shop.create({
    data: {
      userId,
      kind: "PERSONAL",
      shopName: `ร้านของ ${user?.displayName ?? "ฉัน"}`,
      businessType: "INDIVIDUAL",
    },
  });
}
