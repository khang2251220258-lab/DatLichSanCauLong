export const BOOKING_FLOW_V1 = 1;
export const BOOKING_FLOW_V2 = 2;

export const bookingDomainConfig = Object.freeze({
  confirmationHoldMinutes: 30,
});

export function bookingFlowVersion(value, { required = false } = {}) {
  if (required && (value === undefined || value === null || value === '')) {
    throw new Error('BOOKING_FLOW_VERSION_REQUIRED');
  }
  const parsed = Number(value ?? BOOKING_FLOW_V1);
  if (![BOOKING_FLOW_V1, BOOKING_FLOW_V2].includes(parsed)) {
    throw new Error('BOOKING_FLOW_VERSION must be 1 or 2');
  }
  return parsed;
}
