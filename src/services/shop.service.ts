import { prisma } from "@/lib/prisma";
import { ACTIVE_FORWARD_SHIPMENT } from '@/lib/shipment-direction'
import { isPublicNameTaken } from "@/lib/public-name";
import { countableOrderWhere } from "@/lib/public-order-count";
import { normalizeSlug, isValidSlugFormat, isReservedSlug } from "@/lib/shop-slug";
import { getTierScoreRange } from "@/lib/trust-tier";
import { computeCompletionRate, isRateExcludedCancellation } from "@/lib/order-stats";
import { isThaiCoordinate } from "@/lib/geo-thailand";
import { verifyPassword } from "@/lib/password";
import { verifyOtp } from "@/lib/otp";
import { normalizePayoutAccountNo, maskAccountNo, type UpdateShopPayoutInput } from "@/lib/shop-payout";

export async function createShop(userId: string, data: {
  shopName: string;
  description?: string;
  category?: string;
  address?: string;
  businessType: string;
  logo?: string; // fileId จาก /api/upload — เดิม CreateShopSchema strip ทิ้ง (B6 retro)
}) {
  // S-C4: shop.create + user.update(isShop) ต้อง atomic — เดิม 2 query แยก
  // partial-fail = shop มี แต่ isShop=false กู้ไม่ได้ (unique บล็อก recreate)
  return prisma.$transaction(async (tx) => {
    const shop = await tx.shop.create({
      data: { userId, ...data },
    });
    await tx.user.update({
      where: { id: userId },
      data: { isShop: true },
    });
    return shop;
  });
}

// IMPORTANT: allowlist นี้จงใจ "ไม่มี" vertical (feature 00017) — ประเภทกิจการตั้งได้ครั้งเดียว
// ตอนสร้างธุรกิจเท่านั้น เปลี่ยนภายหลังไม่ได้ (BR-LODG-30) เพราะการเปลี่ยนจะทำให้ห้องพัก/การจอง
// เดิมกลายเป็นข้อมูลกำพร้าที่ไม่มีหน้าจอรองรับ ห้ามเพิ่ม vertical เข้า type นี้
/** field ที่แก้ผ่าน updateShop ได้ — whitelist ระดับ runtime ไม่ใช่แค่ type
 *
 *  ทำไมต้องมี: PATCH /api/shops/[id] ส่ง body ที่ parse จาก request.json() (ชนิด any) เข้ามาตรง ๆ
 *  TypeScript จึงไม่ช่วยอะไรเลยที่ขอบเขตนั้น ถ้าปล่อยเข้า prisma.update ทั้งก้อน ผู้ที่เป็นสมาชิก
 *  ร้านจะเขียนทับคอลัมน์ไหนก็ได้ที่มีในตาราง เช่น userId (ย้ายเจ้าของ), kind, slug, deletedAt
 *  การ pick เฉพาะคีย์ที่อนุญาตปิดช่องนี้โดยไม่ต้องแก้ทุก caller
 */
const SHOP_UPDATABLE_FIELDS = [
  "shopName",
  "description",
  "logo",
  "coverImage",
  "category",
  "address",
  "businessType",
] as const;

type ShopUpdatableField = (typeof SHOP_UPDATABLE_FIELDS)[number];

export type ShopUpdateInput = Partial<Record<ShopUpdatableField, string>> & {
  latitude?: number | null;
  longitude?: number | null;
};

