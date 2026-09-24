/**
 * กระดาษใบเสร็จ A4 หนึ่งแผ่น (ต้นฉบับ หรือ สำเนา) — feature 00065
 *
 * ไม่พบ theme match ตรงตัว — closest primitive:
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/invoice/details/page.tsx (โครงหัว/ตารางรายการ/สรุปยอด)
 * ผังกระดาษ สี ช่องติ๊ก ลายเซ็น สามเหลี่ยมเลขหน้า = ตามใบเสร็จจริงของร้าน (HR6 asset/content)
 *
 * Server component ล้วน — ไม่มีสถานะ ใช้ <img> ธรรมดาไม่ใช่ next/image เพราะ next/image lazy-load
 * แล้วรูปที่ยังไม่โหลดจะหายจากงานพิมพ์ (หน้าต่างพิมพ์ไม่รอรูปนอกจอ)
 */
import styles from './receipt.module.css'

export type ReceiptSheetData = {
  receiptNo: string
  issuedDateLabel: string
  sellerName: string
  header: { name: string; address: string | null; taxId: string | null; phone: string | null; logoUrl: string | null }
  stampUrl: string | null
  customer: { name: string; contact: string | null }
  items: { name: string; description: string | null; qty: number; unitPrice: string; lineTotal: string }[]
  breakdown: { key: string; label: string; value: string }[]
  totalLabel: string
  totalValue: string
  totalWords: string
  marks: { cash: boolean; transfer: boolean }
  cancelled: boolean
}

function Box({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span>
      {/* ✓ = dingbat สีเดียวที่ HR12 ยกเว้น ไม่ใช่ emoji */}
      <span className={styles.box} aria-hidden="true">
        {checked ? '✓' : ''}
      </span>
      {label}
      {checked ? <span className="sr-only"> (เลือก)</span> : null}
    </span>
  )
}

export default function ReceiptSheet({
  data,
  copyLabel,
  pageNo,
}: {
  data: ReceiptSheetData
  copyLabel: 'ต้นฉบับ' | 'สำเนา'
  pageNo: number
}) {
  const { header } = data
  return (
    <article className={styles.sheet} aria-label={`ใบเสร็จรับเงิน ${copyLabel} เลขที่ ${data.receiptNo}${data.cancelled ? ' (ยกเลิกแล้ว)' : ''}`}>
      <div className={styles.corner} aria-hidden="true" />
      <span className={styles.cornerNo} aria-hidden="true">
        {pageNo}
      </span>
      {data.cancelled ? (
        <div className={styles.void} aria-hidden="true">
          ยกเลิก
        </div>
      ) : null}

      <div className={styles.header}>
        <div>
          {header.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- เหตุผลที่หัวไฟล์ (next/image lazy-load หายจากงานพิมพ์)
            <img src={header.logoUrl} alt="" className={styles.logo} />
          ) : null}
          <div>{header.name}</div>
          {header.address ? <div style={{ whiteSpace: 'pre-line' }}>{header.address}</div> : null}
          {header.taxId ? <div>เลขประจำตัวผู้เสียภาษี {header.taxId}</div> : null}
          {header.phone ? <div>โทร. {header.phone}</div> : null}
        </div>
        <div className={styles.titleBlock}>
          <div className={styles.title}>ใบเสร็จรับเงิน</div>
          <div className={styles.copyLabel}>{copyLabel}</div>
          <div className={styles.metaGrid}>
            <span className={styles.label}>เลขที่</span>
            <span>{data.receiptNo}</span>
            <span className={styles.label}>วันที่</span>
            <span>{data.issuedDateLabel}</span>
            <span className={styles.label}>ผู้ขาย</span>
            <span>{data.sellerName}</span>
          </div>
        </div>
      </div>

      <div className={styles.customer}>
        <div className={styles.label}>ลูกค้า</div>
        {/* ไม่มีชื่อ = ช่องเขียนมือ ไม่ใช่คำว่า "ลูกค้า" ซ้ำ (อ่านเป็น template พัง) */}
        {data.customer.name ? <div>{data.customer.name}</div> : <div className={styles.fill}>&nbsp;</div>}
        {data.customer.contact ? <div>{data.customer.contact}</div> : null}
      </div>

      <table className={styles.items}>
        <thead>
          <tr>
            <th className={styles.center} style={{ width: '8mm' }}>#</th>
            <th className={styles.center}>รายละเอียด</th>
            <th className={styles.center} style={{ width: '18mm' }}>จำนวน</th>
            <th className={styles.num} style={{ width: '30mm' }}>ราคาต่อหน่วย</th>
            <th className={styles.num} style={{ width: '28mm' }}>ยอดรวม</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((it, i) => (
            <tr key={i}>
              <td className={styles.center}>{i + 1}</td>
              <td>
                <div>{it.name}</div>
                {it.description ? <div className={styles.desc}>{it.description}</div> : null}
              </td>
              <td className={styles.center}>{it.qty}</td>
              <td className={styles.num}>{it.unitPrice}</td>
              <td className={styles.num}>{it.lineTotal}</td>
            </tr>
          ))}
          {data.items.length === 0 ? (
            <tr>
              <td colSpan={5}>&nbsp;</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div className={styles.totals}>
        {data.breakdown.map((row) => (
          <div key={row.key} style={{ display: 'contents' }}>
            <span />
            <span className={styles.label}>{row.label}</span>
            <span className={styles.num}>{row.value} บาท</span>
          </div>
        ))}
        <span className={styles.totalWords}>({data.totalWords})</span>
        <span className={styles.label}>{data.totalLabel}</span>
        <span className={styles.num}>
          <strong>{data.totalValue} บาท</strong>
        </span>
      </div>

      <div className={styles.footer}>
        <div className={styles.payRow}>
          <span>การชำระเงินจะสมบูรณ์เมื่อร้านค้าได้รับเงินเรียบร้อยแล้ว</span>
          <Box checked={data.marks.cash} label="เงินสด" />
          <Box checked={false} label="เช็ค" />
          <Box checked={data.marks.transfer} label="โอนเงิน" />
          <Box checked={false} label="บัตรเครดิต" />
        </div>
        <div className={styles.fillRow}>
          <span className={styles.fill}>ธนาคาร</span>
          <span className={styles.fill}>เลขที่</span>
          <span className={styles.fill}>วันที่</span>
          <span className={styles.fill}>จำนวนเงิน</span>
        </div>

        <div className={styles.signArea}>
          <div className={styles.signSide}>
            <span className={data.customer.name ? undefined : styles.fill}>ในนาม {data.customer.name}</span>
            <div className={styles.lines}>
              <span className={styles.line}>ผู้จ่ายเงิน</span>
              <span className={styles.line}>วันที่</span>
            </div>
          </div>
          {data.stampUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- เหตุผลที่หัวไฟล์
            <img src={data.stampUrl} alt="ตราประทับ" className={styles.stamp} />
          ) : (
            <span />
          )}
          <div className={`${styles.signSide} ${styles.signSideRight}`}>
            <span>ในนาม {header.name}</span>
            <div className={styles.lines}>
              <span className={styles.line}>ผู้รับเงิน</span>
              <span className={styles.line}>วันที่</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
