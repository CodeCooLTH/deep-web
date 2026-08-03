import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireActiveShop } from "@/lib/shop-context";
import { prisma } from "@/lib/prisma";

// Guard ร่วมของ endpoint ใต้ /api/shops/current/** (feature 00017 ดึงออกมาตอน P2
// เพราะเริ่มมีผู้เรียกหลายตัว — เดิม copy อยู่ใน rooms 2 ไฟล์)

// per-user data — กัน shared/carrier cache ส่งคำตอบข้ามผู้ใช้ (feedback_auth_api_cache_control)
export const NO_STORE = { "cache-control": "private, no-store" } as const;

export function jsonNoStore(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, { status: init?.status, headers: NO_STORE });
}

// userId เพิ่มตอน feature 00024 — ต้องบันทึกว่า "ใคร" เป็นคนเลื่อนนัดลงประวัติ (BR-RSV-30)
// additive: caller เดิมที่อ่านแค่ shopId ไม่กระทบ
type GuardResult = { error: NextResponse } | { shopId: string; userId: string };

/** ต้องเป็นสมาชิกของร้านปัจจุบัน (OWNER หรือ ADMIN) */
export async function requireShopMember(): Promise<GuardResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: jsonNoStore({ error: "unauthorized" }, { status: 401 }) };
  // cast จำเป็น: NextAuth Session.user ไม่ประกาศ id/activeShopId และโปรเจกต์ไม่มี d.ts
  // augmentation (comment ใน shop-context ที่ว่า "รับ Session ตรง ๆ ได้" ไม่จริงที่ call site)
  const typedSession = session as unknown as {
    user: { id: string; activeShopId?: string | null };
  };
  const active = await requireActiveShop(typedSession);
  if (!active) return { error: jsonNoStore({ error: "FORBIDDEN" }, { status: 403 }) };
  return { shopId: active.shop.id, userId: typedSession.user.id };
}

/**
 * ต้องเป็นสมาชิกร้าน + ร้านต้องเป็นประเภทบ้านพัก
 *
 * IMPORTANT: การซ่อนเมนูไม่ใช่การควบคุมสิทธิ์ (BR-LODG-03) — ทุก endpoint ของโดเมน
 * บ้านพักต้องผ่านด่านนี้ก่อนตรรกะอื่นเสมอ ร้าน GENERAL ที่ยิงตรงต้องได้ 403
 */
export async function requireLodgingShop(): Promise<GuardResult> {
  const ctx = await requireShopMember();
  if ("error" in ctx) return ctx;
  const shop = await prisma.shop.findUnique({
    where: { id: ctx.shopId },
    select: { vertical: true },
  });
  if (!shop || shop.vertical !== "LODGING") {
    return { error: jsonNoStore({ error: "NOT_LODGING_SHOP" }, { status: 403 }) };
  }
  return { shopId: ctx.shopId, userId: ctx.userId };
}

type GeneralGuardResult =
  | { error: NextResponse }
  | { shopId: string; userId: string; role: "OWNER" | "ADMIN" };

/**
 * ต้องเป็นสมาชิกร้าน + ร้านต้องเป็นประเภทขายออนไลน์ (feature 00022; ค่าที่เทียบเปลี่ยนเป็น
 * 'ONLINE_SALES' ที่ feature 00028 BR-SBT-12 — ชื่อฟังก์ชันคง legacy naming ไว้ตาม SDS TD-001
 * เพราะมี 20 ไฟล์ import ชื่อนี้อยู่ เปลี่ยนแค่ค่าที่เทียบภายใน ไม่ rename)
 *
 * ฝาแฝดของ requireLodgingShop ด้านบน แต่กลับข้าง — ใช้กับโดเมนที่ร้านไม่ใช่ขายออนไลน์ไม่มี
 * เช่นการเชื่อมต่อขนส่ง (BR-ISHIP-01/02): ร้านรับคิว/บ้านพักไม่มีพัสดุให้ส่ง
 *
 * IMPORTANT: การซ่อนเมนูไม่ใช่การควบคุมสิทธิ์ — ร้าน SERVICE_QUEUE/LODGING ที่ยิงตรงต้องได้ 403
 * ทุก endpoint ของโดเมนขนส่งต้องผ่านด่านนี้ก่อนตรรกะอื่นเสมอ
 *
 * ownerOnly: คำสั่งกลุ่มตั้งค่า/วาง token เป็นสิทธิ์ของเจ้าของร้านเท่านั้น (BR-ISHIP-03)
 * พนักงานร้านใช้งานประจำวันได้ (เปิดพัสดุ/พิมพ์ใบปะหน้า) แต่แตะ token ไม่ได้และไม่เห็นค่า
 */
