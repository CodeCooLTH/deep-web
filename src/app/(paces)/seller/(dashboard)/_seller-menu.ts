import { type MenuItemType } from '@/types'

export const sellerMenuItems: MenuItemType[] = [
  {
    icon: 'chart-bar',
    slug: 'seller-analytics',
    label: 'Analytics',
    isTitle: true,
    children: [
      { url: '/dashboard', slug: 'seller:dashboard', label: 'ภาพรวมร้านค้า', icon: 'dashboard' },
      { url: '/sales', slug: 'seller:sales', label: 'ภาพรวมยอดขาย', icon: 'chart-line' },
      { url: '/badges', slug: 'seller:badges', label: 'ความสำเร็จ', icon: 'award' },
    ],
  },
  {
    icon: 'briefcase',
    slug: 'seller-business',
    label: 'Business',
    isTitle: true,
    children: [
      { url: '/orders', slug: 'seller:orders', label: 'คำสั่งซื้อ', icon: 'receipt-2' },
      { url: '/products', slug: 'seller:products', label: 'สินค้า', icon: 'package' },
      { url: '/categories', slug: 'seller:categories', label: 'หมวดหมู่สินค้า', icon: 'category' },
      { url: '/reviews', slug: 'seller:reviews', label: 'รีวิว', icon: 'star' },
      { url: '/wallet', slug: 'seller:wallet', label: 'เครดิต SMS', icon: 'wallet' },
    ],
  },
  {
    icon: 'users',
    slug: 'seller-buyer',
    label: 'Buyer',
    isTitle: true,
    children: [
      { url: '/customers', slug: 'seller:customers', label: 'ผู้ซื้อ', icon: 'user-circle' },
    ],
  },
  {
    icon: 'settings',
    slug: 'seller-settings',
    label: 'Setting',
    isTitle: true,
    children: [
      { url: '/shop', slug: 'seller:shop', label: 'ตั้งค่าร้าน', icon: 'building-store' },
      { url: '/verification', slug: 'seller:verification', label: 'การยืนยันตัวตน', icon: 'shield-check' },
    ],
  },
]
