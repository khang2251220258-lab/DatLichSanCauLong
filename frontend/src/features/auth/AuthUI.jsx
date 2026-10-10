import { useState } from 'react';
import { Link } from 'react-router';
export function AuthLayout({ title, subtitle, children, brand = true, icon, className = '' }) {
  return <main className={'auth-shell ' + className}>
    {brand && <div className="auth-brand" aria-label="Cầu Lông ĐN"><span className="brand-icon" aria-hidden="true">🏸</span><span>Cầu Lông <b>ĐN</b></span></div>}
    <section className="auth-card" aria-labelledby="auth-title">
      {icon && <div className={'state-icon ' + icon} aria-hidden="true">{icon === 'success' ? '✓' : '✉'}</div>}
      <header><h1 id="auth-title">{title}</h1>{subtitle && <p>{subtitle}</p>}</header>
      {children}
    </section>
  </main>;
}
export function Field({ name, label, value, onChange, error, password = false, autoComplete, placeholder, disabled }) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-field">
    <label htmlFor={name}>{label}</label>
    <div className="input-wrap">
      <input id={name} name={name} type={password && !visible ? 'password' : 'text'}
        inputMode={name === 'email' ? 'email' : undefined} autoCapitalize={name === 'email' ? 'none' : undefined}
        autoComplete={autoComplete} spellCheck={false} value={value} onChange={onChange}
        placeholder={placeholder} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? name + '-error' : undefined} />
      {password && <button className="visibility" type="button" onClick={() => setVisible(v => !v)} aria-label={(visible ? 'Ẩn ' : 'Hiện ') + label.toLowerCase()} aria-pressed={visible} disabled={disabled}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible && <path d="m3 3 18 18"/>}</svg>
      </button>}
    </div>
    {error && <p className="field-error" id={name + '-error'}>{error}</p>}
  </div>;
}
export const Notice = ({ children, success = false }) => children ? <p className={'notice ' + (success ? 'positive' : '')} role={success ? 'status' : 'alert'}>{children}</p> : null;
export const BackToLogin = () => <Link className="back-link" to="/login">← Quay lại đăng nhập</Link>;