export async function updateShop(shopId: string, data: ShopUpdateInput) {
  const safe: Partial<Record<ShopUpdatableField, string>> & {
    latitude?: number;
    longitude?: number;
  } = {};
  for (const key of SHOP_UPDATABLE_FIELDS) {
    const value = (data as Record<string, unknown>)?.[key];
    if (typeof value === "string") safe[key] = value;
  }

  /**
   * พิกัดร้าน (เพิ่ม 2026-08-14) — ไม่ได้อยู่ใน SHOP_UPDATABLE_FIELDS เพราะ loop ข้างบนรับเฉพาะ
   * ค่าที่เป็น `string` ตามด่านความปลอดภัยเดิม (body มาจาก request.json() ชนิด any)
   *
   * ทำไมต้องเปิดให้แก้ทีหลังได้: ก่อนหน้านี้ **ไม่มีทางไหนในระบบแก้พิกัดร้านได้เลย** —
   * `POST /api/shops/update` เป็นทางเดียวที่เขียนคอลัมน์นี้ แต่ hardcode `kind:'PERSONAL'`
   * และถูกเรียกจาก onboarding เท่านั้น ร้าน BUSINESS จึงตันสนิท (ยืนยันกับฐาน prod 2026-08-14:
   * ทั้งฐานไม่มีร้านไหนมีพิกัดสักร้าน เพราะ surface เดียวที่ถามพิกัดคือ BusinessCreateModal
   * ซึ่งทิ้งค่าตอนประกอบ payload)
   *
   * 🛑 กติกา 2 ข้อที่ต้องบังคับที่นี่ ไม่ใช่ฝากไว้กับหน้าจอ:
   *   1. lat/lng ต้องมาคู่กันเสมอ — หมุดที่มีแต่ละติจูดวางบนแผนที่ไม่ได้
   *   2. ต้องอยู่ในกรอบประเทศไทย — กัน 0,0 (ค่าตั้งต้นของตัวแปรที่ลืมเซ็ต ซึ่งจะผ่านด่าน
   *      `!= null` ไปเขียนลงฐานได้สบาย ๆ) และกันพิกัดสลับ lat/lng
   * ทั้งสองข้อ throw ไม่ใช่ ignore เงียบ — ค่าที่ผิดต้องกลับไปถึงคนกด ไม่ใช่หายไปแบบที่
   * บั๊กต้นเรื่องของรอบนี้เป็น (docs/conventions/value-fate-decided-at-write-site.md)
   */
  const hasLat = data?.latitude != null;
  const hasLng = data?.longitude != null;
  if (hasLat !== hasLng) throw new Error("GEO_PAIR_REQUIRED");
  if (hasLat && hasLng) {
    if (!isThaiCoordinate(data.latitude, data.longitude)) throw new Error("GEO_OUT_OF_RANGE");
    safe.latitude = data.latitude as number;
    safe.longitude = data.longitude as number;
  }

  return prisma.shop.update({ where: { id: shopId }, data: safe });
}

// P2-2 (feature 00008 Phase 2 cutover): Shop.userId ตัด @unique แล้ว (1 user มีได้หลาย Shop —
// PERSONAL 1 แถว unique partial + BUSINESS หลายแถว) — findUnique ใช้ไม่ได้อีกต่อไป เปลี่ยนเป็น
// findFirst({userId, kind:'PERSONAL'}) คง signature/return เดิม (Shop | null) ให้ 26 caller ไม่ต้องแก้
export async function getShopByUserId(userId: string) {
  return prisma.shop.findFirst({ where: { userId, kind: "PERSONAL" } });
}

/** จำนวนร้านค้า (ผู้ขาย) ที่ใช้งานอยู่ — ใช้โชว์สถิติหน้า landing */
export async function getShopCount(): Promise<number> {
  return prisma.shop.count();
}

