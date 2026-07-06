/**
 * loading.tsx — instant fallback สำหรับหน้า fullscreen (create-order / create-product ฯลฯ)
 *
 * ทำไม: หน้าเหล่านี้ดึง product catalog/bestSellers ก่อน render → ถ้าไม่มี loading.tsx
 * navigation จะ "ค้าง" รอ data. loading.tsx ทำให้เปลี่ยนหน้าทันที (spinner) แล้ว stream data ตามมา.
 * ครอบ navigation แบบ router.push() ที่ global NavigationLoader (ดัก <a>) จับไม่ได้ด้วย.
 *
 * spinner กลางจอ mirror NavigationLoader/SubmitStatusSheet — โทนเดียวกันทั้งแอป.
 */
import Icon from '@/components/wrappers/Icon'

export default function FullscreenLoading() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center" role="status" aria-label="กำลังโหลด">
      <Icon icon="loader-2" className="size-10 animate-spin text-primary" aria-hidden="true" />
      <p className="mt-4 text-sm font-medium text-default-700">กำลังโหลด...</p>
    </div>
  )
}
