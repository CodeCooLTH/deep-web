# Seller — Page Sourcing

> Scope: `src/app/(paces)/seller/**` — **Paces** theme (Preline 4 + Tailwind 4, **no MUI**).
> อ่าน [`../README.md`](../README.md) ก่อนเสมอ (universal rule + checklist + workflow).

Theme source root: `theme/paces/Admin/TS/src/`

> Auth pages มี 3 style variant: `(basic)` (minimal ไม่มี image panel), `card` (card กลางจอ + bg ตกแต่ง), `split` (สองคอลัมน์ + รูป). ใช้ `(basic)` สำหรับ SafePay เสมอ — เบาสุดและตรงกับลุคปัจจุบัน.

## Page-type → theme file mapping (Paces, seller)

| SafePay page | Paces source to copy | Notes |
|---|---|---|
| **Seller auth layout** | `app/layout.tsx` + `app/(admin)/layout.tsx` | Root layout mount `AppProvidersWrapper`; `(admin)/layout.tsx` wrap ด้วย `MainLayout`. Auth routes อยู่นอก `(admin)` จึงข้าม `MainLayout` และ render เปล่า. ไม่ต้องมี layout เพิ่ม — auth pages inherit root layout อย่างเดียว |
| **Seller app shell (dashboard layout)** | `layouts/VerticalLayout.tsx` + `layouts/components/Sidenav/index.tsx` + `layouts/components/TopBar/index.tsx` + `layouts/components/Footer/index.tsx` | Copy `VerticalLayout` เป็น authenticated shell; เปลี่ยน `AppMenu` nav data เป็นเมนู seller ของ SafePay. ตัด `Customizer` (theme switcher — ไม่ใช้ใน prod). `MainLayout` auth-guard ใช้ `useAuth` hook — เปลี่ยนเป็น NextAuth `useSession` |
| `/seller/auth/sign-in` | `app/auth/(basic)/sign-in/page.tsx` + `app/auth/(basic)/sign-in/components/Form.tsx` | ตัดปุ่ม Google/GitHub OAuth; เปลี่ยน email+password เป็น phone field อย่างเดียว. เก็บ card/bg image decorators |
| `/seller/auth/sign-up` | `app/auth/(basic)/sign-up/page.tsx` + `app/auth/(basic)/sign-up/components/SignUpForm.tsx` | ตัดปุ่ม Google/GitHub; เปลี่ยน email เป็น phone; เพิ่ม shop-name field |
| `/seller/auth/verify-otp` | `app/auth/(basic)/two-factor/page.tsx` | OTP inputs เป็น `<input>` 6 ช่องอยู่แล้ว. เปลี่ยน copy "emailed code" เป็น "ส่งไปที่เบอร์โทร". ไม่มี package dependency (raw inputs ไม่ใช่ `input-otp`) |
| `/seller/dashboard` | `app/(admin)/dashboard/ecommerce/page.tsx` + ทุก `components/` ใน folder นั้น | เก็บ `StatisticCard` (map เป็น orders/revenue/trust score), `SalesReport`, `RecentOrder`. ตัด `RevenueByLocation`, `WeeklyPerformanceInsights` (ไม่มี geo data ใน MVP). เปลี่ยน `UserCard` header เป็นชื่อร้าน + trust score |
| `/seller/orders` (list) | `app/(admin)/apps/ecommerce/(orders)/orders/page.tsx` + `components/OrdersList.tsx` + `components/OrdersStatCard.tsx` | เก็บ stat cards (map เป็น order status SafePay: PENDING/CONFIRMED/…). columns: token, buyer contact, type, status, created_at, action |
| `/seller/orders/[token]` (detail) | `app/(admin)/apps/ecommerce/(orders)/order-details/page.tsx` + ทุก `components/` ใน folder นั้น | เก็บ 3-col layout. `OrderSummary` → order items + token link; `CustomerDetails` → buyer contact; `ShippingActivity` → status timeline. ตัด `BillingDetails` + `ShippingAddress` (ไม่มีใน MVP) |
| `/seller/orders/new` (create form) | `app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx` | form fullscreen ที่ง่ายสุดใน theme. fields: orderType (PHYSICAL/DIGITAL/SERVICE), buyer contact, product reference, notes. ลบ Flatpickr date (ใช้ server timestamp) |
| `/seller/products` (list) | `app/(admin)/apps/ecommerce/(products)/products/page.tsx` + `components/ProductsListing.tsx` + `components/ProductStats.tsx` | stat cards = product count by type. columns: name, type, price, status, created_at, actions |
| `/seller/products/new` (create form) | `app/(admin)/apps/ecommerce/(products)/product-add/page.tsx` + ทุก `components/` | เก็บ 2-col layout (ซ้าย: `ProductInformation` + `ProductImage`; ขวา: `Pricing` + `Organize`). map fields กับ Product schema (name, description, price, type, imageUrl). ตัด inventory/SKU/weight ที่ไม่มีใน schema |
| `/seller/products/[id]` (detail) | `app/(admin)/apps/ecommerce/(products)/product-details/page.tsx` + `components/ProductDetails.tsx` + `components/ProductDisplay.tsx` + `components/ProductReviews.tsx` | 3-col card layout เข้ากันดี. `ProductReviews` → reviews ของ order สินค้านี้ |
| `/seller/products/[id]/edit` | `app/(admin)/apps/ecommerce/(products)/product-add/page.tsx` + ทุก `components/` | source เดียวกับ `/new` — pre-populate จาก product ที่ fetch. เปลี่ยนปุ่ม "Publish" เป็น "บันทึก" |
| `/seller/customers` (list) | `app/(admin)/apps/ecommerce/customers/page.tsx` + `components/CustomerTable.tsx` | table ตรงไปตรงมา. columns: buyer display name, contact, total orders with this seller, last order date |
| `/seller/reviews` | `app/(admin)/apps/ecommerce/reviews/page.tsx` + `components/ProductReviews.tsx` | reviews ของทุก order ของ seller นี้. filter เป็น shop ปัจจุบัน; แสดง star rating, comment, buyer, order token link |
| `/seller/sales` (chart + table) | `app/(admin)/apps/ecommerce/(reports)/sales/page.tsx` + `components/SalesChart.tsx` + `components/SalesTable.tsx` | match ตรง — chart บน table ล่าง. ตัด Flatpickr date-range ถ้าไม่จำเป็น; เก็บ `SalesChart` (ECharts wrapper). table = order totals by period |
| `/seller/shop` (settings form) | `app/(admin)/apps/ecommerce/settings/page.tsx` | stepper form หลาย step. เก็บ step 1 (Shop Name/contact) + 3 (Logo upload). ตัด step 4–12 (currency, shipping, payment ฯลฯ) ที่ไม่มีใน MVP. map กับ `updateShop` service action |
| `/seller/categories` (list) | `app/(admin)/apps/ecommerce/categories/page.tsx` + `components/CategoryTable.tsx` + `components/AddCategoryModal.tsx` | table + modal-add pattern. map กับ Category schema (name, description, shopId) |
| `/seller/verification` (level cards) | **Compose from** `app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx` (card→header→body→footer+button shell) | ไม่มี template verification-workflow ตรง. **แก้จากเดิม (Explore E1, Phase B):** `SellerStatisticCard` เป็น stat-display เปล่า ไม่มี CTA/footer slot — ใช้ไม่ได้. `AddCategoryModal` มี pattern `card → card-header → card-body → card-footer + button` ที่เหมาะกับ level card ที่มี action: 3 instance (L1/L2/L3), แต่ละอันมีชื่อ level, status chip (pending/approved/rejected), description, upload CTA |

