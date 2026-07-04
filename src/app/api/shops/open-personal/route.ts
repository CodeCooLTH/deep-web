/**
 * POST /api/shops/open-personal — "เปิดร้านของฉัน" (feature 00012 §4.5 Lazy Personal shop)
 *
 * หลัง Lazy Personal shop cutover ไม่ auto-create Personal shop ตอน login อีกต่อไป — user ที่ถูกเชิญ
 * เป็นแอดมิน business เท่านั้น (ไม่มี Personal shop) ต้องกดปุ่มนี้เพื่อ "เปิดร้านของฉันเอง" ก่อนถึงจะ
 * เข้า onboarding wizard ได้. Idempotent: ถ้ามี Personal shop อยู่แล้ว → คืน shopId เดิม (ไม่สร้างซ้ำ)
 *
 * Base pattern: src/app/api/shops/update/route.ts (session cast + error shape)
 * ใช้ ensurePersonalShop (@/lib/shop-context) เป็นแหล่ง truth เดียวของ "สร้าง Personal shop"
 * (invariant D1 เดิม — resolve-if-exists-else-create) แล้ว set user.isShop=true คู่กัน
 *
 * API spec: docs/superpowers/specs/2026-07-04-shop-staff-invite-link-ux-spec.md (open-personal API section)
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalShop } from "@/lib/shop-context";

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    // ensurePersonalShop เป็น idempotent อยู่แล้ว (resolve ก่อน สร้างเฉพาะไม่มี) — เรียกซ้ำได้ปลอดภัย
    const personalShop = await ensurePersonalShop(userId);

    // isShop=true เป็น flag แสดงว่า user คนนี้ "เป็นผู้ขาย" แล้ว (เทียบ downstream ที่เช็ค user.isShop)
    // update แยกจาก ensurePersonalShop เพราะ user ที่มี Personal shop มาก่อนหน้านี้แล้วอาจมี isShop=true อยู่แล้ว
    // — update ซ้ำไม่มีผลข้างเคียง (idempotent)
    await prisma.user.update({ where: { id: userId }, data: { isShop: true } });

    return NextResponse.json({ shopId: personalShop.id });
  } catch (e: unknown) {
    console.error("[POST /api/shops/open-personal] userId:", userId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
