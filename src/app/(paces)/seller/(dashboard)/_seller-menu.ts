import { type MenuItemType } from '@/types'

export const sellerMenuItems: MenuItemType[] = [
  {
    icon: 'chart-bar',
    slug: 'seller-analytics',
    label: 'ANALYTICS',
    isTitle: true,
    children: [
      { url: '/dashboard', slug: 'seller:dashboard', label: 'ภาพรวมร้านค้า', icon: 'dashboard' },
      { url: '/sales', slug: 'seller:sales', label: 'ภาพรวมยอดขาย', icon: 'chart-line' },
    ],
  },
  {
    icon: 'receipt-2',
    slug: 'seller-orders',
    label: 'ORDERS',
    isTitle: true,
    children: [
      { url: '/orders', slug: 'seller:orders', label: 'คำสั่งซื้อ', icon: 'receipt-2' },
      { url: '/auctions', slug: 'seller:auctions', label: 'การประมูล', icon: 'gavel' },
    ],
  },
  {
    icon: 'package',
    slug: 'seller-products',
    label: 'PRODUCTS',
    isTitle: true,
    children: [
      { url: '/products', slug: 'seller:products', label: 'สินค้า', icon: 'package' },
      // ซ่อนเมนู "หมวดหมู่สินค้า" ชั่วคราว — route /categories ยังอยู่ (เข้าตรงผ่าน URL ได้)
      // { url: '/categories', slug: 'seller:categories', label: 'หมวดหมู่สินค้า', icon: 'category' },
      { url: '/reviews', slug: 'seller:reviews', label: 'รีวิว', icon: 'star' },
    ],
  },
  {
    icon: 'users',
    slug: 'seller-customers',
    label: 'CUSTOMERS',
    isTitle: true,
    children: [
      { url: '/customers', slug: 'seller:customers', label: 'ลูกค้า', icon: 'user-circle' },
    ],
  },
  {
    icon: 'building-store',
    slug: 'seller-shops',
    label: 'SHOPS',
    isTitle: true,
    children: [
      { url: '/verification', slug: 'seller:verification', label: 'ยืนยันตน', icon: 'shield-check' },
      { url: '/badges', slug: 'seller:badges', label: 'ความสำเร็จ', icon: 'award' },
    ],
  },
  {
    icon: 'settings',
    slug: 'seller-store',
    label: 'STORE',
    isTitle: true,
    children: [
      { url: '/shop', slug: 'seller:shop', label: 'ตั้งค่าร้านค้า', icon: 'building-store' },
      { url: '/wallet', slug: 'seller:wallet', label: 'เครดิต SMS', icon: 'wallet' },
      { url: '/settings', slug: 'seller:settings', label: 'บัญชีที่เชื่อมต่อ', icon: 'link' },
    ],
  },
]
