import logoMark from '@/assets/images/logo-deep-mark.png'
import logoWordmarkLight from '@/assets/images/logo-deep-wordmark-light.png'

/**
 * AppLogo — โลโก้ในแถบเมนูซ้าย (sidenav) ของผู้ขาย
 *
 * ## 🛑 เดิมเป็นโลโก้ "Paces" ของธีมที่ก็อปโครงมา (ดูเหตุผลเต็มที่ AuthLogo.tsx)
 *
 * ## กางเมนู = เวิร์ดมาร์กเต็ม · ย่อเมนู = มาร์กอย่างเดียว
 *
 * เดิมใช้มาร์กตัว D อย่างเดียวทั้งสองสถานะ เพราะไฟล์เวิร์ดมาร์กที่มีเป็นตัวหนังสือ **กรมท่า**
 * ซึ่งจมหายไปกับเมนูพื้นเข้ม — user ทักว่าเดสก์ท็อปควรเห็นคำว่า "Deep" เหมือนหัวมือถือ
 * (จอกว้าง มีที่ให้อ่านชื่อเต็ม) จึงทำ `logo-deep-wordmark-light.png` ขึ้นมา
 *
 * 🛑 ไฟล์ light **ไม่ใช่โลโก้ที่วาดใหม่** — เป็นตัวเดิมที่ปรับ *ความสว่าง* ของตัวหนังสือเป็นขาว
 * และถอดพื้นขาวออกให้โปร่ง ส่วนมาร์กตัว D กับแถบสีใน "ee" คงสีเดิมทุกพิกเซล
 * (`docs/conventions/contrast-fix-keeps-hue.md` — ปรับความเข้มได้ ห้ามสลับเฉด)
 *
 * ## ทำไมใบเดียวพอ ไม่ต้องมี logo-light/logo-dark สลับกัน
 *
 * ธีมมีกลไก `.logo-light` / `.logo-dark` ที่สลับตาม `data-menu-color` อยู่ก็จริง แต่ **รีโปนี้
 * ถอด Customizer ออกจาก prod แล้ว** (`VerticalLayout.tsx` — *"theme switcher ไม่ใช้ใน prod"*)
 * ⇒ `sidenavColor` ค้างที่ `'dark'` ตลอด ไม่มีทางเป็นสีอ่อนได้ การเตรียมไฟล์ไว้ 2 ใบจึงเป็นการ
 * แก้สิ่งที่ไม่มีทางเกิด
 *
 * 🛑 วันไหนเอา Customizer กลับมา ต้องกลับมาแก้ที่นี่ด้วย — ตัวหนังสือขาวบนเมนูสีอ่อน
 * จะหายไปเฉย ๆ โดยไม่มี gate ไหนฟ้อง (มีเทส `[blocker]` ผูกเงื่อนไขนี้ไว้แล้ว)
 *
 * มาร์กตัว D ไม่ต้องมีเวอร์ชันสว่าง เพราะเป็นไล่สีฟ้า→ม่วง→ชมพู อ่านออกทั้งพื้นขาวและพื้นเข้ม
 */
const AppLogo = () => {
  return (
    <>
      {/* .logo-lg / .logo-sm = คลาสของธีมที่สลับตอนย่อ/กางเมนู ต้องคงชื่อไว้
          ความสูงมาจาก --logo-lg-height / --logo-sm-height ของธีม (กฎ `.logo-lg img`)
          — ห้ามใส่ h-* ทับ เพราะ CSS ของธีมไม่ได้อยู่ใน @layer จึงชนะ utility เสมอ
          (docs/conventions/unlayered-css-beats-utilities.md) */}
      <span className="logo-lg">
        <img src={logoWordmarkLight.src} alt="Deep" />
      </span>
      <span className="logo-sm">
        <img src={logoMark.src} alt="Deep" />
      </span>
    </>
  )
}

export default AppLogo
