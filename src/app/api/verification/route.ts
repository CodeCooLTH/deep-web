import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { submitVerification, getVerifications } from "@/services/verification.service";
import { requireActiveShop } from "@/lib/shop-context";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;
  // active shop context (P5-1): Personal → shopId null (เดิม), Business → แยกต่อร้าน
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  );
  const records = await getVerifications({
    userId,
    shopId: active?.kind === "BUSINESS" ? active.shop.id : null,
  });
  return NextResponse.json(records);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  );
  const body = await request.json();
  const record = await submitVerification(
    userId,
    body,
    active?.kind === "BUSINESS" ? active.shop.id : null,
  );
  return NextResponse.json(record, { status: 201 });
}
