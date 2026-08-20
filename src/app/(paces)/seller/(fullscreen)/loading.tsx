'use client'

/**
 * loading.tsx — instant fallback สำหรับหน้า fullscreen (create-order / create-product ฯลฯ)
 *
 * ทำไม: หน้าเหล่านี้ดึง product catalog/bestSellers ก่อน render → ถ้าไม่มี loading.tsx
 * navigation จะ "ค้าง" รอ data. loading.tsx ทำให้เปลี่ยนหน้าทันที (spinner) แล้ว stream data ตามมา.
 * ครอบ navigation แบบ router.push() ที่ global NavigationLoader (ดัก <a>) จับไม่ได้ด้วย.
 *
 * spinner กลางจอ mirror NavigationLoader/SubmitStatusSheet — โทนเดียวกันทั้งแอป.
 *
 * 🛑 คงเป็น "สปินเนอร์เปล่า" ไม่ใช่จอแบรนด์แบบ `seller/loading.tsx` โดยตั้งใจ — หัวหน้าเคาะว่า
 * จอแบรนด์เอา **เฉพาะตอนเปิดครั้งแรก** (2026-08-20) ส่วนนี่คือการเปลี่ยนหน้าระหว่างใช้งาน
 * ถ้าเด้งโลโก้ทุกครั้งที่กดสร้างออเดอร์ จะกลายเป็นสิ่งกวนสายตาแทนที่จะเป็นสัญญาณ
 *
 * 🛑 ต้องเป็น 'use client' เพราะใช้ `useT()` — จอโหลดคือจอแรกที่เห็นตอนเปลี่ยนหน้า ถ้าฝังไทย
 * ตายตัวไว้ ผู้ใช้ที่ตั้งภาษาอังกฤษจะเห็นไทยแวบหนึ่งทุกครั้ง (กฎเดียวกับ dashboard/loading.tsx)
 */
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'

export default function FullscreenLoading() {
  const t = useT()

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center" role="status" aria-label={t.common.loading}>
      <Icon icon="loader-2" className="size-10 animate-spin text-primary" aria-hidden="true" />
      <p className="mt-4 text-sm font-medium text-default-700">{t.common.loading}</p>
    </div>
  )
}
