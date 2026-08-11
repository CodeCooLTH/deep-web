import type { SxProps, Theme } from '@mui/material/styles'

/**
 * ความกว้างของคอลัมน์เนื้อหาบนหน้าออเดอร์ `/o/[token]` — จุดเดียวทั้ง 4 ที่ที่ใช้
 * (คอลัมน์เนื้อหา + แถบ CTA ล่างจอ ของทั้งจอ guest และจอหลังล็อกอิน)
 *
 * 🛑 **ค่าเดิมเขียนเป็น key ในอ็อบเจกต์ของ `maxWidth` ซึ่ง MUI ทิ้งทั้งคู่ — เพดาน 720
 * จึงไม่เคยมีผลจริงเลยสักจอ** ตรวจด้วยการรัน `styleFunctionSx` กับธีมจริง ไม่ใช่อ่านโค้ดเดา:
 *
 *   { xs: '100%', '@media (min-width:768px)': 720, lg: 880 }
 *     → { '@media (min-width:0px)': { maxWidth: '100%' },
 *         '@media (min-width:1200px)': { maxWidth: 880 },
 *         '@media (min-width:768px)': 720 }     ← ค่าเปล่า ไม่ใช่ declaration = CSS เสีย
 *
 *   { xs: '100%', 'min-[768px]': 720 }
 *     → { '@media (min-width:0px)': { maxWidth: '100%' },
 *         'min-[768px]': 720 }                  ← ชื่อ property ที่ไม่มีอยู่จริง
 *
 * กลไก: `iterateBreakpoints` เอา key ไปเทียบกับ **breakpoint ของธีม** (xs/sm/md/lg/xl)
 * key ที่ไม่ตรงจะถูกโยนลง output ดิบ ๆ โดยไม่ผ่านตัวประกอบ declaration (และไม่มี error
 * ไม่มี warning) ⇒ จอ guest กว้างเต็มจอทุกขนาด · จอหลังล็อกอินกว้างเต็มจอตั้งแต่ 768–1199
 * แล้วค่อยหดเป็น 880 ที่ 1200 ซึ่งเป็นอาการที่ FR-018 ตั้งใจแก้ตั้งแต่แรกแต่แก้ไม่ติด
 *
 * 768 ไม่ใช่ breakpoint ของธีมนี้ (Vuexy = MUI default: sm 600 / md 900 / lg 1200) จึงต้อง
 * เขียนเป็น media query ที่ระดับบนสุดของ sx ไม่ใช่เป็น key ในค่าของ property
 */
export const orderContentWidthSx: SxProps<Theme> = {
  maxWidth: '100%',
  marginInline: 'auto',
  // 768 = จุดที่คอลัมน์เดียวเริ่มยาวเกินระยะกวาดตาบนแท็บเล็ต
  '@media (min-width:768px)': { maxWidth: 720 },
  // 1200 = `lg` ของธีม — จอเดสก์ท็อปกว้างพอให้เนื้อหาหายใจได้อีกขั้นโดยยังไม่ยาวเกินอ่าน
  '@media (min-width:1200px)': { maxWidth: 880 },
}
