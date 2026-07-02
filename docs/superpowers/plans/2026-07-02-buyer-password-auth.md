# Buyer Password Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. โปรเจกต์นี้ execute จริงผ่าน **agent-team-phase** (Hard Rule 4) — Planner→Developer→Reviewer→QA→Controller.

**Goal:** ให้ buyer login ด้วย username+password + ลืมรหัสผ่าน (reset/new-pass) เทียบเท่า seller โดยคง OTP login เดิม และยกระดับปุ่ม social/OAuth ให้ UX parity

**Architecture:** เพิ่ม NextAuth Credentials provider `buyer-credentials` (เหมือน seller แต่ตัด `isShop`) + hoist การ hash password ใน `phone-otp` ให้ buyer signup ตั้งรหัสได้ (ไม่สร้างร้าน). ฝั่ง UI เป็น Vuexy (MUI) copy จาก theme auth templates. reuse `/api/account/set-password` (provider-agnostic) สำหรับ new-pass — ไม่แตะ DB/schema

**Tech Stack:** Next.js 16 (App Router), NextAuth v4, Prisma, MUI v9/Vuexy, react-hook-form + Yup, bcryptjs, Valibot, Playwright (E2E)

## Global Constraints

- UI ฝั่ง buyer = **Vuexy (MUI)** เท่านั้น — copy จาก `theme/vuexy/typescript-version/full-version/src/views/pages/auth/*` (Hard Rule 1). ห้าม Paces markup ในหน้า `(marketing)/**`
- ทุก commit ที่แตะ UI ต้องมี `Base:` line ชี้ theme file ที่ copy (Hard Rule 3)
- Font Anuphan เท่านั้น (มีจาก `(marketing)/layout.tsx` แล้ว)
- Toast ฝั่ง buyer = `react-toastify` (`import { toast } from 'react-toastify'`) — **ไม่ใช่** pacesToast (นั่นของ seller/admin)
- Password ห้ามเดินทางผ่าน URL — เก็บใน `sessionStorage` เท่านั้น
- Password policy (Yup + server `isStrongPassword`): ≥8 ตัว + มีตัวอักษร + ตัวเลข + อักขระพิเศษ
- Login fail = generic error รวม (กัน user enumeration)
- แตะ `src/lib/auth.ts` → **บังคับผ่าน `safepay-security` review**
- เอกสาร/comment ภาษาไทย (Convention)
- QA = Playwright E2E (memory `feedback_qa_playwright_e2e_mandatory`) + Chrome DevTools MCP visual ที่ `deepth.local:4000` (buyer domain — ไม่ใช่ seller)

---

### Task 1: Backend — `buyer-credentials` provider + hoist password ใน `phone-otp`

**Files:**
- Modify: `src/lib/auth.ts` (providers array + phone-otp authorize new-user branch)
- Test: `e2e/buyer-password-auth.spec.ts` (E2E — ครอบใน Task 8; ที่นี่ commit เฉพาะ backend)

**Interfaces:**
- Produces: NextAuth provider id `"buyer-credentials"` รับ `{ username, password }` → session ปกติ (token.userId). ใช้โดย `SignInCard` (Task 3)
- Produces: `phone-otp` provider เมื่อ `mode==='signup'` + `password` (ไม่มี `shopName`) → สร้าง user ที่มี `passwordHash`, `isShop=false`. ใช้โดย `VerifyOtpCard` (Task 4)
- Consumes: `verifyPassword`, `isStrongPassword`, `hashPassword` จาก `@/lib/password`; `adminLoginTimestamps` store เดิมในไฟล์

- [ ] **Step 1: เพิ่ม provider `buyer-credentials`** — วางต่อจาก block `seller-credentials` (ก่อน `admin-credentials`) ใน `authOptions.providers`

```ts
    CredentialsProvider({
      id: "buyer-credentials",
      name: "Buyer",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;
        // bcrypt DoS guard (เหมือน seller/admin)
        if (credentials.password.length > 1000) return null;

        // rate-limit 5/10min ต่อ username — reuse store เดียวกับ admin/seller (username @unique ทั้งระบบ ไม่ชน)
        const WINDOW_MS = 10 * 60 * 1000;
        const MAX_ATTEMPTS = 5;
        const now = Date.now();
        const cutoff = now - WINDOW_MS;
        const prev = adminLoginTimestamps.get(credentials.username) ?? [];
        const recent = prev.filter((t) => t > cutoff);
        if (recent.length >= MAX_ATTEMPTS) {
          adminLoginTimestamps.set(credentials.username, recent);
          return null;
        }
        recent.push(now);
        adminLoginTimestamps.set(credentials.username, recent);

        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        });
        if (!user) return null;
        // buyer login ฝั่ง main site: ทุก user ที่ไม่ใช่ admin + ตั้ง password แล้ว
        // (seller ก็ login ที่ main ได้ — บัญชีเดียวกัน — จึงไม่ตรวจ isShop; admin ใช้ provider แยก)
        if (user.isAdmin) return null;
        if (user.passwordHash == null) return null;

        const { verifyPassword } = await import("@/lib/password");
        const valid = await verifyPassword(credentials.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.displayName, email: user.email };
      },
    }),
```

- [ ] **Step 2: Hoist password hashing ใน `phone-otp` authorize** — ในบล็อก `if (!user) { ... }` ก่อน `prisma.user.create` ให้เตรียม `passwordHash` จาก `credentials.password` (เดิม logic นี้อยู่เฉพาะใน branch `shopName`). แทรกก่อน `try { user = await prisma.user.create({`

