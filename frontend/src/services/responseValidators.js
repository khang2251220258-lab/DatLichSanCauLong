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
const publicAmenityFields = new Set(['id','name']);
const publicFacilityFields = new Set(['id','name','district','address','cover_image_url','amenities']);
const publicFacilityIntervalFields = new Set([...publicFacilityFields,'matching_courts']);
const publicSummary = (item, interval) => exactFields(item, interval ? publicFacilityIntervalFields : publicFacilityFields)
  && positiveId(item.id)
  && ['name','district','address'].every(key => typeof item[key] === 'string' && item[key].trim().length > 0)
  && (item.cover_image_url === null || url(item.cover_image_url))
  && Array.isArray(item.amenities)
  && item.amenities.every(value => exactFields(value, publicAmenityFields) && positiveId(value.id) && typeof value.name === 'string' && value.name.trim().length > 0)
  && (!interval || (Array.isArray(item.matching_courts) && item.matching_courts.length > 0
    && item.matching_courts.every(value => exactFields(value, publicAmenityFields) && positiveId(value.id) && typeof value.name === 'string' && value.name.trim().length > 0)));
export const facilityListResponse = (envelope, interval = false) => listResponse(envelope)
  && envelope.data.every(item => publicSummary(item, interval));
export const recurringSearchResponse = envelope => listResponse(envelope)
  && instant(envelope.meta.server_time)
  && Number.isInteger(envelope.meta.occurrence_count) && envelope.meta.occurrence_count > 0
  && envelope.data.every(item => publicSummary(item, true));
export const bookingListResponse = envelope => listResponse(envelope) && envelope.data.every(object);
export const ownerBookingListResponse = envelope => listResponse(envelope)
  && instant(envelope.meta.server_time)
  && envelope.data.every(item => object(item) && object(item.customer) && object(item.facility) && object(item.court)
    && [1,2].includes(item.booking_flow_version)
    && (item.booking_flow_version === 1 ? item.transfer_reference === null : item.transfer_reference === `CLDN ${item.id}`)
    && (item.booking_flow_version === 1 ? item.confirmation_expires_at === null : instant(item.confirmation_expires_at)));
const facilityStatuses = new Set(['DRAFT','PENDING','ACTIVE','REJECTED','SUSPENDED']);
const facilityFields = new Set(['id','owner_id','name','address','district','latitude','longitude','phone','description','opening_time','closing_time','status','submitted_at','reviewed_by','reviewed_at','rejection_reason','suspended_at','suspension_reason','created_at','updated_at']);
const adminFacilityOwnerFields = new Set(['id','full_name','email','phone','status']);
const envelopeFields = new Set(['data','meta']);
const listMetaFields = new Set(['server_time','page','page_size','total']);
const detailMetaFields = new Set(['server_time']);
const time = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const nullableString = value => value === null || typeof value === 'string';
const positiveId = value => /^[1-9]\d*$/.test(String(value));
const facilityStateMetadata = item => {
  const reviewed = item.reviewed_by !== null && item.reviewed_at !== null;
  if (item.status === 'DRAFT') return item.submitted_at === null && !reviewed && item.rejection_reason === null && item.suspended_at === null && item.suspension_reason === null;
  if (item.status === 'PENDING') return item.submitted_at !== null && !reviewed && item.rejection_reason === null && item.suspended_at === null && item.suspension_reason === null;
  if (item.status === 'REJECTED') return item.submitted_at !== null && reviewed && typeof item.rejection_reason === 'string' && item.rejection_reason.trim().length > 0 && item.suspended_at === null && item.suspension_reason === null;
  if (item.status === 'SUSPENDED') return item.submitted_at !== null && reviewed && item.rejection_reason === null && item.suspended_at !== null && typeof item.suspension_reason === 'string' && item.suspension_reason.trim().length > 0;
  return item.submitted_at !== null && reviewed && item.rejection_reason === null && item.suspended_at === null && item.suspension_reason === null;
};
const adminFacilityCore = item => exactFields(item, facilityFields)
  && positiveId(item.id) && positiveId(item.owner_id)
  && ['name','address','district','phone'].every(key => typeof item[key] === 'string' && item[key].trim().length > 0)
  && nullableString(item.description) && nullableString(item.latitude) && nullableString(item.longitude)
  && time(item.opening_time) && time(item.closing_time) && facilityStatuses.has(item.status)
  && nullableInstant(item.submitted_at) && (item.reviewed_by === null || positiveId(item.reviewed_by)) && nullableInstant(item.reviewed_at)
  && nullableString(item.rejection_reason) && nullableInstant(item.suspended_at) && nullableString(item.suspension_reason)
  && instant(item.created_at) && instant(item.updated_at) && facilityStateMetadata(item);
