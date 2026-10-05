/**
 * FlexBubbleView — แปลง Flex JSON ที่ `buildSummaryReportFlex` ส่งจริง เป็น markup พรีวิว (ไม่มี state · client-safe)
 *
 * Base: ไม่พบ theme match (addendum E §9 ข้อ 1 · มติ Controller อนุมัติ renderer เล็ก ๆ) — closest:
 *   theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card/.card-body) + utility ข้อความของ Paces
 *
 * ทำไม render จาก JSON จริง ไม่เขียน bubble ตัวอย่างด้วยมือ: ข้อความ/โครงที่แก้ใน flex-summary-report.ts แล้วพรีวิวต้องตามเอง (HR16)
 * สีผ่าน `flex-preview-tokens` เท่านั้น (hex อยู่นอก `(paces)`) · สีไม่รู้จัก → หมึกปกติ · ไม่ใช้ inline style
 * margin ทำเฉพาะแนวตั้ง (`mt-*`) — builder ใช้ margin ในกล่อง vertical เท่านั้น (โหนดแนวนอนไม่มี margin)
 * ปุ่ม footer = ภาพแทน ไม่นำทาง (`aria-disabled` + `tabIndex=-1`)
 */
import type { ReactNode } from 'react'
import { cn } from '@/utils/helpers'
import { flexColorClass } from '@/lib/line-report/flex-preview-tokens'

type FlexNode = Record<string, unknown>
type Layout = 'vertical' | 'horizontal'

const MARGIN: Record<string, string> = { xs: 'mt-0.5', sm: 'mt-1', md: 'mt-2', lg: 'mt-3', xl: 'mt-4' }
const GAP: Record<string, string> = { xs: 'gap-0.5', sm: 'gap-1', md: 'gap-2', lg: 'gap-3', xl: 'gap-4' }
const TEXT_SIZE: Record<string, string> = { xs: 'text-xs', sm: 'text-sm', md: 'text-md' }
const FLEX: Record<number, string> = { 0: 'shrink-0', 1: 'flex-1', 2: 'flex-2', 3: 'flex-3', 4: 'flex-4', 5: 'flex-5' }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const kids = (n: FlexNode): FlexNode[] => (Array.isArray(n.contents) ? (n.contents as FlexNode[]) : [])

function renderNode(n: FlexNode, key: number, parent: Layout): ReactNode {
  const margin = MARGIN[str(n.margin)]
  const flex = parent === 'horizontal' && typeof n.flex === 'number' ? FLEX[n.flex] : undefined
  switch (n.type) {
    case 'box': {
      const layout: Layout = n.layout === 'horizontal' ? 'horizontal' : 'vertical'
      return (
        <div key={key} className={cn('flex min-w-0', layout === 'horizontal' ? 'items-start' : 'flex-col', GAP[str(n.spacing)], margin, flex)}>
          {kids(n).map((c, i) => renderNode(c, i, layout))}
        </div>
      )
    }
    case 'text':
      return (
        <span
          key={key}
          className={cn(
            'block min-w-0',
            TEXT_SIZE[str(n.size)] ?? 'text-sm',
            n.weight === 'bold' && 'font-semibold',
            n.align === 'end' && 'text-right',
            n.align === 'center' && 'text-center',
            n.wrap === false ? 'whitespace-nowrap' : 'break-words',
            n.maxLines === 2 && 'line-clamp-2',
            flexColorClass(n.color),
            margin,
            flex,
          )}
        >
          {str(n.text)}
        </span>
      )
    case 'separator':
      return <div key={key} role="separator" className={cn('border-default-200 border-t', margin)} />
    default:
      return null
  }
}

export default function FlexBubbleView({
  contents,
  caption = 'ตัวอย่าง ตัวเลขจริงมาจากข้อมูลของร้านที่เลือก',
}: {
  /** `LineFlexMessage.contents` (โหนด bubble) */
  contents: Record<string, unknown>
  /** null = ไม่แสดงคำบรรยาย (ปกติต้องแสดงเสมอ — ป้าย "ตัวอย่าง" ตามมติ) */
  caption?: string | null
}) {
  const body = contents.body as FlexNode | undefined
  const footer = contents.footer as FlexNode | undefined
  const button = footer ? kids(footer).find((c) => c.type === 'button') : undefined
  const label = button ? str((button.action as FlexNode | undefined)?.label) : ''
  return (
    <figure aria-label="ตัวอย่างข้อความในกลุ่ม LINE" className="bg-light mb-0 rounded-lg p-3">
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
