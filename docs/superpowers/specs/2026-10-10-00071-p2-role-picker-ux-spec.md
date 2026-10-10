# Design Spec 00071 P2 T5 — เลือกบทบาทสมาชิก

ที่มา: safepay-ux 2026-10-10 (Mode: Operate) · หน้า `/admins` (โมดัลลิงก์เชิญ + ตารางสมาชิก) และ `/business/[shopId]/invites` (ตารางเดียวกัน)

## มติ Controller ต่อ Open questions
1. select ประเภทสมาชิกเปลี่ยนป้ายเป็น **เจ้าของ / พนักงาน** (โค้ดยัง OWNER/ADMIN) + กวาดศัพท์ตามตารางข้างล่าง — อนุมัติ
2. ผู้ดูแล ⊇ ทุกบทบาท (ตรง BRD §8.3) — ใส่ hint ข้อมูล ไม่บล็อก
3. รหัส error ล็อก: `INVALID_ROLES` (รวมกรณีส่ง roles ให้เจ้าของ) · `BILLING_NOT_AVAILABLE`
4. คำอธิบาย MANAGER ใช้ตามสเปก
5. ไม่มี icon ประจำบทบาท
6. อนุมัติแก้ข้อความเดิมของ P1/00012 ตามตารางกวาดศัพท์

## ไฟล์
| ไฟล์ | การแก้ |
|---|---|
| `src/lib/shop-role-picker.ts` (ใหม่, client-safe) | ป้าย+คำอธิบาย SSOT · `staffRoleOptions(billingAvailable)` · `toggleStaffRole(selected, role)` (คืนเรียงลำดับมาตรฐาน) · `canSubmitRoles(selected, billingAvailable)` (≥1, ไม่ซ้ำ, ไม่มี BILLING เมื่อไม่พร้อม) · `rolesDiffer(a,b)` (เซ็ต) · `managerCoversOthers(selected)` · `roleErrorText(code, action)` — เทส `[blocker]` + mutation |
| `src/components/paces/StaffRolePicker.tsx` (ใหม่) | fieldset/legend + การ์ด label ต่อบทบาท |
| `(dashboard)/business/[shopId]/invites/components/MemberRolesEditor.tsx` (ใหม่) | ปุ่ม "แก้ไขบทบาท" + โมดัล |
| `.../invites/components/CurrentMembersTable.tsx` | เซลล์สมาชิก: badge + ปุ่มแก้ (แถวพนักงาน + canManage) · หัวคอลัมน์ "ประเภท" · `MemberRow.roles` · prop `billingAvailable: boolean` **บังคับ** |
| `.../invites/components/MemberRoleControls.tsx` | ป้าย option + confirm/toast ตามตาราง |
| `.../invites/components/member-error-text.ts` | `INVALID_ROLES`, `BILLING_NOT_AVAILABLE`, `FORBIDDEN_ROLE` (alias NOT_OWNER) + กวาดศัพท์ |
| `admins/page.tsx` + `invites/page.tsx` | map roles · `billingAvailable = canUseAppointments(shop)` (invites ต้อง select `vertical`) |
| `admins/components/InviteLinkModal.tsx` | picker ก่อนอายุลิงก์ · ส่ง `roles` · badge บทบาทในรายการลิงก์ · `InviteLinkRow.roles` · ข้อความ error ใหม่ (เลิก "คุณไม่มีสิทธิ์สร้างลิงก์เชิญ") |

