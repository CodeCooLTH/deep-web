/**
 * CustomerProfileHeader — หัวโปรไฟล์ + สรุปตัวเลข + สัญญาณความเสี่ยง 2 ชั้น + ที่อยู่ล่าสุด
 * (feature 00057)
 *
 * server component ล้วน — ไม่มี state ไม่มี handler ปุ่มทั้งหมดเป็นลิงก์/`tel:`
 *
 * 🛑 สัญญาณความเสี่ยงทั้ง 2 ชั้น **ยกของเดิมมาใช้ซ้ำ ไม่เขียนใหม่**:
 *   ชั้นร้านนี้  → `CustomerBehaviorPills` (markup เดียวกับแผงลูกค้าในแชท)
 *   ชั้นทั้งระบบ → `BuyerReputationRow` (component ของ feature 00055 ตรง ๆ)
 * กติกาสีเป็นของ `customer-behavior.ts`: เหลือง = ควรระวัง **ห้ามแดง ห้ามเขียว** —
 * ทั้งหมดคือ "ควรระวัง" ไม่ใช่ "ห้ามขาย" ร้านยังตัดสินใจเองได้เสมอ
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import BuyerReputationRow from '@/app/(paces)/seller/(chat)/inbox/[conversationId]/components/BuyerReputationRow'
import { CustomerBehaviorPills } from '@/components/safepay/CustomerBehaviorBadges'
import { formatBaht } from '@/lib/format-money'
import { formatDateTime } from '@/lib/format-date'
import type { ShippingAddressLike } from '@/lib/shipping-address-status'
import type { CustomerBadge } from '@/lib/customer-behavior'
import type { BuyerReputation } from '@/lib/buyer-reputation'
import type { CustomerDirectoryEntry } from '@/lib/customer-directory'

type Props = {
  entry: CustomerDirectoryEntry
  badges: CustomerBadge[]
  reputation: BuyerReputation | null
  latestConversationId: string | null
  latestAddress: unknown
  /** vertical นี้มีแกน "ที่อยู่จัดส่ง" ไหม — `shopShipsGoods()` เป็นตัวตัดสิน ไม่ใช่เช็ค vertical เอง */
  showAddress: boolean
  /** ป้ายปุ่มสร้างรายการใหม่ ผันตาม vertical (`ORDER_VOCAB.createLabel`) */
  createLabel: string
  /** ยอดเฉลี่ยต่อบิล — `null` = ยังไม่มีใบที่นับเป็นยอดขาย (ต้องแสดง `—` ไม่ใช่ ฿0) */
  avg: number | null
}

/**
 * ที่อยู่แบบบรรทัดเดียวสำหรับการ์ดสรุป
 *
 * เรียงฟิลด์ตาม `ShippingAddress.tsx:121` ของหน้ารายละเอียดออเดอร์ (line1 / ตำบล อำเภอ /
 * จังหวัด รหัสไปรษณีย์) — ที่นั่นเป็นตัวเรนเดอร์หลายบรรทัดฉบับเต็มและยังเป็นเจ้าของรูปแบบ
 * ที่นี่แค่ยุบให้เป็นบรรทัดเดียว **ห้ามเรียงลำดับต่างจากที่นั่น** ไม่งั้นที่อยู่เดียวกันจะอ่านคนละแบบ
 * สองหน้าจอ (ยังไม่มี SSOT กลางของ "ที่อยู่บรรทัดเดียว" — ถ้ามีจุดที่สามเมื่อไหร่ ให้สกัดออกมา)
 */
function formatAddressLine(addr: ShippingAddressLike): string {
  const locality = [addr.subdistrict, addr.district].filter(Boolean).join(' ')
  const region = [addr.province, addr.postcode].filter(Boolean).join(' ')
  return [addr.line1, locality, region].map((s) => (s ?? '').trim()).filter(Boolean).join(' ')
}

/** แถวสรุป label-ซ้าย/ค่า-ขวา — ตัวเลขรองที่ไม่ใช่พระเอกของการ์ด */
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-default-500 text-sm">{label}</span>
      <span className="text-default-900 text-sm font-medium tabular-nums">{value}</span>
    </div>
  )
}

