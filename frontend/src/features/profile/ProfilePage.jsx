import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Header, Footer } from '../facilities/PublicLayout';
import { useAuth } from '../auth/useAuth';
import { errorMessage } from '../../services/api';
import { changePasswordResponse, profileResponse } from '../../services/responseValidators';
import { passwordHint } from '../auth/validation';
import { protectedIdentity, readProtectedSnapshot, writeProtectedSnapshot } from '../../services/protectedReadCache';
import '../facilities/facilities.css';
import './profile.css';

const unknown = error => ['REQUEST_TIMEOUT','NETWORK_ERROR','INVALID_RESPONSE'].includes(error?.code);
const clean = profile => ({ full_name: profile.full_name, phone: profile.phone || '' });
const validate = form => {
  const errors = {}, name = form.full_name.trim(), phone = form.phone.trim();
  if (!name || [...name].length > 150) errors.full_name = 'Họ và tên phải từ 1–150 ký tự.';
  if ([...phone].length > 30) errors.phone = 'Số điện thoại không được vượt quá 30 ký tự.';
  return errors;
};

function useProfileRead(user, request) {
  const userId = user?.id, identity = protectedIdentity(user), path = '/users/me';
  const [state, setState] = useState(() => {
    const value = readProtectedSnapshot(identity, path) || user || null;
    return { loading: !value, busy: false, value, error: null };
  });
  const generation = useRef(0), active = useRef(null), requestRef = useRef(request);
  const resourceKey = String(userId || '');
  useEffect(() => { requestRef.current = request; }, [request]);
  const cancel = useCallback(() => { active.current?.abort(); active.current = null; }, []);
  const invalidate = useCallback(() => { generation.current++; cancel(); }, [cancel]);
  const refresh = useCallback(async () => {
    if (!resourceKey) return null;
    const version = ++generation.current;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setState(current => ({ ...current, loading: !current.value, busy: true, error: null }));
    try {
      const value = await requestRef.current('/users/me', { signal: controller.signal, validate: profileResponse });
      if (!controller.signal.aborted && version === generation.current) {
        writeProtectedSnapshot(identity, path, value.data);
        setState({ loading: false, busy: false, value: value.data, error: null });
      }
      return value.data;
    } catch (error) {
      if (!controller.signal.aborted && version === generation.current && error.code !== 'REQUEST_CANCELLED') setState(current => ({ ...current, loading: false, busy: false, error }));
      throw error;
    } finally { if (active.current === controller) active.current = null; }
  }, [resourceKey, identity]);
  useEffect(() => {
    const version = ++generation.current;
    queueMicrotask(() => { if (version !== generation.current) return; refresh().catch(() => {}); });
    return invalidate;
  }, [refresh, invalidate]);
  const accept = useCallback(value => { generation.current++; active.current?.abort(); active.current=null; writeProtectedSnapshot(identity, path, value); setState({ loading:false,busy:false,value,error:null }); }, [identity]);
  return { ...state, refresh, accept };
}

const capabilityName = value => ({ CUSTOMER:'Khách hàng', OWNER:'Chủ sân', ADMIN:'Quản trị viên' })[value] || value;
function workspace(profile) {
  if (profile.capabilities.includes('ADMIN')) return ['/admin/facilities','Về không gian quản trị'];
  if (profile.capabilities.includes('OWNER')) return ['/owner/facilities','Về không gian chủ sân'];
  return ['/owner-request','Đăng ký trở thành chủ sân'];
}