const adminFacilityOwner = owner => exactFields(owner, adminFacilityOwnerFields)
  && positiveId(owner.id) && typeof owner.full_name === 'string' && owner.full_name.trim().length > 0
  && typeof owner.email === 'string' && owner.email.trim().length > 0
  && (owner.phone === null || typeof owner.phone === 'string') && ['ACTIVE','LOCKED'].includes(owner.status);
export const adminFacilityListResponse = envelope => exactFields(envelope, envelopeFields) && Array.isArray(envelope.data)
  && envelope.data.every(adminFacilityCore) && exactFields(envelope.meta, listMetaFields)
  && pagination(envelope.meta) && instant(envelope.meta.server_time);
export const adminFacilityDetailResponse = expectedId => envelope => exactFields(envelope, envelopeFields) && object(envelope.data)
  && exactFields(envelope.data, new Set([...facilityFields,'owner']))
  && adminFacilityCore(Object.fromEntries(Object.entries(envelope.data).filter(([key]) => key !== 'owner')))
  && adminFacilityOwner(envelope.data.owner) && envelope.data.owner.id === envelope.data.owner_id
  && (!expectedId || envelope.data.id === String(expectedId))
  && exactFields(envelope.meta, detailMetaFields) && instant(envelope.meta.server_time);
export const adminFacilityMutationResponse = expectedStatus => envelope => exactFields(envelope, envelopeFields)
  && adminFacilityCore(envelope.data) && envelope.data.status === expectedStatus
  && exactFields(envelope.meta, detailMetaFields) && instant(envelope.meta.server_time);
export const facilityDetailResponse = envelope => detailResponse(envelope)
  && object(envelope.meta) && typeof envelope.meta.server_time === 'string'
  && ['gallery', 'amenities', 'courts', 'price_rules'].every(key => Array.isArray(envelope.data[key]));
export const availabilityResponse = envelope => detailResponse(envelope)
  && object(envelope.meta) && typeof envelope.meta.server_time === 'string'
  && Array.isArray(envelope.data.slots);