export async function requireGeneralShop(opts?: {
  ownerOnly?: boolean;
}): Promise<GeneralGuardResult> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session?.user || !userId) {
    return { error: jsonNoStore({ error: { code: "UNAUTHORIZED" } }, { status: 401 }) };
  }

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  );
  if (!active) {
    return { error: jsonNoStore({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
  }

  // vertical มาจาก Shop row ที่ requireActiveShop ดึงมาแล้ว — ไม่ต้อง query ซ้ำ
  // feature 00028 (BR-SBT-12): ข้อความเดิมพูดถึงแค่บ้านพัก ตอนนี้ SERVICE_QUEUE ก็เข้าเงื่อนไข
  // นี้ด้วย — ใช้ข้อความกลางที่ไม่ระบุประเภทเฉพาะเจาะจง กันต้องแก้ซ้ำถ้ามีประเภทที่ 4 ในอนาคต
  if (active.shop.vertical !== "ONLINE_SALES") {
    return {
      error: jsonNoStore(
        {
          error: {
            code: "NOT_ELIGIBLE",
            message: "ร้านประเภทนี้ไม่รองรับการเชื่อมต่อระบบขนส่ง",
          },
        },
        { status: 403 },
      ),
    };
  }

  if (opts?.ownerOnly && active.role !== "OWNER") {
    return {
      error: jsonNoStore(
        {
          error: {
            code: "OWNER_ONLY",
            message: "เฉพาะเจ้าของร้านเท่านั้นที่ตั้งค่าการเชื่อมต่อขนส่งได้",
          },
        },
        { status: 403 },
      ),
    };
  }

  return { shopId: active.shop.id, userId, role: active.role };
}

/**
 * เช็ค vertical ของร้านที่ resolve แล้ว (จาก getShopByUserId หรือ requireActiveShop) ว่าเป็น
 * ONLINE_SALES หรือไม่ — ใช้กับ Inventory Add-on (feature 00028 BR-SBT-10, BRD §8.1 matrix:
 * สต็อกสินค้าเปิดเฉพาะ ONLINE_SALES) 7 endpoint ใต้ /api/inventory/**
 *
 * ทำไมไม่ทำเป็น requireXxxShop() เต็มรูปแบบเหมือน requireGeneralShop/requireLodgingShop:
 * 7 endpoint resolve shop ด้วย 2 pattern ต่างกันอยู่แล้ว (getShopByUserId 5 ไฟล์, requireActiveShop
 * 2 ไฟล์) — ฟังก์ชันนี้เป็น choke point ของ "ตรรกะ+ข้อความ error" เท่านั้น ไม่ผูกกับวิธี resolve shop
 * เพื่อไม่ต้อง refactor shop-resolution pattern เดิมที่ไม่เกี่ยวกับงานนี้
 *
 * IMPORTANT: การซ่อนเมนูไม่ใช่การควบคุมสิทธิ์ (BR-SBT-10) — ครอบทุก method รวม GET (บทเรียนจาก
 * auction ที่เคยลืม GET) คืน NextResponse (403) ถ้าไม่ผ่าน, null ถ้าผ่าน
 *
 * shape: flat `{ error: "CODE" }` ให้ตรงกับ error code เดิมในโดเมนเดียวกัน
 * (INVENTORY_NOT_ACTIVE/INVENTORY_NOT_PRO) ไม่ใช่ nested {code,message} แบบ requireGeneralShop
 */
export function requireOnlineSalesVertical(vertical: string): NextResponse | null {
  if (vertical !== "ONLINE_SALES") {
    return jsonNoStore({ error: "INVENTORY_NOT_ELIGIBLE" }, { status: 403 });
  }
  return null;
}
