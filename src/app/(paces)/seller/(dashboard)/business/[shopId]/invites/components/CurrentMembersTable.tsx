/**
 * CurrentMembersTable — ตารางสมาชิกปัจจุบันของ Business shop (owner + admin, server component)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/tables/static/components/HoverableRows.tsx
 *   (table table-hover markup ธรรมดา — ไม่ใช้ TanStack ตาม Design Spec §4 "ข้อมูล ≤3 แถว")
 *
 * `title`/`headerRight` (optional, feature 00012 Task 4.3): หน้า /admins reuse component นี้แต่ต้องการ
 * title แบบ "สมาชิกทั้งหมด (N)" + quota badge ฝั่งขวา card-header — เพิ่ม prop optional (default เดิม
 * "สมาชิกปัจจุบัน" ไม่มี headerRight) กัน breaking หน้า /business/[shopId]/invites เดิม
 */

import { formatDate } from '@/lib/format-date'
import RowActionDeleteButton from './RowActionDeleteButton'

export interface MemberRow {
  id: string
  role: 'OWNER' | 'ADMIN'
  displayName: string
  createdAt: string
}

interface CurrentMembersTableProps {
  members: MemberRow[]
  shopId: string
  /** true = owner เท่านั้น (API §4.14 ลบสมาชิกเป็น owner-only) */
  canManage: boolean
  /** card title — default "สมาชิกปัจจุบัน" */
  title?: string
  /** เนื้อหาเสริมฝั่งขวาของ card-header เช่น quota badge (feature 00012 Task 4.3) */
  headerRight?: React.ReactNode
}

const ROLE_BADGE: Record<'OWNER' | 'ADMIN', string> = {
  OWNER: 'bg-primary/15 text-primary',
  ADMIN: 'bg-info/15 text-info',
}
const ROLE_LABEL: Record<'OWNER' | 'ADMIN', string> = { OWNER: 'เจ้าของ', ADMIN: 'ผู้ดูแล' }

export default function CurrentMembersTable({
  members,
  shopId,
  canManage,
  title = 'สมาชิกปัจจุบัน',
  headerRight,
}: CurrentMembersTableProps) {
  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">{title}</h4>
        {headerRight}
      </div>
      <div className="overflow-x-auto">
        <table className="table table-hover">
          <thead className="font-semibold">
            <tr>
              <th>สมาชิก</th>
              <th>บทบาท</th>
              <th>วันที่เข้าร่วม</th>
              {canManage && <th className="text-end">จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td>{member.displayName}</td>
                <td>
                  <span className={`badge ${ROLE_BADGE[member.role]}`}>{ROLE_LABEL[member.role]}</span>
                </td>
                <td className="text-default-500">{formatDate(member.createdAt)}</td>
                {canManage && (
                  <td className="text-end">
                    {member.role === 'ADMIN' && (
                      <RowActionDeleteButton
                        endpoint={`/api/business/shops/${shopId}/members/${member.id}`}
                        ariaLabel={`ลบสมาชิก ${member.displayName}`}
                        icon="trash"
                        confirmTitle="ลบสมาชิกนี้?"
                        confirmText={`${member.displayName} จะไม่สามารถเข้าถึงร้านนี้ได้อีก`}
                        successMessage="ลบสมาชิกสำเร็จ"
                        errorMessages={{
                          NOT_OWNER: 'คุณไม่มีสิทธิ์ลบสมาชิกนี้',
                          NOT_AN_ADMIN: 'ไม่สามารถลบเจ้าของร้านได้',
                        }}
                      />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
