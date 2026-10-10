const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = value => typeof value === 'number' && Number.isFinite(value);
const pagination = meta => object(meta) && number(meta.page) && number(meta.page_size) && number(meta.total);
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const money = value => typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value);
const url = value => { try { return typeof value === 'string' && new URL(value).protocol === 'https:'; } catch { return false; } };
const bookingStatuses = new Set(['PENDING_PAYMENT','PENDING_CONFIRMATION','CONFIRMED','COMPLETED','CANCELLED','REJECTED','EXPIRED']);
const refundStatuses = new Set(['PENDING','PROOF_SUBMITTED','REFUNDED']);
const refundSummaryFields = new Set(['id','booking_id','amount','status','reason','requested_at','proof_submitted_at','confirmed_at','refunded_at']);
const exactFields = (value, fields) => object(value)
  && Object.keys(value).length === fields.size
  && Object.keys(value).every(key => fields.has(key));
const nullableInstant = value => value === null || instant(value);
const refundSummary = value => exactFields(value, refundSummaryFields)
  && /^[1-9]\d*$/.test(String(value.id)) && /^[1-9]\d*$/.test(String(value.booking_id))
  && money(value.amount) && refundStatuses.has(value.status) && typeof value.reason === 'string' && value.reason.length > 0
  && instant(value.requested_at) && nullableInstant(value.proof_submitted_at) && nullableInstant(value.confirmed_at) && nullableInstant(value.refunded_at)
  && (value.status === 'PENDING' ? value.proof_submitted_at === null && value.confirmed_at === null && value.refunded_at === null
    : value.status === 'PROOF_SUBMITTED' ? value.proof_submitted_at !== null && value.confirmed_at === null && value.refunded_at === null
      : value.proof_submitted_at !== null && value.confirmed_at !== null && value.refunded_at !== null && value.confirmed_at === value.refunded_at);

export const listResponse = envelope => Array.isArray(envelope.data) && pagination(envelope.meta);
export const arrayResponse = envelope => Array.isArray(envelope.data);
export const detailResponse = envelope => object(envelope.data);
export const facilityListResponse = envelope => listResponse(envelope)
  && envelope.data.every(item => object(item) && Array.isArray(item.amenities));
export const bookingListResponse = envelope => listResponse(envelope) && envelope.data.every(object);
export const ownerBookingListResponse = envelope => listResponse(envelope)
  && envelope.data.every(item => object(item) && object(item.customer) && object(item.facility) && object(item.court));
export const adminFacilityListResponse = envelope => listResponse(envelope) && envelope.data.every(object);
export const facilityDetailResponse = envelope => detailResponse(envelope)
  && object(envelope.meta) && typeof envelope.meta.server_time === 'string'
  && ['gallery', 'amenities', 'courts', 'price_rules'].every(key => Array.isArray(envelope.data[key]));
export const availabilityResponse = envelope => detailResponse(envelope)
  && object(envelope.meta) && typeof envelope.meta.server_time === 'string'
  && Array.isArray(envelope.data.slots);
export const bookingDetailResponse = envelope => detailResponse(envelope)
  && object(envelope.meta) && instant(envelope.meta.server_time)
  && /^\d+$/.test(String(envelope.data.id ?? '')) && bookingStatuses.has(envelope.data.status)
  && instant(envelope.data.expires_at)
  && ['total_amount','deposit_amount','remaining_amount'].every(key => money(envelope.data[key]))
  && ['bank_name_snapshot','account_number_snapshot','account_holder_snapshot'].every(key => typeof envelope.data[key] === 'string' && envelope.data[key].length > 0)
  && (envelope.data.qr_image_url === null || url(envelope.data.qr_image_url))
  && (envelope.data.qr_image_expires_at === null || instant(envelope.data.qr_image_expires_at))
  && (envelope.data.cancellation_cutoff_hours_snapshot === null || (Number.isInteger(envelope.data.cancellation_cutoff_hours_snapshot) && envelope.data.cancellation_cutoff_hours_snapshot >= 0 && envelope.data.cancellation_cutoff_hours_snapshot <= 168))
  && Array.isArray(envelope.data.slots)
  && Object.hasOwn(envelope.data,'refund') && (envelope.data.refund === null || (refundSummary(envelope.data.refund) && envelope.data.refund.booking_id === String(envelope.data.id)));
