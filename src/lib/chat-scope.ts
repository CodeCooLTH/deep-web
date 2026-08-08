import { prisma } from "@/lib/prisma";
import { listAccessibleShopIds, resolveActiveShopContext } from "@/lib/shop-context";

/**
 * chat-scope — SSOT ของคำถาม "หน้าแชทกำลังมองร้านไหนอยู่บ้าง" (feature 00037)
 *
 * ก่อนฟีเจอร์นี้ ทุก surface ของแชทเรียก resolveActiveShopContext() เองแล้ว scope ด้วย
 * shopId เดี่ยว ๆ — ซึ่งแปลว่า "ร้านที่ active" กับ "ร้านที่รายการกำลังแสดง" เป็นสิ่งเดียวกัน
 * เสมอ. ฟีเจอร์กล่องแชทรวมหลายร้านตัดความเท่ากันนั้นทิ้ง: ผู้ใช้เลือกได้ว่าจะเห็นทุกร้าน
 * ที่ตัวเองเข้าถึงได้ในรายการเดียว โดย activeShopId ยังคงเป็นร้านเดิมไม่ขยับ (BR-UNI-07)
 *
 * 🛑 กฎที่ต้องบังคับตอนรีวิว: ไฟล์ในขอบเขตแชท (src/app/(paces)/seller/(chat)/** และ
 *    src/app/api/chat/**) ห้ามเรียก resolveActiveShopContext/requireActiveShop ตรง ๆ อีก
 *    ต้องผ่าน resolveChatScope() ที่เดียว —
 *      rg "resolveActiveShopContext|requireActiveShop" "src/app/(paces)/seller/(chat)/" "src/app/api/chat/"
 *    ต้องคืน 0. เหตุผล: จุดที่หลุดจะยัง scope ร้านเดียวปนอยู่กับจุดที่รวมแล้ว โดยไม่มี
 *    tsc/build/หน้าจอไหนฟ้องเลย (คลาสเดียวกับ feedback_or_rule_guard_every_operand —
 *    กั้น operand เดียวแล้วคิดว่าจบ)
 *
 * ข้อยกเว้นที่ตั้งใจ: src/app/api/channels/** (เชื่อม/ถอดเพจ) ยังใช้ active shop เหมือนเดิม
 * เพราะเป็น "การตั้งค่าของร้าน" ไม่ใช่ "การมองข้อความ" — ต้องอยู่ในบริบทร้านเดียวเสมอ
 */

export type ChatScopeMode = "SINGLE" | "UNIFIED";

export interface ChatScope {
  /** โหมดที่ *มีผลจริง* หลัง resolve แล้ว — ผู้ใช้ตั้ง UNIFIED ไว้แต่เข้าถึงร้านเดียวจะได้ 'SINGLE' */
  mode: ChatScopeMode;
  /** โหมดดิบที่ผู้ใช้ตั้งไว้ (ใช้ตัดสินว่าจะโชว์ segment ไหนถูกเลือกใน UI) */
  storedMode: ChatScopeMode;
  /** ร้านที่รายการครอบคลุม — ใช้ใน WHERE ตั้งแต่ query แรกเสมอ ห้าม post-check */
  shopIds: string[];
  /** ร้านที่ active จริง — ใช้ได้เฉพาะเป็นค่าตั้งต้นของ action ที่ "ไม่มีเธรด" (BR-UNI-07) */
  activeShopId: string;
  activeKind: "PERSONAL" | "BUSINESS";
  activeRole: "OWNER" | "ADMIN";
  /** true = ร้าน active ถูก package lock (read-only) — คงความหมายเดิมของ resolveActiveShopContext */
  activeLocked: boolean;
  activeLockReason: string | null;
}

type SessionLike = {
  user?: { id?: string | null; activeShopId?: string | null } | null;
} | null;

/** normalizeMode — ค่าที่ไม่รู้จักในคอลัมน์ตกเป็น SINGLE เสมอ (fail-closed)
 *  คอลัมน์เป็น TEXT ไม่มี CHECK รายชื่อค่า (ตั้งใจ ดู migration) ด่านจึงอยู่ที่นี่กับ Valibot ขาเขียน */
export function normalizeChatScopeMode(raw: unknown): ChatScopeMode {
  return raw === "UNIFIED" ? "UNIFIED" : "SINGLE";
}

