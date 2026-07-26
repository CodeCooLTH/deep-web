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

type GuardResult = { error: NextResponse } | { shopId: string };

/** ต้องเป็นสมาชิกของร้านปัจจุบัน (OWNER หรือ ADMIN) */
export async function requireShopMember(): Promise<GuardResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: jsonNoStore({ error: "unauthorized" }, { status: 401 }) };
  // cast จำเป็น: NextAuth Session.user ไม่ประกาศ id/activeShopId และโปรเจกต์ไม่มี d.ts
  // augmentation (comment ใน shop-context ที่ว่า "รับ Session ตรง ๆ ได้" ไม่จริงที่ call site)
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  );
  if (!active) return { error: jsonNoStore({ error: "FORBIDDEN" }, { status: 403 }) };
  return { shopId: active.shop.id };
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
  return { shopId: ctx.shopId };
}

type GeneralGuardResult =
  | { error: NextResponse }
  | { shopId: string; userId: string; role: "OWNER" | "ADMIN" };

/**
 * ต้องเป็นสมาชิกร้าน + ร้านต้องเป็นประเภทสินค้าและบริการ (feature 00022)
 *
 * ฝาแฝดของ requireLodgingShop ด้านบน แต่กลับข้าง — ใช้กับโดเมนที่ "ร้านบ้านพักไม่มี"
 * เช่นการเชื่อมต่อขนส่ง (BR-ISHIP-01/02): การจองที่พักไม่มีพัสดุให้ส่ง
 *
 * IMPORTANT: การซ่อนเมนูไม่ใช่การควบคุมสิทธิ์ — ร้าน LODGING ที่ยิงตรงต้องได้ 403
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
  if (active.shop.vertical !== "GENERAL") {
    return {
      error: jsonNoStore(
        {
          error: {
            code: "NOT_ELIGIBLE",
            message: "ร้านประเภทบ้านพักไม่รองรับการเชื่อมต่อระบบขนส่ง",
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