const cancellationBookingFields = new Set(['id','status','cancelled_by','cancellation_reason','cancelled_at']);
const cancellationRefundFields = new Set(['id','booking_id','amount','status','requested_at']);
export const bookingCancellationResponse = envelope => object(envelope) && object(envelope.meta) && instant(envelope.meta.server_time)
  && exactFields(envelope.data, new Set(['booking','refund'])) && exactFields(envelope.data.booking, cancellationBookingFields)
  && /^\d+$/.test(envelope.data.booking.id) && envelope.data.booking.status === 'CANCELLED'
  && envelope.data.booking.cancelled_by === 'CUSTOMER' && (envelope.data.booking.cancellation_reason === null || typeof envelope.data.booking.cancellation_reason === 'string')
  && instant(envelope.data.booking.cancelled_at)
  && (envelope.data.refund === null || (exactFields(envelope.data.refund, cancellationRefundFields)
    && /^\d+$/.test(envelope.data.refund.id) && envelope.data.refund.booking_id === envelope.data.booking.id
    && money(envelope.data.refund.amount) && envelope.data.refund.status === 'PENDING' && instant(envelope.data.refund.requested_at)));
const bankFields = new Set(['bank_name','account_number','account_holder','has_qr_image','qr_image_url','qr_image_expires_at']);
export const ownerBankAccountResponse = envelope => object(envelope) && Object.hasOwn(envelope, 'data')
  && (envelope.data === null || (object(envelope.data)
    && Object.keys(envelope.data).length === bankFields.size
    && Object.keys(envelope.data).every(key => bankFields.has(key))
    && ['bank_name','account_number','account_holder'].every(key => typeof envelope.data[key] === 'string')
    && typeof envelope.data.has_qr_image === 'boolean'
    && (envelope.data.qr_image_url === null || url(envelope.data.qr_image_url))
    && (envelope.data.qr_image_expires_at === null || instant(envelope.data.qr_image_expires_at))
    && envelope.data.has_qr_image === Boolean(envelope.data.qr_image_url && envelope.data.qr_image_expires_at)));
const ownerRequestStatuses = new Set(['PENDING','APPROVED','REJECTED']);
const ownerRequestFields = new Set(['id','user_id','status','applicant_name_snapshot','applicant_email_snapshot','applicant_phone_snapshot','reviewed_by','reviewed_at','rejection_reason','created_at','updated_at']);
const ownerRequest = value => exactFields(value, ownerRequestFields)
  && /^[1-9]\d*$/.test(String(value.id)) && /^[1-9]\d*$/.test(String(value.user_id))
  && ownerRequestStatuses.has(value.status)
  && typeof value.applicant_name_snapshot === 'string' && value.applicant_name_snapshot.trim().length > 0
  && typeof value.applicant_email_snapshot === 'string' && value.applicant_email_snapshot.trim().length > 0
  && (value.applicant_phone_snapshot === null || typeof value.applicant_phone_snapshot === 'string')
  && (value.reviewed_by === null || /^[1-9]\d*$/.test(String(value.reviewed_by)))
  && (value.reviewed_at === null || instant(value.reviewed_at))
  && (value.rejection_reason === null || typeof value.rejection_reason === 'string')
  && instant(value.created_at) && instant(value.updated_at)
  && (value.status === 'PENDING'
    ? value.reviewed_by === null && value.reviewed_at === null && value.rejection_reason === null
    : value.reviewed_by !== null && value.reviewed_at !== null)
  && (value.status === 'REJECTED' ? value.rejection_reason?.trim().length > 0 : value.rejection_reason === null);
export const ownerRequestDetailResponse = envelope => object(envelope) && ownerRequest(envelope.data);
export const ownerRequestListResponse = envelope => object(envelope) && Array.isArray(envelope.data)
  && envelope.data.every(ownerRequest) && pagination(envelope.meta) && instant(envelope.meta.server_time);
export const ownerRequestApproveResponse = envelope => object(envelope) && exactFields(envelope.data, new Set(['request','user']))
  && ownerRequest(envelope.data.request) && object(envelope.data.user)
  && /^[1-9]\d*$/.test(String(envelope.data.user.id)) && envelope.data.user.role === 'CUSTOMER'
  && Array.isArray(envelope.data.user.capabilities)
  && envelope.data.user.capabilities.length === 2
  && envelope.data.user.capabilities.includes('CUSTOMER') && envelope.data.user.capabilities.includes('OWNER');
export const ownerRequestRejectResponse = envelope => object(envelope) && exactFields(envelope.data, new Set(['request']))
  && ownerRequest(envelope.data.request) && envelope.data.request.status === 'REJECTED';
