/**
 * PendingInvitesTable — ตารางคำเชิญที่ยังรอตอบรับ (server component, ≤3 แถวปกติ)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/tables/static/components/HoverableRows.tsx
 *   (table table-hover markup ธรรมดา — ไม่ใช้ TanStack ตาม Design Spec §4 "ข้อมูล ≤3 แถว")
 *
 * รับ `invites` ที่ mask แล้วจาก page.tsx (server boundary) — ห้ามรับ contact ดิบเข้ามาที่นี่
 */

import Icon from '@/components/wrappers/Icon'
import { formatDate } from '@/lib/format-date'
import RowActionDeleteButton from './RowActionDeleteButton'

export interface PendingInviteRow {
  id: string
  /** invitedContact ที่ mask แล้ว (server boundary — feedback_rsc_pii_neutralize_at_source) */
  invitedContact: string
  contactType: 'PHONE' | 'EMAIL'
  createdAt: string
}

interface PendingInvitesTableProps {
  invites: PendingInviteRow[]
  shopId: string
  /** true = owner เท่านั้น (API §4.12 ยกเลิกคำเชิญเป็น owner-only) */
  canManage: boolean
}

const CONTACT_TYPE_LABEL: Record<'PHONE' | 'EMAIL', string> = { PHONE: 'เบอร์โทร', EMAIL: 'อีเมล' }

export default function PendingInvitesTable({ invites, shopId, canManage }: PendingInvitesTableProps) {
  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">คำเชิญที่รอตอบรับ</h4>
      </div>
      {invites.length === 0 ? (
        <div className="card-body">
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Icon icon="mail" className="text-4xl text-default-300" aria-hidden="true" />
            <p className="text-default-500 font-semibold">ยังไม่มีคำเชิญที่รออยู่</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-hover">
            <thead className="font-semibold">
              <tr>
                <th>ผู้ติดต่อ</th>
                <th>ประเภท</th>
                <th>วันที่ส่งคำเชิญ</th>
                <th>สถานะ</th>
                {canManage && <th className="text-end">จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id}>
                  <td>{invite.invitedContact}</td>
                  <td>{CONTACT_TYPE_LABEL[invite.contactType]}</td>
                  <td className="text-default-500">{formatDate(invite.createdAt)}</td>
                  <td>
                    <span className="badge bg-warning/15 text-warning">รอตอบรับ</span>
                  </td>
                  {canManage && (
                    <td className="text-end">
                      <RowActionDeleteButton
                        endpoint={`/api/business/shops/${shopId}/invites/${invite.id}`}
                        ariaLabel={`ยกเลิกคำเชิญ ${invite.invitedContact}`}
                        icon="x"
                        confirmTitle="ยกเลิกคำเชิญนี้?"
                        confirmText="ผู้ถูกเชิญจะไม่สามารถกดรับคำเชิญนี้ได้อีก"
                        successMessage="ยกเลิกคำเชิญสำเร็จ"
                        errorMessages={{
                          NOT_OWNER: 'คุณไม่มีสิทธิ์ยกเลิกคำเชิญนี้',
                          INVITE_NOT_PENDING: 'คำเชิญนี้ถูกใช้ไปแล้วหรือถูกยกเลิกไปแล้ว',
                        }}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
