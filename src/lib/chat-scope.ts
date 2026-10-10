import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbiddenRoleResponse } from "@/lib/forbidden-role";
import { isShopMember, resolveActiveShopContext } from "@/lib/shop-context";
import { effectiveRoles, ForbiddenRoleError, listAccessibleShopIds } from "@/lib/shop-capability";
import { can } from "@/lib/shop-permissions";

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

/**
 * capability ที่ขอบเขตแชทรับได้ (00071 S-13) — บังคับให้ผู้เรียกบอกเสมอว่า "จะทำอะไร"
 * ไม่มีค่าตั้งต้น: overload "ทุกร้านที่เป็นสมาชิก" คือที่มาของช่องโหว่ BILLING/TECHNICIAN เห็นแชท
 */
export type ChatCap = "H1" | "H2" | "H3" | "X2" | "X3";

export interface ChatScope {
  /** โหมดที่ *มีผลจริง* หลัง resolve แล้ว — ผู้ใช้ตั้ง UNIFIED ไว้แต่เข้าถึงร้านเดียวจะได้ 'SINGLE' */
  mode: ChatScopeMode;
  /** โหมดดิบที่ผู้ใช้ตั้งไว้ (ใช้ตัดสินว่าจะโชว์ segment ไหนถูกเลือกใน UI) */
  storedMode: ChatScopeMode;
  /** ร้านที่รายการครอบคลุม — ใช้ใน WHERE ตั้งแต่ query แรกเสมอ ห้าม post-check
   *  00071: มี "เฉพาะร้านที่ผู้ใช้ถือ cap ที่ขอ" — ว่าง = มีร้านแต่ไม่มีสิทธิ์ (ผู้เรียกตอบ 403 FORBIDDEN_ROLE) */
  shopIds: string[];
  /** ร้าน active ถือ cap ที่ขอหรือไม่ — false = ห้ามใช้ activeShopId เป็นค่าตั้งต้นของ action ใด ๆ */
  activeHasCap: boolean;
  /** ร้านที่ active จริง — ใช้ได้เฉพาะเป็นค่าตั้งต้นของ action ที่ "ไม่มีเธรด" (BR-UNI-07) */
  activeShopId: string;
  activeKind: "PERSONAL" | "BUSINESS";
  activeRole: "OWNER" | "ADMIN";
  activeRoles: string[];
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
export async function resolveChatScope(session: SessionLike, cap: ChatCap): Promise<ChatScope | null> {
  const userId = session?.user?.id;
  if (!userId) return null;

  // ยิงขนานกับ resolveActiveShopContext — คอลัมน์นี้เป็น PK lookup ตัวเดียว ไม่ได้เพิ่ม
  // เวลารอจริงให้โหมด SINGLE (NFR "โหมดเดิมต้องไม่ช้าลง")
  //
  // ทำไมอ่านจาก DB ไม่ฝังใน JWT: ค่าที่ฝังใน token จะค้างจนกว่า session จะ refresh ซึ่งแปลว่า
  // ผู้ใช้กดสลับโหมดแล้วอาจไม่เห็นผลจนกว่าจะ re-login — ราคาที่จ่ายคือ query เดียว
  // บทบาท (role+roles) มากับ resolveActiveShopContext / listAccessibleShopIds อยู่แล้ว → อ่านสดทุกคำขอ
  const [activeCtx, row] = await Promise.all([
    resolveActiveShopContext({
      user: { id: userId, activeShopId: session?.user?.activeShopId ?? null },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { chatScopeMode: true } }),
  ]);

  if (!activeCtx) return null;

  const storedMode = normalizeChatScopeMode(row?.chatScopeMode);
  // กฎ PERSONAL/BILLING อยู่ใน effectiveRoles ที่เดียว ไม่เขียนซ้ำ · userId ใส่เป็นของตัวเอง
  // เพราะ ChatCap ไม่มีตัวไหนอยู่ใน PRIMARY_OWNER_ONLY (T4) จึงไม่ต้องรู้เจ้าของหลัก
  const activeHasCap = can(
    effectiveRoles({ kind: activeCtx.kind, vertical: activeCtx.vertical, userId }, activeCtx.role, activeCtx.roles),
    cap,
  );

  const base = {
    storedMode,
    activeHasCap,
    activeShopId: activeCtx.shopId,
    activeKind: activeCtx.kind,
    activeRole: activeCtx.role,
    activeRoles: activeCtx.roles,
    activeLocked: activeCtx.locked,
    activeLockReason: activeCtx.lockReason,
  };

  if (storedMode === "SINGLE") {
    return { ...base, mode: "SINGLE", shopIds: activeHasCap ? [activeCtx.shopId] : [] };
  }

  // UNIFIED: เฉพาะร้านที่ถือ cap นี้ — ร้านที่ผู้ใช้เป็น BILLING/TECHNICIAN ไม่เข้าขอบเขตเลย
  const shopIds = await listAccessibleShopIds(userId, cap);

  return {
    ...base,
    // ร้านเดียว = ไม่มีอะไรให้รวม → ลดเป็น SINGLE ตั้งแต่ที่นี่ (ดู comment หัวฟังก์ชัน)
    mode: shopIds.length > 1 ? "UNIFIED" : "SINGLE",
    shopIds,
  };
}

/**
 * chatScopeOrDeny — แปลงผล resolveChatScope เป็นคำตอบของ route (00071 S-13)
 *   null → 404 ไม่พบร้าน (คงพฤติกรรมเดิม) · shopIds ว่าง → 403 FORBIDDEN_ROLE (ร้านมี แต่ไม่ถือ cap)
 * ผู้เรียก: `const r = chatScopeOrDeny(await resolveChatScope(session, 'H1')); if ('response' in r) return r.response`
 * (resolveChatScope ต้องถูกเรียกด้วย literal cap ใน route เองเพื่อให้ทะเบียน/ตัวสแกนเห็น)
 */
export function chatScopeOrDeny(
  scope: ChatScope | null,
): { scope: ChatScope } | { response: NextResponse } {
  if (!scope) return { response: NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 }) };
  if (scope.shopIds.length === 0) return { response: forbiddenRoleResponse() };
  return { scope };
}

