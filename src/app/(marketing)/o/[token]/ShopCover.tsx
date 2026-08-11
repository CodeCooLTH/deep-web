/**
 * ShopCover — ปกไล่สีตาม tier ของหน้าออเดอร์ `/o/[token]` ใช้ร่วมทั้งจอ guest และจอหลังล็อกอิน
 *
 * ทำไมไม่ใช้ `ProfileBanner` ต่อ (ตัวที่หน้าโปรไฟล์เคยใช้): มันพก 2 อย่างที่ผิดที่บนหน้านี้
 *   1. **dot-mesh overlay** — ลายจุดเป็นของประดับที่ถูกออกแบบมาสำหรับปกสูง 176–224px
 *      ย่อลงมาเหลือ 104px แล้วลายจุด 22px กลายเป็นเนื้อสัมผัสรบกวนบนแถบบาง ๆ
 *   2. **ปุ่มย้อนกลับกลม ๆ มุมซ้ายบน** — `router` ของเบราว์เซอร์พาไป "หน้าก่อนหน้า" ซึ่งสำหรับ
 *      คนที่กดลิงก์มาจากแชทคือ "กลับไปแชท" บ้าง "หน้าเปล่า" บ้าง (จริง ๆ มันเป็น Link href='/'
 *      แต่หน้าตาเป็นปุ่ม back) บนหน้าที่ผู้ซื้อยังไม่รู้ว่า Deep คืออะไร ที่ว่างมุมนั้นมีค่ากว่า
 *      ถ้าใช้บอกว่า "ใครเป็นคนรับรองหน้านี้" ⇒ แทนด้วยพิลแบรนด์ที่ทำหน้าที่เดียวกันคือกลับหน้าแรก
 *      แต่ตอบคำถามที่ผู้ซื้อถามอยู่จริงไปด้วย (แพตเทิร์นเดียวกับหน้าโปรไฟล์ร้าน)
 *
 * 🛑 **ความสูงคง 104px ทั้งสองจอ ห้ามยกไปเท่าหน้าโปรไฟล์ (176/200/224)** — คนที่เปิดหน้านี้
 * มางานเดียวคือดูว่าออเดอร์ถึงไหนแล้วและกดยืนยัน ปกคือพื้นที่ตกแต่งล้วน ทุก px ที่ให้มันไป
 * คือ px ที่หลักฐานออเดอร์เสียไป (หน้าโปรไฟล์ต่างกันตรงที่ "ทำความรู้จักร้าน" คืองานของหน้านั้น)
 * เขียนกำกับไว้ตรงนี้เพราะเดิมสองจอตั้ง 104 กับ 140 ต่างกันอยู่แล้วโดยไม่มีเหตุผล — วันที่มีคน
 * มาไล่ "ทำให้เหมือนกัน" จะได้ไม่ไล่ขึ้นไปหาเลขของหน้าโปรไฟล์
 *
 * Base: src/views/pages/user-profile/UserProfileHeader.tsx (ProfileBanner — ไล่สี tier + พิลร้านใหม่)
 *   + src/views/pages/user-profile/v2/ProfileHero.tsx (พิลตราแบรนด์บนปก)
 */
import Box from '@mui/material/Box'

import { getTierGradient } from '@/lib/trust-tier'

import BrandHomeLink from './BrandHomeLink'

/** ความสูงปกของหน้าออเดอร์ — จุดเดียวทั้งสองจอ (ดูเหตุผลที่หัวไฟล์ก่อนแก้) */
export const ORDER_COVER_HEIGHT = 104

export default function ShopCover({
  trustScore,
  /**
   * ร้านยังไม่มีออเดอร์จบสักใบ → ไล่สีเทา ไม่ใช่ไล่สี tier
   *
   * 🛑 เกณฑ์คือ "มีออเดอร์จบไหม" ไม่ใช่ trustScore — คะแนนถูกดันด้วยรีวิวเพื่อนได้ แต่ออเดอร์
   * จบจริงปลอมยากกว่ามาก (เหตุผลเต็มอยู่ที่ ProfileBanner) เดิมจอหลังล็อกอินไม่เคยส่งค่านี้เลย
   * ⇒ ร้านใหม่ได้ปกไล่สีที่หน้าตาเหมือนรางวัลทันทีที่ผู้ซื้อล็อกอิน ทั้งที่ก่อนล็อกอินเป็นเทา
   */
  isNewShop,
}: {
  trustScore: number
  isNewShop: boolean
}) {
  const gradient = isNewShop
    ? 'linear-gradient(135deg, #9b98a8 0%, #bdbbc7 55%, #dedce4 100%)'
    : getTierGradient(trustScore)

  return (
    <Box sx={{ height: ORDER_COVER_HEIGHT, position: 'relative', overflow: 'hidden', background: gradient }}>
      <BrandHomeLink className='absolute inset-block-start-0 inset-inline-start-0' />

      {/* พิล "ร้านใหม่" — บอกตรง ๆ ว่ายังไม่มีประวัติเพียงพอ แทนที่จะปล่อยให้ปกเทาดูเหมือนบั๊ก
          (ยกมาจาก ProfileBanner ทั้งก้อน ไม่เขียนคำใหม่ — ร้านเดียวกันต้องอ่านได้เหมือนกัน
          ไม่ว่าผู้ซื้อจะมาจากหน้าโปรไฟล์หรือจากลิงก์ออเดอร์) */}
      {isNewShop && (
        <Box
          sx={{
            position: 'absolute',
            insetInlineStart: 16,
            bottom: 12,
            display: 'inline-flex',
            alignItems: 'center',
            bgcolor: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.6)',
            boxShadow: 'var(--mui-customShadows-sm)',
            borderRadius: '9999px',
            px: '10px',
            py: '4px',
            /* 13px = ขั้น "Label / Caption" ของ ramp (DESIGN.md §Typography) ไม่ใช่ 12px ที่ต้นฉบับ
               ใช้ — 12px คือขั้น Overline ซึ่งสงวนไว้ให้ป้ายสั้น ๆ พร้อม letter-spacing 0.8px และ
               เอกสารระบุเองว่า "ใช้น้อยมาก" ส่วนนี่เป็นประโยคบอกสถานะเต็ม ๆ
               (ต้นฉบับใน ProfileBanner ยังเป็น 12px อยู่ = หนี้เดิม ไม่ได้แก้ในรอบนี้) */
            fontSize: '0.8125rem',
            letterSpacing: '0.4px',
            fontWeight: 600,
            color: '#2F2B3D',
          }}
        >
          ร้านใหม่ · ยังไม่มีประวัติเพียงพอ
        </Box>
      )}
    </Box>
  )
}
