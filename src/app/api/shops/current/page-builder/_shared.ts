/**
 * ตัวช่วยร่วมของ /api/shops/current/page-builder/** (feature 00035 — ตัวจัดหน้าร้าน)
 *
 * ทั้ง 4 endpoint auth เหมือนกันเป๊ะ (session → requireActiveShop → canAccessShop ที่ service เป็น
 * defense-in-depth ชั้นสอง — API.md §2) และ error mapping เหมือนกัน (SRS §4.2) — รวมไว้ที่เดียว
 * กัน route ไหนลืมครอบ error ตัวใดตัวหนึ่งแล้วหลุดเป็น 500 ดิบ (feedback_service_error_route_mapping)
 *
 * โครง error response ยึดตาม API.md §5 ตรง ๆ: { error: { code, message, details } } — คนละแบบกับ
 * ส่วนอื่นของโปรเจกต์ที่เป็น { error: "text", code } แบบ flat เพราะ API.md ของฟีเจอร์นี้ระบุ shape
 * นี้ไว้ชัดเจนเป็น contract (ห้ามเปลี่ยนเอง)
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { requireActiveShop } from "@/lib/shop-context";

// NextAuth Session ไม่ประกาศ id/activeShopId (โปรเจกต์นี้ไม่มี d.ts augmentation) — cast ที่นี่ที่เดียว
type SellerSession = { user: { id: string; activeShopId?: string | null } };

export type BuilderShopContext = { shopId: string; actorUserId: string };

/** โครง error มาตรฐานของฟีเจอร์นี้ตาม API.md §5 — ทุก error response (รวม 401/404 จากที่นี่) ต้องผ่านฟังก์ชันนี้ */
export function errorResponse(
  code: string,
  message: string,
  status: number,
  details: Record<string, unknown> = {},
): NextResponse {
  const res = NextResponse.json({ error: { code, message, details } }, { status });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

/**
 * resolve session + active shop ของทั้ง 4 endpoint (API.md §2) — คืน context ให้เรียก service ต่อ
 * หรือ response error สำเร็จรูปถ้า resolve ไม่ผ่าน (401 ไม่มี session / 404 ไม่มี active shop)
 * ไม่เช็ค role แยกอีกชั้นที่นี่ เพราะ requireActiveShop re-verify membership เสมอ (SRS TFR-001) —
 * canAccessShop false (ทฤษฎีเกิดยากมาก) ถูกกันซ้ำที่ service แล้ว route จับผ่าน handleBuilderError
 */
export async function requireBuilderShopContext(): Promise<
  { ctx: BuilderShopContext; response: null } | { ctx: null; response: NextResponse }
> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return { ctx: null, response: errorResponse("UNAUTHORIZED", "กรุณาเข้าสู่ระบบ", 401) };
  }

  const active = await requireActiveShop(session as unknown as SellerSession);
  if (!active?.shop) {
    return { ctx: null, response: errorResponse("NOT_FOUND", "ไม่พบร้านที่ใช้งานอยู่", 404) };
  }

  return { ctx: { shopId: active.shop.id, actorUserId: userId }, response: null };
}

/**
 * แปลง error ที่ shop-page-layout.service.ts โยน (SRS §4.2 cross-file error-mapping table) → HTTP
 * response ตรง ๆ — ทุก route ของฟีเจอร์นี้เรียกฟังก์ชันนี้ใน catch เดียว ห้ามเขียน mapping ซ้ำที่ route
 */
export function handleBuilderError(e: unknown, where: string): NextResponse {
  const message = e instanceof Error ? e.message : String(e);

  if (message === "FORBIDDEN") {
    return errorResponse("FORBIDDEN", "ไม่มีสิทธิ์เข้าถึงร้านนี้", 403);
  }
  if (message === "POST_NOT_OWNED") {
    return errorResponse("NOT_OWNED", "มีโพสต์ที่ไม่ได้อยู่ในเพจที่เชื่อมไว้", 403);
  }
  if (message === "BADGE_NOT_OWNED") {
    return errorResponse("NOT_OWNED", "มีเหรียญตราที่ไม่ใช่ของร้านนี้", 403);
  }
  // feature 00053 — setProfileItemVisibility โยนตัวนี้เมื่อ updateMany ได้ count 0 ซึ่งครอบทั้ง
  // "ไม่มีรายการนี้" และ "มีแต่เป็นของร้านอื่น" โดยตั้งใจ (ไม่ยืนยันให้คนนอกรู้ว่า id นี้มีอยู่จริง)
  if (message === "NOT_FOUND") {
    return errorResponse("NOT_FOUND", "ไม่พบรายการนี้ในร้าน", 404);
  }
  if (message === "TOO_MANY_BADGE_BLOCKS") {
    return errorResponse("VALIDATION_ERROR", "บันทึกได้สูงสุด 1 บล็อกเหรียญเด่นต่อหน้า", 400);
  }
  if (message === "DUPLICATE_FACEBOOK_POST") {
    return errorResponse("CONFLICT", "มีโพสต์ซ้ำกันในชุดที่บันทึก", 409);
  }
  // race ระหว่าง 2 session save พร้อมกัน ชนกับ partial unique index — แปลเป็นข้อความเดียวกับ
  // DUPLICATE_FACEBOOK_POST (SRS §4.2 — คนละจุดจับ DB-level vs app-level แต่ผลลัพธ์ที่ user เห็นเหมือนกัน)
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return errorResponse("CONFLICT", "มีโพสต์ซ้ำกันในชุดที่บันทึก", 409);
  }

  console.error(`[${where}]`, message);
  return errorResponse("INTERNAL_ERROR", "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", 500);
}