/** ผู้ใช้เป็นสมาชิกของร้านนั้นแต่บทบาทไม่ถือ cap — ผู้เรียกตอบ 403 FORBIDDEN_ROLE (ไม่ใช่ 404) */
export type RoleDenied = { denied: true };

/**
 * ตัดสินว่า "ไม่ผ่าน" เพราะบทบาท (403) หรือเพราะไม่มี/ไม่ใช่สมาชิก (404)
 * 403 เฉพาะสมาชิกของร้านนั้น — คนนอกร้านยังได้ 404 เหมือนเดิม (403 ให้คนนอกยืนยันว่ามีร้าน/เธรดนี้ = รั่วข้อมูล)
 * คืนค่าเฉพาะบนเส้นทางที่ miss แล้วเท่านั้น จึงไม่เพิ่ม query ให้ทางปกติ
 */
async function memberLacksCap(shopId: string, userId: string): Promise<boolean> {
  return isShopMember(shopId, userId);
}

/**
 * resolveConversationShopId — "เธรดนี้อยู่ร้านไหน" โดย scope สิทธิ์ไว้ใน WHERE ตั้งแต่คำสั่งแรก
 *
 * ใช้กับ route ที่ทำงานกับเธรดใดเธรดหนึ่ง (`/api/chat/conversations/[id]/**`) ซึ่งเดิม scope
 * ด้วยร้านที่ active — พอมีกล่องแชทรวม เธรดที่เปิดอยู่อาจเป็นของอีกร้าน แล้ว route เหล่านั้นจะ
 * ตอบ 404 ทั้งที่ผู้ใช้มีสิทธิ์เต็ม (อาการเดียวกับบั๊ก push notification เมื่อ 2026-08-06)
 *
 * 00071: cap บังคับ — ร้านที่ผู้ใช้ไม่ถือ cap ไม่เข้า WHERE
 * คืน null = "ไม่มีเธรดนี้" หรือ "ไม่ใช่สมาชิกร้านของเธรด" (404 เหมือนกัน ไม่ใช่ 403 — 403 ยืนยันว่าเธรดมีอยู่จริง)
 * คืน {denied} = เป็นสมาชิกร้านของเธรด แต่บทบาทไม่ถือ cap (403 FORBIDDEN_ROLE)
 */
export async function resolveConversationShopId(
  session: SessionLike,
  conversationId: string,
  cap: ChatCap,
): Promise<{ scope: ChatScope; shopId: string } | RoleDenied | null> {
  const scope = await resolveChatScope(session, cap);
  if (!scope) return null;
  const row = await prisma.conversation.findFirst({
    where: { id: conversationId, shopId: { in: scope.shopIds } },
    select: { shopId: true },
  });
  if (row) return { scope, shopId: row.shopId };
  // miss: แยก "บทบาทไม่พอ" ออกจาก "ไม่มี/ไม่ใช่ร้านของฉัน" — ยิงเฉพาะทางที่ปฏิเสธแล้ว
  const userId = session?.user?.id;
  if (!userId) return null;
  const any = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { shopId: true } });
  return any && (await memberLacksCap(any.shopId, userId)) ? { denied: true } : null;
}

