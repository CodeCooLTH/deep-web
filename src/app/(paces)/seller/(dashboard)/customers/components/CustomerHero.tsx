/**
 * CustomerHero — แถบหัวหน้าจอ **เฉพาะมือถือ** ของหน้ารายชื่อลูกค้า
 *
 * Base: src/app/(paces)/seller/(dashboard)/dashboard/components/CompactHero.tsx:145-183
 *       (SVG ไล่สี xenon + overlay tint — ยกโครงมาทั้งชุด เปลี่ยนแต่เนื้อหา)
 *
 * user เลือกภาษานี้เอง 2026-08-26 ("ชอบ Style ของ Mobile Command Center + หน้า Chat")
 *
 * 🛑 มือถือใช้ hero **แทน** `PageBreadcrumb` ไม่ใช่เพิ่มจากมัน — ไม่งั้นจะมีหัวเรื่อง
 * "ลูกค้า" สองอันซ้อนกันในจอเดียว (dashboard ก็ไม่มี breadcrumb ในบล็อกมือถือด้วยเหตุผลเดียวกัน)
 *
 * 🛑 บรรทัดรองเป็นตัวเลข **ขอบเขตร้านนี้** — ต่างจากคอลัมน์ในลิสต์ที่เป็น "ทั้งระบบ"
 * จึงต้องไม่เขียนคำที่ทำให้สับสนกัน (ไม่มีคำว่า "ทั้งระบบ" ที่นี่เด็ดขาด)
 */
import Icon from '@/components/wrappers/Icon'

type Props = {
  totalCustomers: number
  /** อัตรารับของสำเร็จของร้าน — `null` = ฐานยังไม่ถึงเกณฑ์ (ห้ามแสดง 0%) */
  receivedRate: number | null
  returned: number
  /** ร้านนี้เคยเปิดพัสดุผ่านระบบไหม — ตัดสินว่าบรรทัดรองจะพูดเรื่องอัตราได้ไหม */
  hasParcels: boolean
}

export default function CustomerHero({ totalCustomers, receivedRate, returned, hasParcels }: Props) {
  return (
    <div className="relative overflow-hidden rounded-b-2xl text-white">
      {/* HR7 carve-out: SVG ไล่สี + overlay — Paces ไม่มี gradient/hero token
          ค่าสีทั้งหมดยกมาจาก CompactHero ตรง ๆ เพื่อให้สอง hero ในแอปเป็นเฉดเดียวกันเป๊ะ */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 390 112"
        preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="cust-hero-base" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2b7be0" /> {/* HR7 arbitrary — ยกจาก CompactHero */}
            <stop offset="1" stopColor="#163a72" /> {/* HR7 arbitrary */}
          </linearGradient>
          <radialGradient id="cust-hero-glow" cx="0.86" cy="0.08" r="0.7">
            <stop offset="0" stopColor="#7fb4ff" stopOpacity=".55" /> {/* HR7 arbitrary */}
            <stop offset="1" stopColor="#7fb4ff" stopOpacity="0" /> {/* HR7 arbitrary */}
          </radialGradient>
        </defs>
        <rect width="390" height="112" fill="url(#cust-hero-base)" />
        <rect width="390" height="112" fill="url(#cust-hero-glow)" />
        <g fill="#ffffff"> {/* HR7 arbitrary */}
          <polygon points="20,112 58,112 188,0 150,0" opacity=".10" />
          <polygon points="96,112 116,112 232,0 212,0" opacity=".07" />
          <polygon points="170,112 232,112 360,0 298,0" opacity=".12" />
          <polygon points="262,112 286,112 392,0 368,0" opacity=".06" />
        </g>
      </svg>
      {/* eslint-disable-next-line react/forbid-dom-props -- HR7 carve-out: overlay tint ให้ตัวอักษรขาวอ่านชัด (ค่าเดียวกับ CompactHero) */}
      <div className="absolute inset-0" style={{ background: 'rgba(20,52,102,0.30)' }} aria-hidden="true" />

      <div className="relative z-10 px-4 pt-3 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <span className="flex size-12 items-center justify-center rounded-full bg-white/15 text-2xl">
              <Icon icon="solar:users-group-rounded-bold-duotone" aria-hidden="true" />
            </span>
            {/* badge จำนวนลูกค้าห้อยใต้ไอคอน — ท่าเดียวกับคะแนน trust ใน CompactHero */}
            <span className="text-2xs text-primary absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-lg bg-white px-1.5 py-0.5 leading-none font-bold tabular-nums">
              {totalCustomers.toLocaleString('th-TH')}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="mb-0 truncate text-lg leading-tight font-bold text-white">ลูกค้าของร้าน</h4>
            <p className="text-2xs mt-1 mb-0 flex items-center gap-1.5 text-white/80">
              {hasParcels && receivedRate !== null ? (
                <>
                  <span className="font-semibold text-white tabular-nums">
                    {Math.round(receivedRate * 100)}%
                  </span>
                  รับของสำเร็จ
                  <span className="opacity-50">·</span>
                  <span className="font-semibold text-white tabular-nums">{returned}</span>
                  ใบตีกลับ
                </>
              ) : hasParcels ? (
                /* มีพัสดุแต่ฐานยังไม่ถึงเกณฑ์ — บอกจำนวนจริงแทนอัตรา ห้ามแสดง 0% */
                <>
                  <span className="font-semibold text-white tabular-nums">{returned}</span>
                  ใบตีกลับ<span className="opacity-50">·</span>ยังบอกอัตราไม่ได้
                </>
              ) : (
                'ยังไม่เคยเปิดพัสดุผ่าน Deep'
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
