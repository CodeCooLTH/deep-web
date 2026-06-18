// badge-progress — achievement ของ seller สำหรับ Summary step (feature 00001 step 5)
// คืน badge ทั้งหมด (audience seller+any) พร้อม earned/progress; shape ให้ OnboardingModal
// ใช้ได้ตรง (nameTH = badge.name ไทย; icon = short tabler name). Trace: SRS TFR-012
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBadgeProgress } from "@/services/badge.service";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const progress = await getBadgeProgress(userId, "seller");
  const items = progress.map((p) => ({
    badge: { id: p.badge.id, nameTH: p.badge.name, nameEN: p.badge.nameEN, icon: "award" },
    earned: p.earned,
    progressLabel: p.progressLabel,
    progressRatio: p.progressRatio,
  }));
  return NextResponse.json(items);
}