## Layout
- **โมดัลลิงก์เชิญ** (`lg:max-w-lg` เดิม): [picker บทบาท — การ์ด 1 คอลัมน์ทุก breakpoint] → [note/hint/error] → [อายุลิงก์ fieldset เดิม] → [ปุ่มสร้าง w-full] → [ลิงก์ที่ใช้งานอยู่: แถว badge บทบาทเหนือแถวคัดลอก, sr-only `บทบาทที่ลิงก์นี้ให้:`] · ค่าตั้งต้น = ผู้ดูแลติ๊ก · หลังสร้างโมดัลเปิดค้าง picker คงค่า
- **การ์ดบทบาท**: `<label>` ขอบ 1px แบบเดียวกับตัวเลือกอายุลิงก์ (มาจาก AuctionTimeCard) · ติ๊ก = `border-primary bg-primary/5` · ไม่ติ๊ก = `border-default-300` · `form-checkbox` + ชื่อ `text-sm font-medium` + คำอธิบาย `text-xs text-default-500` (`aria-describedby`) · ระยะการ์ด `gap-2` · ระหว่างกลุ่ม `space-y-5` · ลำดับ: ผู้ดูแล, ตอบแชท, เปิดบิล (เฉพาะ billingAvailable — **ซ่อน ไม่ disable**), ฝ่ายช่าง
- **ตารางสมาชิก**: badge + ปุ่มอยู่ในเซลล์ "สมาชิก" ใต้ชื่อ (ไม่เพิ่มคอลัมน์) · badge เทา `badge bg-default-100 text-default-700` (`flex flex-wrap gap-1.5`) · ปุ่ม `btn bg-light hover:text-primary min-h-11` icon `pencil` · แถวเจ้าของไม่มี badge/ปุ่ม · ผู้ดูไม่ใช่เจ้าของเห็น badge ไม่เห็นปุ่ม · roles ว่างบน ADMIN (ข้อมูลเคลื่อน) badge `ยังไม่ได้ตั้งบทบาท` `bg-warning/15 text-warning-ink`
- **โมดัลแก้บทบาท**: shell controlled ตาม `wallet/components/TopUpRequestModal.tsx` (overlay `size-full fixed … z-80 bg-black/50`, `role=dialog aria-modal aria-labelledby`, `useLockBodyScroll(open)`, `overscroll-contain`, `w-[calc(100%-24px)]` + comment บรรทัดเดียวกันตาม TopUp:213) · `lg:max-w-lg` · หัว `h3 min-w-0 truncate` + ปิด `shrink-0` · footer `border-t` ปุ่ม `ยกเลิก`(bg-light) `บันทึกบทบาท`(bg-primary) `min-h-11` ชิดขวา · `{open && <Dialog/>}` draft init จาก props · โฟกัส checkbox แรกตอนเปิด คืนที่ปุ่มตอนปิด · บันทึก disabled เมื่อ ว่าง/ไม่ต่างจากเดิม/กำลังบันทึก · ระหว่างบันทึกปิดไม่ได้ · สำเร็จ `pacesToast.success` → ปิด → `router.refresh()` · ล้มเหลว banner `bg-danger/10 border border-danger/30 role="alert"` (ยกจาก TopUp ~234) ไม่ปิด · stale (`NOT_OWNER`, `FORBIDDEN_ROLE`, `NOT_A_MEMBER`, `PRIMARY_OWNER_LOCKED`) → refresh; NOT_A_MEMBER ปิดด้วย
- ข้อมูลเคลื่อน BILLING แต่ร้านไม่มีบริการ: แสดงแถวเปิดบิลติ๊กอยู่ คำอธิบายแทนด้วย `ร้านนี้ไม่ได้ขายบริการ เอาออกเพื่อบันทึก` (`text-warning-ink`) · canSubmit = false

## Copy (SSOT ใน shop-role-picker.ts)
| รหัส | ป้าย | คำอธิบาย |
|---|---|---|
| MANAGER | ผู้ดูแล | ดูแลงานร้านได้เกือบทั้งหมด ยกเว้นการเงิน สมาชิก และบัญชีรับเงิน |
| CHAT | ตอบแชท | อ่านและตอบแชททุกห้อง สร้างออเดอร์ เห็นราคารายใบ ไม่เห็นยอดขายรวมและกำไร |
| BILLING | เปิดบิล | เปิดบิลบริการและพิมพ์ใบเสร็จ เห็นราคารายใบ ไม่เห็นแชท |
| TECHNICIAN | ฝ่ายช่าง | ดูงานทั้งหมด อัปเดตสถานะและผลเข้ารับบริการ ไม่เห็นราคาและแชท |