export const bookingDetailResponse = envelope => detailResponse(envelope)
  && object(envelope.meta) && instant(envelope.meta.server_time)
  && /^\d+$/.test(String(envelope.data.id ?? '')) && bookingStatuses.has(envelope.data.status)
  && [1,2].includes(envelope.data.booking_flow_version)
  && instant(envelope.data.expires_at)
  && (envelope.data.booking_flow_version === 1
    ? envelope.data.confirmation_expires_at === null
    : instant(envelope.data.confirmation_expires_at))
  && (envelope.data.booking_flow_version === 1
    ? (!Object.hasOwn(envelope.data, 'transfer_reference') || envelope.data.transfer_reference === null)
    : envelope.data.transfer_reference === `CLDN ${envelope.data.id}`)
  && (envelope.data.confirmed_by_user_id === null || positiveId(envelope.data.confirmed_by_user_id))
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
export const ownerBookingCancellationResponse = expectedAmount => envelope => object(envelope) && object(envelope.meta) && instant(envelope.meta.server_time)
  && exactFields(envelope.data, new Set(['booking','refund'])) && exactFields(envelope.data.booking, cancellationBookingFields)
  && /^\d+$/.test(envelope.data.booking.id) && envelope.data.booking.status === 'CANCELLED'
  && envelope.data.booking.cancelled_by === 'OWNER'
  && typeof envelope.data.booking.cancellation_reason === 'string'
  && envelope.data.booking.cancellation_reason.trim().length > 0
  && [...envelope.data.booking.cancellation_reason].length <= 500
  && instant(envelope.data.booking.cancelled_at)
  && exactFields(envelope.data.refund, cancellationRefundFields)
  && /^\d+$/.test(envelope.data.refund.id) && envelope.data.refund.booking_id === envelope.data.booking.id
  && money(envelope.data.refund.amount) && envelope.data.refund.amount === expectedAmount
  && envelope.data.refund.status === 'PENDING' && instant(envelope.data.refund.requested_at);
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
export const bookingCreateResponse = bookingDetailResponse;
const ownerBookingDetailFields = new Set(['id','status','booking_flow_version','transfer_reference','start_at','end_at','total_amount','deposit_amount','created_at','customer','facility','court','payment_proof','refund','remaining_amount','confirmation_expires_at','confirmed_at','confirmed_by_user_id','rejected_at','rejection_reason','cancelled_at','cancelled_by','cancellation_reason','slots']);
const ownerBookingParty = (value, withPhone = false) => exactFields(value, new Set(withPhone ? ['id','full_name','phone'] : ['id','name']))
  && /^[1-9]\d*$/.test(String(value.id))
  && typeof (withPhone ? value.full_name : value.name) === 'string'
  && (withPhone ? value.full_name : value.name).trim().length > 0
  && (!withPhone || value.phone === null || typeof value.phone === 'string');
const ownerPaymentProofSummary = value => value === null || (exactFields(value, new Set(['id','status','submitted_at','reviewed_at','rejection_reason']))
  && /^[1-9]\d*$/.test(String(value.id)) && ['SUBMITTED','APPROVED','REJECTED'].includes(value.status)
  && instant(value.submitted_at) && nullableInstant(value.reviewed_at)
  && (value.rejection_reason === null || typeof value.rejection_reason === 'string')
  && (value.status === 'SUBMITTED' ? value.reviewed_at === null && value.rejection_reason === null
    : value.status === 'APPROVED' ? value.reviewed_at !== null && value.rejection_reason === null
      : value.reviewed_at !== null && typeof value.rejection_reason === 'string' && value.rejection_reason.trim().length > 0));
const ownerSlot = value => exactFields(value, new Set(['start_at','end_at','hourly_rate_snapshot','slot_amount']))
  && instant(value.start_at) && instant(value.end_at) && Date.parse(value.end_at) > Date.parse(value.start_at)
  && money(value.hourly_rate_snapshot) && money(value.slot_amount);
export const ownerBookingDetailResponse = envelope => object(envelope) && object(envelope.meta) && instant(envelope.meta.server_time)
  && exactFields(envelope.data, ownerBookingDetailFields)
  && /^[1-9]\d*$/.test(String(envelope.data.id)) && bookingStatuses.has(envelope.data.status)
  && [1,2].includes(envelope.data.booking_flow_version)
  && (envelope.data.booking_flow_version === 1
    ? envelope.data.confirmation_expires_at === null
    : instant(envelope.data.confirmation_expires_at))
  && (envelope.data.booking_flow_version === 1
    ? envelope.data.transfer_reference === null
    : envelope.data.transfer_reference === `CLDN ${envelope.data.id}`)
  && (envelope.data.confirmed_by_user_id === null || positiveId(envelope.data.confirmed_by_user_id))
  && instant(envelope.data.start_at) && instant(envelope.data.end_at) && instant(envelope.data.created_at)
  && ['total_amount','deposit_amount','remaining_amount'].every(key => money(envelope.data[key]))
  && ownerBookingParty(envelope.data.customer, true) && ownerBookingParty(envelope.data.facility) && ownerBookingParty(envelope.data.court)
  && ownerPaymentProofSummary(envelope.data.payment_proof)
  && ['confirmed_at','rejected_at','cancelled_at'].every(key => nullableInstant(envelope.data[key]))
  && ['rejection_reason','cancellation_reason'].every(key => envelope.data[key] === null || typeof envelope.data[key] === 'string')
  && (envelope.data.cancelled_by === null || ['CUSTOMER','OWNER'].includes(envelope.data.cancelled_by))
  && Array.isArray(envelope.data.slots) && envelope.data.slots.every(ownerSlot)
  && (envelope.data.refund === null || (refundSummary(envelope.data.refund) && envelope.data.refund.booking_id === String(envelope.data.id)));
