// Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card/.card-header/.card-body/.card-footer)
// Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/RevenueByLocation.tsx (แท่งสัดส่วน + legend เส้นประ)
// Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/page.tsx (โครง 2 คอลัมน์ lg)
// Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx (ตารางรายการ md+)
// Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (chip)
// Base: theme/paces/Admin/TS/src/app/(admin)/ui/accordions/page.tsx (ลุคหัวพับ — ใช้ <details> เพราะ hs-accordion พึ่ง JS ซึ่ง WebView ของ LINE อาจไม่รัน · Controller อนุมัติ)
import Icon from '@/components/wrappers/Icon'
import { SALES_CHANNEL_LABELS, SALES_CHANNEL_ICONS } from '@/app/(paces)/seller/(dashboard)/orders/components/data'
import { formatDayMonthTH, formatDayMonthTimeTH, formatTimeHM } from '@/lib/format-date'
import { expenseDisplay } from '@/lib/format-money'
import { sellerDashboardUrl } from '@/lib/line-report/config'
import type { DetailShop, DetailSnapshotV1, ExpenseRow, OrderRow } from '@/lib/line-report/detail-snapshot'
import { money, rangeText } from '@/lib/line/flex-report-blocks'
import { SALES_CHANNEL_LOGO } from '@/lib/sales-channel-logo'
import { FINANCE_COLORS } from '@/lib/finance-colors'
import { Brand } from './StateCard'
import { barSegments, EXCLUDED_REASON_TH, expiryDayText, isMultiDay, rowChip, rowMarker, safeImageUrl } from './view-model'

type Snap = DetailSnapshotV1
const CHIP = 'badge text-xs'
const MUTED = 'text-default-700'

// ---------- ชิ้นเล็ก ----------

function Marker({ shop, r }: { shop: DetailShop; r: OrderRow }) {
  const m = rowMarker(shop, r)
  if (!m) return null
  return (
    <span className={`${m.cls} inline-flex items-center gap-1 text-xs`}>
      <Icon icon={m.icon} className="size-3.5" aria-hidden="true" />
      {m.label}
    </span>
  )
}

function Chips({ shop, r }: { shop: DetailShop; r: OrderRow }) {
  const chip = rowChip(shop, r)
  const marker = rowMarker(shop, r)
  if (!chip && !marker) return null
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {chip && <span className={`${CHIP} ${chip.chip}`}>{chip.label}</span>}
      <Marker shop={shop} r={r} />
    </span>
  )
}

function ChannelTag({ channel }: { channel?: string }) {
  if (!channel) return null
  const label = SALES_CHANNEL_LABELS[channel] ?? channel
  const logo = SALES_CHANNEL_LOGO[channel]
  return (
    <span className={`${MUTED} inline-flex items-center gap-1 text-xs`}>
      {logo ? (
        <img src={logo} alt="" className="size-4 shrink-0 rounded-full object-contain" />
      ) : (
        <Icon icon={SALES_CHANNEL_ICONS[channel] ?? 'world'} className="size-4 shrink-0" aria-hidden="true" />
      )}
      {label}
    </span>
  )
}

function Thumb({ url }: { url?: string }) {
  const src = safeImageUrl(url)
  return src ? (
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="bg-default-100 size-10 shrink-0 rounded-md object-cover" />
  ) : (
    <span className="bg-default-100 text-default-700 flex size-10 shrink-0 items-center justify-center rounded-md">
      <Icon icon="package" className="size-5" aria-hidden="true" />
    </span>
  )
}