```ts
          // password (optional): buyer signup ก็ตั้งรหัสได้ (เดิม logic นี้อยู่เฉพาะ branch seller/shopName)
          // ต้อง strong เสมอถ้าส่งมา — server guard กัน Yup bypass
          let signupPasswordHash: string | undefined;
          if (credentials.password) {
            const { isStrongPassword, hashPassword } = await import("@/lib/password");
            if (!isStrongPassword(credentials.password)) return null;
            signupPasswordHash = await hashPassword(credentials.password);
          }
```

- [ ] **Step 3: ใส่ `passwordHash` ลงใน `user.create` data** — เพิ่มบรรทัด `passwordHash: signupPasswordHash,` ใน object ที่ create (ต่อจาก `avatar` / ก่อน `authAccounts`). buyer จะมี passwordHash ตั้งแต่สร้าง โดย isShop ยัง default false

```ts
          user = await prisma.user.create({
            data: {
              phone: credentials.phone,
              displayName,
              username,
              passwordHash: signupPasswordHash, // ← เพิ่ม: buyer/seller signup ตั้งรหัสได้
              authAccounts: {
                create: {
                  provider: "PHONE",
                  providerAccountId: credentials.phone,
                },
              },
              // ... verifications เดิมคงไว้
```

- [ ] **Step 4: ลบ password logic ที่ซ้ำใน branch `shopName`** — ใน `if (credentials.mode === "signup" && trimmedShopName)` ลบบล็อก `let passwordHash ...` และเอา `passwordHash` ออกจาก `tx.user.update` (password ถูกตั้งใน create แล้วจาก Step 3) เหลือเฉพาะ `isShop: true`

