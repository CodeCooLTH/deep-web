/**
 * loading.tsx — skeleton สำหรับ /seller/shop
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx (PulseBar primitive)
 *
 * 🛑 skeleton ต้อง "mirror หน้าจริง" ทั้งสองจอ ไม่ใช่แค่ approximate
 * bug 2026-08-01 (user report): ของเดิม render PageBreadcrumb "ตั้งค่าร้าน" เสมอ แต่ page.tsx
 * ซ่อน breadcrumb บนมือถือไปแล้ว (SellerMobileHeader แสดงชื่อหน้าให้อยู่แล้ว) ผลคือตอนโหลด
 * ผู้ใช้เห็นชื่อหน้าซ้อนกันสองอัน แล้วอันหนึ่งหายไปตอนโหลดเสร็จ = จอกระตุกทุกครั้งที่เข้าหน้านี้
 * → ครอบ breadcrumb ด้วย `hidden lg:block` ให้ตรงกับ page.tsx เป๊ะ
 *
 * และโครง skeleton ตามหน้าจริงที่เปลี่ยนไปแล้ว:
 *   มือถือ = การ์ดหัวร้าน (ปก+โลโก้) → ฟอร์ม → รายการจัดการร้าน → ออกจากระบบ
 *   เดสก์ท็อป = การ์ดฟอร์มใบเดียว (stepper)
 * ถ้า skeleton ไม่ตรง จำนวน/ความสูงของกล่องจะกระโดดตอนสลับเป็นเนื้อหาจริง (layout shift)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'

// pulse bar helper — ซ้ำจาก SellerCardSkeleton primitive (ไม่ import เพราะ internal only)
const PulseBar = ({ className }: { className?: string }) => (
  <span className={`bg-default-300 block animate-pulse rounded ${className ?? ''}`} />
)

/** การ์ดหัวร้าน — มือถือเท่านั้น (mirror ShopMobileHero: ปก h-24 + โลโก้ size-16 ทับขอบล่าง) */
const HeroSkeleton = () => (
  <div className="card mb-3 -mx-4 overflow-hidden rounded-b-2xl lg:hidden">
    <span className="bg-default-300 block h-24 w-full animate-pulse" />
    <div className="card-body pt-0">
      <span className="bg-default-300 ring-card -mt-8 block size-16 animate-pulse rounded-lg ring-4" />
      <PulseBar className="mt-3 h-4 w-40" />
      <PulseBar className="mt-2 h-3 w-24" />
    </div>
  </div>
)

/** การ์ดฟอร์ม — mirror ShopForm (มือถือ edge-to-edge, เดสก์ท็อปมี margin ปกติ) */
const FormSkeleton = () => (
  <div className="card -mx-4 lg:mx-0">
    <div className="card-body space-y-4">
      {/* หัวข้อกลุ่ม "ข้อมูลร้าน" — มือถือเท่านั้น (ไอคอนวงกลม + ข้อความ) */}
      <div className="flex items-center gap-3 lg:hidden">
        <span className="bg-default-300 size-8 shrink-0 animate-pulse rounded-full" />
        <PulseBar className="h-4 w-24" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <PulseBar className="h-3 w-20" />
          <PulseBar className="h-9 w-full" />
        </div>
      ))}
    </div>
  </div>
)

/** รายการ "จัดการร้าน" — มือถือเท่านั้น (mirror ShopQuickLinks: 4 แถว ไอคอนวงกลม + 2 บรรทัด) */
const QuickLinksSkeleton = () => (
  <div className="card mt-4 -mx-4 lg:hidden">
    <div className="card-header">
      <PulseBar className="h-4 w-24" />
    </div>
    <div className="divide-default-200 divide-y">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <span className="bg-default-300 size-8 shrink-0 animate-pulse rounded-full" />
          <div className="flex-1 space-y-1.5">
            <PulseBar className="h-3 w-28" />
            <PulseBar className="h-2.5 w-40" />
          </div>
        </div>
      ))}
    </div>
  </div>
)

const ShopLoading = () => (
  <>
    {/* hidden lg:block — ตรงกับ page.tsx (มือถือใช้ชื่อหน้าจาก SellerMobileHeader แทน) */}
    <div className="hidden lg:block">
      <PageBreadcrumb title="ตั้งค่าร้าน" trail={[{ label: 'ร้านค้า', href: '/shop' }]} />
      <div className="mb-5">
        <PulseBar className="h-3 w-56" />
      </div>
    </div>

    <span className="sr-only">กำลังโหลด...</span>
    <HeroSkeleton />
    <FormSkeleton />
    <QuickLinksSkeleton />
  </>
)

export default ShopLoading