const cancellationPolicyFields = new Set(['id','facility_id','cutoff_hours','created_at','updated_at']);
export const ownerCancellationPolicyResponse = envelope => object(envelope)
  && object(envelope.meta) && instant(envelope.meta.server_time)
  && Object.hasOwn(envelope, 'data')
  && (envelope.data === null || (exactFields(envelope.data, cancellationPolicyFields)
    && /^[1-9]\d*$/.test(envelope.data.id) && /^[1-9]\d*$/.test(envelope.data.facility_id)
    && Number.isInteger(envelope.data.cutoff_hours)
    && envelope.data.cutoff_hours >= 0 && envelope.data.cutoff_hours <= 168
    && instant(envelope.data.created_at) && instant(envelope.data.updated_at)));
const facilityImageFields = new Set(['id','facility_id','url','sort_order','created_at','updated_at']);
const facilityImage = item => exactFields(item, facilityImageFields)
  && /^\d+$/.test(String(item.id)) && /^\d+$/.test(String(item.facility_id))
  && url(item.url) && Number.isInteger(item.sort_order) && item.sort_order >= 0
  && instant(item.created_at) && instant(item.updated_at);
export const ownerFacilityImageResponse = envelope => object(envelope) && facilityImage(envelope.data);
export const ownerFacilityImagesResponse = envelope => object(envelope) && Array.isArray(envelope.data)
  && envelope.data.every(facilityImage)
  && envelope.data.every((item, index) => item.sort_order === index);
const amenityFields = new Set(['id','name','is_active','created_at','updated_at']);
const amenity = item => exactFields(item, amenityFields)
  && /^\d+$/.test(String(item.id)) && typeof item.name === 'string' && item.name.trim().length > 0
  && typeof item.is_active === 'boolean' && instant(item.created_at) && instant(item.updated_at);
export const ownerAmenityArrayResponse = envelope => object(envelope) && Array.isArray(envelope.data)
  && envelope.data.every(amenity);
export const adminAmenityListResponse = envelope => object(envelope) && Array.isArray(envelope.data)
  && envelope.data.every(amenity) && pagination(envelope.meta) && instant(envelope.meta.server_time);
export const adminAmenityResponse = envelope => object(envelope) && amenity(envelope.data)
  && object(envelope.meta) && instant(envelope.meta.server_time);
export const bookingCreateResponse = envelope => detailResponse(envelope)
  && /^\d+$/.test(String(envelope.data.id ?? ''));
export const ownerBookingDetailResponse = envelope => detailResponse(envelope)
  && Array.isArray(envelope.data.slots)
  && object(envelope.data.customer) && object(envelope.data.facility) && object(envelope.data.court)
  && (envelope.data.payment_proof == null || object(envelope.data.payment_proof))
  && Object.hasOwn(envelope.data,'refund') && (envelope.data.refund === null || (refundSummary(envelope.data.refund) && envelope.data.refund.booking_id === String(envelope.data.id)));
export const refundMutationResponse = envelope => object(envelope) && object(envelope.meta) && instant(envelope.meta.server_time) && refundSummary(envelope.data);
const refundDetailFields = new Set([...refundSummaryFields,'proof_image_url','proof_image_expires_at']);
export const refundDetailResponse = envelope => object(envelope) && object(envelope.meta) && instant(envelope.meta.server_time)
  && exactFields(envelope.data,refundDetailFields) && refundSummary(Object.fromEntries([...refundSummaryFields].map(key=>[key,envelope.data[key]])))
  && (envelope.data.status === 'PENDING'
    ? envelope.data.proof_image_url === null && envelope.data.proof_image_expires_at === null
    : url(envelope.data.proof_image_url) && instant(envelope.data.proof_image_expires_at)
      && Date.parse(envelope.data.proof_image_expires_at) > Date.parse(envelope.meta.server_time));
const customerProofFields = new Set(['id','booking_id','status','submitted_at','proof_image_url','proof_image_expires_at']);
export const customerProofResponse = envelope => detailResponse(envelope)
  && object(envelope.meta) && instant(envelope.meta.server_time)
  && Object.keys(envelope.data).length === customerProofFields.size
  && Object.keys(envelope.data).every(key => customerProofFields.has(key))
  && /^\d+$/.test(String(envelope.data.id ?? '')) && /^\d+$/.test(String(envelope.data.booking_id ?? ''))
  && ['SUBMITTED','APPROVED','REJECTED'].includes(envelope.data.status)
  && instant(envelope.data.submitted_at) && instant(envelope.data.proof_image_expires_at)
  && Date.parse(envelope.data.proof_image_expires_at) > Date.parse(envelope.meta.server_time)
  && url(envelope.data.proof_image_url);
export const authResponse = envelope => detailResponse(envelope)
  && object(envelope.data.user) && Array.isArray(envelope.data.user.capabilities)
  && typeof envelope.data.csrf_token === 'string';
