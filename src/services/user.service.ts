import { prisma } from "@/lib/prisma";

export async function findOrCreateByPhone(phone: string, displayName?: string) {
  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        phone,
        displayName: displayName || `User_${phone.slice(-4)}`,
        username: `user_${Date.now()}`,
        authAccounts: {
          create: { provider: "PHONE", providerAccountId: phone },
        },
      },
    });
  }
  return user;
}

// P2-3 (feature 00008 Phase 2 cutover): User.shop (1:1) → User.shops (1:N) — include:{shop:true}
// ใช้ไม่ได้อีกต่อไป เปลี่ยนเป็น shops:{where:{kind:'PERSONAL'}} แล้ว remap คง shape เดิม (`.shop`)
// ให้ caller เดิม (u/[username], public/profile) ไม่ต้องแก้
export async function findByUsername(username: string) {
  const u = await prisma.user.findUnique({
    where: { username },
    include: {
      shops: { where: { kind: "PERSONAL" } },
      // orderBy earnedAt desc — หน้าโปรไฟล์โชว์ badge pill "3 ใบล่าสุดที่ได้รับ" (BadgePillRow)
      // ถ้าไม่เรียงตรงนี้ ลำดับจะขึ้นกับ insertion order ของ DB ซึ่งไม่มีความหมายกับผู้ใช้
      userBadges: { include: { badge: true }, orderBy: { earnedAt: "desc" } },
    },
  });
  if (!u) return null;
  /**
   * บัญชีที่ถูกลบ → ถือว่า "ไม่มีอยู่" ต่อสายตาสาธารณะ (App Store 5.1.1(v) / PDPA)
   *
   * จุดนี้เป็นคอขวดเดียวของทั้ง 3 ทางเข้าที่เปิดโปรไฟล์สาธารณะ — หน้า /u/[username],
   * GET /api/public/profile/[username] และ GET /api/app/users/[username] (แอปมือถือ)
   * ปิดที่นี่ที่เดียวจึงครอบครบ ไม่ต้องไล่แก้ทีละ call-site
   *
   * ทำไมสำคัญ: ระหว่างรอ purge 30 วัน แถว User ยังมี displayName/avatar/สินค้าครบ
   * ถ้าไม่กัน คนที่กด "ลบบัญชี" ไปแล้วจะยังถูกค้นเจอและเปิดดูโปรไฟล์ได้อีกเดือนหนึ่ง
   * (ร้าน BUSINESS ไม่มีปัญหานี้ — findShopBySlug กรอง deletedAt อยู่แล้ว)
   */
  if (u.deletedAt) return null;
  const { shops, ...rest } = u;
  return { ...rest, shop: shops[0] ?? null };
}

// updateProfile — แก้ได้เฉพาะ field ที่เจ้าของบัญชีตั้งเองได้
//
// pick ทีละ field แทนการส่ง `data` ต่อทั้งก้อน = ชั้นกันที่สอง (ชั้นแรกคือ UpdateProfileSchema ที่
// route parse): ถ้าวันหลังมี caller ใหม่ลืม parse ก่อนเรียก field แปลกปลอม (isAdmin/trustScore/
// passwordHash) ก็ยังตกที่นี่อยู่ดี — TS type อย่างเดียวกันไม่ได้ เพราะ object ที่มาจาก
// request.json() เป็น any ตอน runtime
//
// undefined = ไม่แตะ field นั้น (Prisma ข้ามให้เอง) ต่างจาก null ของ avatar ที่แปลว่า "ลบรูป"
export async function updateProfile(
  userId: string,
  data: {
    displayName?: string
    username?: string
    avatar?: string | null
    /** feature 00037 — มุมมองกล่องข้อความ "SINGLE" | "UNIFIED" */
    chatScopeMode?: string
  },
) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      displayName: data.displayName,
      username: data.username,
      avatar: data.avatar,
      chatScopeMode: data.chatScopeMode,
    },
    select: {
      id: true,
      displayName: true,
      username: true,
      avatar: true,
      phone: true,
      email: true,
      trustScore: true,
      isShop: true,
      chatScopeMode: true,
    },
  });
}

export async function linkBuyerHistory(userId: string, phone?: string, email?: string) {
  const conditions = [];
  if (phone) conditions.push({ buyerContact: phone });
  if (email) conditions.push({ buyerContact: email });
  if (conditions.length === 0) return;

  await prisma.order.updateMany({
    where: { buyerUserId: null, OR: conditions },
    data: { buyerUserId: userId },
  });

  await prisma.review.updateMany({
    where: { reviewerUserId: null, OR: conditions.map(c => ({ reviewerContact: c.buyerContact })) },
    data: { reviewerUserId: userId },
  });
}
