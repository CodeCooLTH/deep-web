import { type MenuItemType } from '@/types'

export const adminMenuItems: MenuItemType[] = [
  {
    icon: 'chart-bar',
    slug: 'admin-overview',
    label: 'Overview',
    isTitle: true,
    children: [
      { url: '/dashboard', slug: 'admin:dashboard', label: 'ภาพรวม', icon: 'dashboard' },
    ],
  },
  {
    icon: 'users',
    slug: 'admin-people',
    label: 'People',
    isTitle: true,
    children: [
      { url: '/users', slug: 'admin:users', label: 'ผู้ใช้งาน', icon: 'users' },
      { url: '/verifications', slug: 'admin:verifications', label: 'ยืนยันตัวตน', icon: 'shield-check' },
    ],
  },
  {
    icon: 'briefcase',
    slug: 'admin-business',
    label: 'Business',
    isTitle: true,
    children: [
      { url: '/orders', slug: 'admin:orders', label: 'คำสั่งซื้อ', icon: 'receipt-2' },
      { url: '/topups', slug: 'admin:topups', label: 'เติมเครดิต SMS', icon: 'credit-card' },
      { url: '/badges', slug: 'admin:badges', label: 'Badges', icon: 'award' },
    ],
  },
]