## หมายเหตุโครงสร้าง Paces theme

- **Auth variant groups** — `theme/paces/Admin/TS/src/app/auth/` มี 3 sub-group: `(basic)/`, `card/`, `split/` แต่ละอันมี page type เดียวกัน (sign-in, sign-up, two-factor, reset-pass). SafePay seller/admin ใช้ `(basic)/` เสมอ เพราะเบาสุดและตรงกับลุคปัจจุบัน ยกเว้นกรณีที่ design สั่งให้ใช้อย่างอื่นอย่างชัดเจน
- **Auth routes อยู่นอก `(admin)`** — หน้า auth inherit เฉพาะ root `app/layout.tsx` (ซึ่ง mount `AppProvidersWrapper`) ไม่ผ่าน `MainLayout` หรือ sidebar ถือว่าถูกต้องสำหรับหน้า auth. SafePay ต้อง mirror pattern นี้: seller auth layout ต้อง render children เปล่า ไม่มี shell ครอบ
- **Shell ไม่ใช่ไฟล์เดียว** — `VerticalLayout.tsx` + `Sidenav` + `TopBar` + `Footer` (4 ไฟล์) เป็น bundle อะตอมเดียว ไม่มี shell `page.tsx` ให้ copy โดยตรง ต้อง copy ทั้ง 4 ไฟล์พร้อมกัน
- **`useAuth` ใน `MainLayout`** — Paces theme ใช้ `useAuth` hook ของตัวเอง (ไม่ใช่ NextAuth). เวอร์ชัน SafePay ต้องเปลี่ยนเป็น `useSession()` จาก `next-auth/react` พร้อม redirect ไป `/seller/auth/sign-in` เมื่อ session ไม่มี
- **Route groups มีวงเล็บ ไม่โผล่ใน URL** — `(orders)`, `(products)`, `(reports)`, `(sellers)`, `(inventory)` เป็น route group ไม่ปรากฏใน URL แต่ `Base:` ใน commit message ต้องใส่วงเล็บเต็ม path เช่น `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx`

## สถานะปัจจุบัน

seller ทั้งฝั่ง (~17 หน้า + auth) ยัง hand-composed off-theme — ยังไม่มี `Base:`. นี่คือหนี้ก้อนใหญ่ที่ Phase B (agent-team-phase) จะ re-source ตามตารางนี้.