function Bar({ shop }: { shop: DetailShop }) {
  const segs = barSegments(shop.buckets)
  if (segs.length === 0) return null
  return (
    <>
      <div
        className="bg-default-200 flex h-2 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={segs.map((s) => `${s.tone.label} ${money(s.amount)}`).join(' ')}
      >
        {segs
          .filter((s) => s.amount > 0)
          // สัดส่วนจากข้อมูลจริง ไม่ใช่ค่าคงที่ (แบบอย่าง FinancePanels)
          .map((s) => <div key={s.key} className={`${s.tone.dot} h-full`} style={{ width: `${s.pct.toFixed(1)}%` }} />)}
      </div>
      <div className="border-default-300 mt-3 flex rounded border border-dashed">
        {segs.map((s) => (
          <div key={s.key} className="border-default-300 flex-1 border-e border-dashed px-3 py-2.5 last:border-e-0">
            <div className={`${MUTED} flex items-center gap-1.5 text-xs`}>
              <span className={`${s.tone.dot} size-2 shrink-0 rounded-full`} />
              {s.tone.label}
            </div>
            <div className="text-md text-default-900 font-bold tabular-nums">{money(s.amount)}</div>
            <div className={`${MUTED} text-xs`}>{s.count} รายการ</div>
          </div>
        ))}
      </div>
    </>
  )
}

function BigNumber({ n, size = 'text-3xl', unit = 'บาท', unitCls = 'text-base' }: { n: number; size?: string; unit?: string; unitCls?: string }) {
  return (
    <p className="m-0 flex flex-wrap items-baseline gap-x-1.5">
      <span className={`text-default-900 ${size} font-bold tabular-nums`}>{money(n)}</span>
      {unit && <span className={`${MUTED} ${unitCls}`}>{unit}</span>}
    </p>
  )
}

const timeText = (s: Snap, iso: string) => (isMultiDay(s) ? formatDayMonthTimeTH(iso) : formatTimeHM(iso))

function Stamp({ s }: { s: Snap }) {
  return (
    <div className="card-footer">
      <p className={`${MUTED} m-0 flex items-start gap-1.5 text-xs`}>
        <Icon icon="clock" className="mt-px size-4 shrink-0" aria-hidden="true" />
        <span>ข้อมูล ณ {timeText(s, s.window.computedAt)} น. ตอนส่งรายงาน — ตัวเลขนี้ไม่อัปเดตเอง</span>
      </p>
    </div>
  )
}

