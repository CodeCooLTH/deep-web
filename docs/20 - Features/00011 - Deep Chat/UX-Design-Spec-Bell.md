# UX Design Spec — Bell Notification (feat 00011 FLAG-3)

2026-07-03 · safepay-ux · ปิด FLAG-3: web bell อ่าน `Notification` table (kind=chat_message/badge_earned) — buyer+seller
API: `GET /api/notifications` → `{items:[{id,kind,title,body,refId,read,createdAt}],nextCursor,unreadCount}` · `POST /api/notifications/read {id?}` (id=mark-one, ไม่มี=mark-all)

## Resolved decisions
| # | ค่า |
|---|---|
| OQ1 seller footer "ดูทั้งหมด" | **ตัดออก** (v1 dropdown-only 20 ล่าสุด — /notifications page เป็น activity คนละ data) |
| OQ2 buyer footer "view all" | **ตัดออก** (dropdown-only) |
| OQ3 refetch | fetch on mount **+ refetch on dropdown open** |
| OQ4 buyer title | ไทย **"การแจ้งเตือน"** |
| OQ5 mobile bell (SellerMobileHeader/IdentityBar hardcode) | **follow-up** (desktop dropdown + buyer bell พอปิด FLAG-3) |
| deep-link | chat_message→ seller `/inbox/{refId}`, buyer `/messages` (refId=conversationId ไม่ใช่ shopId → ไป list กัน mis-map); badge_earned→ buyer `/badges`, seller ไม่ deep-link (mark-read เฉย); unknown kind→ mark-read ไม่ navigate |
| icon ตาม kind | chat_message=`message-circle` primary, badge_earned=`award` warning, อื่น=`bell` default |

## Seller bell (Paces) — `src/layouts/components/TopBar/components/NotificationDropdownPeople.tsx` (convert static→client)
- Base = ไฟล์เดิม (markup dropdown/SimpleBar/item structure คงไว้); ตัด user4..8 image imports → icon-circle (`size-9 rounded-full bg-light` + Icon)
- **🛑 เลี่ยง Preline hs-dropdown bug** (opacity ค้าง 0 เมื่อ re-render ระหว่างเปิด — คลิก mark-read = trigger) → ใช้ **custom React useState + click-outside + Escape** (pattern `src/components/safepay/FilterDropdown.tsx`) แทน hs-dropdown attribute
- unread badge บน bell = `unreadCount` (ซ่อนถ้า 0, เกิน 9 = "9+"); header chip `bg-danger/15 text-danger "{n} ใหม่"`
- item = `<button>` (a11y): คลิก → `POST /read {id}` (optimistic local read) + `router.push(deepLink)`; unread tint `bg-primary/5 rounded-lg` (HR7 exception precedent `NotificationFeed.tsx:182`)
- "อ่านทั้งหมด" button (header, icon `solar:check-read-line-duotone`) → `POST /read` (no id) → local all read + unreadCount=0
- states: loading spinner (copy NotificationFeed.tsx:245), empty inline (`bell-off` "ยังไม่มีการแจ้งเตือน" py-10 text-default-400), fetch-error inline retry, mark-read-error `pacesToast.error` top-right
- ไม่มี footer "ดูทั้งหมด" (OQ1)
- admin ใช้ component เดียวกัน → empty ปกติ (admin ไม่มี chat/badge notif); deep-link /inbox seller-only (flag อนาคต)

## Buyer bell (Vuexy) — ใหม่ `src/components/layout/shared/NotificationsDropdown.tsx` + mount `front-pages/Header.tsx`
- Base = copy `theme/vuexy/.../components/layout/shared/NotificationsDropdown.tsx` ทั้งไฟล์
- **prop-driven → self-fetch**: `useSession` + useEffect fetch `GET /api/notifications` เมื่อ authed (เหมือน UserDropdown.tsx)
- mapping: title←title, subtitle←body, time←`relativeTimeTh(createdAt)`, read←read, avatarIcon ตาม kind (`tabler-message-circle`/`tabler-award`/`tabler-bell`), avatarColor primary/warning, avatarSkin light-static
- **ตัด** delete-icon (X) ต่อ item + mark-unread toggle (backend มีแค่ mark-read ทางเดียว); badge = dot (`variant='dot' invisible={unreadCount===0}`); chip "{n} New" ในหัว
- คลิก item → `POST /read {id}` + `router.push(deepLink)`; mark-all-read icon (`tabler-mail-opened`, tooltip "ทำเครื่องหมายว่าอ่านแล้วทั้งหมด") → `POST /read` no-id
- mount ใน Header.tsx ระหว่าง ModeDropdown/UserDropdown, **เฉพาะ authed**
- title "การแจ้งเตือน" (OQ4); ไม่มี footer "view all" (OQ2)
- states: loading CircularProgress/caption, empty `tabler-bell-off` "ยังไม่มีการแจ้งเตือน", fetch-error inline retry, mark-read-error `toast.error` (react-toastify OK ใน marketing)

## Base:
seller: `theme/paces/.../TopBar/components/NotificationDropdownPeople.tsx` + `FilterDropdown.tsx`(controlled) + `NotificationFeed.tsx`(icon/tint) + `paces-toast.ts`
buyer: `theme/vuexy/.../components/layout/shared/NotificationsDropdown.tsx` + `Header.tsx`(mount) + `UserDropdown.tsx`(useSession pattern) + `relative-time-th.ts`
