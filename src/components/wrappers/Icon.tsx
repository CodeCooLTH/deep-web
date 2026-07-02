import { Icon as IconifyIcon, IconProps } from '@iconify/react'

const Icon = ({ icon, ...props }: { icon: string } & IconProps) => {
  // ชื่อที่มี namespace แล้ว (เช่น "solar:pen-2-linear", "tabler:x", "mdi:loading") ส่งผ่านตรง ๆ
  // ห้าม prefix "tabler:" ซ้ำ — มิฉะนั้นได้ "tabler:solar:..." = ชื่อ invalid → ไอคอนไม่ขึ้น (กล่องว่าง)
  // ชื่อเปล่า (เช่น "plus") = ค่า default ของโปรเจกต์ = tabler set
  const name = icon.includes(':') ? icon : `tabler:${icon}`
  return <IconifyIcon icon={name} {...props} />
}
export default Icon
