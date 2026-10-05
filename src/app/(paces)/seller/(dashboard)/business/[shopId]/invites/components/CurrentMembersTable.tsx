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

import Image from 'next/image'
import { formatDate } from '@/lib/format-date'
import Icon from '@/components/wrappers/Icon'
import RowActionDeleteButton from './RowActionDeleteButton'
import MemberRoleControls from './MemberRoleControls'
import TransferOwnershipButton from './TransferOwnershipButton'
import LoginProviderLogo, { LOGIN_PROVIDER_LABEL, type LoginProvider } from '@/components/safepay/LoginProviderLogo'
import { memberErrorText } from './member-error-text'

export interface MemberRow {
  id: string
  role: 'OWNER' | 'ADMIN'
  displayName: string
  /** รูปโปรไฟล์ (User.avatar) — null = แสดงอักษรแรกของชื่อแทน */
  avatar: string | null
  /** ช่องทางที่ใช้ล็อกอิน (AuthAccount.provider ที่รู้จัก) */
  providers: LoginProvider[]
  createdAt: string
  /** (ส่วนขยาย 00025 2026-08-12) คนนี้ปิดแจ้งเตือนข้อความของร้านนี้อยู่ */
  notificationsOff?: boolean
  /** (EXT 2026-10-05) เจ้าของหลัก = Shop.userId — แตะไม่ได้ */
  isPrimary: boolean
  /** แถวของผู้ที่เปิดหน้านี้อยู่ */
  isSelf: boolean
}

interface CurrentMembersTableProps {
  members: MemberRow[]
  shopId: string
  /** true = ผู้ดูเป็นเจ้าของ (หลักหรือร่วม) — เปลี่ยนบทบาท/ลบได้ (EXT 2026-10-05 BR-MR-01/07) */
  canManage: boolean
  /** card title — default "สมาชิกปัจจุบัน" */
  title?: string
  /** เนื้อหาเสริมฝั่งขวาของ card-header เช่น quota badge (feature 00012 Task 4.3) */
  headerRight?: React.ReactNode
}

// -ink: เฉดเดิม เข้มขึ้นให้ผ่าน AA บนพื้น /15 (contrast-fix-keeps-hue)
const ROLE_BADGE: Record<'OWNER' | 'ADMIN', string> = {
  OWNER: 'bg-primary/15 text-primary-ink',
  ADMIN: 'bg-info/15 text-info-ink',
}
const ROLE_LABEL: Record<'OWNER' | 'ADMIN', string> = { OWNER: 'เจ้าของ', ADMIN: 'ผู้ดูแล' }