const ownerV2ActionBookingFields = new Set(['id','status','confirmed_at','confirmed_by_user_id','rejected_at','rejection_reason']);
export const ownerV2BookingActionResponse = expectedId => envelope => object(envelope) && object(envelope.meta) && instant(envelope.meta.server_time)
  && exactFields(envelope.data, new Set(['booking'])) && exactFields(envelope.data.booking, ownerV2ActionBookingFields)
  && String(envelope.data.booking.id) === String(expectedId)
  && ['CONFIRMED','REJECTED'].includes(envelope.data.booking.status)
  && nullableInstant(envelope.data.booking.confirmed_at) && nullableInstant(envelope.data.booking.rejected_at)
  && (envelope.data.booking.confirmed_by_user_id === null || positiveId(envelope.data.booking.confirmed_by_user_id))
  && (envelope.data.booking.rejection_reason === null || typeof envelope.data.booking.rejection_reason === 'string')
  && (envelope.data.booking.status === 'CONFIRMED'
    ? envelope.data.booking.confirmed_at !== null && envelope.data.booking.confirmed_by_user_id !== null && envelope.data.booking.rejected_at === null && envelope.data.booking.rejection_reason === null
    : envelope.data.booking.confirmed_at === null && envelope.data.booking.confirmed_by_user_id === null && envelope.data.booking.rejected_at !== null && typeof envelope.data.booking.rejection_reason === 'string' && envelope.data.booking.rejection_reason.trim().length > 0);
const ownerProofDetailFields = new Set(['id','status','submitted_at','reviewed_at','rejection_reason','proof_image_url','proof_image_expires_at','booking','customer','facility','court']);
const ownerProofBookingFields = new Set(['id','status','start_at','end_at','total_amount','deposit_amount','remaining_amount']);
export const ownerPaymentProofDetailResponse = (expectedProofId, expectedBookingId) => envelope => object(envelope) && object(envelope.meta) && instant(envelope.meta.server_time)
  && exactFields(envelope.data, ownerProofDetailFields)
  && ownerPaymentProofSummary(Object.fromEntries(['id','status','submitted_at','reviewed_at','rejection_reason'].map(key => [key,envelope.data[key]])))
  && String(envelope.data.id) === String(expectedProofId)
  && url(envelope.data.proof_image_url) && instant(envelope.data.proof_image_expires_at)
  && Date.parse(envelope.data.proof_image_expires_at) > Date.parse(envelope.meta.server_time)
  && exactFields(envelope.data.booking, ownerProofBookingFields)
  && /^[1-9]\d*$/.test(String(envelope.data.booking.id)) && String(envelope.data.booking.id) === String(expectedBookingId)
  && bookingStatuses.has(envelope.data.booking.status)
  && instant(envelope.data.booking.start_at) && instant(envelope.data.booking.end_at)
  && ['total_amount','deposit_amount','remaining_amount'].every(key => money(envelope.data.booking[key]))
  && ownerBookingParty(envelope.data.customer, true) && ownerBookingParty(envelope.data.facility) && ownerBookingParty(envelope.data.court);
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

