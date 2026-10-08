/**
 * FlexBubbleView — แปลง Flex JSON ที่ `buildSummaryReportFlex` ส่งจริง เป็น markup พรีวิว (ไม่มี state · client-safe)
 *
 * Base: ไม่พบ theme match (addendum E §9 ข้อ 1 · มติ Controller อนุมัติ renderer เล็ก ๆ) — closest:
 *   theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card/.card-body) + utility ข้อความของ Paces
 *
 * ทำไม render จาก JSON จริง ไม่เขียน bubble ตัวอย่างด้วยมือ: ข้อความ/โครงที่แก้ใน flex-summary-report.ts แล้วพรีวิวต้องตามเอง (HR16)
 * สีผ่าน `flex-preview-tokens` เท่านั้น (hex อยู่นอก `(paces)`) · สีไม่รู้จัก → หมึกปกติ
 * inline style ใช้เฉพาะค่าที่มาจากข้อมูลกราฟ (สูง/กว้างแท่ง, สัดส่วน flex) พร้อมคอมเมนต์กำกับ (HR7 carve-out)
 * margin ทำเฉพาะแนวตั้ง (`mt-*`) — builder ใช้ margin ในกล่อง vertical เท่านั้น (โหนดแนวนอนไม่มี margin)
 * ปุ่ม footer = ภาพแทน ไม่นำทาง (`aria-disabled` + `tabIndex=-1`)
 */
import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/utils/helpers'
import { flexBgClass, flexColorClass, GAP, isFlexLength, ITEMS, JUSTIFY, MARGIN, RADIUS, TEXT_SIZE } from '@/lib/line-report/flex-preview-tokens'

type FlexNode = Record<string, unknown>
type Layout = 'vertical' | 'horizontal'

const LINE_CLAMP: Record<number, string> = { 1: 'line-clamp-1', 2: 'line-clamp-2' }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const kids = (n: FlexNode): FlexNode[] => (Array.isArray(n.contents) ? (n.contents as FlexNode[]) : [])

/** flex: 0 = ไม่ยืด · n = สัดส่วน (LINE: grow n, basis 0) — สัดส่วนมาจาก composer (เช่น 38/62) จึงใส่ผ่าน style ไม่ใช่คลาส */
function flexOf(n: FlexNode, parent: Layout): { className?: string; style?: CSSProperties } {
  if (parent !== 'horizontal' || typeof n.flex !== 'number') return {}
  if (n.flex === 0) return { className: 'shrink-0' }
  return { style: { flex: `${n.flex} 1 0px` } } // ค่าสัดส่วนจากข้อมูลของ composer (HR7 carve-out)
}

/** กล่องที่มีลูกกำหนดความสูงเป็น % ต้องมีความสูงชัดเจน — ยืดเต็มแถวแม่ (แท่งกราฟ) ไม่งั้น % ไม่มีฐานให้คิด */
const hasPctHeightChild = (n: FlexNode) => kids(n).some((c) => c.type === 'box' && typeof c.height === 'string' && c.height.endsWith('%'))

function renderSpan(n: FlexNode, key: number): ReactNode {
  return (
    <span key={key} className={cn(n.weight === 'bold' && 'font-semibold', n.color ? flexColorClass(n.color) : undefined)}>
      {str(n.text)}
    </span>
  )
}

