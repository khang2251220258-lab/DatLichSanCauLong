export const summaryFields = Object.fromEntries([
  'id', 'court_id', 'status', 'start_at', 'end_at', 'expires_at', 'created_at',
  'total_amount', 'deposit_amount', 'remaining_amount', 'facility_name_snapshot', 'facility_address_snapshot', 'court_name_snapshot',
].map(k => [k, true]));
export const detailFields = { ...summaryFields, cancellation_cutoff_hours_snapshot: true,
  cancelled_at: true, cancelled_by: true, cancellation_reason: true,
  bank_name_snapshot: true, account_number_snapshot: true, account_holder_snapshot: true,
  qr_image_path_snapshot: true,
  refund: { select: { id: true, booking_id: true, amount: true, status: true, reason: true, requested_at: true,
    proof_submitted_at: true, confirmed_at: true, refunded_at: true } },
  slots: { select: { start_at: true, end_at: true, hourly_rate_snapshot: true, slot_amount: true }, orderBy: { start_at: 'asc' } } };
export function present(row, now, storage) {
  const safe = { ...row };
  const qrPath = safe.qr_image_path_snapshot;
  delete safe.qr_image_path_snapshot;
  const qrExpiresAt = qrPath ? new Date(now.getTime() + 300000) : null;
  return { ...safe, id: String(row.id), court_id: String(row.court_id),
    status: row.status === 'PENDING_PAYMENT' && row.expires_at <= now ? 'EXPIRED' : row.status,
    total_amount: row.total_amount.toString(), deposit_amount: row.deposit_amount.toString(), remaining_amount: row.remaining_amount.toString(),
    ...(Object.hasOwn(row, 'qr_image_path_snapshot') ? {
      qr_image_url: qrPath && storage ? storage.privateUrl(qrPath, 'image/png', Math.floor(qrExpiresAt.getTime() / 1000)) : null,
      qr_image_expires_at: qrExpiresAt?.toISOString() ?? null,
    } : {}),
    ...(Object.hasOwn(row, 'refund') ? { refund: row.refund ? { ...row.refund, id: String(row.refund.id), booking_id: String(row.refund.booking_id), amount: row.refund.amount.toString() } : null } : {}),
    ...(row.slots ? { slots: row.slots.map(s => ({ ...s, hourly_rate_snapshot: s.hourly_rate_snapshot.toString(), slot_amount: s.slot_amount.toString() })) } : {}) };
}