export default function CustomerProfileHeader({
  entry,
  badges,
  reputation,
  latestConversationId,
  latestAddress,
  showAddress,
  createLabel,
  avg,
}: Props) {
  // `shippingAddress` เป็น Json ดิบจาก Prisma — แคบชนิดเท่าที่ใช้จริง ไม่ cast ทั้งก้อน
  const addressText =
    latestAddress && typeof latestAddress === 'object'
      ? formatAddressLine(latestAddress as ShippingAddressLike)
      : ''

  return (
    <>
      <div className="card">
        <div className="card-body flex flex-col gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="bg-primary/10 text-primary flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold">
              {entry.initial}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-default-900 flex min-w-0 items-center gap-1 text-base font-semibold">
                {/* ชื่อยาว 34+ ตัวอักษรเคยดันการ์ดหลุดขอบจอบน prod — truncate ต้องมาเป็นชุด
                    (min-w-0 ที่กล่อง + max-w-full ที่ลูก) ไม่ใช่ใส่ truncate เดี่ยว ๆ */}
                <span className="max-w-full truncate">{entry.displayName}</span>
              </h1>
              {/* หน้านี้เปิดมาดูลูกค้ารายเดียวโดยตั้งใจแล้ว — แสดงเบอร์เต็ม ต่างจากลิสต์ที่ยัง mask */}
              <p className="text-default-500 mb-0 font-mono text-sm tabular-nums">
                {entry.contactFull ?? '—'}
              </p>
              <p className="text-2xs text-default-400 mb-0">
                ลูกค้าตั้งแต่ {formatDateTime(entry.firstOrderISO)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {entry.contactFull && (
              <a
                href={`tel:${entry.contactFull}`}
                className="btn border-default-300 inline-flex size-11 items-center justify-center lg:size-auto lg:gap-1 lg:px-3"
                aria-label="โทรหาลูกค้า">
                <Icon icon="phone" className="text-sm" aria-hidden="true" />
                <span className="hidden lg:inline">โทร</span>
              </a>
            )}
            {/* ไม่มีเธรดเลย → ไม่ render ปุ่ม (ไม่ใช่ disabled เทา) — ไม่มีอะไรให้เปิดจริง ๆ */}
            {latestConversationId && (
              <Link
                href={`/inbox/${latestConversationId}`}
                className="btn border-default-300 inline-flex items-center gap-1 px-3">
                <Icon icon="message-circle" className="text-sm" aria-hidden="true" />
                เปิดแชท
              </Link>
            )}
            <Link
              href="/orders/new"
              className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-1 px-3 font-medium text-white">
              <Icon icon="plus" className="text-sm" aria-hidden="true" />
              {createLabel}
            </Link>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body flex flex-col gap-3">
          <div>
            <p className="text-default-500 mb-0 text-sm">ยอดซื้อสะสม</p>
            <p className="text-2xs text-default-400 mb-1">(นับเป็นยอดขายแล้ว)</p>
            {/* พระเอกของการ์ดนี้ — ไม่ใช่การ์ด 5 ใบน้ำหนักเท่ากัน */}
            <p className="text-default-900 mb-0 text-3xl font-bold tabular-nums">
              {formatBaht(entry.totalSpent)}
            </p>
          </div>
          <div className="border-default-100 flex flex-col gap-2 border-t pt-3">
            <StatRow label="ออเดอร์ทั้งหมด" value={String(entry.totalOrders)} />
            {/* 🛑 `—` ไม่ใช่ ฿0 เมื่อไม่มีใบที่นับเป็นยอดขาย — "เฉลี่ยแล้วได้ศูนย์บาท" ไม่จริง
                ความจริงคือ "ยังไม่มีอะไรให้เฉลี่ย" (สองอย่างนี้ผู้ใช้ตัดสินใจต่างกัน) */}
            <StatRow label="เฉลี่ยต่อบิล" value={avg === null ? '—' : formatBaht(avg)} />
            {/* จำนวนยกเลิกเป็นตัวเลขของตัวเอง — ห้ามให้ผู้ใช้ลบ "ทั้งหมด − ที่นับเป็นยอดขาย" เอง
                (ผลต่างนั้นไม่เท่ากับจำนวนที่ยกเลิก เพราะมี PENDING/SHIPPED ที่ยังไม่จบคั่นอยู่) */}
            <StatRow label="ยกเลิก" value={String(entry.behavior.cancelledTotal)} />
            <StatRow label="ซื้อล่าสุด" value={formatDateTime(entry.lastOrderISO)} />
          </div>
        </div>
      </div>

      {/* ไม่มีสัญญาณเลยทั้ง 2 ชั้น → ไม่ render การ์ดทั้งใบ (ค่าเริ่มต้นของระบบคือเงียบ
          ไม่ใช่การ์ดว่างที่เขียนว่า "ไม่มีข้อมูล") */}
      {(badges.length > 0 || (reputation && reputation.orders > 0)) && (
        // border-s-3 + สี semantic = ข้อยกเว้นของ Paces ที่ขึ้นทะเบียนไว้แล้วใน DESIGN.md
        <div className="card border-warning border-s-3">
          <div className="card-body flex flex-col gap-3">
            {badges.length > 0 && (
              <div>
                <p className="text-default-500 mb-2 text-sm font-medium">
                  สัญญาณที่ควรระวัง (ร้านนี้)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <CustomerBehaviorPills badges={badges} />
                </div>
              </div>
            )}
            {reputation && reputation.orders > 0 && <BuyerReputationRow data={reputation} />}
          </div>
        </div>
      )}

      {showAddress && (
        <div className="card">
          <div className="card-body">
            <p className="text-default-500 mb-1 text-sm font-medium">ที่อยู่ล่าสุด</p>
            {addressText ? (
              <p className="text-default-900 mb-0 text-sm">{addressText}</p>
            ) : (
              <p className="text-default-400 mb-0 text-sm">ยังไม่มีที่อยู่จัดส่ง</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