export default function CurrentMembersTable({
  members,
  shopId,
  canManage,
  title = 'สมาชิกปัจจุบัน',
  headerRight,
}: CurrentMembersTableProps) {
  const primary = members.find((m) => m.isPrimary)
  const viewerIsPrimary = primary?.isSelf ?? false
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
              <th>ช่องทาง</th>
              <th>บทบาท</th>
              <th className="hidden sm:table-cell">วันที่เข้าร่วม</th>
              {canManage && <th className="text-end">จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td>
                  <span className="flex flex-wrap items-center gap-1.5 break-words">
                    {/* Base: reports/agents/components/AgentLeaderboard.tsx (รูป 32px + อักษรแรกเมื่อไม่มีรูป) */}
                    {member.avatar ? (
                      <Image
                        src={member.avatar}
                        alt=""
                        width={32}
                        height={32}
                        className="size-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        className="bg-primary/15 text-primary-ink flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                        aria-hidden="true"
                      >
                        {member.displayName.slice(0, 1)}
                      </span>
                    )}
                    {member.displayName}
                    {member.isSelf && <span className="badge bg-default-100 text-default-600 text-2xs">คุณ</span>}
                    {/* tone neutral ไม่ใช่ warning โดยตั้งใจ — S4 (เรื่องของตัวเอง) เป็น info
                        พร้อมปุ่มแก้ทันที ส่วนตรงนี้เป็นเรื่องของ "คนอื่น" ที่เจ้าของทำแทนไม่ได้
                        (ค่าผูกกับ userId ของเจ้าของค่าเอง) จึงเป็นข้อมูลสถานะ ไม่ใช่คำเตือน */}
                    {member.notificationsOff && (
                      <span className="badge bg-default-100 text-default-600 text-2xs inline-flex items-center gap-1">
                        <Icon icon="bell-off" className="text-2xs" aria-hidden="true" />
                        ปิดแจ้งเตือน
                      </span>
                    )}
                  </span>
                  {/* เหตุผลอยู่บนจอเสมอ ไม่ใช่ tooltip — มือถือไม่มี hover (ux spec) */}
                  {member.isPrimary && (
                    <p className="text-xs text-default-500 mt-1">
                      {viewerIsPrimary
                        ? 'แพ็กเกจของคุณกำหนดโควตาของร้านนี้'
                        : 'ผูกกับแพ็กเกจที่กำหนดโควตาของร้านนี้ · เปลี่ยนบทบาทหรือลบไม่ได้'}
                    </p>
                  )}
                  {member.isPrimary && viewerIsPrimary && members.length > 1 && (
                    <TransferOwnershipButton
                      shopId={shopId}
                      candidates={members.filter((m) => !m.isPrimary).map((m) => ({ id: m.id, name: m.displayName }))}
                      primaryOwnerName={member.displayName}
                    />
                  )}
                </td>
                <td>
                  {member.providers.length ? (
                    <span className="flex items-center gap-2">
                      {member.providers.map((p) => (
                        <span key={p} role="img" aria-label={`ล็อกอินด้วย ${LOGIN_PROVIDER_LABEL[p]}`} title={LOGIN_PROVIDER_LABEL[p]} className="inline-flex">
                          <LoginProviderLogo provider={p} />
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-default-500">-</span>
                  )}
                </td>
                <td>
                  {member.isPrimary ? (
                    <span className={`badge ${ROLE_BADGE.OWNER} inline-flex items-center gap-1`}>
                      <Icon icon="lock" aria-hidden="true" />
                      เจ้าของหลัก
                    </span>
                  ) : canManage ? (
                    <MemberRoleControls
                      shopId={shopId}
                      memberId={member.id}
                      name={member.displayName}
                      role={member.role}
                      isSelf={member.isSelf}
                      primaryOwnerName={primary?.displayName ?? 'เจ้าของหลัก'}
                    />
                  ) : (
                    <span className={`badge ${ROLE_BADGE[member.role]}`}>{ROLE_LABEL[member.role]}</span>
                  )}
                </td>
                <td className="text-default-500 hidden sm:table-cell">{formatDate(member.createdAt)}</td>
                {canManage && (
                  <td className="text-end">
                    {!member.isPrimary && !member.isSelf && (
                      <RowActionDeleteButton
                        endpoint={`/api/business/shops/${shopId}/members/${member.id}`}
                        ariaLabel={`ลบสมาชิก ${member.displayName}`}
                        icon="trash"
                        confirmTitle={`ลบ ${member.displayName} ออกจากร้าน?`}
                        confirmText={
                          member.role === 'OWNER'
                            ? `${member.displayName} เป็นเจ้าของร่วม จะเข้าร้านนี้ไม่ได้อีก และต้องเชิญใหม่ถึงจะกลับเข้าร้านได้`
                            : `${member.displayName} จะเข้าร้านนี้ไม่ได้อีก จนกว่าจะเชิญใหม่`
                        }
                        successMessage={`ลบ ${member.displayName} ออกจากร้านแล้ว`}
                        errorMessages={Object.fromEntries(
                          ['NOT_OWNER', 'PRIMARY_OWNER_LOCKED', 'CANNOT_REMOVE_SELF', 'SHOP_LOCKED', 'NOT_A_MEMBER'].map(
                            (c) => [c, memberErrorText(c, member.displayName, primary?.displayName ?? 'เจ้าของหลัก')],
                          ),
                        )}
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