- legend เชิญ `บทบาทของคนที่เข้าผ่านลิงก์นี้` · แก้ `เลือกบทบาท` · รอง `เลือกได้มากกว่า 1`
- note คงที่ (icon info-circle, text-xs): `ยอดขายรวม กำไร ต้นทุน และกระเป๋าเงินของร้าน เห็นได้เฉพาะเจ้าของ`
- hint (เมื่อ managerCoversOthers): `ผู้ดูแลมีสิทธิ์ของบทบาทอื่นครบอยู่แล้ว การเลือกบทบาทอื่นเพิ่มจึงไม่ได้ให้สิทธิ์เพิ่ม`
- error ว่าง (icon alert-circle, `role="alert" aria-live="polite"`): `เลือกอย่างน้อย 1 บทบาทก่อน{สร้างลิงก์|บันทึก}`
- เชิญ: ปุ่ม `สร้างลิงก์เชิญ` / `กำลังสร้างลิงก์...` · toast `สร้างลิงก์เชิญแล้ว ({บทบาท คั่น " · "})` · empty `ยังไม่มีลิงก์เชิญที่ใช้งานอยู่` / `เลือกบทบาทและอายุ แล้วกดสร้างลิงก์ด้านบน`
- ตาราง: หัว `สมาชิก · ช่องทาง · ประเภท · วันที่เข้าร่วม · จัดการ` · option `เจ้าของ`/`พนักงาน` · select aria-label `ประเภทสมาชิกของ {name}` · ปุ่ม `แก้ไขบทบาท` aria-label `แก้ไขบทบาทของ {name}` · badge ไม่ใช้ aria-label ใช้ sr-only นำหน้า
- โมดัลแก้: หัว `บทบาทของ {name}` · นำ `บันทึกแล้วมีผลทันที {name} ไม่ต้องเข้าระบบใหม่` · ปุ่ม `ยกเลิก`/`บันทึกบทบาท`/`กำลังบันทึก...` · toast `บันทึกบทบาทของ {name} แล้ว`

### กวาดศัพท์
| จุด | ใหม่ |
|---|---|
| ลดตัวเอง title | `เปลี่ยนตัวเองเป็นพนักงาน?` |
| ลดตัวเอง text | `คุณจะได้บทบาทผู้ดูแล เข้าหน้านี้และดูการเงินของร้านไม่ได้อีก และเปลี่ยนกลับเองไม่ได้ ต้องให้เจ้าของคนอื่นเปลี่ยนให้` |
| ลดตัวเอง ปุ่ม | `เปลี่ยนเป็นพนักงาน` |
| ตั้งเป็นเจ้าของ text | `{name} จะเชิญ/ลบสมาชิก เปลี่ยนบทบาทคนอื่น แก้บัญชีรับเงิน และดูยอดขายกับกำไรของร้านได้เหมือนคุณ · บทบาทพนักงานเดิมของ {name} จะถูกล้าง` |
| toast เป็นเจ้าของ | `ตั้ง {name} เป็นเจ้าของแล้ว` |
| toast เป็นพนักงาน | `เปลี่ยน {name} เป็นพนักงานแล้ว ได้บทบาทผู้ดูแล ปรับได้ที่ปุ่ม “แก้ไขบทบาท”` |
| `CANNOT_REMOVE_SELF` | `…หรือเปลี่ยนตัวเองเป็นพนักงาน` |
| `RECIPIENT_ADMIN_QUOTA` | `รองรับพนักงานไม่พอ… ลดจำนวนพนักงาน` |
| หน้า invites บรรทัดการเงิน | `…พนักงานทุกบทบาทจะไม่เห็นตัวเลขเหล่านี้` |

### Error
| รหัส | ข้อความ |
|---|---|
| `INVALID_ROLES` | `บทบาทที่เลือกใช้ไม่ได้ ลองเลือกใหม่แล้วกด{สร้างลิงก์|บันทึก}อีกครั้ง ถ้ายังไม่ได้ให้โหลดหน้านี้ใหม่` |
| `BILLING_NOT_AVAILABLE` | `ร้านนี้ไม่ได้ขายบริการ จึงใช้บทบาทเปิดบิลไม่ได้ เอาเปิดบิลออกแล้ว{สร้างลิงก์|บันทึก}อีกครั้ง` |
| `FORBIDDEN_ROLE`/`NOT_OWNER` | ข้อความ NOT_OWNER เดิมของ memberErrorText |
| อื่น ๆ | `ทำรายการไม่สำเร็จ ลองอีกครั้ง ถ้ายังไม่ได้ให้โหลดหน้านี้ใหม่` |

## Base (HR3)
```
Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx
Base: theme/paces/Admin/TS/src/app/(admin)/tables/static/components/HoverableRows.tsx
```
ห้ามสีเขียว · ห้าม emoji · HR7 arbitrary ต้องมี comment บรรทัดเดียวกัน · HR9 pacesToast
