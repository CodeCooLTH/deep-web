/**
 * Base: theme/paces/Admin/TS/src/layouts/components/Footer/index.tsx
 *
 * การปรับจาก theme:
 * - เปลี่ยน copy ในคอลัมน์ขวาจาก "10GB of 250GB Free." (demo copy)
 *   เป็น "ระบบสร้างความน่าเชื่อถือ" — ตรงกับ brand message ของ Deep
 * - META_DATA.name = 'Deep', META_DATA.author = 'Deep Thailand' (จาก constants.ts)
 */
import { currentYear, META_DATA } from '@/config/constants'

const Footer = () => {
  return (
    <footer className="footer">
      <div className="container-fluid">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-base">
          <div className="text-center md:text-start">
            {currentYear} © {META_DATA.name} - โดย&nbsp;
            <span className="font-semibold">{META_DATA.author}</span>
          </div>

          <div className="md:text-end hidden md:block">
            ระบบสร้าง<span className="font-bold">ความน่าเชื่อถือ</span>สำหรับการซื้อขายออนไลน์
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