/**
 * resolveChatScope — จุดเดียวที่ตอบว่า "หน้าแชทนี้มองร้านไหนอยู่"
 *
 * คืน null เมื่อ resolve ร้าน active ไม่ได้เลย (ร้านถูกลบ/หลุดสิทธิ์/ไม่มี session) — caller
 * ต้องแสดง error state ตรง ๆ **ห้าม fallback เงียบ ๆ ไป PERSONAL** (นั่นคือบั๊กเดิมที่
 * inbox/page.tsx เคยมีก่อน 2026-07)
 *
 * โหมด UNIFIED ที่ listAccessibleShopIds คืนร้านเดียว จะถูกลดเป็น mode='SINGLE' ตั้งแต่ที่นี่
 * เพื่อให้ทุก UI ข้างบนเช็คที่เดียว (`scope.mode === 'UNIFIED'`) แล้วได้ผลถูกต้องเสมอ —
 * ไม่ต้องมีใครจำว่า "ต้องเช็ค shopIds.length ด้วยนะ" ซึ่งเป็นเงื่อนไขที่คนลืมได้ทุกจุด
 */
export async function resolveChatScope(session: SessionLike): Promise<ChatScope | null> {
  const userId = session?.user?.id;
  if (!userId) return null;

  // ยิงขนานกับ resolveActiveShopContext — คอลัมน์นี้เป็น PK lookup ตัวเดียว ไม่ได้เพิ่ม
  // เวลารอจริงให้โหมด SINGLE (NFR "โหมดเดิมต้องไม่ช้าลง")
  //
  // ทำไมอ่านจาก DB ไม่ฝังใน JWT: ค่าที่ฝังใน token จะค้างจนกว่า session จะ refresh ซึ่งแปลว่า
  // ผู้ใช้กดสลับโหมดแล้วอาจไม่เห็นผลจนกว่าจะ re-login — ราคาที่จ่ายคือ query เดียว
  const [activeCtx, row] = await Promise.all([
    resolveActiveShopContext({
      user: { id: userId, activeShopId: session?.user?.activeShopId ?? null },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { chatScopeMode: true } }),
  ]);

  if (!activeCtx) return null;

  const storedMode = normalizeChatScopeMode(row?.chatScopeMode);

  if (storedMode === "SINGLE") {
    return {
      mode: "SINGLE",
      storedMode,
      shopIds: [activeCtx.shopId],
      activeShopId: activeCtx.shopId,
      activeKind: activeCtx.kind,
      activeRole: activeCtx.role,
      activeLocked: activeCtx.locked,
      activeLockReason: activeCtx.lockReason,
    };
  }

  const accessible = await listAccessibleShopIds(userId);
  // defensive: activeShopId ต้องอยู่ในรายการเสมอ (resolveActiveShopContext เพิ่ง verify ไปแล้ว)
  // แต่ถ้า race กับการถูกถอดสิทธิ์พอดี ให้ยังเห็นร้าน active ของตัวเองไว้ก่อน ดีกว่ารายการว่างเปล่า
  const shopIds = accessible.includes(activeCtx.shopId)
    ? accessible
    : [activeCtx.shopId, ...accessible];

  return {
    // ร้านเดียว = ไม่มีอะไรให้รวม → ลดเป็น SINGLE ตั้งแต่ที่นี่ (ดู comment หัวฟังก์ชัน)
    mode: shopIds.length > 1 ? "UNIFIED" : "SINGLE",
    storedMode,
    shopIds,
    activeShopId: activeCtx.shopId,
    activeKind: activeCtx.kind,
    activeRole: activeCtx.role,
    activeLocked: activeCtx.locked,
    activeLockReason: activeCtx.lockReason,
  };
}

/**
 * intersectScopedShopIds — ตัดตัวกรองร้าน/เพจที่ client ส่งมาให้อยู่ในขอบเขตเสมอ (BR-UNI-02)
 *
 * 🛑 คืน [] (ผลลัพธ์ว่าง) เมื่อ id ที่ขอมาอยู่นอกขอบเขต — **ห้ามคืน scope.shopIds ทั้งก้อน**
 * (นั่นคือการเพิกเฉยต่อตัวกรอง = แสดงข้อมูลที่ผู้ใช้ไม่ได้ขอ) และ **ห้ามโยน 403**
 * (403 ยืนยันว่าร้านนั้นมีอยู่จริง — เป็นการรั่วข้อมูลที่ตอบไปโดยไม่ตั้งใจ)
 *
 * requested = undefined/null/'' → ไม่กรอง คืนทั้งขอบเขต
 */
export function intersectScopedShopIds(
  scopeShopIds: string[],
  requested?: string | string[] | null,
): string[] {
  if (!requested || (Array.isArray(requested) && requested.length === 0)) return scopeShopIds;
  const wanted = new Set(Array.isArray(requested) ? requested : [requested]);
  return scopeShopIds.filter((id) => wanted.has(id));
}
