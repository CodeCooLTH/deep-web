import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { keepErrorCode } from "@/lib/legacy-forbidden";
import { ChangeMemberRoleSchema } from "@/lib/validations";
import { memberErrorResponse } from "@/lib/shop-member-errors";
import { changeMemberRole, removeShopMember } from "@/services/shop-member.service";

/**
 * /api/business/shops/[shopId]/members/[memberId]
 * - PATCH  { role?, roles? } — เจ้าของ (หลัก/ร่วม) เปลี่ยนบทบาทสมาชิก (EXT 2026-10-05 BR-MR-01/02)
 * - DELETE — เจ้าของ (หลัก/ร่วม) ลบสมาชิก (BR-MR-07)
 *
 * ทำไม callerId derive จาก session เท่านั้น: ดู src/app/api/business/subscribe/route.ts
 * เอกสาร: docs/20 - Features/00012 - Shop Staff Invite Links/EXTENSIONS-2026-10-05-member-roles.md
 */
type Ctx = { params: Promise<{ shopId: string; memberId: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  const { shopId, memberId } = await params;
  // 00071 T2: ด่านบทบาทก่อน · กฎ BR-MR (เจ้าของร่วม/หลัก ใน service) คงเดิมเป็นด่านที่สอง
  const gate = await requireShopCapability(session, "T2", { shopId });
  if (!gate.ok) return keepErrorCode(gate.response, "NOT_OWNER");
  const callerId = gate.userId;

  const parsed = v.safeParse(ChangeMemberRoleSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const { role, roles } = await changeMemberRole(callerId, shopId, memberId, parsed.output);
    return NextResponse.json({ role, roles });
  } catch (e: unknown) {
    const res = memberErrorResponse(e);
    if (res) return res;
    console.error("[PATCH members/[memberId]] shopId:", shopId, "memberId:", memberId, e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  const { shopId, memberId } = await params;
  // 00071 T2: ด่านบทบาทก่อน · กฎ BR-MR (เจ้าของร่วม/หลัก ใน service) คงเดิมเป็นด่านที่สอง
  const gate = await requireShopCapability(session, "T2", { shopId });
  if (!gate.ok) return keepErrorCode(gate.response, "NOT_OWNER");
  const callerId = gate.userId;

  try {
    await removeShopMember(callerId, shopId, memberId);
    return NextResponse.json({ status: "REMOVED" });
  } catch (e: unknown) {
    const res = memberErrorResponse(e);
    if (res) return res;
    console.error("[DELETE members/[memberId]] shopId:", shopId, "memberId:", memberId, e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
