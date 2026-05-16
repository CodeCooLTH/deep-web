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
}

export const FALLBACK_LUCIDE = 'lucide:award'