/**
 * resolveScopedShopId — ร้านที่ route ระดับ "ตั้งค่ารายร้าน" ควรทำงานด้วย (กลุ่ม/แท็ก/ข้อความด่วน/โควตา AI)
 *
 * ของพวกนี้เป็นทรัพยากรของร้าน แต่ถูกใช้ "ในบริบทของเธรด" — client จึงส่ง ?shopId= ของเธรดมา
 * ไม่ส่ง = ร้านที่ active (พฤติกรรมเดิมทุกประการสำหรับผู้ใช้ร้านเดียว)
 *
 * 🛑 ต้อง intersect กับ scope เสมอ: ยิง shopId ที่ไม่มีสิทธิ์ต้องได้ null → ผู้เรียกตอบ 404
 * 00071: cap บังคับ · ไม่ส่ง shopId แต่ร้าน active ไม่ถือ cap → {denied} (ห้ามใช้ร้าน active เป็นค่าตั้งต้น)
 * ส่ง shopId ของร้านที่เป็นสมาชิกแต่ไม่ถือ cap → {denied} (403) · ร้านของคนอื่น → null (404)
 */
export async function resolveScopedShopId(
  session: SessionLike,
  requestedShopId: string | null | undefined,
  cap: ChatCap,
): Promise<{ scope: ChatScope; shopId: string } | RoleDenied | null> {
  const scope = await resolveChatScope(session, cap);
  if (!scope) return null;
  if (!requestedShopId) return scope.activeHasCap ? { scope, shopId: scope.activeShopId } : { denied: true };
  if (scope.shopIds.includes(requestedShopId)) return { scope, shopId: requestedShopId };
  const userId = session?.user?.id;
  return userId && (await memberLacksCap(requestedShopId, userId)) ? { denied: true } : null;
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

/**
 * assertShopsHoldCap — ทุกร้านใน shopIds ต้องเป็นร้านที่ผู้ใช้ "ถือ cap นี้" (1 query · 00071 S-13)
 * แทน assertShopsAccessible (แค่เป็นสมาชิก) ในชั้น service: shopIds ควรมาจาก resolveChatScope(cap) อยู่แล้ว
 * ด่านนี้กันคนเผลอส่งค่าจากที่อื่นเข้ามา — ไม่ผ่าน = ForbiddenRoleError (route → 403 FORBIDDEN_ROLE)
 */
export async function assertShopsHoldCap(shopIds: string[], userId: string, cap: ChatCap): Promise<void> {
  if (shopIds.length === 0) return;
  const allowed = new Set(await listAccessibleShopIds(userId, cap));
  if (shopIds.some((id) => !allowed.has(id))) throw new ForbiddenRoleError();
}

/**
 * userIdsHoldingCap — ผู้ใช้ที่ "ถือ cap นี้" ของแต่ละร้านใน shopIds (1 query · 00071 S-13)
 *
 * ใช้คัดผู้รับ push/เตือนงาน: เดิมส่งหา "เจ้าของ + สมาชิกทุกคน" ⇒ BILLING/TECHNICIAN ได้เสียงเตือนแชท
 * ที่เปิดอ่านไม่ได้ (ได้ 403) · กฎ PERSONAL/BILLING อยู่ใน effectiveRoles ที่เดียว (ไม่เขียนซ้ำ)
 * ร้าน PERSONAL = เจ้าของ · ร้านทีม = ต้องมีแถว ShopMember (เหมือน canAccessShopWith)
 */
export async function userIdsHoldingCap(shopIds: string[], cap: ChatCap): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>(shopIds.map((id) => [id, new Set<string>()]));
  if (shopIds.length === 0) return out;
  const shops = await prisma.shop.findMany({
    where: { id: { in: shopIds } },
    select: {
      id: true, userId: true, kind: true, vertical: true,
      members: { select: { userId: true, role: true, roles: true } },
    },
  });
  for (const shop of shops) {
    const set = out.get(shop.id);
    if (!set) continue;
    if (shop.kind === "PERSONAL") {
      if (can(effectiveRoles(shop, "OWNER", []), cap)) set.add(shop.userId);
      continue;
    }
    for (const m of shop.members) {
      if (can(effectiveRoles(shop, m.role, m.roles), cap)) set.add(m.userId);
    }
  }
  return out;
}
