import { prisma } from "@/lib/prisma";
import { canEditReview } from "@/lib/review-window";
import { evaluateBadges, evaluateSellerBadgesForShop } from "@/services/badge.service";
import { canAccessShop } from "@/lib/shop-context";

export async function createReview(orderToken: string, data: {
  rating: number;
  comment?: string;
  reviewerUserId: string; // feature 00015 — review ต้องมีเจ้าของที่ login แล้ว (ปิด guest-write เดิม)
}) {
  const order = await prisma.order.findUnique({
    where: { publicToken: orderToken },
    include: { review: true, shop: true },
  });
  if (!order) throw new Error("Order not found");
  // 🛑 ตรงนี้ **ห้ามเติม deletedAt: null** ต่างจาก read path อื่นทั้งหมดในไฟล์นี้ — นี่คือกลไก
  // ที่กัน "ลบรีวิวแล้วเขียนใหม่": แถวที่ถูก soft-delete ยังต้องทำให้ guard นี้ throw
  // ถ้าเผลอกรองออก แถวเก่าจะมองไม่เห็น → สร้างใหม่ได้ → createdAt ใหม่ → หน้าต่างแก้ไข 24 ชม.
  // เริ่มนับใหม่ ⇒ ลบ-สร้างใหม่ทุก 23 ชม. ก็แก้รีวิวได้ตลอดกาล (ทำลาย BR-BOE-17 ทั้งข้อ)
  if (order.review) throw new Error("Review already exists for this order");
  // State guard — รีวิวได้เฉพาะหลัง buyer ยืนยัน (CONFIRMED / SHIPPED); COMPLETED ถูกลบออกจาก OMS redesign
  // PRD FR-7.1: "Buyer ให้ review + rating ได้หลัง confirm order"
  if (!["CONFIRMED", "SHIPPED"].includes(order.status)) {
    throw new Error(`Cannot review order in status ${order.status} (must be CONFIRMED or later)`);
  }

  const review = await prisma.review.create({
    data: {
      orderId: order.id,
      rating: data.rating,
      comment: data.comment,
      reviewerUserId: data.reviewerUserId,
    },
  });

  // Review is persisted at this point. The post-create recalc is best-effort:
  // a transient Prisma error (e.g. connection pool timeout in dev with
  // connection_limit=1) should NOT fail the review request — the review row
  // is already saved. Log the failure so it's visible, not silent.
  try {
    // 00008 P5-2: scope เหมือน confirmOrder — business shop แยก badge ต่อร้าน, personal เดิม
    if (order.shop.kind === "BUSINESS") {
      await evaluateSellerBadgesForShop({ id: order.shop.id, userId: order.shop.userId, kind: order.shop.kind });
    } else {
      await evaluateBadges(order.shop.userId);
    }
  } catch (err) {
    console.error(
      `[review] post-create recalc failed for shop owner ${order.shop.userId}; review ${review.id} persisted but trust score / badges may be stale. Retry via admin tool.`,
      err,
    );
  }

  return review;
}