function Callout({ tone, icon, children }: { tone: 'warning' | 'danger'; icon?: string; children: React.ReactNode }) {
  const cls = tone === 'warning' ? 'bg-warning/15 text-warning-ink' : 'bg-danger/15 text-danger-ink'
  return (
    <div role="status" className={`${cls} flex items-start gap-2 rounded-lg px-3 py-2 text-sm`}>
      {icon && <Icon icon={icon} className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      <div>{children}</div>
    </div>
  )
}

// ---------- การ์ด ----------

function Hero({ s, shop, cls }: { s: Snap; shop: DetailShop; cls: string }) {
  const showSales = s.exposure.sales && shop.sales !== undefined
  const countLine = s.exposure.orders
    ? `${shop.orderWord} ${shop.orders} รายการ${s.exposure.cancelled && shop.cancelled !== undefined ? ` · ยกเลิก ${shop.cancelled} ใบ` : ''}`
    : null
  return (
    <section className={`card ${cls}`} aria-labelledby="h1">
      <div className="card-header">
        <h1 id="h1" className="text-default-900 m-0 text-lg font-semibold text-balance">{s.title}</h1>
        {s.kind === 'TEST' && <span className={`${CHIP} bg-warning/15 text-warning-ink`}>รายงานทดสอบ</span>}
      </div>
      <div className="card-body">
        <p className={`${MUTED} m-0 text-sm break-words`}>{shop.name}</p>
        <p className="text-primary m-0 mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
          <Icon icon="calendar" className="size-4" aria-hidden="true" />
          {rangeText(s.window.startIso, s.window.endIso)}
        </p>
        {s.kind === 'TEST' && (
          <p className={`${MUTED} m-0 mt-2 text-xs`}>ส่งทดสอบจากหน้าตั้งค่า ใช้ยอดจริงของร้านตั้งแต่เที่ยงคืนถึง {formatTimeHM(s.window.computedAt)} น.</p>
        )}
        {shop.state === 'ERROR' ? (
          <div className="mt-4"><ErrorCallout /></div>
        ) : (
          <>
            <p className={`${MUTED} m-0 mt-4 text-sm`}>{showSales ? 'ยอดขาย' : shop.orderWord}</p>
            <BigNumber n={showSales ? (shop.sales as number) : shop.orders} unit={showSales ? 'บาท' : 'รายการ'} />
            {showSales && countLine && <p className={`${MUTED} m-0 text-sm`}>{countLine}</p>}
            {showSales && <div className="mt-4"><Bar shop={shop} /></div>}
          </>
        )}
      </div>
      <Stamp s={s} />
    </section>
  )
}

function ErrorCallout() {
  return (
    <Callout tone="danger" icon="alert-circle">
      <p className="m-0">ดึงข้อมูลร้านนี้ไม่สำเร็จ ณ ตอนส่งรายงาน</p>
      <p className="m-0 text-xs">ยอดรวมด้านบนยังไม่รวมร้านนี้</p>
    </Callout>
  )
}

function ShopSummary({ shop, s, cls }: { shop: DetailShop; s: Snap; cls: string }) {
  const showSales = s.exposure.sales && shop.sales !== undefined
  return (
    <section className={`card ${cls}`}>
      <div className="card-body">
        <p className={`${MUTED} m-0 text-sm`}>{showSales ? 'ยอดขายร้านนี้' : shop.orderWord}</p>
        <BigNumber n={showSales ? (shop.sales as number) : shop.orders} size="text-xl" unit={showSales ? 'บาท' : 'รายการ'} unitCls="text-sm" />
        {s.exposure.orders && (
          <p className={`${MUTED} m-0 mb-4 text-sm`}>
            {shop.orderWord} {shop.orders} รายการ{s.exposure.cancelled && shop.cancelled !== undefined ? ` · ยกเลิก ${shop.cancelled} ใบ` : ''}
          </p>
        )}
        {showSales && <Bar shop={shop} />}
      </div>
    </section>
  )
}

function ListCard({ s, shop, cls, id }: { s: Snap; shop: DetailShop; cls: string; id: string }) {
  const hasThumb = shop.rows.some((r) => r.imageUrl)
  const showAmt = s.exposure.sales
  const range = rangeText(s.window.startIso, s.window.endIso)
  const name = (r: OrderRow) => r.customerName ?? 'ลูกค้าไม่ระบุชื่อ'
  const timeCell = (r: OrderRow) =>
    isMultiDay(s) ? (
      <span className="block leading-tight"><span className={`${MUTED} block text-xs`}>{formatDayMonthTH(r.at)}</span>{formatTimeHM(r.at)}</span>
    ) : (
      formatTimeHM(r.at)
    )
  return (
    <section className={`card ${cls}`} aria-labelledby={id}>
      <div className="card-header">
        <h2 id={id} className="card-title">รายการทั้งหมด</h2>
        <span className={`${CHIP} bg-default-200 text-default-800 tabular-nums`}>{shop.rowsTotal}</span>
      </div>
      {shop.parity === 'MISMATCH' && (
        <div className="px-5 pt-3"><Callout tone="warning">รายการอาจต่างจากยอดรวมเล็กน้อย เพราะมีการแก้ไขระหว่างสร้างรายงาน</Callout></div>
      )}
      <p className={`${MUTED} m-0 px-5 pt-3 pb-1 text-xs`}>
        เรียงจากล่าสุด · เวลาคือเวลาที่เปิดบิล{shop.cancelled ? ' · ไม่รวมใบที่ยกเลิก' : ''}
      </p>
      {shop.rows.length === 0 ? (
        <div className="flex flex-col items-center px-5 pt-4 pb-8 text-center">
          <span className="bg-default-200 text-default-700 mb-3 flex size-14 items-center justify-center rounded-full">
            <Icon icon="receipt-2" className="text-2xl" aria-hidden="true" />
          </span>
          <p className="text-default-900 text-md m-0 font-semibold">ไม่มีรายการในช่วงนี้</p>
          <p className={`${MUTED} m-0 mt-1 max-w-sm text-sm text-balance`}>
            ไม่มีบิลที่เปิด{s.window.startIso === s.window.endIso ? 'ในวันที่' : 'ในช่วง'} {range} ก่อนเวลา {formatTimeHM(s.window.computedAt)} น. บิลที่เปิดหลังจากนั้นจะไม่อยู่ในหน้านี้
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-default-200 m-0 list-none divide-y p-0 md:hidden">
            {shop.rows.map((r, i) => (
              <li key={i} className="flex gap-3 px-5 py-3">
                <span className="text-default-900 w-12 shrink-0 text-sm tabular-nums">{timeCell(r)}</span>
                <div className="min-w-0 flex-1 break-words">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-default-900 min-w-0 text-sm font-medium">{name(r)}</span>
                    {showAmt && r.amount !== undefined && <span className="text-default-900 shrink-0 text-sm font-semibold tabular-nums">{money(r.amount)}</span>}
                  </div>
                  <div className="mt-0.5 flex items-start gap-2.5">
                    {hasThumb && <Thumb url={r.imageUrl} />}
                    <div className="min-w-0 flex-1">
                      <p className="text-default-800 m-0 text-sm">{r.title}</p>
                      {r.phoneMasked && <p className={`${MUTED} m-0 text-xs tabular-nums`}>{r.phoneMasked}</p>}
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Chips shop={shop} r={r} />
                    <ChannelTag channel={r.channel} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="table-wrapper hidden md:block">
            <table className="table text-sm">
              <thead className="thead-sm bg-light/25">
                <tr>
                  <th>เวลา</th>
                  <th>ลูกค้า</th>
                  <th>{shop.itemColLabel}</th>
                  {showAmt && <th>สถานะ</th>}
                  {showAmt && <th className="text-end">ยอด</th>}
                </tr>
              </thead>
              <tbody>
                {shop.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="text-default-900 tabular-nums">{timeCell(r)}</td>
                    <td className="min-w-0 break-words">
                      <span className="text-default-900 block font-medium">{name(r)}</span>
                      {r.phoneMasked && <span className={`${MUTED} block text-xs tabular-nums`}>{r.phoneMasked}</span>}
                      <ChannelTag channel={r.channel} />
                    </td>
                    <td className="text-default-800 break-words">
                      <div className="flex items-start gap-2.5">
                        {hasThumb && <Thumb url={r.imageUrl} />}
                        <span className="min-w-0">{r.title}</span>
                      </div>
                    </td>
                    {showAmt && <td><Chips shop={shop} r={r} /></td>}
                    {showAmt && <td className="text-default-900 text-end font-semibold tabular-nums">{r.amount !== undefined ? money(r.amount) : ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {shop.rowsTruncated && (
        <div className="card-footer">
          <p className={`${MUTED} m-0 flex items-start gap-1.5 text-xs`}>
            <Icon icon="info-circle" className="mt-px size-4 shrink-0" aria-hidden="true" />
            <span>แสดง {shop.rows.length} จาก {shop.rowsTotal} รายการล่าสุด ยอดรวมด้านบนนับครบทุกรายการ ดูรายการที่เหลือใน Deep</span>
          </p>
        </div>
      )}
    </section>
  )
}

function ExpenseCard({ s, shop, cls }: { s: Snap; shop: DetailShop; cls: string }) {
  const e = shop.expense
  if (!e) return null // exposure.expense ปิด = ไม่มีส่วนนี้เลย (ไม่ใช่ซ่อน)
  const d = expenseDisplay(e.total, { recorded: e.recorded })
  const empty = !e.recorded && e.total === 0 && e.rows.length === 0
  const sub = (r: ExpenseRow) => [isMultiDay(s) && !r.system ? formatDayMonthTH(r.date) : null, r.system ? 'ระบบคิดให้' : r.note].filter(Boolean).join(' · ')
  return (
    <section className={`card ${cls}`}>
      <div className="card-header">
        <h2 className="card-title flex items-center gap-2">
          <span className={`${FINANCE_COLORS.outflow.dot} size-2 shrink-0 rounded-full`} />
          {d.label}
        </h2>
        {!empty && <span className="text-default-900 text-md font-semibold tabular-nums">{money(e.total)}</span>}
      </div>
      <div className="card-body py-3">
        {empty ? (
          <p className={`${MUTED} m-0 py-1.5 text-sm`}>ร้านยังไม่ได้บันทึกค่าใช้จ่ายในช่วงนี้</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {e.rows.map((r, i) => (
              <li key={i} className="py-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-default-900 min-w-0 text-sm break-words">{r.category}</span>
                  <span className="text-default-900 shrink-0 text-sm tabular-nums">{money(r.amount)}</span>
                </div>
                {sub(r) && <p className={`${MUTED} m-0 text-xs break-words`}>{sub(r)}</p>}
              </li>
            ))}
          </ul>
        )}
        {e.rowsTruncated && <p className={`${MUTED} m-0 pt-2 text-xs`}>แสดง {e.rows.length} จาก {e.rowsTotal} รายการ ยอดรวมนับครบทุกรายการ</p>}
      </div>
      <div className="card-footer"><p className={`${MUTED} m-0 text-xs`}>รายการที่ร้านบันทึกไว้ในช่วงนี้ และค่าส่งที่ระบบคิดให้</p></div>
    </section>
  )
}

/** โครง 4/8 ของร้านหนึ่ง: ซ้าย (สรุป+ค่าใช้จ่าย) · ขวา (รายการ) — ลำดับมือถือ สรุป → รายการ → ค่าใช้จ่าย */
function ShopGrid({ s, shop, summary, id }: { s: Snap; shop: DetailShop; summary: React.ReactNode; id: string }) {
  const showList = s.exposure.orders || s.exposure.sales
  return (
    <>
      <div className="contents md:grid md:grid-cols-2 md:gap-base lg:col-span-4 lg:flex lg:flex-col">
        {summary}
        {shop.expense && <ExpenseCard s={s} shop={shop} cls="order-3 md:h-full lg:h-fit" />}
      </div>
      {showList && <ListCard s={s} shop={shop} cls="order-2 lg:col-span-8" id={id} />}
    </>
  )
}

function ExcludedRow({ shop }: { shop: DetailShop }) {
  const why = shop.excludedReason ? (EXCLUDED_REASON_TH[shop.excludedReason] ?? shop.excludedReason) : null
  return (
    <div className="bg-default-200 text-default-700 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm">
      <Icon icon="lock" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="break-words">ไม่รวมร้าน {shop.name}{why ? ` (${why})` : ''} · ร้านนี้ไม่อยู่ในยอดรวม</span>
    </div>
  )
}

function PageFooter({ s }: { s: Snap }) {
  const dash = sellerDashboardUrl()
  return (
    <footer className="mx-auto w-full max-w-3xl px-4 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:px-6 lg:max-w-6xl">
      {/* safe-area ไม่มี token — carve-out เดียวกับ AuthCardShell */}
      <p className={`${MUTED} m-0 text-xs`}>ลิงก์นี้ใช้ได้ถึงสิ้นวันที่ {expiryDayText(s.expiresAt)} เปิดได้โดยไม่ต้องเข้าสู่ระบบ ควรแชร์เฉพาะคนในทีม</p>
      <p className={`${MUTED} m-0 flex flex-wrap items-center gap-x-1 text-xs`}>
        ต้องการตัวเลขล่าสุด? เจ้าของร้านดูได้ใน Deep
        {dash && (
          <a href={dash} rel="noopener noreferrer" className="text-primary inline-flex min-h-11 items-center font-medium">เปิด Deep</a>
        )}
      </p>
    </footer>
  )
}

const MAIN = 'mx-auto flex w-full max-w-3xl flex-col gap-base px-4 md:px-6 lg:grid lg:max-w-6xl lg:grid-cols-12 lg:items-start'

// ---------- หน้า ----------

export default function ReportView({ snapshot: s }: { snapshot: Snap }) {
  const shops = s.shops
  const okShops = shops.filter((x) => x.state !== 'EXCLUDED')
  const excluded = shops.filter((x) => x.state === 'EXCLUDED')

  if (shops.length === 1 && shops[0].state !== 'EXCLUDED') {
    const shop = shops[0]
    const full = shop.state === 'OK'
    return (
      <div className="bg-body-bg min-h-screen">
        <Brand />
        <main className={MAIN}>
          {full ? (
            <ShopGrid s={s} shop={shop} id="list-0" summary={<Hero s={s} shop={shop} cls={`order-1 md:h-full lg:h-fit${shop.expense ? '' : ' md:col-span-2'}`} />} />
          ) : (
            <div className="lg:col-span-12"><Hero s={s} shop={shop} cls="" /></div>
          )}
        </main>
        <PageFooter s={s} />
      </div>
    )
  }

  const showSales = s.exposure.sales && s.total.sales !== undefined
  const hasError = shops.some((x) => x.state === 'ERROR')
  const countLine = s.exposure.orders
    ? `${s.orderWordMixed ? 'รายการ' : `${s.orderWord} `}${s.orderWordMixed ? ` ${s.total.orders}` : `${s.total.orders} รายการ`}${s.exposure.cancelled && s.total.cancelled !== undefined ? ` · ยกเลิก ${s.total.cancelled} ใบ` : ''}`
    : null
  return (
    <div className="bg-body-bg min-h-screen">
      <Brand />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-base px-4 md:px-6 lg:max-w-6xl">
        <section className="card" aria-labelledby="h1">
          <div className="card-header">
            <h1 id="h1" className="text-default-900 m-0 text-lg font-semibold text-balance">{s.title}</h1>
            {s.kind === 'TEST' && <span className={`${CHIP} bg-warning/15 text-warning-ink`}>รายงานทดสอบ</span>}
          </div>
          <div className="card-body md:grid md:grid-cols-2 md:gap-base">
            <div>
              <p className={`${MUTED} m-0 text-sm`}>รวม {okShops.length} ร้าน</p>
              <p className="text-primary m-0 mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
                <Icon icon="calendar" className="size-4" aria-hidden="true" />
                {rangeText(s.window.startIso, s.window.endIso)}
              </p>
              {s.kind === 'TEST' && (
                <p className={`${MUTED} m-0 mt-2 text-xs`}>ส่งทดสอบจากหน้าตั้งค่า ใช้ยอดจริงของร้านตั้งแต่เที่ยงคืนถึง {formatTimeHM(s.window.computedAt)} น.</p>
              )}
              <p className={`${MUTED} m-0 mt-4 text-sm`}>{showSales ? 'ยอดขาย' : s.orderWord}</p>
              <BigNumber n={showSales ? (s.total.sales as number) : s.total.orders} unit={showSales ? 'บาท' : 'รายการ'} />
            </div>
            <div className="md:border-default-300 md:self-end md:border-s md:border-dashed md:ps-5">
              {showSales && countLine && <p className={`${MUTED} m-0 text-sm`}>{countLine}</p>}
              {s.mixedFinanceRules && <p className={`${MUTED} m-0 mt-1 text-xs`}>ยอดแต่ละร้านคิดตามกติกาของประเภทธุรกิจ</p>}
              {hasError && <p className="text-danger-ink m-0 mt-1 text-xs">ยอดรวมยังไม่ครบ เพราะดึงข้อมูลบางร้านไม่สำเร็จ</p>}
            </div>
          </div>
          <Stamp s={s} />
        </section>
        {okShops.map((shop, i) => (
          <details key={i} open={okShops.length <= 2 || i === 0} className="group">
            <summary className="border-default-300 flex min-h-11 cursor-pointer items-center justify-between gap-3 border-b border-dashed py-2">
              <span className="flex min-w-0 items-center gap-2">
                <Icon icon="chevron-down" className={`${MUTED} size-4 -rotate-90 transition-transform group-open:rotate-0`} aria-hidden="true" />
                <span className="text-md text-default-900 font-semibold break-words">{shop.name}</span>
              </span>
              {s.exposure.sales && shop.sales !== undefined && <span className="text-default-900 text-md shrink-0 font-bold tabular-nums">{money(shop.sales)}</span>}
            </summary>
            <div className="mt-base gap-base flex flex-col lg:grid lg:grid-cols-12 lg:items-start">
              {shop.state === 'ERROR' ? (
                <div className="lg:col-span-12"><ErrorCallout /></div>
              ) : (
                <ShopGrid s={s} shop={shop} id={`list-${i}`} summary={<ShopSummary s={s} shop={shop} cls="order-1 md:h-full lg:h-fit" />} />
              )}
            </div>
          </details>
        ))}
        {excluded.map((shop, i) => <ExcludedRow key={i} shop={shop} />)}
      </main>
      <PageFooter s={s} />
    </div>
  )
}
