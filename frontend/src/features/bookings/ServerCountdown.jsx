import { useServerCountdown } from './useServerCountdown';

export function ServerCountdown({ expiresAt, serverTime, receivedAt, sync, compact = false, children }) {
  const remaining = useServerCountdown(expiresAt, serverTime, receivedAt, sync);
  return <section className={'bk-panel bk-countdown'+(compact?' pay-countdown':'')}>
    <h2>◷ {compact ? 'Vui lòng hoàn tất chuyển khoản trong' : 'Thời gian giữ sân còn lại'}</h2>
    <p role="timer" aria-label="Thời gian giữ sân">{String(Math.floor(remaining/60)).padStart(2,'0')}:{String(remaining%60).padStart(2,'0')}</p>
    {!compact && <><p>{remaining ? 'Trạng thái giữ sân được xác định bởi máy chủ.' : 'Đang chờ xác minh trạng thái giữ sân với máy chủ.'}</p><small>Hết thời hạn, máy chủ xử lý hết hạn và giải phóng khung giờ theo trạng thái booking.</small></>}
    {remaining > 0 && children}
  </section>;
}
