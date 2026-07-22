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
