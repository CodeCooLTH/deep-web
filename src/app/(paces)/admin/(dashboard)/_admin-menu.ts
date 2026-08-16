import { type MenuItemType } from '@/types'

export const adminMenuItems: MenuItemType[] = [
  {
    icon: 'chart-bar',
    slug: 'admin-overview',
    label: 'ภาพรวม',
    isTitle: true,
    children: [
      { url: '/dashboard', slug: 'admin:dashboard', label: 'ภาพรวม', icon: 'dashboard' },
    ],
  },
  {
    icon: 'users',
    slug: 'admin-people',
    label: 'ผู้ใช้',
    isTitle: true,
    children: [
      { url: '/users', slug: 'admin:users', label: 'ผู้ใช้งาน', icon: 'users' },
      { url: '/verifications', slug: 'admin:verifications', label: 'ยืนยันตัวตน', icon: 'shield-check' },
      { url: '/scam-reports', slug: 'admin:scam-reports', label: 'รายงานมิจฉาชีพ', icon: 'alert-triangle' },
    ],
  },
  {
    icon: 'briefcase',
    slug: 'admin-business',
    label: 'ธุรกิจ',
    isTitle: true,
    children: [
      { url: '/orders', slug: 'admin:orders', label: 'คำสั่งซื้อ', icon: 'receipt-2' },
      { url: '/subscriptions', slug: 'admin:subscriptions', label: 'แพ็กเกจ', icon: 'crown' },
      { url: '/topups', slug: 'admin:topups', label: 'เติมเงิน', icon: 'credit-card' },
      { url: '/badges', slug: 'admin:badges', label: 'ตราสัญลักษณ์', icon: 'award' },
    ],
  },
  {
    // กลุ่มใหม่ "ระบบ" — เครื่องมือ ops ภายใน ไม่ใช่ข้อมูลธุรกิจแบบ orders/topups
    // เอาไปปนกลุ่ม "ธุรกิจ" จะทำให้เมนูนั้นอ่านผิดความหมาย (UX spec §9 ข้อ 1)
    icon: 'settings-2',
    slug: 'admin-system',
    label: 'ระบบ',
    isTitle: true,
    children: [
      { url: '/command-center', slug: 'admin:command-center', label: 'สายพานงาน AI', icon: 'robot' },
    ],
  },
]
