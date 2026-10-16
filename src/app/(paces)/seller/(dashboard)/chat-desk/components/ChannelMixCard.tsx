/**
 * ChannelMixCard — การ์ด ③ แชทแยกตามช่องทาง: แถบสัดส่วนซ้อน + แถวตัวเลข (ช่องทางที่ไม่มีห้องไม่แสดง)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/progress/page.tsx (progress แบบซ้อน — style={{width}} เป็นรูปแบบของ theme เอง)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (card + card-header)
 * สีแถบคงที่ต่อช่องทาง (CHANNEL_TOKEN) กันสีสลับที่เมื่อลำดับเปลี่ยนทุกรอบ poll · ไม่ใช้เขียว/ม่วง · HR10: ไม่ใช้กราฟ
 */
import { CHANNEL_LABEL } from '@/lib/chat-desk/channel-colors'
import type { ChannelMixRow } from '@/lib/chat-desk/page-model'
import type { DeskPlatform } from '@/lib/chat-desk/types'
import { ChannelDot } from './desk-ui'

// class เต็มเขียนตรง ๆ (ไม่ประกอบ `bg-${token}`) เพื่อให้ Tailwind เก็บคลาสครบ — ค่าตรงกับ CHANNEL_TOKEN
const BAR: Record<DeskPlatform, string> = {
  DEEP: 'bg-primary',
  MESSENGER: 'bg-info',
  INSTAGRAM: 'bg-dark',
  LINE: 'bg-default-400',
}

export default function ChannelMixCard({ rows }: { rows: ChannelMixRow[] }) {
  const total = rows.reduce((a, r) => a + r.count, 0)
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">แชทแยกตามช่องทาง</div>
          <div className="text-default-400 text-xs">ห้องที่อยู่บนฉากตอนนี้</div>
        </div>
      </div>
      <div className="p-3">
        {rows.length === 0 ? (
          <p className="text-default-700 text-xs">ยังไม่มีห้องบนฉาก</p>
        ) : (
          <>
            <div className="bg-light flex h-2.5 gap-px overflow-hidden rounded-full" aria-hidden="true">
              {rows.map((r) => (
                <div key={r.platform} className={BAR[r.platform]} style={{ width: `${(r.count / total) * 100}%` }} />
              ))}
            </div>
            <ul className="mt-3 space-y-2">
              {rows.map((r) => (
                <li key={r.platform} className="flex items-center gap-2 text-sm">
                  <span aria-hidden="true" className={`size-2.5 rounded-sm ${BAR[r.platform]}`} />
                  <ChannelDot platform={r.platform} size="size-5" />
                  <span className="text-default-700">{CHANNEL_LABEL[r.platform]}</span>
                  <span className="ms-auto font-semibold tabular-nums">{r.count}</span>
                  <span className="text-default-400 w-9 text-end text-xs tabular-nums">{r.pct}%</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
