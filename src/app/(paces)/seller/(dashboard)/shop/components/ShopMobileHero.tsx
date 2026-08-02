'use client'

/**
 * ShopMobileHero — การ์ดอัตลักษณ์ร้าน หัวหน้าจอ "ตั้งค่าร้าน" ของมือถือ (แสดงเฉพาะ <lg)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/users/profile/page.tsx:17-27
 *   (article.card > div.relative.overflow-hidden.bg-cover.bg-center + backgroundImage inline,
 *    แล้วบล็อกเนื้อหาถัดมาใช้ -mt-* ดึงตัวเองขึ้นไปทับขอบล่างของ cover)
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/users/profile/components/ProfileCard.tsx:13-25
 *   (avatar + ชื่อ + `p.text-default-400.text-sm` + `span.badge.badge-label`)
 *
 * Widgets adapted:
 *   - cover: h-62.5/minHeight 300 (เดสก์ท็อป) → h-24 พอเป็นแถบสีให้โลโก้เกาะ ไม่กินจอ
 *   - avatar: rounded-full size-18 → rounded-lg size-16 (โลโก้ร้านเป็นสี่เหลี่ยม การครอบวงกลม
 *     กินมุมโลโก้/ตัวอักษรแบรนด์หายไป ต่างจากรูปคน)
 *   - 🛑 ชื่อร้านย้ายมา "ใต้" โลโก้ ไม่ใช่ข้าง ๆ (theme วางข้างกันได้เพราะ avatar ไม่ทับ cover)
 *     รอบแรกวางข้างกันแบบ theme แล้วพัง: โลโก้ที่ถูกดึงขึ้นทับ cover ทำให้ข้อความไปคร่อม
 *     รอยต่อ cover/การ์ด ครึ่งบนอยู่บนพื้นเทา ครึ่งล่างอยู่บนพื้นขาว และตัวอักษรตัวแรก ๆ
 *     ถูกกล่องโลโก้บังจนอ่านไม่ออก (เห็นในสกรีนช็อตจริง 2026-08-01)
 *   - ทั้ง cover และ avatar ถูกครอบด้วย <label> ให้ "แตะที่รูป = เปลี่ยนรูป" ตรง ๆ
 *
 * Dropped: gradient overlay + คำคม (theme hardcode hex ผิด HR7 และไม่มีเนื้อหาจะทับบนปก),
 *   dropdown จุดสามจุด, ปุ่มโซเชียล, skills
 *
 * presentational ล้วน — รับ state/handler ของ ShopForm มาหมด ไม่มี logic ของตัวเอง
 */

import Icon from '@/components/wrappers/Icon'
import { toFileUrl } from '@/lib/file-url'

