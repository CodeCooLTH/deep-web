// badge-progress — achievement ของ seller สำหรับ Summary step (feature 00001 step 5)
// คืน badge ทั้งหมด (audience seller+any) พร้อม earned/progress; shape ให้ OnboardingModal
// ใช้ได้ตรง (nameTH = badge.name ไทย; icon = short tabler name). Trace: SRS TFR-012
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBadgeProgress, toBadgeScope } from "@/services/badge.service";
import { requireActiveShop } from "@/lib/shop-context";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 🛑 scope ด้วยร้านที่เปิดอยู่ — เหรียญของร้าน BUSINESS เก็บที่ UserBadge.shopId ถ้าไม่ส่ง
  // shopOverride จะตกไปร้าน PERSONAL เสมอ แล้วขั้น Summary ของ onboarding จะโชว์ของคนละร้าน
  const active = await requireActiveShop(session as { user?: { id?: string | null; activeShopId?: string | null } | null });
  const scope = toBadgeScope(active, userId);

  const progress = await getBadgeProgress(scope.ownerUserId, "seller", scope.shop);
  const items = progress.map((p) => ({
    badge: { id: p.badge.id, nameTH: p.badge.name, nameEN: p.badge.nameEN, icon: "award" },
    earned: p.earned,
    progressLabel: p.progressLabel,
    progressRatio: p.progressRatio,
  }));
  return NextResponse.json(items);
}
