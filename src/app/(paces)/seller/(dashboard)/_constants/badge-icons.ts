// แยกออกมาเป็น single source of truth — map นี้ใช้ทั้ง AchievementLevel widget และ /badges page

export const LUCIDE_FOR_BADGE: Record<string, string> = {
  'First Sale':          'lucide:store',
  'Trusted Seller 50':   'lucide:star',
  'Century Club':        'lucide:trophy',
  'Perfect Rating':      'lucide:gem',
  'Highly Rated':        'lucide:sparkles',
  'Zero Complaint':      'lucide:shield-check',
  'Veteran':             'lucide:medal',
  'Speed Demon':         'lucide:zap',
  'Fully Verified':      'lucide:badge-check',
  'Community Favorite':  'lucide:heart',
  // ── P1 — 7 badge ใหม่ (fallback เมื่อ imageUrl ว่าง; ปกติ render รูป asset จาก badge.imageUrl) ──
  'Getting Started':     'lucide:sprout',
  'Rising Seller':       'lucide:trending-up',
  'Well Rated':          'lucide:thumbs-up',
  'Getting Noticed':     'lucide:eye',
  'Spotless 100':        'lucide:sparkles',
  '3 Months Strong':     'lucide:calendar-check',
  'Same-Day Hero':       'lucide:rocket',
}

export const FALLBACK_LUCIDE = 'lucide:award'