```ts
              // (ลบ) let passwordHash: string | undefined ... — password ตั้งใน create แล้ว
              const { isShopCategory } = await import("@/lib/shop-categories");
              const category =
                credentials.category && isShopCategory(credentials.category)
                  ? credentials.category
                  : undefined;
              await prisma.$transaction(async (tx) => {
                await tx.shop.create({
                  data: {
                    userId: user!.id,
                    shopName: trimmedShopName,
                    businessType: "INDIVIDUAL",
                    ...(category ? { category } : {}),
                  },
                });
                await tx.user.update({
                  where: { id: user!.id },
                  data: { isShop: true }, // ← password ตัดออก (ตั้งใน create แล้ว)
                });
              });
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ใหม่จาก `src/lib/auth.ts`

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat(auth): buyer-credentials provider + password ตอน buyer signup

เพิ่ม provider buyer-credentials (เหมือน seller แต่ตัด isShop) + hoist การ hash
password ใน phone-otp ให้ buyer signup (ไม่มี shopName) ตั้งรหัสได้ isShop=false.
seller path เดิมคงพฤติกรรม (create ตั้ง passwordHash, tx เหลือ isShop).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Sign-up — เพิ่ม password + confirmPassword + signupDraft

**Files:**
- Modify: `src/app/(marketing)/auth/sign-up/SignUpCard.tsx`
- Test: E2E (Task 8)

**Interfaces:**
- Produces: `sessionStorage.signupDraft = JSON.stringify({ password })` ก่อน push `/auth/verify-otp` — อ่านโดย `VerifyOtpCard` (Task 4)
- Consumes: `PasswordInputWithStrength` (`@/components/PasswordInputWithStrength`), `/api/otp/send`, `/api/users/check-username`, `/api/users/check-phone`

- [ ] **Step 1: เพิ่ม password/confirmPassword ใน Yup schema** — แก้ `schema` (บนไฟล์)

```ts
const schema = Yup.object({
  phone: Yup.string()
    .matches(/^0[0-9]{9}$/, 'เบอร์ต้องขึ้นต้นด้วย 0 และมี 10 หลัก')
    .required('กรุณากรอกเบอร์โทร'),
  displayName: Yup.string()
    .min(2, 'อย่างน้อย 2 ตัวอักษร')
    .max(50, 'ไม่เกิน 50 ตัวอักษร')
    .required('กรุณากรอกชื่อที่แสดง'),
  username: Yup.string()
    .matches(/^[a-zA-Z0-9_]{3,30}$/, 'ใช้ a-z, 0-9, _ ได้ 3-30 ตัว')
    .required('กรุณาตั้งชื่อผู้ใช้'),
  password: Yup.string()
    .min(8, 'อย่างน้อย 8 ตัวอักษร')
    .matches(/[a-zA-Z]/, 'ต้องมีตัวอักษร')
    .matches(/[0-9]/, 'ต้องมีตัวเลข')
    .matches(/[\W_]/, 'ต้องมีอักขระพิเศษ')
    .required('กรุณากรอกรหัสผ่าน'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password')], 'รหัสผ่านไม่ตรงกัน')
    .required('กรุณายืนยันรหัสผ่าน'),
})
```

- [ ] **Step 2: เพิ่ม state + import สำหรับ password field** — เพิ่ม `import PasswordInputWithStrength from '@/components/PasswordInputWithStrength'`, `useState` (มีแล้ว), และใน component: controlled password state + confirm toggle + defaultValues

```ts
  // ใต้ useForm defaultValues → เพิ่ม password, confirmPassword: ''
  // ใน component body:
  const [password, setPassword] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const { onChange: rhfPwOnChange, ...rhfPwRest } = register('password')
```
(อัปเดต `defaultValues` เป็น `{ phone: '', displayName: '', username: '', password: '', confirmPassword: '' }`)

- [ ] **Step 3: เก็บ password ใน sessionStorage แทนส่ง URL** — ใน `onSubmit` หลัง `otp/send` ok เพิ่มก่อน push

```ts
      // เก็บ password ใน sessionStorage — ไม่ผ่าน URL (กัน leak ใน history/log)
      sessionStorage.setItem('signupDraft', JSON.stringify({ password: values.password }))
      const params = new URLSearchParams({
        mode: 'signup',
        phone: values.phone,
        name: values.displayName,
        username: values.username,
      })
      router.push(`/auth/verify-otp?${params.toString()}`)
```
(ตัด `password`/`confirmPassword` ไม่ให้เข้า params — คง phone/name/username เดิม; **ไม่ส่ง shopName** เพราะ buyer ไม่เปิดร้าน)

- [ ] **Step 4: เพิ่ม UI password + confirmPassword fields** — วางระหว่าง username field กับปุ่ม submit (Base: `theme/vuexy/.../views/pages/auth/RegisterV1.tsx` password field)

```tsx
              <div>
                <CustomTextField
                  fullWidth
                  label='รหัสผ่าน'
                  placeholder='••••••••'
                  type='password'
                  slotProps={{ htmlInput: { autoComplete: 'new-password' } }}
                  error={!!errors.password}
                  helperText={errors.password?.message ?? '≥8 ตัว มีตัวอักษร ตัวเลข และอักขระพิเศษ'}
                  {...rhfPwRest}
                  onChange={(e) => { setPassword(e.target.value); rhfPwOnChange(e) }}
                />
              </div>
              <CustomTextField
                fullWidth
                label='ยืนยันรหัสผ่าน'
                placeholder='••••••••'
                type={showConfirm ? 'text' : 'password'}
                slotProps={{
                  htmlInput: { autoComplete: 'new-password' },
                  input: {
                    endAdornment: (
                      <IconButton size='small' edge='end' onClick={() => setShowConfirm((s) => !s)}>
                        <i className={showConfirm ? 'tabler-eye-off' : 'tabler-eye'} />
                      </IconButton>
                    ),
                  },
                }}
                error={!!errors.confirmPassword}
                helperText={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />
```
> หมายเหตุ: ใช้ `CustomTextField type='password'` (Vuexy) แทน `PasswordInputWithStrength` (Paces component) เพื่อคง markup Vuexy. ถ้าต้องการ strength bar ให้ยืนยัน component ฝั่ง Vuexy — default นี้ไม่มี strength bar

- [ ] **Step 5: อัปปุ่ม social หน้า sign-up เป็นเต็มกว้างมี label** (S-BA-4 — Controller decision 2026-07-02) — แทน block IconButton เดิมด้วยปุ่มเต็มกว้าง (โครงเดียวกับ sign-in Task 3 Step 5 แต่ label = "สมัครด้วย …", callbackUrl = `/`)

```tsx
<div className='flex flex-col gap-3'>
  <Button fullWidth variant='outlined' startIcon={<i className='tabler-brand-facebook-filled text-facebook' />}
    onClick={() => signIn('facebook', { callbackUrl: '/' })}>
    สมัครด้วย Facebook
  </Button>
  <Button fullWidth variant='outlined' onClick={() => signIn('line', { callbackUrl: '/auth/callback/line' })}
    startIcon={<Icon icon='ri:line-fill' width={20} height={20} style={{ color: '#06C755' }} />}>
    สมัครด้วย LINE
  </Button>
  {process.env.NEXT_PUBLIC_ENABLE_IG_LOGIN === 'true' && (
    <Button fullWidth variant='outlined' onClick={() => signIn('instagram', { callbackUrl: '/auth/callback/instagram' })}
      startIcon={<Icon icon='ri:instagram-fill' width={20} height={20} style={{ color: '#E1306C' }} />}>
      สมัครด้วย Instagram
    </Button>
  )}
</div>
```

- [ ] **Step 6: Type-check + verify field ขึ้น**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ใหม่

- [ ] **Step 7: Commit**

```bash
git add "src/app/(marketing)/auth/sign-up/SignUpCard.tsx"
git commit -m "feat(buyer-auth): เพิ่ม password ตอน sign-up + ปุ่ม social เต็มกว้าง (signupDraft ไม่ผ่าน URL)

Base: theme/vuexy/typescript-version/full-version/src/views/pages/auth/RegisterV1.tsx

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Sign-in — username+password primary + OTP toggle + social buttons เต็มกว้าง

**Files:**
- Modify: `src/app/(marketing)/auth/sign-in/SignInCard.tsx`
- Test: E2E (Task 8)

**Interfaces:**
- Consumes: provider `buyer-credentials` (Task 1); `getSafeCallbackUrl` เดิม; `/api/otp/send`
- Produces: หน้า sign-in ที่ push `/auth/verify-otp?mode=signin` (OTP toggle) หรือ redirect `safeCallbackUrl` (password)

- [ ] **Step 1: เพิ่ม state โหมด + password schema** — เพิ่ม `useState` สำหรับ `mode: 'password' | 'otp'` (default `'password'`) และแยก schema 2 ชุด

```ts
const phoneSchema = Yup.object({
  phone: Yup.string().matches(/^0[0-9]{9}$/, 'เบอร์ต้องขึ้นต้นด้วย 0 และมี 10 หลัก').required('กรุณากรอกเบอร์โทร'),
})
const pwSchema = Yup.object({
  username: Yup.string().required('กรุณากรอกชื่อผู้ใช้'),
  password: Yup.string().required('กรุณากรอกรหัสผ่าน'),
})
```
ใน component: `const [loginMode, setLoginMode] = useState<'password' | 'otp'>('password')`. ใช้ 2 useForm แยก (หรือ 1 form + conditional) — แนะนำแยก hook: `pwForm` / `otpForm`

- [ ] **Step 2: onSubmit password** — เรียก buyer-credentials

```ts
  const onPasswordSubmit = async ({ username, password }: Yup.InferType<typeof pwSchema>) => {
    const res = await signIn('buyer-credentials', { username, password, redirect: false })
    if (res?.ok) { router.push(safeCallbackUrl); return }
    pwForm.setError('username', { type: 'server', message: '' })
    pwForm.setError('password', { type: 'server', message: '' })
    pwForm.setError('root', { message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' })
  }
```

- [ ] **Step 3: onSubmit OTP** — คง logic เดิม (ย้ายมาไว้ใน otpForm)

```ts
  const onOtpSubmit = async ({ phone }: Yup.InferType<typeof phoneSchema>) => {
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: phone, type: 'PHONE' }),
      })
      if (!res.ok) { toast.error('ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่'); return }
      const params = new URLSearchParams({ mode: 'signin', phone })
      if (rawCallbackUrl) params.set('callbackUrl', rawCallbackUrl)
      router.push(`/auth/verify-otp?${params.toString()}`)
    } catch { toast.error('ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่') }
  }
```

- [ ] **Step 4: UI — password form (default) + OTP form (toggle)** — แทน form เดิม. subtitle เปลี่ยนตามโหมด. Base: `theme/vuexy/.../views/pages/auth/LoginV1.tsx`

```tsx
{loginMode === 'password' ? (
  <form onSubmit={pwForm.handleSubmit(onPasswordSubmit)} noValidate className='flex flex-col gap-6'>
    <CustomTextField autoFocus fullWidth label='ชื่อผู้ใช้' placeholder='your_username'
      slotProps={{ htmlInput: { autoComplete: 'username' } }}
      error={!!pwForm.formState.errors.username} {...pwForm.register('username')} />
    <CustomTextField fullWidth label='รหัสผ่าน' type='password' placeholder='••••••••'
      slotProps={{ htmlInput: { autoComplete: 'current-password' } }}
      error={!!pwForm.formState.errors.password} {...pwForm.register('password')} />
    <div className='flex justify-end'>
      <Typography component={Link} href='/auth/reset-pass' color='primary.main' className='text-sm'>ลืมรหัสผ่าน?</Typography>
    </div>
    {pwForm.formState.errors.root && (
      <Typography color='error.main' className='text-sm text-center'>{pwForm.formState.errors.root.message}</Typography>
    )}
    <Button fullWidth variant='contained' type='submit' disabled={pwForm.formState.isSubmitting}>
      {pwForm.formState.isSubmitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
    </Button>
    <Typography component='button' type='button' onClick={() => setLoginMode('otp')} color='primary.main'
      className='text-center' sx={{ background: 'none', border: 0, cursor: 'pointer' }}>
      เข้าสู่ระบบด้วยรหัส OTP แทน
    </Typography>
  </form>
) : (
  <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} noValidate className='flex flex-col gap-6'>
    <CustomTextField autoFocus fullWidth label='เบอร์โทรศัพท์' placeholder='08xxxxxxxx' type='tel'
      slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'tel' } }}
      error={!!otpForm.formState.errors.phone} helperText={otpForm.formState.errors.phone?.message}
      {...otpForm.register('phone')} />
    <Button fullWidth variant='contained' type='submit' disabled={otpForm.formState.isSubmitting}>
      {otpForm.formState.isSubmitting ? 'กำลังส่งรหัส…' : 'ส่งรหัส OTP'}
    </Button>
    <Typography component='button' type='button' onClick={() => setLoginMode('password')} color='primary.main'
      className='text-center' sx={{ background: 'none', border: 0, cursor: 'pointer' }}>
      เข้าสู่ระบบด้วยรหัสผ่านแทน
    </Typography>
  </form>
)}
```
+ คงลิงก์ "ยังไม่มีบัญชี? สมัครสมาชิก" + divider "หรือ" + social buttons (Step 5) ไว้ใต้ form ทั้งสองโหมด

- [ ] **Step 5: อัปปุ่ม social เป็นปุ่มเต็มกว้างมี label** — แทน block IconButton เดิม (คง `signIn('facebook'|'line', ...)` + IG flag) ด้วยปุ่มเต็มกว้าง

```tsx
<div className='flex flex-col gap-3'>
  <Button fullWidth variant='outlined' startIcon={<i className='tabler-brand-facebook-filled text-facebook' />}
    onClick={() => signIn('facebook', { callbackUrl: safeCallbackUrl })}>
    เข้าสู่ระบบด้วย Facebook
  </Button>
  <Button fullWidth variant='outlined' onClick={() => signIn('line', { callbackUrl: '/auth/callback/line' })}
    startIcon={<Icon icon='ri:line-fill' width={20} height={20} style={{ color: '#06C755' }} />}>
    เข้าสู่ระบบด้วย LINE
  </Button>
  {process.env.NEXT_PUBLIC_ENABLE_IG_LOGIN === 'true' && (
    <Button fullWidth variant='outlined' onClick={() => signIn('instagram', { callbackUrl: '/auth/callback/instagram' })}
      startIcon={<Icon icon='ri:instagram-fill' width={20} height={20} style={{ color: '#E1306C' }} />}>
      เข้าสู่ระบบด้วย Instagram
    </Button>
  )}
</div>
```
> FB ชี้ `safeCallbackUrl` (เด้งตรง — ลด redirect chain ตามบทเรียน seller). LINE/IG ชี้ callback page (Task 7)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ใหม่

- [ ] **Step 7: Commit**

```bash
git add "src/app/(marketing)/auth/sign-in/SignInCard.tsx"
git commit -m "feat(buyer-auth): username+password login + OTP toggle + ปุ่ม social เต็มกว้าง

Base: theme/vuexy/typescript-version/full-version/src/views/pages/auth/LoginV1.tsx

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: verify-otp — รองรับ mode=reset + อ่าน signupDraft.password

**Files:**
- Modify: `src/app/(marketing)/auth/verify-otp/VerifyOtpCard.tsx`
- Test: E2E (Task 8)

**Interfaces:**
- Consumes: `sessionStorage.signupDraft` (Task 2); `phone-otp` provider password (Task 1)
- Produces: `sessionStorage.resetDraft = { phone, otp }` ก่อน push `/auth/new-pass` — อ่านโดย `NewPassCard` (Task 6)

- [ ] **Step 1: ขยาย mode type** — เปลี่ยน `const mode = (params.get('mode') ?? 'signin') as 'signin' | 'signup'` เป็น `... as 'signin' | 'signup' | 'reset'`

- [ ] **Step 2: แก้ onSubmit ให้แยก 3 mode** — แทน block `signIn('phone-otp', ...)` เดิม

```ts
    setSubmitting(true)
    try {
      if (mode === 'reset') {
        // ไม่ consume OTP ที่นี่ (กัน double-consume) — set-password คือที่ verify จริง
        sessionStorage.setItem('resetDraft', JSON.stringify({ phone, otp }))
        router.push('/auth/new-pass')
        return
      }
      // signin / signup
      let password = ''
      if (mode === 'signup') {
        try {
          const raw = sessionStorage.getItem('signupDraft')
          if (raw) password = (JSON.parse(raw) as { password?: string }).password ?? ''
        } catch { /* draft เสีย → signup ต่อโดยไม่มี password (ตั้งภายหลัง reset) */ }
      }
      const result = await signIn('phone-otp', {
        phone, otp, mode, displayName, username, password, redirect: false,
      })
      if (result?.ok) {
        if (mode === 'signup') sessionStorage.removeItem('signupDraft')
        router.push(safeCallbackUrl)
        return
      }
      setErrorMsg('รหัสไม่ถูกต้องหรือหมดอายุ ลองอีกครั้ง')
    } catch {
      setErrorMsg('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
```
> `displayName`/`username` มาจาก params เดิม (ว่างตอน reset/signin — server ไม่ใช้). ไม่ส่ง `shopName` (buyer ไม่เปิดร้าน)

- [ ] **Step 3: (optional) ปรับ header ตาม mode reset** — ถ้า `mode==='reset'` แสดง subtitle "ยืนยัน OTP เพื่อรีเซ็ตรหัสผ่าน" (ไม่บังคับ — ปรับ Typography ตามต้องการ)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ใหม่

- [ ] **Step 5: Commit**

```bash
git add "src/app/(marketing)/auth/verify-otp/VerifyOtpCard.tsx"
git commit -m "feat(buyer-auth): verify-otp รองรับ mode=reset + อ่าน signupDraft.password

Base: (ต่อยอด) src/app/(marketing)/auth/verify-otp/VerifyOtpCard.tsx

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: reset-pass page (ขอ OTP ด้วยเบอร์)

**Files:**
- Create: `src/app/(marketing)/auth/reset-pass/page.tsx`
- Create: `src/app/(marketing)/auth/reset-pass/ResetPassCard.tsx`
- Test: E2E (Task 8)

**Interfaces:**
- Consumes: `/api/otp/send`
- Produces: push `/auth/verify-otp?mode=reset&phone=<phone>` → ต่อ Task 4

- [ ] **Step 1: page.tsx**

```tsx
import type { Metadata } from 'next'
import ResetPassCard from './ResetPassCard'

export const metadata: Metadata = { title: 'ลืมรหัสผ่าน' }

export default function ResetPassPage() {
  return <ResetPassCard />
}
```

- [ ] **Step 2: ResetPassCard.tsx** (Base: `theme/vuexy/.../views/pages/auth/ForgotPasswordV1.tsx`)

```tsx
'use client'

import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { yupResolver } from '@hookform/resolvers/yup'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import * as Yup from 'yup'
import CustomTextField from '@core/components/mui/TextField'
import Logo from '@components/layout/shared/Logo'
import AuthIllustrationWrapper from '@/views/pages/auth/AuthIllustrationWrapper'
import { currentYear, META_DATA } from '@/config/constants'

const schema = Yup.object({
  phone: Yup.string().matches(/^0[0-9]{9}$/, 'เบอร์ต้องขึ้นต้นด้วย 0 และมี 10 หลัก').required('กรุณากรอกเบอร์โทร'),
})
type FormValues = Yup.InferType<typeof schema>

export default function ResetPassCard() {
  const router = useRouter()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: yupResolver(schema), defaultValues: { phone: '' },
  })

  const onSubmit = async ({ phone }: FormValues) => {
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: phone, type: 'PHONE' }),
      })
      if (res.status === 429) { toast.error('คุณส่งคำขอบ่อยเกินไป กรุณารอสักครู่'); return }
      if (!res.ok) { toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่'); return }
      // ไม่ leak phone oracle — otp/send ok เสมอ, fail จริงตอน set-password
      router.push(`/auth/verify-otp?mode=reset&phone=${encodeURIComponent(phone)}`)
    } catch { toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') }
  }

  return (
    <div className='flex min-bs-[100dvh] justify-center items-center p-6'>
      <AuthIllustrationWrapper>
        <Card className='flex flex-col sm:is-[450px]'>
          <CardContent className='sm:!p-12'>
            <Link href='/' className='flex justify-center mbe-6'><Logo /></Link>
            <div className='flex flex-col gap-1 mbe-6'>
              <Typography variant='h4'>ลืมรหัสผ่าน? 🔒</Typography>
              <Typography>กรอกเบอร์โทรเพื่อรับรหัส OTP สำหรับตั้งรหัสผ่านใหม่</Typography>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} noValidate autoComplete='off' className='flex flex-col gap-6'>
              <CustomTextField autoFocus fullWidth label='เบอร์โทรศัพท์' placeholder='08xxxxxxxx' type='tel'
                slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'tel' } }}
                error={!!errors.phone} helperText={errors.phone?.message} {...register('phone')} />
              <Button fullWidth variant='contained' type='submit' disabled={isSubmitting}>
                {isSubmitting ? 'กำลังส่ง…' : 'ส่งรหัส OTP'}
              </Button>
              <Typography className='flex justify-center items-center gap-1.5' color='primary.main'
                component={Link} href='/auth/sign-in'>
                <i className='tabler-chevron-left text-base' />กลับไปเข้าสู่ระบบ
              </Typography>
            </form>
            <Typography className='mt-7 text-center text-sm' color='text.disabled'>
              &copy; {currentYear} {META_DATA.name} — by {META_DATA.author}
            </Typography>
          </CardContent>
        </Card>
      </AuthIllustrationWrapper>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ใหม่

- [ ] **Step 4: Commit**

```bash
git add "src/app/(marketing)/auth/reset-pass/"
git commit -m "feat(buyer-auth): หน้า reset-pass (ขอ OTP ด้วยเบอร์)

Base: theme/vuexy/typescript-version/full-version/src/views/pages/auth/ForgotPasswordV1.tsx

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: new-pass page (ตั้งรหัสผ่านใหม่)

**Files:**
- Create: `src/app/(marketing)/auth/new-pass/page.tsx`
- Create: `src/app/(marketing)/auth/new-pass/NewPassCard.tsx`
- Test: E2E (Task 8)

**Interfaces:**
- Consumes: `sessionStorage.resetDraft = { phone, otp }` (Task 4); `POST /api/account/set-password { phone, otp, password }`

- [ ] **Step 1: page.tsx**

```tsx
import type { Metadata } from 'next'
import NewPassCard from './NewPassCard'

export const metadata: Metadata = { title: 'ตั้งรหัสผ่านใหม่' }

export default function NewPassPage() {
  return <NewPassCard />
}
```

- [ ] **Step 2: NewPassCard.tsx** (Base: `theme/vuexy/.../views/pages/auth/ResetPasswordV1.tsx`)

```tsx
'use client'

import { useEffect, useState } from 'react'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import { yupResolver } from '@hookform/resolvers/yup'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import * as Yup from 'yup'
import CustomTextField from '@core/components/mui/TextField'
import Logo from '@components/layout/shared/Logo'
import AuthIllustrationWrapper from '@/views/pages/auth/AuthIllustrationWrapper'
import { currentYear, META_DATA } from '@/config/constants'

const schema = Yup.object({
  password: Yup.string()
    .min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
    .matches(/[a-zA-Z]/, 'ต้องมีตัวอักษร').matches(/\d/, 'ต้องมีตัวเลข').matches(/[\W_]/, 'ต้องมีอักขระพิเศษ')
    .required('กรุณากรอกรหัสผ่านใหม่'),
  confirmPassword: Yup.string().oneOf([Yup.ref('password')], 'รหัสผ่านไม่ตรงกัน').required('กรุณายืนยันรหัสผ่าน'),
})
type FormValues = Yup.InferType<typeof schema>
type ResetDraft = { phone: string; otp: string }

export default function NewPassCard() {
  const router = useRouter()
  const [draft, setDraft] = useState<ResetDraft | null>(null)
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: yupResolver(schema), defaultValues: { password: '', confirmPassword: '' },
  })

  useEffect(() => {
    const raw = sessionStorage.getItem('resetDraft')
    if (!raw) { router.replace('/auth/reset-pass'); return }
    try {
      const parsed = JSON.parse(raw) as ResetDraft
      if (!parsed.phone || !parsed.otp) throw new Error('invalid')
      setDraft(parsed)
    } catch { sessionStorage.removeItem('resetDraft'); router.replace('/auth/reset-pass') }
  }, [router])

  const onSubmit = async ({ password }: FormValues) => {
    if (!draft) return
    try {
      const res = await fetch('/api/account/set-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: draft.phone, otp: draft.otp, password }),
      })
      if (res.ok) {
        sessionStorage.removeItem('resetDraft')
        toast.success('ตั้งรหัสผ่านใหม่เรียบร้อย')
        router.push('/auth/sign-in')
        return
      }
      if (res.status === 400) { toast.error('รหัสผ่านไม่ผ่านเงื่อนไข'); return }
      if (res.status === 401) {
        toast.error('รหัส OTP หมดอายุ กรุณาขอรหัสใหม่')
        sessionStorage.removeItem('resetDraft'); router.push('/auth/reset-pass'); return
      }
      if (res.status === 404) { toast.error('ไม่พบบัญชีที่ใช้เบอร์นี้'); return }
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } catch { toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') }
  }

  if (!draft) return null

  return (
    <div className='flex min-bs-[100dvh] justify-center items-center p-6'>
      <AuthIllustrationWrapper>
        <Card className='flex flex-col sm:is-[450px]'>
          <CardContent className='sm:!p-12'>
            <Link href='/' className='flex justify-center mbe-6'><Logo /></Link>
            <div className='flex flex-col gap-1 mbe-6'>
              <Typography variant='h4'>ตั้งรหัสผ่านใหม่ 🔑</Typography>
              <Typography>ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ</Typography>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} noValidate autoComplete='off' className='flex flex-col gap-6'>
              <CustomTextField fullWidth label='รหัสผ่านใหม่' type={showPw ? 'text' : 'password'} placeholder='••••••••'
                slotProps={{ htmlInput: { autoComplete: 'new-password' },
                  input: { endAdornment: (<IconButton size='small' edge='end' onClick={() => setShowPw((s) => !s)}><i className={showPw ? 'tabler-eye-off' : 'tabler-eye'} /></IconButton>) } }}
                error={!!errors.password} helperText={errors.password?.message ?? '≥8 ตัว มีตัวอักษร ตัวเลข และอักขระพิเศษ'}
                {...register('password')} />
              <CustomTextField fullWidth label='ยืนยันรหัสผ่านใหม่' type={showConfirm ? 'text' : 'password'} placeholder='••••••••'
                slotProps={{ htmlInput: { autoComplete: 'new-password' },
                  input: { endAdornment: (<IconButton size='small' edge='end' onClick={() => setShowConfirm((s) => !s)}><i className={showConfirm ? 'tabler-eye-off' : 'tabler-eye'} /></IconButton>) } }}
                error={!!errors.confirmPassword} helperText={errors.confirmPassword?.message} {...register('confirmPassword')} />
              <Button fullWidth variant='contained' type='submit' disabled={isSubmitting || !draft}>
                {isSubmitting ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่าน'}
              </Button>
              <Typography className='flex justify-center items-center gap-1.5' color='primary.main'
                component={Link} href='/auth/sign-in'>
                <i className='tabler-chevron-left text-base' />กลับไปเข้าสู่ระบบ
              </Typography>
            </form>
            <Typography className='mt-7 text-center text-sm' color='text.disabled'>
              &copy; {currentYear} {META_DATA.name} — by {META_DATA.author}
            </Typography>
          </CardContent>
        </Card>
      </AuthIllustrationWrapper>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ใหม่

- [ ] **Step 4: Commit**

```bash
git add "src/app/(marketing)/auth/new-pass/"
git commit -m "feat(buyer-auth): หน้า new-pass (ตั้งรหัสผ่านใหม่ via set-password)

Base: theme/vuexy/typescript-version/full-version/src/views/pages/auth/ResetPasswordV1.tsx

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: OAuth callback loading page

**Files:**
- Create: `src/app/(marketing)/auth/callback/[provider]/page.tsx`
- Test: E2E (Task 8 — visual/redirect)

**Interfaces:**
- Consumes: `useSession` (next-auth/react); `useParams` provider segment
- Produces: หน้า loading → redirect `/` เมื่อ authenticated (LINE/IG signIn callbackUrl ชี้มาที่นี่)

- [ ] **Step 1: page.tsx** (Base: `theme/vuexy/.../views/pages/auth/*` + MUI CircularProgress)

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { toast } from 'react-toastify'
import Logo from '@components/layout/shared/Logo'

const MIN_DISPLAY_MS = 1500

const providerErrorMessage = (p: string): string => {
  switch (p) {
    case 'facebook': return 'เข้าสู่ระบบด้วย Facebook ไม่สำเร็จ กรุณาลองใหม่'
    case 'line': return 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่'
    case 'instagram': return 'เข้าสู่ระบบด้วย Instagram ไม่สำเร็จ กรุณาลองใหม่'
    default: return 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'
  }
}

export default function OAuthCallbackPage() {
  const { status } = useSession()
  const router = useRouter()
  const params = useParams()
  const provider = Array.isArray(params.provider) ? params.provider[0] : (params.provider ?? '')
  const mountedAt = useRef(Date.now())

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'authenticated') {
      const wait = Math.max(0, MIN_DISPLAY_MS - (Date.now() - mountedAt.current))
      const t = setTimeout(() => router.replace('/'), wait)
      return () => clearTimeout(t)
    }
    toast.error(providerErrorMessage(provider))
    router.replace('/auth/sign-in')
  }, [status, router, provider])

  return (
    <div className='flex min-bs-[100dvh] flex-col items-center justify-center gap-6 p-6'>
      <Logo />
      <CircularProgress />
      <div className='flex flex-col items-center gap-1 text-center'>
        <Typography color='text.primary' className='font-medium'>กำลังเข้าสู่ระบบ…</Typography>
        <Typography color='text.secondary' className='text-sm'>กำลังตั้งค่าบัญชีของคุณ</Typography>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ใหม่

- [ ] **Step 3: Commit**

```bash
git add "src/app/(marketing)/auth/callback/"
git commit -m "feat(buyer-auth): OAuth callback loading page (UX parity กับ seller)

Base: theme/vuexy/.../views/pages/auth (spinner) + MUI CircularProgress

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Playwright E2E — buyer auth flows

**Files:**
- Create: `e2e/buyer-password-auth.spec.ts`
- Modify (ถ้าจำเป็น): `e2e/helpers/auth.ts` — เพิ่ม buyer seed helper (cookie domain `deepth.local`) ถ้ายังไม่มี

**Interfaces:**
- Consumes: helper `createSeller` / `cleanup` / `cleanupTestPhone` เดิม; dev test phone/OTP (`0000000009`/`123456` dev-only — memory); buyer domain `http://deepth.local:4000`

- [ ] **Step 1: (ถ้าต้อง) เพิ่ม `loginAsBuyer` cookie domain deepth.local** — mirror `loginAs` แต่ `domain: 'deepth.local'` (main site) เพราะ helper เดิม hard-code `seller.deepth.local`

```ts
export async function loginAsBuyer(context: BrowserContext, seeded: Seeded) {
  const token = await encode({
    token: { userId: seeded.userId, needsRegistration: seeded.needsRegistration, needsOnboarding: seeded.needsOnboarding },
    secret: SECRET,
  })
  await context.addCookies([{
    name: 'next-auth.session-token', value: token,
    domain: 'deepth.local', path: '/', httpOnly: true, sameSite: 'Lax',
  }])
}
```

- [ ] **Step 2: E2E spec** — ครอบ: (a) render sign-in password form + toggle OTP, (b) social buttons ขึ้น 2 ปุ่ม (FB/LINE), (c) password login สำเร็จ (seed user มี passwordHash), (d) password login ผิด → error รวม, (e) reset flow reachable (reset-pass → verify-otp?mode=reset), (f) new-pass redirect กลับเมื่อไม่มี resetDraft

```ts
import { test, expect } from '@playwright/test'
import { createSeller, cleanup, type Seeded } from './helpers/auth'
import bcrypt from 'bcryptjs'
import { prisma } from './helpers/auth'

const BUYER = 'http://deepth.local:4000'

test.describe('buyer password auth', () => {
  let seeded: Seeded
  const password = 'Test@1234!'

  test.beforeAll(async () => {
    // seed buyer (ไม่ใช่ shop) ที่มี passwordHash
    const s = Math.random().toString(36).slice(2, 8)
    const user = await prisma.user.create({
      data: { displayName: 'QA Buyer', username: `qabuyer_${s}`, passwordHash: await bcrypt.hash(password, 10) },
    })
    seeded = { userId: user.id, needsRegistration: true, needsOnboarding: true, username: user.username, password }
  })
  test.afterAll(async () => { if (seeded) await cleanup(seeded.userId) })

  test('sign-in แสดง password form + toggle OTP + ปุ่ม social', async ({ page }) => {
    await page.goto(`${BUYER}/auth/sign-in`)
    await expect(page.getByLabel('ชื่อผู้ใช้')).toBeVisible()
    await expect(page.getByLabel('รหัสผ่าน')).toBeVisible()
    await expect(page.getByRole('button', { name: /Facebook/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /LINE/ })).toBeVisible()
    await page.getByText('เข้าสู่ระบบด้วยรหัส OTP แทน').click()
    await expect(page.getByLabel('เบอร์โทรศัพท์')).toBeVisible()
  })

  test('password login สำเร็จ → redirect ออกจาก /auth', async ({ page }) => {
    await page.goto(`${BUYER}/auth/sign-in`)
    await page.getByLabel('ชื่อผู้ใช้').fill(seeded.username!)
    await page.getByLabel('รหัสผ่าน').fill(password)
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
    await expect(page).not.toHaveURL(/\/auth\/sign-in/)
  })

  test('password login ผิด → error รวม', async ({ page }) => {
    await page.goto(`${BUYER}/auth/sign-in`)
    await page.getByLabel('ชื่อผู้ใช้').fill(seeded.username!)
    await page.getByLabel('รหัสผ่าน').fill('wrong-password-x')
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
    await expect(page.getByText('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')).toBeVisible()
  })

  test('reset-pass → verify-otp(mode=reset)', async ({ page }) => {
    await page.goto(`${BUYER}/auth/reset-pass`)
    await page.getByLabel('เบอร์โทรศัพท์').fill('0000000009')
    await page.getByRole('button', { name: 'ส่งรหัส OTP' }).click()
    await expect(page).toHaveURL(/\/auth\/verify-otp\?mode=reset/)
  })

  test('new-pass ไม่มี resetDraft → เด้งกลับ reset-pass', async ({ page }) => {
    await page.goto(`${BUYER}/auth/new-pass`)
    await expect(page).toHaveURL(/\/auth\/reset-pass/)
  })
})
```

- [ ] **Step 3: รัน E2E** (user รัน dev server เอง ที่ port 4000 — ตาม memory)

Run: `npm run e2e -- buyer-password-auth`
Expected: ทุก test PASS

- [ ] **Step 4: Commit**

```bash
git add e2e/buyer-password-auth.spec.ts e2e/helpers/auth.ts
git commit -m "test(buyer-auth): Playwright E2E — password login, toggle OTP, reset flow, social render

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §3.1 buyer-credentials → Task 1 ✅
- §3.2 hoist password phone-otp → Task 1 ✅
- §4.1 sign-up password → Task 2 ✅
- §4.2 sign-in password+toggle → Task 3 ✅
- §4.3 verify-otp reset+signupDraft → Task 4 ✅
- §4.4 reset-pass/new-pass → Task 5, 6 ✅
- §4.5 social buttons + callback → Task 3 (buttons), Task 7 (callback) ✅
- §6 security (no URL password, single-use OTP, enumeration, rate-limit, DoS guard, !isAdmin) → Task 1 + Task 2/4 (sessionStorage) + Task 3 (generic error) ✅
- §7 edge cases (legacy no-hash, FB no-phone, draft missing) → Task 1 (passwordHash null→null), Task 4/6 (draft missing→redirect) ✅
- §8 E2E → Task 8 ✅

**Placeholder scan:** ไม่มี TBD/TODO — ทุก step มี code จริง

**Type consistency:** `signupDraft={password}` (Task 2 เขียน / Task 4 อ่าน) ✅; `resetDraft={phone,otp}` (Task 4 เขียน / Task 6 อ่าน) ✅; provider id `buyer-credentials` (Task 1 สร้าง / Task 3 เรียก) ✅; `/api/account/set-password` payload `{phone,otp,password}` ตรง `SetPasswordSchema` ✅

**Note (ต้องยืนยันตอน implement):**
- Task 2/6 ใช้ `CustomTextField type='password'` (Vuexy) — ไม่มี strength bar. ถ้าต้องการ strength bar ต้องหา/สร้าง component ฝั่ง Vuexy (Paces `PasswordInputWithStrength` ใช้ในหน้า Vuexy ไม่ได้ตรง ๆ — ควรตรวจ import safety ก่อน). safepay-ux ควรชี้ชัดตอนออก Design Spec
- ก่อนแตะ UI ทุกไฟล์ → invoke `safepay-ux` (Hard Rule 8, mandatory gate)
```