function PasswordField({id,label,toggleLabel,value,onChange,visible,setVisible,error,autoComplete}) { return <div className="pr-password-field"><label htmlFor={id}>{label}</label><div><input id={id} type={visible?'text':'password'} value={value} onChange={onChange} autoComplete={autoComplete} aria-invalid={Boolean(error)} aria-describedby={error?`${id}-error`:undefined}/><button type="button" aria-label={`${visible?'Ẩn':'Hiện'} ${toggleLabel}`} onClick={()=>setVisible(!visible)}>{visible?'Ẩn':'Hiện'}</button></div>{error&&<p id={`${id}-error`} className="pr-field-error">{error}</p>}</div> }
function SecuritySection({profile,auth}) {
  const navigate=useNavigate(), [values,setValues]=useState({current:'',next:'',confirm:''}), [visible,setVisible]=useState({current:false,next:false,confirm:false}), [errors,setErrors]=useState({}), [busy,setBusy]=useState(false), [notice,setNotice]=useState('');
  const lock=useRef(false), active=useRef(null), mounted=useRef(true); useEffect(()=>()=>{mounted.current=false;active.current?.abort()},[]);
  if(!profile.has_local_password)return <section id="security" className="pr-card pr-section"><h2>Bảo mật</h2><div className="pr-security-note"><strong>Không có mật khẩu cục bộ</strong><p>Tài khoản này không hỗ trợ đổi mật khẩu bằng mật khẩu hiện tại. Hãy tiếp tục dùng phương thức đăng nhập đã liên kết.</p></div></section>;
  async function submit(event){event.preventDefault();if(lock.current)return;const next={};if(!values.current)next.current='Vui lòng nhập mật khẩu hiện tại.';if([...values.next].length<8||[...values.next].length>128||!/[\p{L}]/u.test(values.next)||!/[\p{Nd}]/u.test(values.next))next.next=passwordHint;if(!values.confirm)next.confirm='Vui lòng xác nhận mật khẩu mới.';else if(values.confirm!==values.next)next.confirm='Mật khẩu xác nhận chưa khớp.';setErrors(next);if(Object.keys(next).length)return;lock.current=true;setBusy(true);setNotice('');const controller=new AbortController();active.current=controller;try{await auth.request('/auth/change-password',{method:'POST',body:{current_password:values.current,new_password:values.next},validate:changePasswordResponse,signal:controller.signal});if(!mounted.current)return;auth.clearSession();navigate('/login',{replace:true,state:{passwordChanged:true}})}catch(error){if(!mounted.current||error.code==='REQUEST_CANCELLED')return;if(unknown(error)){auth.clearSession();navigate('/login',{replace:true,state:{passwordChangeUnknown:true}})}else setNotice(errorMessage(error))}finally{lock.current=false;if(active.current===controller)active.current=null;if(mounted.current)setBusy(false)}}
  const field=(key,id,label,toggleLabel,autoComplete)=><PasswordField id={id} label={label} toggleLabel={toggleLabel} value={values[key]} onChange={e=>{setValues({...values,[key]:e.target.value});setErrors({...errors,[key]:null});setNotice('')}} visible={visible[key]} setVisible={value=>setVisible({...visible,[key]:value})} error={errors[key]} autoComplete={autoComplete}/>;
  return <section id="security" className="pr-card pr-section"><h2>Bảo mật</h2><p className="pr-section-lead">Đổi mật khẩu sẽ đăng xuất tài khoản khỏi tất cả phiên hiện tại.</p><form onSubmit={submit} noValidate aria-busy={busy}>{field('current','current-password','Mật khẩu hiện tại','mật khẩu cũ','current-password')}{field('next','new-password','Mật khẩu mới','mật khẩu mới','new-password')}{field('confirm','confirm-password','Xác nhận mật khẩu mới','mật khẩu xác nhận','new-password')}<p className="pr-help">{passwordHint}</p>{notice&&<p className="pr-form-error" role="alert">{notice}</p>}<div className="pr-actions"><button className="primary" type="submit" disabled={busy}>{busy?'Đang đổi mật khẩu…':'Đổi mật khẩu'}</button></div></form></section>;
}