// ร้านน่าเชื่อถือ (buyer mobile home "ร้านน่าเชื่อถือ") — Profile-Centric: trust อยู่ที่ User
// เรียงตาม trustScore มากสุด, เฉพาะ user ที่เป็นร้าน + มี shop ที่ยัง active (ไม่ถูก soft-delete)
// link ปลายทาง = /u/{username} (trust profile). shopName/logo ดึงจาก shop แถวแรกที่ยัง active
export async function getTrustedShops(limit = 10) {
  return prisma.user.findMany({
    where: {
      isShop: true,
      shops: { some: { deletedAt: null, purgedAt: null } },
    },
    orderBy: { trustScore: "desc" },
    take: limit,
    select: {
      username: true,
      displayName: true,
      avatar: true,
      trustScore: true,
      verifications: { where: { status: "APPROVED" }, select: { level: true } },
      shops: {
        where: { deletedAt: null, purgedAt: null },
        select: { id: true, shopName: true, logo: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });
}

// จำนวนดีลสำเร็จ (CONFIRMED orders) ต่อ shopId — batched groupBy (สัญญาณ "ซื้อขายจริง" บนการ์ดร้าน)
export async function getConfirmedOrderCountByShopIds(shopIds: string[]): Promise<Map<string, number>> {
  if (shopIds.length === 0) return new Map();
  const groups = await prisma.order.groupBy({
    by: ["shopId"],
    where: { shopId: { in: shopIds }, status: "CONFIRMED" },
    _count: true,
  });
  return new Map(groups.map((g) => [g.shopId, g._count]));
}

// seller trust ตาม shopId (buyer mobile: โชว์บนการ์ดประมูล) — map shopId → { trustScore, verified }.
// trust = user (owner) trustScore; verified = มี verification APPROVED อย่างน้อย 1 (mirror getTrustedShops)
export async function getSellerTrustByShopIds(
  shopIds: string[],
): Promise<Map<string, { trustScore: number; verified: boolean }>> {
  if (shopIds.length === 0) return new Map();
  const shops = await prisma.shop.findMany({
    where: { id: { in: shopIds } },
    select: {
      id: true,
      user: {
        select: {
          trustScore: true,
          verifications: { where: { status: "APPROVED" }, select: { id: true }, take: 1 },
        },
      },
    },
  });
  return new Map(
    shops.map((s) => [s.id, { trustScore: s.user.trustScore, verified: s.user.verifications.length > 0 }]),
  );
}

export type BrowseShopRow = {
  username: string;
  displayName: string;
  avatar: string | null;
  trustScore: number;
  verifications: { level: number }[];
  shops: { shopName: string; logo: string | null }[];
};

// browse ร้านค้าแบบ scale จริง (buyer mobile discovery) — filter ตามเลเวล (tier→score range) + ค้นชื่อ,
// เรียง trust desc, cursor pagination (id). ไม่ใช่ top-N ตายตัวเหมือน getTrustedShops
export async function browseShops(opts: {
  tier?: string;
  q?: string;
  category?: string;
  cursor?: string;
  take?: number;
}): Promise<{ items: BrowseShopRow[]; nextCursor: string | null }> {
  const take = opts.take ?? 20;
  const range = opts.tier ? getTierScoreRange(opts.tier) : null;
  const q = opts.q?.trim();
  const category = opts.category?.trim();

  const rows = await prisma.user.findMany({
    where: {
      isShop: true,
      // filter หมวดร้าน (Shop.categories String[] → has); กรอง soft-delete เสมอ
      shops: { some: { deletedAt: null, purgedAt: null, ...(category ? { categories: { has: category } } : {}) } },
      ...(range ? { trustScore: { gte: range.gte, ...(range.lt != null ? { lt: range.lt } : {}) } } : {}),
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: "insensitive" as const } },
              { shops: { some: { shopName: { contains: q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    },
    orderBy: [{ trustScore: "desc" }, { id: "asc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
      trustScore: true,
      verifications: { where: { status: "APPROVED" }, select: { level: true } },
      shops: {
        where: { deletedAt: null, purgedAt: null },
        select: { shopName: true, logo: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  return {
    items: page.map((r) => ({
      username: r.username,
      displayName: r.displayName,
      avatar: r.avatar,
      trustScore: r.trustScore,
      verifications: r.verifications,
      shops: r.shops,
    })),
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
  };
}

// 00008 Phase 5 (P5-4): resolve BUSINESS shop จาก public slug สำหรับหน้า /b/[slug]
// คืนเฉพาะ kind='BUSINESS' + deletedAt:null (soft-deleted shop ไม่โชว์ public) — PERSONAL shop ไม่ผ่าน endpoint นี้ (คนละหน้ากับ /u/[username])
// include user.avatar สำหรับ fallback เมื่อ shop.logo เป็น null + badges join Badge (P5-2, business-scope achievement)
export async function findShopBySlug(slug: string) {
  return prisma.shop.findFirst({
    where: { slug, kind: "BUSINESS", deletedAt: null },
    include: {
      user: { select: { avatar: true } },
      // orderBy earnedAt desc — sync กับ user.service.ts::findByUsername: /b/[slug] ก็ใช้ BadgePillRow
      // "3 ใบล่าสุดที่ได้รับ" เหมือนกัน ถ้าไม่เรียงตรงนี้ลำดับ pill จะขึ้นกับ insertion order ของ DB
      badges: { include: { badge: true }, orderBy: { earnedAt: "desc" } },
    },
  });
}

/** slug ใช้ได้ไหม: format ถูก + ไม่ reserved + ไม่ถูกใช้ใน DB */
export async function isSlugAvailable(rawSlug: string): Promise<boolean> {
  const slug = normalizeSlug(rawSlug);
  if (!isValidSlugFormat(slug) || isReservedSlug(slug)) return false;
  // เช็คข้ามตาราง: username ของคนอื่นก็ถือว่าชื่อนี้ถูกใช้แล้ว — กันไม่ให้ slug ชนกับ username
  // เพิ่มขึ้นอีก เพราะเมื่อรวม URL เป็นเส้นเดียว ตัวหนึ่งจะเข้าไม่ถึงตลอดกาล (lib/public-name.ts)
  return !(await isPublicNameTaken(slug));
}

/** ตั้ง slug ให้ shop — throw ถ้าไม่ available (กัน TOCTOU เบื้องต้น; unique index = guard ชั้นสุดท้าย) */
export async function setShopSlug(shopId: string, rawSlug: string) {
  const slug = normalizeSlug(rawSlug);

  /**
   * 🛑 ด่าน "ตั้งได้ครั้งเดียว" — เพิ่ม 2026-08-14
   *
   * กฎนี้ถูก *เขียนไว้* 3 ที่มาตลอด (คอมเมนต์ใน api/shops/slug/route.ts:33 ว่า "ไม่มีทางเข้า
   * เขียนทับที่ไหนในระบบ" · ข้อความบนจอ ShopSlugField "ตั้งแล้ว เปลี่ยนภายหลังไม่ได้ในตอนนี้" ·
   * กล่องยืนยันก่อนกด) แต่ **ไม่เคยมีโค้ดบรรทัดไหนบังคับ** — สิ่งเดียวที่กันอยู่คือ
   * ShopSlugField `return` ออกไปตั้งแต่ต้นเมื่อมี slug แล้ว จึงไม่มีช่องกรอกให้เห็น
   * ⇒ ยิง POST /api/shops/slug ตรง ๆ เขียนทับได้ทันที และ URL ที่ลูกค้าบุ๊กมาร์กไว้จะตายเงียบ
   * (docs/conventions/rule-must-be-enforced-not-described.md — กฎที่เขียนไว้ ≠ กฎที่บังคับได้)
   *
   * ตั้งค่าเดิมซ้ำ = ผ่าน (idempotent) เพราะไม่ได้เปลี่ยนอะไร กดปุ่มซ้ำ/ยิงซ้ำจากเน็ตกระตุก
   * ไม่ควรกลายเป็น error
   */
  const current = await prisma.shop.findUnique({ where: { id: shopId }, select: { slug: true } });
  if (current?.slug && current.slug !== slug) {
    throw new Error("SLUG_ALREADY_SET");
  }
  // ตั้งค่าเดิมซ้ำ — ไม่เขียนอะไร แต่คืนรูปเดิม (Shop เต็มใบ) ให้ผู้เรียกไม่ต้องแยกเคส
  if (current?.slug === slug) return prisma.shop.findUniqueOrThrow({ where: { id: shopId } });

  if (!(await isSlugAvailable(slug))) {
    throw new Error("SLUG_UNAVAILABLE");
  }
  return prisma.shop.update({ where: { id: shopId }, data: { slug } });
}

/**
 * สถิติสำหรับหน้าร้านสาธารณะ /u/[username] (redesign 2026-07-26)
 *
 * รวมคิวรีที่หน้าโปรไฟล์ต้องใช้ไว้ที่เดียว เพื่อไม่ให้ page.tsx บวมและให้ทดสอบแยกได้
 *
 * กติกาสำคัญ: คืน null เมื่อ "ยังไม่มีข้อมูล" ไม่ใช่คืน 0 — ฝั่ง UI ใช้ null เป็นสัญญาณให้ซ่อน
 * ทั้งบล็อกแทนการโชว์เลขศูนย์ ตามหลักของระบบที่ไม่แสดงตัวเลขที่ไม่มีความหมาย (PRD 00015 §11.3)
 */
export async function getShopProfileStats(shopId: string) {
  const [statusGroups, countableOrders, cancelledRows, customerGroups, ratingGroups, channels] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      where: { shopId },
      _count: { _all: true },
    }),
    // BR-POC-01/03 — "ออเดอร์ที่นับได้" = ผู้ซื้อยืนยันเอง **หรือ** ขนส่งขยับพัสดุจริงแล้ว
    // (ดู docs/10 - Business Rules/Public Order Count.md) เกณฑ์นี้แก้ปัญหาที่ร้านซึ่งขายผ่าน
    // แชทจริงแสดงตัวเลขต่ำกว่าความจริงมาก เพราะผู้ซื้อแทบไม่กลับมากดยืนยัน
    prisma.order.count({ where: countableOrderWhere(shopId) }),
    // feature 00039 — ใบที่ยกเลิกพร้อมหลักฐานที่ใช้ตัดสินว่าเป็นความผิดร้านหรือไม่
    // อยู่ใน Promise.all เดิม ไม่ยิงรอบใหม่ (NFR ประสิทธิภาพ)
    //
    // 🛑 select เฉพาะที่ใช้ตัดสิน — ไม่ดึง cancelReason มาด้วยโดยตั้งใจ เพื่อให้อ่านโค้ดแล้ว
    // เห็นทันทีว่าเหตุผลที่ร้านเลือกไม่มีทางมีอิทธิพลต่อตัวเลข (BR-OSM-05) ถ้าวันหนึ่งมีคน
    // เพิ่ม cancelReason เข้ามาใน select นี้ ให้ถือเป็นสัญญาณว่ากำลังจะละเมิดกฎ
    //
    // shipments กรองด้วย status CREATED + isDryRun=false = นิยาม "พัสดุที่มีอยู่จริง"
    // ตัวเดียวกับที่ระบบใช้ (ห้ามใช้ status <> 'CANCELLED' ซึ่งนับใบ FAILED ด้วย —
    // บั๊กที่เคยทำให้แถวในกล่องแชทขึ้นชิป "สร้างพัสดุแล้ว" ทั้งที่ไม่มีเลขพัสดุ)
    prisma.order.findMany({
      where: { shopId, status: "CANCELLED" },
      select: {
        cancelInitiator: true,
        shipments: {
          where: ACTIVE_FORWARD_SHIPMENT,
          select: { carrierStatus: true },
          take: 1,
        },
      },
    }),
    // นับ "ลูกค้า" จาก customerId ที่ผูกกับออเดอร์ของร้านนี้ — ออเดอร์ที่ยังไม่ผูก Customer
    // (ของเก่าก่อน feat 00014) จะไม่ถูกนับ ซึ่งถูกต้องกว่าการเดาจากเบอร์ซ้ำ
    //
    // status CONFIRMED (เพิ่ม 2026-07-31 จาก Impeccable critique): เดิมนับทุกสถานะ ทำให้หน้าร้าน
    // แสดง "3 ออเดอร์" คู่กับ "23 จำนวนลูกค้า" ซึ่งเป็นไปไม่ได้ในสายตาคนอ่าน เพราะสองตัวเลข
    // ใช้ตัวหารคนละชุด — ออเดอร์นับเฉพาะที่ผู้ซื้อยืนยันรับของแล้ว แต่ลูกค้านับ PENDING ด้วย
    //
    // บนหน้าที่ทั้งหน้ามีไว้พิสูจน์ว่าเชื่อได้ ตัวเลขที่เป็นไปไม่ได้หนึ่งตัวทำให้ผู้ซื้อสงสัยตัวเลขที่
    // เหลือทั้งหมด และที่อันตรายกว่านั้นคือ PENDING เป็นสิ่งที่ร้านสร้างเองได้ไม่จำกัด — มิจฉาชีพ
    // เปิดร้านแล้วสร้างออเดอร์ทิ้งไว้ 50 รายการก็ได้ "50 จำนวนลูกค้า" ฟรี ๆ ซึ่งขัดพันธกิจของ
    // ทั้งแพลตฟอร์ม เกณฑ์เดียวกับ completionRate/ยอดขายรายสินค้าที่ใช้ CONFIRMED เท่านั้น
    // BR-POC-03 — ใช้เกณฑ์ "ออเดอร์ที่นับได้" ตัวเดียวกับช่อง "ออเดอร์" ห้ามนับคนละแบบ
    // ไม่งั้นหน้าเดียวกันจะมีตัวเลขสองนิยามอีก (Hard Rule 16)
    prisma.order.groupBy({
      by: ["customerId"],
      where: { ...countableOrderWhere(shopId), customerId: { not: null } },
      _count: { _all: true },
    }),
    prisma.review.groupBy({
      by: ["rating"],
      where: { order: { shopId }, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.shopChannel.findMany({
      where: { shopId, status: "ACTIVE" },
      // followerCount อ่านจากคอลัมน์ ไม่ยิง Graph ตอนมีคนเปิดหน้าร้าน (ช้า + ชนลิมิต Meta)
      // null = ยังไม่รู้ (เพจที่เชื่อมก่อนมีคอลัมน์นี้) — UI ต้องซ่อนยอด ไม่ใช่แสดง 0
      // basicId: LINE Basic ID (ขึ้นต้น `@`) — คนละตัวกับ externalId ซึ่งเป็น user/bot id ภายใน
      // ต้องมีถึงจะประกอบลิงก์ LINE ได้ (src/lib/official-channel-link.ts) เดิมไม่ได้ select
      // ทำให้ปุ่มทักของช่องทาง LINE ประกอบ URL ไม่ได้เลย
      select: {
        provider: true,
        name: true,
        avatarUrl: true,
        externalId: true,
        followerCount: true,
        basicId: true,
      },
    }),
  ]);

  const confirmed = statusGroups.find((s) => s.status === "CONFIRMED")?._count._all ?? 0;
  const cancelled = statusGroups.find((s) => s.status === "CANCELLED")?._count._all ?? 0;

  // feature 00039 — ใบที่หลุดจากตัวหารเพราะไม่ใช่ความผิดร้าน (BR-OSM-04)
  const excluded = cancelledRows.filter((o) =>
    isRateExcludedCancellation({
      cancelInitiator: o.cancelInitiator,
      activeShipmentCarrierStatus: o.shipments[0]?.carrierStatus ?? null,
    }),
  ).length;

  // 🛑 สูตรอยู่ที่ lib/order-stats.ts ที่เดียว ห้ามคำนวณเองที่นี่อีก (BR-OSM-10)
  // เดิมบรรทัดถัดไปเป็น `settled > 0 ? Math.round(...) : null` ซึ่งเป็นสำเนาที่ไม่มีเกณฑ์
  // ขั้นต่ำ ทำให้ร้านที่มีออเดอร์สำเร็จใบเดียวขึ้น "100%" ได้บนหน้าที่คนใช้ตัดสินใจโอนเงิน
  const rate = computeCompletionRate({ confirmed, cancelled, excluded });

  const customerCount = customerGroups.length;
  // "กลับมาซื้อซ้ำ" = ลูกค้าที่ซื้อสำเร็จกับร้านนี้ตั้งแต่ 2 ครั้งขึ้นไป (นับจากชุด CONFIRMED เดียวกัน)
  const repeatCustomerCount = customerGroups.filter((g) => g._count._all >= 2).length;

  const reviewCount = ratingGroups.reduce((sum, g) => sum + g._count._all, 0);
  const ratingSum = ratingGroups.reduce((sum, g) => sum + g.rating * g._count._all, 0);

  // การกระจายดาว 5→1 — ค่าเฉลี่ยเท่ากันแต่กระจายต่างกันมีความหมายคนละอย่างต่อคนที่กำลังจะโอนเงิน
  const ratingDistribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: ratingGroups.find((g) => g.rating === star)?._count._all ?? 0,
  }));

  return {
    // 🛑 ช่อง "ออเดอร์" ใช้เกณฑ์ BR-POC ส่วน completionRate ด้านล่างยังใช้ `confirmed` ล้วน
    // (BR-POC-04) — "สำเร็จ" แปลว่าผู้ซื้อได้ของแล้ว พัสดุที่ยังเดินทางอยู่ยังไม่ใช่ความสำเร็จ
    // สองตัวนี้จึงใช้ตัวหารคนละชุดโดยตั้งใจ
    completedOrders: countableOrders > 0 ? countableOrders : null,
    completionRate: rate.rate,
    /** ฐานที่ใช้คำนวณจริง — UI ต้องแสดงคู่กับ % เสมอ (BR-OSM-07) ผู้ซื้อจะได้บวกตามได้ */
    completionDenominator: rate.denominator,
    /** จำนวนใบที่หักออก — UI แสดงเมื่อ > 0 เท่านั้น */
    completionExcluded: rate.excluded,
    /** ยังไม่ถึงเกณฑ์ขั้นต่ำ — UI ใช้เลือกข้อความ "ยังสรุปไม่ได้" แทนการซ่อนเงียบ */
    completionBelowMinSample: rate.belowMinSample,
    customerCount: customerCount > 0 ? customerCount : null,
    repeatCustomerCount: repeatCustomerCount > 0 ? repeatCustomerCount : null,
    avgRating: reviewCount > 0 ? Number((ratingSum / reviewCount).toFixed(1)) : null,
    reviewCount,
    ratingDistribution: reviewCount > 0 ? ratingDistribution : null,
    channels,
  };
}

// ─── บัญชีรับเงินของร้าน (feature 00062, U14/TFR-009) ───────────────────────

/**
 * throw เมื่อผู้เรียกไม่ใช่เจ้าของร้าน (`role !== 'OWNER'`) หรือร้านไม่ใช่ประเภทที่เปิดฟีเจอร์นี้
 * (`vertical !== 'ONLINE_SALES'`) — รวมสองเงื่อนไขไว้ error code เดียวกัน (`FORBIDDEN`, API.md
 * §4.5/§5 มีแค่โค้ดเดียวสำหรับ endpoint นี้) mirror `OrderNotPickupError` ใน `order.service.ts`
 * ที่รวมด่าน vertical เข้ากับด่านหลักตัวเดียวกันด้วยเหตุผลเดียวกัน: แยกโค้ดออกจากกันไม่มีความหมาย
 * เพิ่มเติมต่อผู้เรียก (ทั้งสองกรณีคือ "ทำสิ่งนี้กับร้านนี้ไม่ได้")
 */
export class PayoutForbiddenError extends Error {
  constructor() {
    super("ไม่มีสิทธิ์แก้ไขบัญชีรับเงิน");
    this.name = "PayoutForbiddenError";
  }
}

/** throw เมื่อ reauth (รหัสผ่าน/OTP) ไม่ถูกต้อง — เฉพาะตอน "เปลี่ยน" บัญชีที่มีอยู่แล้ว (BR-BANK-02) */
export class PayoutReauthFailedError extends Error {
  constructor() {
    super("ยืนยันตัวตนไม่ผ่าน");
    this.name = "PayoutReauthFailedError";
  }
}

/**
 * throw เมื่อ user ไม่มีทั้ง `passwordHash` และ `phone` ให้ reauth ด้วย (ไม่มีช่องทางพิสูจน์ตัวตน
 * เลย) — ห้ามปล่อยผ่านโดยไม่ reauth (feature 00062, API.md §6.1 sequence)
 */
export class PayoutReauthUnavailableError extends Error {
  constructor() {
    super("บัญชีนี้ยังไม่มีช่องทางยืนยันตัวตน (รหัสผ่าน/เบอร์โทร) จึงเปลี่ยนบัญชีรับเงินไม่ได้");
    this.name = "PayoutReauthUnavailableError";
  }
}

/**
 * updateShopPayout — ตั้ง/เปลี่ยนบัญชีรับเงินของร้าน (feature 00062, U14/TFR-009, API.md §4.5/§6.1)
 *
 * ด่านทั้งหมด (OWNER-only · vertical=ONLINE_SALES · reauth) อยู่ที่นี่ทั้งก้อน ไม่ใช่ inline ที่
 * route — mirror `setHandedOver`/`setPaymentConfirmed` (`order.service.ts`) ตาม "หมายเหตุการ
 * implement" ใน API.md §5: ด่านที่ต้องพิสูจน์ด้วย mutation test ได้ต้องอยู่ที่ service ไม่งั้น
 * ผู้เรียกในอนาคต (แอปมือถือ/cron) เลี่ยงด่านได้โดยไม่ผ่าน route นี้
 *
 * role resolve ที่นี่เอง (ไม่รับเป็น parameter จาก route) — re-verify membership เสมอ (pattern
 * เดียวกับ `resolveActiveShopContext` ใน `shop-context.ts`): ร้าน Personal ไม่มีแถว ShopMember
 * เลย (สร้างเฉพาะร้าน Business — `business-shop.service.ts`) เจ้าของร้าน Personal จึงเป็น OWNER
 * โดยนิยาม (`shop.userId === userId`) ส่วนร้าน Business ต้องเช็คแถว ShopMember จริง
 *
 * บันทึกครั้งแรก (`payoutUpdatedAt === null`) ข้ามบล็อก reauth ทั้งก้อน — BR-BANK-02 พูดถึง
 * "เปลี่ยน" ไม่ใช่ "ตั้งครั้งแรก" (ยังไม่มีอะไรให้สวมสิทธิ์) `data.reauth` ยังเป็น field บังคับ
 * ที่ Valibot layer (`UpdateShopPayoutSchema` ไม่มี `v.optional` ที่ `reauth`) แต่ฟังก์ชันนี้ไม่แตะ
 * เนื้อใน `data.reauth` เลยในกรณีนี้ (ไม่เรียก `verifyPassword`/`verifyOtp`)
 */
export async function updateShopPayout(
  shopId: string,
  userId: string,
  data: UpdateShopPayoutInput,
) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, kind: true, userId: true, vertical: true, payoutUpdatedAt: true },
  });
  // ไม่ควรเกิด (route resolve ownership ผ่าน requireActiveShop มาก่อนแล้ว) — defense-in-depth
  if (!shop) throw new PayoutForbiddenError();

  if (shop.vertical !== "ONLINE_SALES") throw new PayoutForbiddenError();

  const isOwner =
    shop.kind === "PERSONAL"
      ? shop.userId === userId
      : (
          await prisma.shopMember.findUnique({
            where: { shopId_userId: { shopId, userId } },
            select: { role: true },
          })
        )?.role === "OWNER";
  if (!isOwner) throw new PayoutForbiddenError();

  const isFirstTime = shop.payoutUpdatedAt === null;

  if (!isFirstTime) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, phone: true },
    });

    let reauthOk: boolean;
    if (data.reauth.method === "PASSWORD" && user?.passwordHash) {
      reauthOk = await verifyPassword(data.reauth.password, user.passwordHash);
    } else if (data.reauth.method === "OTP" && user?.phone) {
      reauthOk = await verifyOtp(user.phone, data.reauth.code);
    } else {
      // ไม่มีช่องทางยืนยันตัวตนที่ผู้ใช้ขอมา (หรือไม่มีทั้งคู่เลย) — ห้ามปล่อยผ่าน (API.md §6.1)
      throw new PayoutReauthUnavailableError();
    }
    if (!reauthOk) throw new PayoutReauthFailedError();
  }

  // FR-BANK-04 (Should) — best-effort: เจอแล้วแค่ log แจ้งทีมงาน ไม่บล็อกการบันทึก และห้ามให้
  // ความล้มเหลวของขั้นนี้ (เช่น DB hiccup) ทำให้การบันทึกบัญชีจริงล้มไปด้วย — ครอบ try/catch ของ
  // ตัวเองแยกจาก transaction หลัก
  if (data.payoutAccountNo) {
    try {
      const normalized = normalizePayoutAccountNo(data.payoutAccountNo);
      // dynamic import (ไม่ใช่ static ที่หัวไฟล์) เพราะ scam-identifier.ts throw ที่ module-load
      // ทันทีถ้า NEXTAUTH_SECRET ไม่ได้ตั้งค่า (fail-closed ของไฟล์นั้นเอง) — ด่าน best-effort
      // ของ FR-BANK-04 ต้อง "ห้ามพังการบันทึกบัญชีจริง" แม้แต่ตอน import ก็ตาม ไม่ใช่แค่ตอนเรียก
      // ฟังก์ชัน การ import แบบ static ที่หัวไฟล์จะทำให้ทุก caller ของ shop.service.ts (รวม test
      // ที่ไม่เกี่ยวกับ payout เลย) พังไปด้วยถ้า env ตัวนี้ไม่ถูกตั้ง
      const { hashIdentifier } = await import("@/lib/scam-identifier");
      const valueHash = hashIdentifier("BANK_ACCOUNT", normalized);
      const hit = await prisma.scamReportIdentifier.findFirst({
        where: { type: "BANK_ACCOUNT", valueHash, report: { status: "APPROVED" } },
        select: { id: true },
      });
      if (hit) {
        // ห้าม log เลขบัญชีเต็ม (DATABASE.md §6.2 / SRS §"Security" ข้อ 2) — mask ก่อนเสมอ
        console.warn("[shop.service] payoutAccountNo matches ScamReportIdentifier", {
          shopId,
          accountNoMasked: maskAccountNo(normalized),
        });
      }
    } catch (err) {
      console.error("[shop.service] scam identifier check failed (best-effort, ignored)", err);
    }
  }

  return prisma.shop.update({
    where: { id: shopId },
    data: {
      ...(data.payoutBankCode !== undefined && { payoutBankCode: data.payoutBankCode }),
      ...(data.payoutAccountNo !== undefined && {
        payoutAccountNo:
          data.payoutAccountNo !== null ? normalizePayoutAccountNo(data.payoutAccountNo) : null,
      }),
      ...(data.payoutAccountName !== undefined && { payoutAccountName: data.payoutAccountName }),
      ...(data.payoutPromptPayId !== undefined && { payoutPromptPayId: data.payoutPromptPayId }),
      payoutUpdatedAt: new Date(),
    },
    select: {
      payoutBankCode: true,
      payoutAccountNo: true,
      payoutAccountName: true,
      payoutPromptPayId: true,
      payoutUpdatedAt: true,
    },
  });
}
