import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import NextLink from 'next/link'

import themeConfig from '@configs/themeConfig'

import { HELP_CENTER_HREF } from '@/lib/public-links'

/**
 * PublicProfileFooter — ท้ายหน้าโปรไฟล์ร้านสาธารณะ (`/b/[slug]` + `/u/[username]`)
 *
 * เดิมทั้งสองหน้ามี `<footer>` ของตัวเองที่ก็อปกันมา มีลิงก์เดียวคือ "นโยบายความเป็นส่วนตัว"
 * พร้อมคอมเมนต์ที่เขียนไว้ตรง ๆ ว่าเป็น "legal link ที่ Meta ต้องการ" — คือมันมีอยู่เพราะ
 * Facebook App Review บังคับ ไม่ได้ถูกออกแบบมาเป็น footer จริง หน้าจึงจบแบบห้อยกลางอากาศ
 *
 * user เทียบกับ footer ของ Instagram แล้วเลือกแบบ "ย่อส่วน" (2026-08-11)
 *
 * 🛑 ใส่เฉพาะลิงก์ที่ **มี route จริงและมีเนื้อหาจริง** — IG มี Blog/Jobs/API/Locations แต่เราไม่มี
 * การใส่ลิงก์ตายหรือหน้าเปล่าลง footer ของหน้าที่ทั้งหน้ามีไว้พิสูจน์ความน่าเชื่อถือ คือการทำ
 * สิ่งที่ตรงข้ามกับหน้าที่ของมันเอง (ตรวจแล้ว: `(marketing)` มี /privacy /terms /support /report
 * ที่มีหน้าจริงทั้งหมด ส่วน /check เป็นหน้าผลลัพธ์ที่ต้องมีพารามิเตอร์ จึงไม่ใส่)
 *
 * "แจ้งมิจฉาชีพ" อยู่ใน footer นี้โดยตั้งใจ — ผู้ซื้อที่เปิดหน้านี้คือคนที่กำลังประเมินว่า
 * ร้านนี้เชื่อได้ไหม ถ้าคำตอบคือ "ไม่" ต้องมีที่ให้ไปต่อในหน้าเดียวกัน ไม่ใช่ปล่อยให้ปิดหน้าไปเฉย ๆ
 */
const LINKS = [
  { href: '/terms', label: 'ข้อกำหนดการใช้บริการ' },
  { href: '/privacy', label: 'นโยบายความเป็นส่วนตัว' },
  /* ปลายทางเดียวกับพิล "ช่วยเหลือ" บนปกหน้าออเดอร์ — ดึงจาก SSOT ไม่พิมพ์ซ้ำ (HR16) */
  { href: HELP_CENTER_HREF, label: 'ศูนย์ช่วยเหลือ' },
  { href: '/report', label: 'แจ้งมิจฉาชีพ' },
] as const

export default function PublicProfileFooter() {
  /* ปี พ.ศ. คำนวณจากเวลาจริง ไม่ hardcode — footer ที่ค้างปีเก่าคือสัญญาณว่าเว็บไม่มีคนดูแล
     ซึ่งบั่นทอนสิ่งเดียวกับที่หน้านี้พยายามสร้าง (RSC render ฝั่งเซิร์ฟเวอร์ ไม่มีปัญหา hydration) */
  const yearBE = new Date().getFullYear() + 543

  return (
    <Box
      component='footer'
      sx={{
        textAlign: 'center',
        /**
         * 🛑 ต้องเป็นคีย์ของ MUI (`px`/`pt`/`pb`/`mt`) — เดิมเขียน `pli: 4, pbs: 3, pbe: 4`
         * ซึ่งเป็น **utility ของ Tailwind ไม่ใช่คีย์ของ `sx`** ⇒ เงียบไปทั้งชุด
         * วัดบนจอจริง 2026-08-31: footer ได้ padding **0 ทุกด้าน** และเส้นคั่นห่างจาก
         * การ์ดใบสุดท้ายแค่ 8px จนอ่านเหมือนขอบล่างของการ์ด (หัวหน้าทัก 2 รอบ)
         *
         * `mt: 10` (40px) = ขั้นใหญ่สุดของจังหวะระบบ (DESIGN.md §Rhythm 4→8→16→24→40)
         * ซึ่งเป็นขั้นที่สงวนไว้ให้ขอบเขตของ section พอดี
         */
        px: 4,
        mt: 10,
        pt: 3,
        pb: 4,
        borderBlockStart: '1px solid',
        borderColor: 'divider',
      }}
    >
      {/* RSC + MUI: ห้าม `component={Link}` — ห่อด้วย NextLink แทน (Hard Rule 2) */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: 4, rowGap: 1 }}>
        {LINKS.map((l) => (
          <NextLink key={l.href} href={l.href} style={{ textDecoration: 'none' }}>
            <Typography
              variant='caption'
              color='text.secondary'
              sx={{
                /**
                 * 🛑 พื้นที่แตะ 44px — `PRODUCT.md` ประกาศไว้เป็น baseline แต่ลิงก์ชุดนี้
                 * วัดได้จริงแค่ **22px** (ครึ่งเดียว) ทุกความกว้าง (วัดด้วยเบราว์เซอร์ 2026-08-30)
                 *
                 * นิ้วโป้งบนมือถือกดพลาดไปโดนลิงก์ข้างเคียงได้ง่าย — และลิงก์ชุดนี้มี
                 * **"แจ้งมิจฉาชีพ"** อยู่ด้วย ซึ่งเป็นทางออกฉุกเฉินของคนที่กำลังโดนโกง
                 * ทางออกที่กดยากคือทางออกที่ไม่มีอยู่จริง
                 *
                 * ขยายพื้นที่แตะโดย **ไม่ขยายตัวอักษร** — footer ยังเบาเหมือนเดิม
                 * (ท่าเดียวกับปุ่มคัดลอกเลขออเดอร์และชิปเบอร์โทรที่ทำไว้แล้ว)
                 */
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 44,
                '&:hover': { color: 'text.primary' },
              }}
            >
              {l.label}
            </Typography>
          </NextLink>
        ))}
      </Box>

      <Typography variant='caption' color='text.disabled' sx={{ display: 'block', mt: 2 }} /* `mbs` ไม่ใช่คีย์ `sx` — no-op */>
        {`© ${yearBE} ${themeConfig.templateName}`}
      </Typography>
    </Box>
  )
}