interface ShopMobileHeroProps {
  shopName: string
  /** ป้ายหมวดหมู่ภาษาไทย — null = ยังไม่ได้เลือก */
  categoryLabel: string | null
  /** อายุร้านแบบสั้น เช่น "เปิดร้านวันนี้" — ย้ายมาจากหัวหน้าที่ซ้ำกับ topbar มือถือ */
  ageText: string | null
  logoFileId: string
  coverFileId: string
  logoUploading: boolean
  coverUploading: boolean
  onLogoChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onCoverChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

const ACCEPT = 'image/png,image/jpeg,image/webp'

export default function ShopMobileHero({
  shopName,
  categoryLabel,
  ageText,
  logoFileId,
  coverFileId,
  logoUploading,
  coverUploading,
  onLogoChange,
  onCoverChange,
}: ShopMobileHeroProps) {
  // 🛑 ต้องผ่าน toFileUrl() เสมอ ห้ามต่อ `/api/files/` เอง
  // ค่าที่เก็บใน DB มีสองแบบปนกัน: storage key ("2026/07/31/uuid.jpg") กับ URL เต็ม (seed/CDN/
  // avatar จาก OAuth) — ต่อ prefix ให้ค่าที่เป็น URL อยู่แล้วจะได้ "/api/files/https://..." ซึ่งพัง
  // helper กลางตัวนี้มีอยู่เพราะความผิดพลาดนี้เกิดซ้ำมาแล้ว 2 รอบ (ดูคอมเมนต์หัว src/lib/file-url.ts)
  const logoUrl = toFileUrl(logoFileId)
  const coverUrl = toFileUrl(coverFileId)

  return (
    /* edge-to-edge ชนขอบจอ — ยึดภาษาเดียวกับหน้า /dashboard เป๊ะ:
         -mx-4      หักล้าง gutter `.seller-mobile-shell main { padding-inline:1rem }` (16px)
                    (CommandCenter.tsx ~บรรทัด 37 ใช้ค่าเดียวกัน)
         rounded-b-2xl  โค้งเฉพาะขอบล่าง ส่วนบนชนขอบจอ — ตรงกับ CompactHero.tsx:91 ซึ่งเป็น
                    การ์ดหัวหน้าของ /dashboard ที่อยู่ตำแหน่งเดียวกัน (บนสุดของหน้า)
       HR7 arbitrary: Paces ไม่มี full-bleed token */
    <div className="card mb-3 -mx-4 overflow-hidden rounded-b-2xl lg:hidden">
      {/* ── ภาพหน้าปก ──
          backgroundImage inline = pattern เดียวกับ theme (profile/page.tsx:19) — URL มาจาก
          fileId ที่ผู้ใช้อัปโหลด เป็นค่า runtime ที่เขียนเป็นคลาสล่วงหน้าไม่ได้ */}
      <label
        htmlFor="shop-cover-mobile"
        className="bg-light focus-within:ring-primary relative block h-24 w-full cursor-pointer bg-cover bg-center focus-within:ring-2"
        style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
      >
        {!coverUrl && (
          <span className="text-default-400 absolute inset-y-0 start-4 flex items-center gap-1.5 text-sm">
            <Icon icon="photo-plus" className="text-lg" />
            เพิ่มภาพหน้าปก
          </span>
        )}
        {/* ปุ่มกล้อง = affordance ทางสายตา (พื้นที่แตะจริงคือทั้งแถบปก เพราะ label ครอบทั้งก้อน) */}
        <span className="bg-card/90 text-default-700 absolute end-3 top-3 inline-flex size-8 items-center justify-center rounded-full">
          <Icon
            icon={coverUploading ? 'loader-2' : 'camera'}
            className={coverUploading ? 'animate-spin' : undefined}
          />
        </span>
        <input
          id="shop-cover-mobile"
          type="file"
          accept={ACCEPT}
          // sr-only ไม่ใช่ hidden: `hidden` = display:none ทำให้ input โฟกัสด้วยคีย์บอร์ดไม่ได้
          // และ screen reader มองไม่เห็นเลย = เปลี่ยนรูปไม่ได้ถ้าไม่ใช้เมาส์/นิ้ว
          // sr-only ซ่อนทางสายตาแต่ยังอยู่ใน accessibility tree และ tab ถึง
          className="sr-only"
          onChange={onCoverChange}
          disabled={coverUploading}
        />
      </label>

      <div className="card-body pt-0">
        {/* โลโก้ — ดึงขึ้นทับขอบล่างของปก (pattern -mt-* จาก theme profile/page.tsx:27)
            ring-4 ring-card ทำให้ดูลอยเหนือปกโดยไม่ต้องพึ่งเงา (ตรง DESIGN.md ที่ให้เงาบาง) */}
        <label
          htmlFor="shop-logo-mobile"
          className="ring-card bg-light focus-within:ring-primary relative -mt-8 block size-16 cursor-pointer overflow-hidden rounded-lg ring-4"
        >
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="text-default-400 flex h-full w-full items-center justify-center">
              <Icon
                icon={logoUploading ? 'loader-2' : 'building-store'}
                className={`text-xl ${logoUploading ? 'animate-spin' : ''}`}
              />
            </span>
          )}
          <input
            id="shop-logo-mobile"
            type="file"
            accept={ACCEPT}
            // ดูเหตุผลที่ input ของภาพปกด้านบน
            className="sr-only"
            onChange={onLogoChange}
            disabled={logoUploading}
          />
        </label>

        {/* ชื่อ + ป้าย — อยู่ "ใต้" โลโก้เสมอ จึงไม่มีทางถูกทับ (ดูเหตุผลที่หัวไฟล์)
            ชื่อใช้ค่าที่บันทึกแล้ว ไม่ใช่ค่าที่กำลังพิมพ์ — เจตนา (perf): ถ้าใช้ watch() ของ
            react-hook-form ทั้งฟอร์มจะ re-render ทุกตัวอักษร แลกกับการเห็นชื่อขยับสด ๆ
            ซึ่งไม่ช่วยอะไรในหน้าที่กดบันทึกทีเดียว */}
        <p className="text-default-900 mt-3 truncate text-base font-semibold">{shopName}</p>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {categoryLabel ? (
            <span className="badge badge-label bg-light">{categoryLabel}</span>
          ) : (
            <span className="text-default-400 text-xs">ยังไม่ได้เลือกหมวดหมู่</span>
          )}
          {ageText && <span className="text-default-400 text-xs">{ageText}</span>}
        </div>
      </div>
    </div>
  )
}
