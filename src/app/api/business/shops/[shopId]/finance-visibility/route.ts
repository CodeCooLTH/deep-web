import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// body validate inline (ไม่แตะ src/lib/validations.ts — เลี่ยง conflict กับ Unit 1 ที่แก้ไฟล์เดียวกันขนานกัน)
const Body = v.object({
  staffCanViewFinance: v.boolean(),
});

/**
 * PATCH /api/business/shops/[shopId]/finance-visibility — feature 00016 Unit 4 (TFR-010)
 *
 * Toggle Shop.staffCanViewFinance — owner-only, "ไม่ผ่าน" resolveExpenseAccess() (mirror guard
 * ของ src/app/api/business/shops/[shopId]/onboarding/route.ts ตรง ๆ): getServerSession → 401,
 * findUnique(shopId) select userId/kind/deletedAt → ไม่พบ/ไม่ใช่ BUSINESS/ถูกลบ → 404 (context
 * isolation — ไม่บอก caller ว่า shop มีอยู่จริงไหม), shop.userId !== session.user.id → 403 NOT_OWNER.
 * ให้ owner แก้ค่านี้ได้คนเดียว — admin member ไม่มีสิทธิ์ toggle (SDS §4.6 / API.md §4.6)
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { shopId } = await params;

  const parsed = v.safeParse(Body, await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, userId: true, kind: true, deletedAt: true },
  });
  // ไม่มี/ไม่ใช่ BUSINESS/ถูกลบ → 404 (context isolation — ไม่บอก caller ว่า shop มีอยู่จริงไหม)
  if (!shop || shop.kind !== "BUSINESS" || shop.deletedAt) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // owner-only — toggle นี้สงวนสิทธิ์เจ้าของเท่านั้น (mirror onboarding route NOT_OWNER)
  if (shop.userId !== userId) {
    return NextResponse.json({ error: "NOT_OWNER" }, { status: 403 });
  }

  const { staffCanViewFinance } = parsed.output;

  try {
    await prisma.shop.update({ where: { id: shop.id }, data: { staffCanViewFinance } });
    return NextResponse.json({ ok: true, staffCanViewFinance });
  } catch (e) {
    console.error("[PATCH /api/business/shops/[shopId]/finance-visibility] shopId:", shopId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