function renderNode(n: FlexNode, key: number, parent: Layout): ReactNode {
  const margin = MARGIN[str(n.margin)]
  const { className: flexClass, style: flexStyle } = flexOf(n, parent)
  switch (n.type) {
    case 'box': {
      const layout: Layout = n.layout === 'horizontal' ? 'horizontal' : 'vertical'
      // ความสูง/กว้างแท่งกราฟมาจากข้อมูล (px หรือ %) — ใส่ผ่าน style ได้ (HR7 carve-out)
      const style: CSSProperties = { ...flexStyle }
      if (isFlexLength(n.height)) style.height = n.height // ค่าจากข้อมูลกราฟ (HR7 carve-out)
      if (isFlexLength(n.width)) style.width = n.width // ค่าจากข้อมูลกราฟ (HR7 carve-out)
      // จุดของเส้นแนวโน้ม — ตำแหน่งมาจากข้อมูลกราฟ (HR7 carve-out)
      if (n.position === 'absolute') {
        style.position = 'absolute'
        if (isFlexLength(n.offsetStart)) style.left = n.offsetStart
        if (isFlexLength(n.offsetBottom)) style.bottom = n.offsetBottom
      }
      return (
        <div
          key={key}
          style={Object.keys(style).length > 0 ? style : undefined}
          className={cn(
            'flex min-w-0',
            layout === 'horizontal' ? 'items-start' : 'flex-col',
            ITEMS[str(n.alignItems)],
            JUSTIFY[str(n.justifyContent)],
            GAP[str(n.spacing)],
            RADIUS[str(n.cornerRadius)],
            flexBgClass(n.backgroundColor),
            hasPctHeightChild(n) && 'self-stretch',
            kids(n).some((c) => c.position === 'absolute') && 'relative',
            margin,
            flexClass,
          )}
        >
          {kids(n).map((c, i) => renderNode(c, i, layout))}
        </div>
      )
    }
    case 'text': {
      const spans = kids(n).filter((c) => c.type === 'span')
      return (
        <span
          key={key}
          style={flexStyle} // HR7 carve-out: สัดส่วน flex มาจากข้อมูล Flex (ดู flexOf)
          className={cn(
            'block min-w-0',
            TEXT_SIZE[str(n.size)] ?? 'text-sm',
            n.weight === 'bold' && 'font-semibold',
            n.align === 'end' && 'text-right',
            n.align === 'center' && 'text-center',
            n.wrap === false ? 'whitespace-nowrap' : 'break-words',
            typeof n.maxLines === 'number' && LINE_CLAMP[n.maxLines],
            flexColorClass(n.color),
            margin,
            flexClass,
          )}
        >
          {spans.length > 0 ? spans.map((c, i) => renderSpan(c, i)) : str(n.text)}
        </span>
      )
    }
    case 'filler':
      return <div key={key} aria-hidden="true" className="flex-1" />
    case 'separator':
      return <div key={key} role="separator" className={cn('border-default-200 border-t', margin)} />
    default:
      return null
  }
}

export default function FlexBubbleView({
  contents,
  caption = 'ตัวอย่าง ตัวเลขจริงมาจากข้อมูลของร้านที่เลือก',
  className,
}: {
  /** `LineFlexMessage.contents` (โหนด bubble) */
  contents: Record<string, unknown>
  /** null = ไม่แสดงคำบรรยาย (ปกติต้องแสดงเสมอ — ป้าย "ตัวอย่าง" ตามมติ) */
  caption?: string | null
  /** ปรับกล่องพื้นเทา (เช่นถอดพื้น/padding เมื่ออยู่ใน card-body อยู่แล้ว) — ไม่แตะสี/โหนดของ bubble */
  className?: string
}) {
  const body = contents.body as FlexNode | undefined
  const footer = contents.footer as FlexNode | undefined
  const button = footer ? kids(footer).find((c) => c.type === 'button') : undefined
  const label = button ? str((button.action as FlexNode | undefined)?.label) : ''
  return (
    <figure aria-label="ตัวอย่างข้อความในกลุ่ม LINE" className={cn('bg-light mb-0 rounded-lg p-3', className)}>
      <div className="text-default-700 mb-1.5 flex items-center gap-1.5 text-xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logos/line.svg" alt="" aria-hidden="true" width={20} height={20} className="size-5 rounded-full" />
        Deep รายงานยอด
      </div>
      <div className="bg-card border-default-200 mx-auto w-full max-w-xs overflow-hidden rounded-lg border">
        <div className="p-4">{body ? renderNode(body, 0, 'vertical') : null}</div>
        {label && (
          <div className="border-default-200 border-t p-3">
            <button type="button" aria-disabled="true" tabIndex={-1} className="btn bg-primary w-full cursor-default text-white">
              {label}
            </button>
          </div>
        )}
      </div>
      {caption && <figcaption className="text-default-700 mt-2 text-center text-xs">{caption}</figcaption>}
    </figure>
  )
}
