import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { sessionUserId } from "@/lib/session-user";
import { ChangeMemberRoleSchema } from "@/lib/validations";
import { memberErrorResponse } from "@/lib/shop-member-errors";
import { changeMemberRole, removeShopMember } from "@/services/shop-member.service";

/**
 * /api/business/shops/[shopId]/members/[memberId]
 * - PATCH  { role } — เจ้าของ (หลัก/ร่วม) เปลี่ยนบทบาทสมาชิก (EXT 2026-10-05 BR-MR-01/02)
 * - DELETE — เจ้าของ (หลัก/ร่วม) ลบสมาชิก (BR-MR-07)
 *
 * ทำไม callerId derive จาก session เท่านั้น: ดู src/app/api/business/subscribe/route.ts
 * เอกสาร: docs/20 - Features/00012 - Shop Staff Invite Links/EXTENSIONS-2026-10-05-member-roles.md
 */
type Ctx = { params: Promise<{ shopId: string; memberId: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const callerId = sessionUserId(await getServerSession(authOptions));
  if (!callerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { shopId, memberId } = await params;

  const parsed = v.safeParse(ChangeMemberRoleSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    await changeMemberRole(callerId, shopId, memberId, parsed.output.role);
    return NextResponse.json({ role: parsed.output.role });
  } catch (e: unknown) {
    const res = memberErrorResponse(e);
    if (res) return res;
    console.error("[PATCH members/[memberId]] shopId:", shopId, "memberId:", memberId, e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const callerId = sessionUserId(await getServerSession(authOptions));
  if (!callerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { shopId, memberId } = await params;

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
