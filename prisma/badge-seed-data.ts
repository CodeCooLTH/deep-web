// Badge seed data — pure module ไม่มี side effect (ไม่ import PrismaClient/ไม่เรียก main())
// แยกออกจาก seed.ts เพื่อให้ test/script import defaultBadges ได้โดยไม่ trigger
// main() ของ seed.ts (ซึ่ง seed admin/test user/mock data — destructive ตอน test)
// imageUrl: ใส่เฉพาะ entry ที่มี SVG asset; 11 entry เดิมไม่มี (undefined = omit)
export type BadgeSeed = {
  name: string;
  nameEN: string;
  icon: string | null;
  type: string;
  audience: string;
  criteria: object;
  imageUrl?: string | null;
};

export const defaultBadges: BadgeSeed[] = [
  // ── 11 badges เดิม (10 SELLER + Fully Verified ANY; มี audience field) ──────────────────────────
  { name: "เปิดหน้าร้าน",       nameEN: "First Sale",         icon: "🏪", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "FIRST_ORDER" } },
  { name: "ร้านค้าขายอดนิยม",  nameEN: "Trusted Seller 50",  icon: "⭐", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "ORDER_COUNT", count: 50 } },
  { name: "ร้อยออเดอร์",        nameEN: "Century Club",       icon: "💯", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "ORDER_COUNT", count: 100 } },
  { name: "ร้านคะแนนเต็ม",     nameEN: "Perfect Rating",     icon: "💎", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "PERFECT_RATING", minReviews: 10 } },
  { name: "ร้านคะแนนสูง",      nameEN: "Highly Rated",       icon: "🌟", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "HIGH_RATING", minRating: 4.8, minReviews: 20 } },
  { name: "ไร้ข้อร้องเรียน",   nameEN: "Zero Complaint",     icon: "🛡️", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "ZERO_COMPLAINT", minOrders: 50 } },
  { name: "ร้านค้าเก่าแก่",    nameEN: "Veteran",            icon: "🏆", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "VETERAN", minDays: 365 } },
  { name: "จัดส่งสายฟ้า",      nameEN: "Speed Demon",        icon: "⚡", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "FAST_SHIPPING", maxHours: 24, minOrders: 20 } },
  { name: "ยืนยันครบถ้วน",     nameEN: "Fully Verified",     icon: "✅", type: "VERIFICATION", audience: "ANY",    criteria: { type: "FULL_VERIFICATION" } },
  { name: "ขวัญใจชุมชน",       nameEN: "Community Favorite", icon: "❤️", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "UNIQUE_REVIEWERS", count: 50 } },
  // ── badge ใหม่ (Phase 3) ──────────────────────────────────────────────────────────────────────
  // icon: null — engine ใช้ fallback SVG/image แทน emoji สำหรับ badge ปี
  { name: "ปี 2026",            nameEN: "2026_BADGE",         icon: null, type: "ACHIEVEMENT",  audience: "ANY",    criteria: { type: "SIGNUP_YEAR", year: 2026 } },
  // ── P1 — 7 badge ใหม่ ฝั่ง seller, reuse engine, ไม่มี reward ──
  { name: "เริ่มมีลูกค้า",       nameEN: "Getting Started",    icon: "🌱", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "ORDER_COUNT", count: 10 },                                  imageUrl: "/images/badges/seller/getting-started.svg" },
  { name: "ร้านกำลังโต",        nameEN: "Rising Seller",      icon: "📈", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "ORDER_COUNT", count: 25 },                                  imageUrl: "/images/badges/seller/rising-seller.svg" },
  { name: "คะแนนดีน่าซื้อ",     nameEN: "Well Rated",         icon: "👍", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "HIGH_RATING", minRating: 4.5, minReviews: 10 },            imageUrl: "/images/badges/seller/well-rated.svg" },
  { name: "เริ่มเป็นที่รู้จัก",  nameEN: "Getting Noticed",    icon: "👀", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "UNIQUE_REVIEWERS", count: 10 },                             imageUrl: "/images/badges/seller/getting-noticed.svg" },
  { name: "ขายดีไร้ปัญหา",      nameEN: "Spotless 100",       icon: "✨", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "ZERO_COMPLAINT", minOrders: 100 },                          imageUrl: "/images/badges/seller/spotless-100.svg" },
  { name: "เปิดร้านครบไตรมาส",  nameEN: "3 Months Strong",    icon: "📅", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "VETERAN", minDays: 90 },                                    imageUrl: "/images/badges/seller/3-months-strong.svg" },
  { name: "ส่งไวระดับเทพ",      nameEN: "Same-Day Hero",      icon: "🚀", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "FAST_SHIPPING", maxHours: 12, minOrders: 20 },              imageUrl: "/images/badges/seller/same-day-hero.svg" },
];