const profileFields = new Set(['id','full_name','email','phone','capabilities','has_local_password']);
const profileCapabilities = new Set(['CUSTOMER','OWNER','ADMIN']);
export const profileResponse = envelope => exactFields(envelope, envelopeFields)
  && exactFields(envelope.meta, detailMetaFields) && instant(envelope.meta.server_time)
  && exactFields(envelope.data, profileFields)
  && /^[1-9]\d*$/.test(String(envelope.data.id))
  && typeof envelope.data.full_name === 'string' && envelope.data.full_name.trim().length > 0
  && [...envelope.data.full_name].length <= 150
  && typeof envelope.data.email === 'string' && envelope.data.email.length > 0
  && (envelope.data.phone === null || (typeof envelope.data.phone === 'string' && [...envelope.data.phone].length <= 30))
  && Array.isArray(envelope.data.capabilities) && envelope.data.capabilities.length > 0
  && new Set(envelope.data.capabilities).size === envelope.data.capabilities.length
  && envelope.data.capabilities.every(value => profileCapabilities.has(value))
  && typeof envelope.data.has_local_password === 'boolean';
export const changePasswordResponse = envelope => exactFields(envelope, envelopeFields)
  && exactFields(envelope.data, new Set(['message']))
  && envelope.data.message === 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.'
  && object(envelope.meta) && instant(envelope.meta.server_time);

const seriesStatuses = new Set(['PENDING_CONFIRMATION','CONFIRMED','REJECTED','EXPIRED']);
const seriesFields = new Set(['id','status','weekday','start_date','end_date','start_time','end_time','occurrence_count','total_amount','deposit_amount','remaining_amount','confirmation_expires_at','transfer_reference','created_at','facility','court','bank','confirmed_at','confirmed_by_user_id','rejected_at','rejection_reason','occurrences']);
const seriesCustomerFields = new Set(['full_name','phone']);
const seriesPlaceFields = new Set(['id','name','address']);
const seriesCourtFields = new Set(['id','name']);
const seriesBankFields = new Set(['bank_name','account_number','account_holder','has_qr_image','qr_image_url','qr_image_expires_at']);
const seriesOccurrenceFields = new Set(['booking_id','start_at','end_at','total_amount','deposit_amount','remaining_amount','status','can_cancel','cancellation_deadline','cancellation_block_reason','cancelled_at','cancelled_by','cancellation_reason','refund']);
const seriesRefundFields = new Set(['id','booking_id','amount','status','reason','requested_at','proof_submitted_at','confirmed_at','refunded_at']);
const seriesRefund = value => value === null || (exactFields(value,seriesRefundFields) && positiveId(value.id) && positiveId(value.booking_id)
  && money(value.amount) && ['PENDING','PROOF_SUBMITTED','REFUNDED'].includes(value.status) && typeof value.reason === 'string'
  && instant(value.requested_at) && ['proof_submitted_at','confirmed_at','refunded_at'].every(key=>value[key]===null||instant(value[key]))
  && (value.status==='PENDING' ? value.proof_submitted_at===null&&value.confirmed_at===null&&value.refunded_at===null
    : value.status==='PROOF_SUBMITTED' ? value.proof_submitted_at!==null&&value.confirmed_at===null&&value.refunded_at===null
      : value.proof_submitted_at!==null&&value.confirmed_at!==null&&value.refunded_at!==null&&value.confirmed_at===value.refunded_at));
const seriesOccurrence = value => exactFields(value, seriesOccurrenceFields)
  && positiveId(value.booking_id) && instant(value.start_at) && instant(value.end_at)
  && Date.parse(value.start_at) < Date.parse(value.end_at)
  && ['total_amount','deposit_amount','remaining_amount'].every(key => money(value[key]))
  && bookingStatuses.has(value.status) && typeof value.can_cancel === 'boolean'
  && (value.cancellation_deadline===null||instant(value.cancellation_deadline))
  && (value.cancellation_block_reason===null||['INVALID_BOOKING_STATE','CANCELLATION_POLICY_NOT_CONFIGURED','CANCELLATION_DEADLINE_PASSED'].includes(value.cancellation_block_reason))
  && (value.cancelled_at===null||instant(value.cancelled_at)) && (value.cancelled_by===null||['CUSTOMER','OWNER'].includes(value.cancelled_by))
  && (value.cancellation_reason===null||typeof value.cancellation_reason==='string') && seriesRefund(value.refund)
  && (!value.can_cancel || (value.status==='CONFIRMED' && value.cancellation_deadline!==null && value.cancellation_block_reason===null && value.refund===null))
  && (value.status==='CANCELLED'
    ? value.can_cancel===false && value.cancelled_at!==null && ['CUSTOMER','OWNER'].includes(value.cancelled_by) && value.refund!==null
      && String(value.refund.booking_id)===String(value.booking_id) && value.refund.amount===value.deposit_amount
    : value.cancelled_at===null && value.cancelled_by===null && value.cancellation_reason===null && value.refund===null);
