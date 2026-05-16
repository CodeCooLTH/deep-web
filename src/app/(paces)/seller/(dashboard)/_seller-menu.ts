import { type MenuItemType } from '@/types'

export const sellerMenuItems: MenuItemType[] = [
  {
    icon: 'chart-bar',
    slug: 'seller-analytics',
    label: 'Analytics',
    isTitle: true,
    children: [
      { url: '/seller/dashboard', slug: 'seller:dashboard', label: 'ภาพรวมร้านค้า', icon: 'dashboard' },
      { url: '/seller/sales', slug: 'seller:sales', label: 'ภาพรวมยอดขาย', icon: 'chart-line' },
      { url: '/seller/badges', slug: 'seller:badges', label: 'ความสำเร็จ', icon: 'award' },
    ],
  },
  {
    icon: 'briefcase',
    slug: 'seller-business',
    label: 'Business',
    isTitle: true,
    children: [
      { url: '/seller/orders', slug: 'seller:orders', label: 'คำสั่งซื้อ', icon: 'receipt-2' },
      { url: '/seller/products', slug: 'seller:products', label: 'สินค้า', icon: 'package' },
      { url: '/seller/categories', slug: 'seller:categories', label: 'หมวดหมู่สินค้า', icon: 'category' },
      { url: '/seller/reviews', slug: 'seller:reviews', label: 'รีวิว', icon: 'star' },
    ],
  },
  {
    icon: 'users',
    slug: 'seller-buyer',
    label: 'Buyer',
    isTitle: true,
    children: [
      { url: '/seller/customers', slug: 'seller:customers', label: 'ผู้ซื้อ', icon: 'user-circle' },
    ],
  },
  {
    icon: 'settings',
    slug: 'seller-settings',
    label: 'Setting',
    isTitle: true,
    children: [
      { url: '/seller/shop', slug: 'seller:shop', label: 'ตั้งค่าร้าน', icon: 'building-store' },
      { url: '/seller/verification', slug: 'seller:verification', label: 'การยืนยันตัวตน', icon: 'shield-check' },
    ],
  },
]
