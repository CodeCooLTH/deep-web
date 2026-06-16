'use client'
import Icon from './wrappers/Icon'

type PasswordInputProps = {
  password: string
  setPassword: (value: string) => void
  showIcon?: boolean
  id?: string
  name?: string
  placeholder?: string
  label?: string
  labelClassName?: string
  inputClassName?: string
  /** ซ่อน hint อังกฤษ default ของ component — ใช้เมื่อ caller render hint ของตัวเองแทน (เช่น hint ไทย) */
  hideHint?: boolean
}

const calculatePasswordStrength = (password: string): number => {
  let strength = 0
  if (password.length >= 8) strength++
  if (/[A-Z]/.test(password)) strength++
  if (/\d/.test(password)) strength++
  if (/[\W_]/.test(password)) strength++
  return strength
}

const PasswordInputWithStrength = ({ password, setPassword, id, label, name, placeholder, showIcon, hideHint = false, labelClassName = 'form-label', inputClassName = 'form-input' }: PasswordInputProps) => {
  const strength = calculatePasswordStrength(password)
  const strengthBars = new Array(4).fill(0)

  return (
    <>
      {label && (
        <label htmlFor={id} className={labelClassName}>
          {label} <span className="text-danger">*</span>
        </label>
      )}

      <div className="input-icon-group">
        {showIcon && <Icon icon="lock-password" className="input-icon" />}
        <input type="password" name={name} id={id} placeholder={placeholder} required className={inputClassName} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>

      <div className="password-bar my-3">
        {strengthBars.map((_, i) => (
          <div key={i} className={'strong-bar ' + (i < strength ? `bar-active-${strength}` : '')} />
        ))}
      </div>

      {!hideHint && (
        <p className="text-default-400 text-xs">Use 8+ characters with letters, numbers & symbols.</p>
      )}
    </>
  )
}

export default PasswordInputWithStrength