const seriesCore = (value, { customer = false } = {}) => {
  const expected = customer ? new Set([...seriesFields,'customer']) : seriesFields;
  if (!exactFields(value, expected) || !positiveId(value.id) || !seriesStatuses.has(value.status)
      || !Number.isInteger(value.weekday) || value.weekday < 1 || value.weekday > 7
      || !/^\d{4}-\d{2}-\d{2}$/.test(value.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(value.end_date)
      || !/^([01]\d|2[0-3]):(?:00|30)$/.test(value.start_time) || !/^([01]\d|2[0-3]):(?:00|30)$/.test(value.end_time)
      || !Number.isInteger(value.occurrence_count) || value.occurrence_count < 1 || value.occurrence_count > 14
      || !['total_amount','deposit_amount','remaining_amount'].every(key => money(value[key]))
      || !instant(value.confirmation_expires_at) || value.transfer_reference !== `CLDNS ${value.id}` || !instant(value.created_at)
      || !exactFields(value.facility, seriesPlaceFields) || !positiveId(value.facility.id)
      || typeof value.facility.name !== 'string' || !value.facility.name.trim() || typeof value.facility.address !== 'string' || !value.facility.address.trim()
      || !exactFields(value.court, seriesCourtFields) || !positiveId(value.court.id) || typeof value.court.name !== 'string' || !value.court.name.trim()
      || !exactFields(value.bank, seriesBankFields) || !['bank_name','account_number','account_holder'].every(key => typeof value.bank[key] === 'string' && value.bank[key].length > 0)
      || typeof value.bank.has_qr_image !== 'boolean'
      || (value.bank.qr_image_url !== null && !url(value.bank.qr_image_url))
      || (value.bank.qr_image_expires_at !== null && !instant(value.bank.qr_image_expires_at))
      || (value.confirmed_at !== null && !instant(value.confirmed_at))
      || (value.confirmed_by_user_id !== null && !positiveId(value.confirmed_by_user_id))
      || (value.rejected_at !== null && !instant(value.rejected_at))
      || (value.rejection_reason !== null && typeof value.rejection_reason !== 'string')
      || !Array.isArray(value.occurrences) || !value.occurrences.every(seriesOccurrence)) return false;
  const pending = value.status === 'PENDING_CONFIRMATION'
    && value.confirmed_at === null && value.confirmed_by_user_id === null
    && value.rejected_at === null && value.rejection_reason === null;
  const confirmed = value.status === 'CONFIRMED'
    && instant(value.confirmed_at) && positiveId(value.confirmed_by_user_id)
    && value.rejected_at === null && value.rejection_reason === null;
  const rejected = value.status === 'REJECTED'
    && value.confirmed_at === null && value.confirmed_by_user_id === null
    && instant(value.rejected_at) && typeof value.rejection_reason === 'string'
    && value.rejection_reason.trim().length > 0 && [...value.rejection_reason].length <= 500;
  const expired = value.status === 'EXPIRED'
    && value.confirmed_at === null && value.confirmed_by_user_id === null
    && value.rejected_at === null && value.rejection_reason === null;
  if (!(pending || confirmed || rejected || expired)) return false;
  const allowedChildren=value.status==='CONFIRMED'?new Set(['CONFIRMED','CANCELLED','COMPLETED']):new Set([value.status]);
  if (value.occurrences.length > 0 && !value.occurrences.every(item => allowedChildren.has(item.status))) return false;
  return !customer || (exactFields(value.customer, seriesCustomerFields)
    && typeof value.customer.full_name === 'string' && value.customer.full_name.trim().length > 0
    && (value.customer.phone === null || typeof value.customer.phone === 'string'));
};
const seriesEnvelope = (envelope, options) => exactFields(envelope, envelopeFields)
  && exactFields(envelope.meta, detailMetaFields) && instant(envelope.meta.server_time)
  && seriesCore(envelope.data, options);
export const recurringCreateResponse = envelope => seriesEnvelope(envelope)
  && envelope.data.status === 'PENDING_CONFIRMATION'
  && envelope.data.occurrences.length === envelope.data.occurrence_count;
export const customerSeriesDetailResponse = envelope => seriesEnvelope(envelope)
  && envelope.data.occurrences.length === envelope.data.occurrence_count;
export const ownerSeriesDetailResponse = envelope => seriesEnvelope(envelope, { customer:true }) && envelope.data.occurrences.length === envelope.data.occurrence_count;
export const ownerSeriesActionResponse = expectedStatus => envelope => seriesEnvelope(envelope)
  && envelope.data.status === expectedStatus
  && envelope.data.occurrences.length === envelope.data.occurrence_count;
const recurringCancelOccurrenceFields = new Set(['series','occurrence']);
const recurringCancelSeriesFields = new Set(['id','status']);
export const recurringOccurrenceCancellationResponse = (seriesId,bookingId,depositAmount) => envelope => exactFields(envelope,envelopeFields)
  && exactFields(envelope.meta,detailMetaFields) && instant(envelope.meta.server_time)
  && exactFields(envelope.data,recurringCancelOccurrenceFields)
  && exactFields(envelope.data.series,recurringCancelSeriesFields)
  && String(envelope.data.series.id)===String(seriesId) && envelope.data.series.status==='CONFIRMED'
  && seriesOccurrence(envelope.data.occurrence)
  && String(envelope.data.occurrence.booking_id)===String(bookingId)
  && envelope.data.occurrence.status==='CANCELLED'
  && envelope.data.occurrence.cancelled_by==='CUSTOMER'
  && envelope.data.occurrence.refund?.status==='PENDING'
  && envelope.data.occurrence.refund?.amount===String(depositAmount);
export const customerSeriesListResponse = envelope => exactFields(envelope, envelopeFields)
  && exactFields(envelope.meta, listMetaFields) && pagination(envelope.meta) && instant(envelope.meta.server_time)
  && Array.isArray(envelope.data) && envelope.data.every(value => seriesCore(value) && value.occurrences.length === 0);
export const ownerSeriesListResponse = envelope => exactFields(envelope, envelopeFields)
  && exactFields(envelope.meta, listMetaFields) && pagination(envelope.meta) && instant(envelope.meta.server_time)
  && Array.isArray(envelope.data) && envelope.data.every(value => seriesCore(value,{customer:true}) && value.occurrences.length === 0);

const analyticsRangeFields = new Set(['from','to','timezone','facility_id']);
const analyticsSummaryFields = new Set(['confirmed_booking_count','completed_booking_count','cancelled_booking_count','confirmed_hours','confirmed_booking_value','confirmed_deposit_amount','refunded_deposit_amount','net_known_deposit_amount','operational_capacity_slots','confirmed_occupied_slots','utilization_rate']);
const analyticsMonthFields = new Set(['month','confirmed_count','cancelled_count','confirmed_booking_value']);
const analyticsWeekdayFields = new Set(['weekday','confirmed_count','occupied_slots','capacity_slots','utilization_rate']);
const analyticsHeatFields = new Set(['weekday','start_time','occupied_slots','capacity_slots','blocked_slots','available_slots','utilization_rate']);
const analyticsDayFields = new Set(['date','capacity_slots','occupied_slots','blocked_slots','available_slots']);
const analyticsOverviewFields = new Set(['range','summary','monthly_trend','weekday_usage','hourly_heatmap','daily_capacity']);
const analyticsCourtFields = new Set(['court_id','court_name','facility_id','facility_name','confirmed_booking_count','confirmed_hours','confirmed_booking_value','capacity_slots','occupied_slots','blocked_slots','available_slots','utilization_rate']);
const nonNegativeInteger = value => Number.isInteger(value) && value >= 0;
const decimal = value => typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value);
const utilization = value => value === null || (decimal(value) && Number(value) >= 0 && Number(value) <= 100);
const analyticsCapacity = value => ['capacity_slots','occupied_slots','blocked_slots','available_slots'].every(key => nonNegativeInteger(value[key]));
export const ownerAnalyticsOverviewResponse = envelope => exactFields(envelope,envelopeFields)
  && exactFields(envelope.meta,detailMetaFields) && instant(envelope.meta.server_time)
  && exactFields(envelope.data,analyticsOverviewFields)
  && exactFields(envelope.data.range,analyticsRangeFields)
  && /^\d{4}-\d{2}-\d{2}$/.test(envelope.data.range.from) && /^\d{4}-\d{2}-\d{2}$/.test(envelope.data.range.to)
  && envelope.data.range.timezone === 'Asia/Ho_Chi_Minh' && (envelope.data.range.facility_id === null || positiveId(envelope.data.range.facility_id))
  && exactFields(envelope.data.summary,analyticsSummaryFields)
  && ['confirmed_booking_count','completed_booking_count','cancelled_booking_count','operational_capacity_slots','confirmed_occupied_slots'].every(key => nonNegativeInteger(envelope.data.summary[key]))
  && ['confirmed_hours','confirmed_booking_value','confirmed_deposit_amount','refunded_deposit_amount','net_known_deposit_amount'].every(key => decimal(envelope.data.summary[key]))
  && utilization(envelope.data.summary.utilization_rate)
  && Array.isArray(envelope.data.monthly_trend) && envelope.data.monthly_trend.every(value => exactFields(value,analyticsMonthFields) && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value.month) && nonNegativeInteger(value.confirmed_count) && nonNegativeInteger(value.cancelled_count) && decimal(value.confirmed_booking_value))
  && Array.isArray(envelope.data.weekday_usage) && envelope.data.weekday_usage.every(value => exactFields(value,analyticsWeekdayFields) && Number.isInteger(value.weekday) && value.weekday>=1 && value.weekday<=7 && nonNegativeInteger(value.confirmed_count) && nonNegativeInteger(value.occupied_slots) && nonNegativeInteger(value.capacity_slots) && utilization(value.utilization_rate))
  && Array.isArray(envelope.data.hourly_heatmap) && envelope.data.hourly_heatmap.every(value => exactFields(value,analyticsHeatFields) && Number.isInteger(value.weekday) && value.weekday>=1 && value.weekday<=7 && /^([01]\d|2[0-3]):(?:00|30)$/.test(value.start_time) && analyticsCapacity(value) && utilization(value.utilization_rate))
  && Array.isArray(envelope.data.daily_capacity) && envelope.data.daily_capacity.every(value => exactFields(value,analyticsDayFields) && /^\d{4}-\d{2}-\d{2}$/.test(value.date) && analyticsCapacity(value));
export const ownerAnalyticsCourtsResponse = envelope => exactFields(envelope,envelopeFields)
  && exactFields(envelope.meta,listMetaFields) && pagination(envelope.meta) && instant(envelope.meta.server_time)
  && Array.isArray(envelope.data) && envelope.data.every(value => exactFields(value,analyticsCourtFields)
    && positiveId(value.court_id) && positiveId(value.facility_id)
    && typeof value.court_name === 'string' && value.court_name.trim().length > 0
    && typeof value.facility_name === 'string' && value.facility_name.trim().length > 0
    && nonNegativeInteger(value.confirmed_booking_count) && decimal(value.confirmed_hours) && decimal(value.confirmed_booking_value)
    && analyticsCapacity(value) && utilization(value.utilization_rate));