export async function getReviewsByBuyer(userId: string, take?: number) {
  return prisma.review.findMany({
    where: { reviewerUserId: userId, deletedAt: null },
    include: {
      order: {
        select: {
          publicToken: true,
          items: { take: 1 },
          shop: { select: { user: { select: { displayName: true, username: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    ...(take ? { take } : {}),
  });
}

export async function getReviewsByShopUser(userId: string) {
  return prisma.review.findMany({
    where: { order: { shop: { userId } }, deletedAt: null },
    include: {
      order: { select: { publicToken: true, items: true } },
      // feature 00041 — ดึงชื่อผู้รีวิวจริงมาแสดงแทนคำว่า "ผู้ใช้ที่ลงทะเบียน"
      // 🛑 select ทีละฟิลด์ ไม่ใช่ `true` ทั้งก้อน: หน้านี้เป็น RSC ที่อยู่ใต้ client layout
      // ⇒ อะไรที่ include มาจะถูก serialize ลง flight payload ทั้งหมด การดึง User ทั้งแถว
      // = ส่ง passwordHash/เบอร์/อีเมลของผู้ซื้อไปให้เบราว์เซอร์ของผู้ขาย
      // (memory `feedback_rsc_pii_neutralize_at_source`)
      reviewer: { select: { displayName: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getReviewsByUsername(username: string, take = 10, skip = 0) {
  return prisma.review.findMany({
    where: { order: { shop: { user: { username } } }, deletedAt: null },
    // ขยาย 2026-08-11 — หน้าโปรไฟล์สาธารณะแสดงชื่อผู้รีวิว (mask), เลขออเดอร์ และรูปแนบ
    // 🛑 คืน reviewer/contact ดิบ — **ผู้เรียกต้อง mask ก่อนส่งข้ามไปฝั่ง client เสมอ**
    // (lib/reviewer-display.ts) ไม่ใช่ mask ที่นี่ เพราะฝั่ง seller ต้องการค่าจริงเพื่อติดต่อลูกค้า
    include: {
      order: { select: { publicToken: true, createdAt: true, items: true } },
      reviewer: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
    skip,
  });
}

// คำนวณ avg rating + จำนวน review จาก review ทั้งหมดของร้าน
// ไม่ใช้ getReviewsByUsername เพราะมี take=10 ทำให้ avg ผิด (bug เดิม)
export async function getAvgRatingByUsername(
  username: string,
): Promise<{ avgRating: number; reviewCount: number }> {
  const agg = await prisma.review.aggregate({
    _avg: { rating: true },
    _count: { id: true },
    where: { order: { shop: { user: { username } } }, deletedAt: null },
  });
  return {
    avgRating: agg._avg.rating ?? 0,
    reviewCount: agg._count.id,
  };
}

// 00008 Phase 5 (P5-4): เทียบ getAvgRatingByUsername แต่ scope ที่ shopId ตรง — ใช้กับ BUSINESS shop
// (แยกจาก owner user) แทนการ derive ผ่าน user.username
export async function getAvgRatingByShop(
  shopId: string,
): Promise<{ avgRating: number; reviewCount: number }> {
  const agg = await prisma.review.aggregate({
    _avg: { rating: true },
    _count: { id: true },
    where: { order: { shopId }, deletedAt: null },
  });
  return {
    avgRating: agg._avg.rating ?? 0,
    reviewCount: agg._count.id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// feature 00041 — แก้ไข/ลบรีวิว + คำตอบร้าน (SRS TFR-007/008/009)
// ─────────────────────────────────────────────────────────────────────────────

export class ReviewNotFoundError extends Error {
  constructor() { super("REVIEW_NOT_FOUND"); this.name = "ReviewNotFoundError"; }
}
export class ReviewForbiddenError extends Error {
  constructor() { super("REVIEW_FORBIDDEN"); this.name = "ReviewForbiddenError"; }
}
export class ReviewEditWindowExpiredError extends Error {
  constructor() { super("REVIEW_EDIT_WINDOW_EXPIRED"); this.name = "ReviewEditWindowExpiredError"; }
}
export class ReviewReplyForbiddenError extends Error {
  constructor() { super("REVIEW_REPLY_FORBIDDEN"); this.name = "ReviewReplyForbiddenError"; }
}
export class ReviewReplyNotFoundError extends Error {
  constructor() { super("REVIEW_REPLY_NOT_FOUND"); this.name = "ReviewReplyNotFoundError"; }
}

/**
 * หน้าต่างแก้ไข/ลบรีวิว (BR-BOE-17) — นิยามจริงอยู่ที่ `@/lib/review-window`
 *
 * 🛑 ที่นี่ **re-export เท่านั้น ห้ามเขียนสูตรซ้ำ** — ไฟล์นี้ import prisma ⇒ client component
 * ที่ต้องตัดสินว่าจะโชว์ปุ่มแก้ไข/ลบไหม ดึงเข้าไปไม่ได้ ถ้ามีสองนิยาม วันหนึ่งมันจะเลื่อนออก
 * จากกันแล้วปุ่มจะโชว์ทั้งที่กดแล้วโดนปฏิเสธ (HR16)
 */
export { REVIEW_EDIT_WINDOW_MS, canEditReview } from "@/lib/review-window";

/**
 * หา review ที่ "ยังมีชีวิต" ของออเดอร์นี้ — soft-deleted ถือว่าไม่มี
 *
 * ใช้ร่วมทั้ง 4 mutation ข้างล่าง: แก้/ลบ/ตอบกลับ/ลบคำตอบ ล้วนต้องหยุดที่นี่ถ้ารีวิวถูกลบไปแล้ว
 * (ต่างจาก createReview ที่ต้องเห็นแถว tombstone — ดูคอมเมนต์ตรงนั้น)
 */
async function findActiveReviewOrThrow(orderToken: string) {
  const order = await prisma.order.findUnique({
    where: { publicToken: orderToken },
    select: { id: true, shopId: true, review: true },
  });
  if (!order?.review || order.review.deletedAt) throw new ReviewNotFoundError();
  return { orderId: order.id, shopId: order.shopId, review: order.review };
}

/**
 * updateReview — ผู้ซื้อแก้ไขรีวิวของตัวเองภายใน 24 ชม.
 *
 * 🛑 ลำดับ guard บังคับ: not-found → forbidden → expired
 * ต้องเช็ค "ไม่ใช่เจ้าของ" ก่อน "หมดเวลา" เสมอ — ไม่งั้นคนที่ไม่ใช่เจ้าของจะรู้จาก status code
 * ว่ารีวิวใบนั้นหมดเวลาแก้ไขหรือยัง ซึ่งเป็นข้อมูลที่เขาไม่ควรได้ (oracle leak)
 */
export async function updateReview(
  orderToken: string,
  userId: string,
  data: { rating?: number; comment?: string; images?: string[] },
) {
  const { review } = await findActiveReviewOrThrow(orderToken);
  if (review.reviewerUserId !== userId) throw new ReviewForbiddenError();
  if (!canEditReview(review.createdAt)) throw new ReviewEditWindowExpiredError();

  return prisma.review.update({
    where: { id: review.id },
    data: {
      ...(data.rating !== undefined ? { rating: data.rating } : {}),
      ...(data.comment !== undefined ? { comment: data.comment } : {}),
      ...(data.images !== undefined ? { images: data.images } : {}),
    },
  });
}

/**
 * deleteReview — soft delete เท่านั้น
 *
 * 🛑 ห้ามใช้ prisma.review.delete() เด็ดขาด: แถวต้องอยู่ต่อเพื่อให้ guard ของ createReview
 * ยังเห็น ⇒ เขียนรีวิวใหม่ไม่ได้ ⇒ createdAt ไม่มีวันรีเซ็ต (เหตุผลเต็มที่ SRS §8)
 *
 * ล้าง images/คำตอบร้านไปด้วย เพื่อให้ BR-BOE-23 ("ลบรีวิว = ลบรูปและคำตอบพร้อมกัน") เป็นจริง
 * ในระดับข้อมูล ไม่ใช่แค่ซ่อนบนหน้าจอ — แถวที่เหลือทำหน้าที่เป็น tombstone อย่างเดียว
 */
export async function deleteReview(orderToken: string, userId: string): Promise<void> {
  const { review } = await findActiveReviewOrThrow(orderToken);
  if (review.reviewerUserId !== userId) throw new ReviewForbiddenError();
  if (!canEditReview(review.createdAt)) throw new ReviewEditWindowExpiredError();

  await prisma.review.update({
    where: { id: review.id },
    data: {
      deletedAt: new Date(),
      images: [],
      shopReplyComment: null,
      shopRepliedAt: null,
      shopRepliedByUserId: null,
    },
  });
}

/**
 * replyToReview — ร้านตอบกลับรีวิว (1 คำตอบต่อ 1 รีวิว — ตอบซ้ำ = เขียนทับ ไม่ใช่สร้างใหม่)
 *
 * สิทธิ์ผ่าน canAccessShop() ตรง ๆ ไม่ implement ใหม่: ฟังก์ชันนั้นคืน true ให้เจ้าของร้าน
 * หรือคนที่มีแถว ShopMember ซึ่ง role มีแค่ OWNER/ADMIN ในสคีมา = ตรงกับ BR-BOE-21 พอดี
 * ไม่มีเงื่อนไขเวลา (BR-BOE-22 — ร้านแก้คำตอบได้ไม่จำกัด)
 */
export async function replyToReview(orderToken: string, actorUserId: string, comment: string) {
  const { shopId, review } = await findActiveReviewOrThrow(orderToken);
  if (!(await canAccessShop(shopId, actorUserId))) throw new ReviewReplyForbiddenError();

  return prisma.review.update({
    where: { id: review.id },
    data: {
      shopReplyComment: comment,
      shopRepliedAt: new Date(),
      shopRepliedByUserId: actorUserId,
    },
  });
}

/** deleteReviewReply — ร้านลบคำตอบของตัวเอง (ไม่กระทบรีวิวต้นทาง) */
export async function deleteReviewReply(orderToken: string, actorUserId: string): Promise<void> {
  const { shopId, review } = await findActiveReviewOrThrow(orderToken);
  if (!(await canAccessShop(shopId, actorUserId))) throw new ReviewReplyForbiddenError();
  if (review.shopReplyComment == null) throw new ReviewReplyNotFoundError();

  await prisma.review.update({
    where: { id: review.id },
    data: { shopReplyComment: null, shopRepliedAt: null, shopRepliedByUserId: null },
  });
}
