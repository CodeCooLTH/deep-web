/**
 * notification-data.ts — mock data สำหรับหน้า /notifications
 *
 * mock เท่านั้น — real source Phase 2 (OOS-1: Notification model + push pipeline)
 *
 * Type `Notification` นี้ FROZEN — T10 (NotificationTimeline) จะ import
 * ห้ามเปลี่ยน field name/type โดยไม่ sync กับ T10
 */

export type NotificationType = 'order' | 'review' | 'finance' | 'system'
export type NotiColor = 'primary' | 'success' | 'info' | 'warning' | 'default'

export type Notification = {
  id: string
  type: NotificationType
  icon: string         // tabler name (ไม่มี prefix เช่น "shopping-cart-plus")
  color: NotiColor     // สี node/chip semantic
  title: string
  desc: string
  badge?: string       // label หมวด เช่น "รอดำเนินการ"
  badgeColor?: NotiColor
  href?: string
  unread: boolean
  daysAgo: number      // 0=วันนี้, 1=เมื่อวาน, ... (ใช้ group ตามวัน + แสดงเวลา)
  timeText: string     // เช่น "2 นาทีที่แล้ว", "เมื่อวาน 14:30"
}

export const MOCK_NOTIFICATIONS: Notification[] = [
  // --- วันนี้ ---
  {
    id: 'noti-1',
    type: 'order',
    icon: 'shopping-cart-plus',
    color: 'primary',
    title: 'คำสั่งซื้อใหม่ AA000010',
    desc: 'มีคำสั่งซื้อใหม่เข้ามา รอการดำเนินการ',
    badge: 'รอดำเนินการ',
    badgeColor: 'warning',
    href: '/orders',
    unread: true,
    daysAgo: 0,
    timeText: '2 นาทีที่แล้ว',
  },
  {
    id: 'noti-2',
    type: 'order',
    icon: 'user-check',
    color: 'success',
    title: 'ผู้ซื้อยืนยันรับสินค้าแล้ว',
    desc: 'คำสั่งซื้อ AA000008 ได้รับการยืนยันรับสินค้าจากผู้ซื้อ',
    badge: 'สำเร็จ',
    badgeColor: 'success',
    href: '/orders',
    unread: true,
    daysAgo: 0,
    timeText: '22 นาทีที่แล้ว',
  },
  {
    id: 'noti-3',
    type: 'review',
    icon: 'star',
    color: 'warning',
    title: 'ได้รับรีวิว 5 ดาว',
    desc: 'ลูกค้าให้คะแนน 5 ดาวพร้อมความคิดเห็น "บริการดีมาก ส่งเร็ว"',
    badge: 'รีวิว',
    badgeColor: 'warning',
    href: '/reviews',
    unread: true,
    daysAgo: 0,
    timeText: '1 ชั่วโมงที่แล้ว',
  },
  // --- เมื่อวาน ---
  {
    id: 'noti-4',
    type: 'finance',
    icon: 'coin',
    color: 'success',
    title: 'เติมเครดิต ฿200 สำเร็จ',
    desc: 'เครดิต SMS ของคุณเพิ่มขึ้น ฿200 พร้อมใช้งานแล้ว',
    badge: 'การเงิน',
    badgeColor: 'success',
    href: '/wallet',
    unread: false,
    daysAgo: 1,
    timeText: 'เมื่อวาน 14:30',
  },
  {
    id: 'noti-5',
    type: 'system',
    icon: 'shield-check',
    color: 'info',
    title: 'การยืนยัน L2 ได้รับการอนุมัติ',
    desc: 'บัญชีของคุณได้รับการยืนยันระดับ L2 เรียบร้อยแล้ว',
    badge: 'ระบบ',
    badgeColor: 'info',
    href: '/verification',
    unread: false,
    daysAgo: 1,
    timeText: 'เมื่อวาน 10:15',
  },
  {
    id: 'noti-6',
    type: 'system',
    icon: 'message-2',
    color: 'default',
    title: 'ส่ง SMS สำเร็จ',
    desc: 'ส่ง SMS ลิงก์คำสั่งซื้อให้ผู้ซื้อเรียบร้อย (AA000007)',
    badge: 'ระบบ',
    badgeColor: 'default',
    unread: false,
    daysAgo: 1,
    timeText: 'เมื่อวาน 09:00',
  },
  // --- 2 วันที่แล้ว ---
  {
    id: 'noti-7',
    type: 'order',
    icon: 'package',
    color: 'primary',
    title: 'คำสั่งซื้อ AA000006 อยู่ระหว่างจัดส่ง',
    desc: 'อัปเดตสถานะเป็น "กำลังจัดส่ง" สำเร็จ',
    badge: 'จัดส่ง',
    badgeColor: 'primary',
    href: '/orders',
    unread: false,
    daysAgo: 2,
    timeText: '2 วันที่แล้ว 16:45',
  },
  {
    id: 'noti-8',
    type: 'review',
    icon: 'star-half',
    color: 'warning',
    title: 'ได้รับรีวิว 4 ดาว',
    desc: 'ลูกค้าให้คะแนน 4 ดาว "สินค้าตรงตามคำบรรยาย"',
    badge: 'รีวิว',
    badgeColor: 'warning',
    href: '/reviews',
    unread: false,
    daysAgo: 2,
    timeText: '2 วันที่แล้ว 11:20',
  },
  // --- 3 วันที่แล้ว (สำหรับ lazy-load) ---
  {
    id: 'noti-9',
    type: 'finance',
    icon: 'receipt',
    color: 'info',
    title: 'รายงานยอดขายรายสัปดาห์พร้อมแล้ว',
    desc: 'ยอดขายสัปดาห์นี้รวม ฿4,800 จาก 6 คำสั่งซื้อ',
    badge: 'รายงาน',
    badgeColor: 'info',
    unread: false,
    daysAgo: 3,
    timeText: '3 วันที่แล้ว 08:00',
  },
  {
    id: 'noti-10',
    type: 'system',
    icon: 'lock',
    color: 'default',
    title: 'เข้าสู่ระบบจากอุปกรณ์ใหม่',
    desc: 'ตรวจพบการเข้าสู่ระบบผ่าน iPhone ถ้าไม่ใช่คุณ กรุณาเปลี่ยนรหัสผ่าน',
    badge: 'ความปลอดภัย',
    badgeColor: 'warning',
    unread: false,
    daysAgo: 3,
    timeText: '3 วันที่แล้ว 07:30',
  },
]