export function ProfilePage() {
  const auth = useAuth(), navigate=useNavigate(), read = useProfileRead(auth.user, auth.request);
  const [form,setForm] = useState(null), [formUserId,setFormUserId] = useState(null), [errors,setErrors] = useState({}), [message,setMessage] = useState(''), [mutationError,setMutationError] = useState(''), [unresolved,setUnresolved] = useState(''), [mutationBusy,setMutationBusy] = useState(false);
  const submitLock = useRef(false), mounted = useRef(true), mutationController = useRef(null);
  useEffect(() => () => { mounted.current = false; mutationController.current?.abort(); }, []);
  const profile = read.value, activeForm = profile && formUserId === profile.id ? form : profile ? clean(profile) : {full_name:'',phone:''};
  const dirty = profile && (activeForm.full_name !== profile.full_name || activeForm.phone !== (profile.phone || ''));
  const change = next => { setFormUserId(profile.id); setForm(next); };
  const [workspacePath,workspaceLabel] = profile ? workspace(profile) : ['/', 'Về trang chủ'];
  async function recover() {
    try {
      const current = await read.refresh();
      if (!mounted.current) return false;
      auth.reconcileProfile(current); setFormUserId(current.id); setForm(clean(current)); setUnresolved('');
      return true;
    } catch { if (mounted.current) setUnresolved('Kết quả cập nhật chưa được xác minh. Hãy đồng bộ hồ sơ trước khi thử lại.'); return false; }
  }
  async function submit(event) {
    event.preventDefault(); if (submitLock.current || !dirty || unresolved) return;
    const nextErrors = validate(activeForm); setErrors(nextErrors); if (Object.keys(nextErrors).length) return;
    submitLock.current = true; setMutationBusy(true); setMessage(''); setMutationError('');
    const controller = new AbortController(); mutationController.current = controller;
    try {
      const result = await auth.request('/users/me', { method:'PATCH', body:{full_name:activeForm.full_name,phone:activeForm.phone}, validate:profileResponse, signal:controller.signal });
      if (!mounted.current) return;
      read.accept(result.data); auth.reconcileProfile(result.data); setFormUserId(result.data.id); setForm(clean(result.data)); setMessage('Đã cập nhật hồ sơ.');
    } catch (error) {
      if (!mounted.current || error.code === 'REQUEST_CANCELLED') return;
      if (unknown(error)) { if (await recover()) setMessage('Hồ sơ đã được đồng bộ theo dữ liệu mới nhất.'); }
      else setMutationError(errorMessage(error));
    } finally { submitLock.current = false; if (mutationController.current === controller) mutationController.current = null; if (mounted.current) setMutationBusy(false); }
  }
  function cancel(){ if(profile){setFormUserId(profile.id);setForm(clean(profile));setErrors({});setMutationError('');setMessage('');} }
  return <div className="pr-page"><Header/><main className="pr-main">
    {read.loading ? <div className="pr-skeleton" aria-busy="true"><span/><span/><span/><p role="status">Đang tải hồ sơ…</p></div>
      : read.error && !profile ? <section className="pr-state" role="alert"><h1>Chưa thể tải hồ sơ</h1><p>{errorMessage(read.error)}</p><button onClick={()=>read.refresh().catch(()=>{})}>Thử lại</button></section>
      : profile && <>
        <header className="pr-heading"><p>TÀI KHOẢN CÁ NHÂN</p><h1>Tài khoản của tôi</h1><span>Quản lý hồ sơ, bảo mật và quyền truy cập của tài khoản.</span></header>
        {read.busy && <p className="pr-sync" role="status">Đang đồng bộ hồ sơ…</p>}
        {read.error && <div className="pr-inline-error" role="alert"><span>Không thể đồng bộ dữ liệu mới nhất. Thông tin đã xác minh gần nhất vẫn được giữ lại.</span><button onClick={()=>read.refresh().catch(()=>{})}>Thử lại</button></div>}
        {unresolved && <div className="pr-inline-error" role="alert"><span>{unresolved}</span><button onClick={recover}>Đồng bộ lại</button></div>}
        <div className="pr-account"><aside><section className="pr-identity"><div className="pr-avatar" aria-hidden="true">{profile.full_name.trim().slice(0,1)}</div><h2>{profile.full_name}</h2><p>{profile.email}</p><div className="pr-badges" aria-label="Quyền tài khoản">{profile.capabilities.map(value=><span key={value}>{capabilityName(value)}</span>)}</div></section><nav className="pr-section-nav" aria-label="Cài đặt tài khoản"><a href="#personal">Hồ sơ cá nhân</a><a href="#security">Bảo mật</a><a href="#access">Quyền &amp; tài khoản</a></nav></aside><div className="pr-sections">
          <section id="personal" className="pr-card pr-section"><h2>Hồ sơ cá nhân</h2><form onSubmit={submit} noValidate>
            <label htmlFor="profile-name">Họ và tên</label><input id="profile-name" name="full_name" autoComplete="name" maxLength="150" value={activeForm.full_name} onChange={e=>{change({...activeForm,full_name:e.target.value});setErrors({...errors,full_name:null});setMessage('')}} aria-invalid={Boolean(errors.full_name)} aria-describedby={errors.full_name?'profile-name-error':undefined}/>{errors.full_name&&<p id="profile-name-error" className="pr-field-error">{errors.full_name}</p>}
            <label htmlFor="profile-email">Email</label><input id="profile-email" value={profile.email} readOnly aria-readonly="true"/><p className="pr-help">Email được sử dụng để đăng nhập và hiện chưa thể thay đổi.</p>
            <label htmlFor="profile-phone">Số điện thoại</label><input id="profile-phone" name="phone" type="tel" autoComplete="tel" maxLength="30" value={activeForm.phone} onChange={e=>{change({...activeForm,phone:e.target.value});setErrors({...errors,phone:null});setMessage('')}} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone?'profile-phone-error':undefined}/>{errors.phone&&<p id="profile-phone-error" className="pr-field-error">{errors.phone}</p>}
            {message&&<p className="pr-success" role="status">{message}</p>}{mutationError&&<p className="pr-form-error" role="alert">{mutationError}</p>}
            <div className="pr-actions"><button type="button" onClick={cancel} disabled={!dirty||mutationBusy}>Hủy</button><button className="primary" type="submit" disabled={!dirty||mutationBusy||Boolean(unresolved)}>{mutationBusy?'Đang lưu…':'Lưu thay đổi'}</button></div>
          </form></section><SecuritySection profile={profile} auth={auth}/><section id="access" className="pr-card pr-section"><h2>Quyền &amp; tài khoản</h2><p className="pr-section-lead">Các quyền hiện tại được xác định từ tài khoản đã đăng nhập.</p><div className="pr-capability-list">{profile.capabilities.map(value=><div key={value}><strong>{capabilityName(value)}</strong><span>{value==='ADMIN'?'Quản lý vận hành hệ thống.':value==='OWNER'?'Quản lý cơ sở và đơn đặt sân thuộc quyền sở hữu.':'Đặt sân và quản lý các lượt đặt của bạn.'}</span></div>)}</div><div className="pr-account-actions"><Link to={workspacePath}>{workspaceLabel}</Link><button type="button" onClick={async()=>{await auth.request('/auth/logout',{method:'POST'}).catch(()=>{});auth.clearSession();navigate('/login',{replace:true})}}>Đăng xuất</button></div></section></div></div>
      </>}
  </main><Footer/></div>;
}
