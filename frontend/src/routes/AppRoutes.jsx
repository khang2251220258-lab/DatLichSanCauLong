import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router';
import { GuestOnly, RequireAuth } from '../features/auth/guards';
import { BookingDraftProvider } from '../features/bookings/draft';
import { AuthLayout } from '../features/auth/AuthUI';

const route = (loader, name) => lazy(() => loader().then(module => ({ default: module[name] })));
const Home = lazy(() => import('../App'));
const FacilityList = route(() => import('../features/facilities/FacilityList'), 'FacilityList');
const FacilityDetail = route(() => import('../features/facilities/FacilityDetail'), 'FacilityDetail');
const BookingConfirm = route(() => import('../features/bookings/BookingConfirm'), 'BookingConfirm');
const BookingList = route(() => import('../features/bookings/BookingList'), 'BookingList');
const BookingDetail = route(() => import('../features/bookings/BookingDetail'), 'BookingDetail');
const PaymentPage = route(() => import('../features/payments/PaymentPage'), 'PaymentPage');
const OwnerBookingList = route(() => import('../features/owner/OwnerPages'), 'OwnerBookingList');
const OwnerBookingDetail = route(() => import('../features/owner/OwnerPages'), 'OwnerBookingDetail');
const OwnerFacilityList = route(() => import('../features/owner/OwnerFacilityPages'), 'OwnerFacilityList');
const OwnerFacilityCreate = route(() => import('../features/owner/OwnerFacilityPages'), 'OwnerFacilityCreate');
const OwnerFacilityDetail = route(() => import('../features/owner/OwnerFacilityPages'), 'OwnerFacilityDetail');
const OwnerFacilityEdit = route(() => import('../features/owner/OwnerFacilityPages'), 'OwnerFacilityEdit');
const OwnerCourtList = route(() => import('../features/owner/OwnerFacilityPages'), 'OwnerCourtList');
const OwnerCourtCreate = route(() => import('../features/owner/OwnerFacilityPages'), 'OwnerCourtCreate');
const OwnerCourtEdit = route(() => import('../features/owner/OwnerFacilityPages'), 'OwnerCourtEdit');
const OwnerPricing = route(() => import('../features/owner/OwnerFacilityPages'), 'OwnerPricing');
const OwnerBankAccount = route(() => import('../features/owner/OwnerBankAccount'), 'OwnerBankAccount');
const OwnerFacilityPresentation = route(() => import('../features/owner/OwnerFacilityPresentation'), 'OwnerFacilityPresentation');
const OwnerCancellationPolicy = route(() => import('../features/owner/OwnerCancellationPolicy'), 'OwnerCancellationPolicy');
const OwnerAnalytics = route(() => import('../features/owner/OwnerAnalytics'), 'OwnerAnalytics');
const AdminFacilityList = route(() => import('../features/admin/AdminFacilityPages'), 'AdminFacilityList');
const AdminFacilityDetail = route(() => import('../features/admin/AdminFacilityPages'), 'AdminFacilityDetail');
const CustomerOwnerRequest = route(() => import('../features/ownerRequests/OwnerRequestPages'), 'CustomerOwnerRequest');
const AdminOwnerRequestList = route(() => import('../features/ownerRequests/OwnerRequestPages'), 'AdminOwnerRequestList');
const AdminOwnerRequestDetail = route(() => import('../features/ownerRequests/OwnerRequestPages'), 'AdminOwnerRequestDetail');
const AdminAmenityCatalog = route(() => import('../features/admin/AdminAmenityCatalog'), 'AdminAmenityCatalog');
const LoginPage = route(() => import('../features/auth/AuthPages'), 'LoginPage');
const RegisterPage = route(() => import('../features/auth/AuthPages'), 'RegisterPage');
const ForgotPage = route(() => import('../features/auth/AuthPages'), 'ForgotPage');
const ResetPage = route(() => import('../features/auth/AuthPages'), 'ResetPage');
const ProfilePage = route(() => import('../features/profile/ProfilePage'), 'ProfilePage');
const RecurringConfirm = route(() => import('../features/recurring/RecurringPages'), 'RecurringConfirm');
const CustomerSeriesList = route(() => import('../features/recurring/RecurringPages'), 'CustomerSeriesList');
const CustomerSeriesDetail = route(() => import('../features/recurring/RecurringPages'), 'CustomerSeriesDetail');
const OwnerSeriesList = route(() => import('../features/recurring/RecurringPages'), 'OwnerSeriesList');
const OwnerSeriesDetail = route(() => import('../features/recurring/RecurringPages'), 'OwnerSeriesDetail');

export function RouteLoading() {
  return <main className="route-loading" aria-busy="true"><p role="status">Đang mở trang…</p></main>;
}

export function AppRoutes({ tokenVault }) {
  return <BookingDraftProvider><Suspense fallback={<RouteLoading/>}><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/facilities" element={<FacilityList />} />
    <Route path="/facilities/:facility_id" element={<FacilityDetail />} />
    <Route path="/facilities/:facility_id/booking-confirm" element={<RequireAuth capability="CUSTOMER"><BookingConfirm /></RequireAuth>} />
    <Route path="/facilities/:facility_id/recurring-confirm" element={<RequireAuth capability="CUSTOMER"><RecurringConfirm /></RequireAuth>} />
    <Route path="/bookings" element={<RequireAuth capability="CUSTOMER"><BookingList /></RequireAuth>} />
    <Route path="/booking-series" element={<RequireAuth capability="CUSTOMER"><CustomerSeriesList /></RequireAuth>} />
    <Route path="/booking-series/:series_id" element={<RequireAuth capability="CUSTOMER"><CustomerSeriesDetail /></RequireAuth>} />
    <Route path="/bookings/:id" element={<RequireAuth capability="CUSTOMER"><BookingDetail /></RequireAuth>} />
    <Route path="/bookings/:id/payment" element={<RequireAuth capability="CUSTOMER"><PaymentPage /></RequireAuth>} />
    <Route path="/owner/bookings" element={<RequireAuth capability="OWNER"><OwnerBookingList /></RequireAuth>} />
    <Route path="/owner/bookings/:booking_id" element={<RequireAuth capability="OWNER"><OwnerBookingDetail /></RequireAuth>} />
    <Route path="/owner/booking-series" element={<RequireAuth capability="OWNER"><OwnerSeriesList /></RequireAuth>} />
    <Route path="/owner/booking-series/:series_id" element={<RequireAuth capability="OWNER"><OwnerSeriesDetail /></RequireAuth>} />
    <Route path="/owner/facilities" element={<RequireAuth capability="OWNER"><OwnerFacilityList /></RequireAuth>} />
    <Route path="/owner/facilities/new" element={<RequireAuth capability="OWNER"><OwnerFacilityCreate /></RequireAuth>} />
    <Route path="/owner/facilities/:facility_id" element={<RequireAuth capability="OWNER"><OwnerFacilityDetail /></RequireAuth>} />
    <Route path="/owner/facilities/:facility_id/edit" element={<RequireAuth capability="OWNER"><OwnerFacilityEdit /></RequireAuth>} />
    <Route path="/owner/facilities/:facility_id/courts" element={<RequireAuth capability="OWNER"><OwnerCourtList /></RequireAuth>} />
    <Route path="/owner/facilities/:facility_id/courts/new" element={<RequireAuth capability="OWNER"><OwnerCourtCreate /></RequireAuth>} />
    <Route path="/owner/courts/:court_id/edit" element={<RequireAuth capability="OWNER"><OwnerCourtEdit /></RequireAuth>} />
    <Route path="/owner/facilities/:facility_id/pricing" element={<RequireAuth capability="OWNER"><OwnerPricing /></RequireAuth>} />
    <Route path="/owner/facilities/:facility_id/bank-account" element={<RequireAuth capability="OWNER"><OwnerBankAccount /></RequireAuth>} />
    <Route path="/owner/facilities/:facility_id/images-amenities" element={<RequireAuth capability="OWNER"><OwnerFacilityPresentation /></RequireAuth>} />
    <Route path="/owner/facilities/:facility_id/cancellation-policy" element={<RequireAuth capability="OWNER"><OwnerCancellationPolicy /></RequireAuth>} />
    <Route path="/owner/analytics" element={<RequireAuth capability="OWNER"><OwnerAnalytics /></RequireAuth>} />
    <Route path="/admin/facilities" element={<RequireAuth capability="ADMIN"><AdminFacilityList /></RequireAuth>} />
    <Route path="/admin/facilities/:facility_id" element={<RequireAuth capability="ADMIN"><AdminFacilityDetail /></RequireAuth>} />
    <Route path="/owner-request" element={<RequireAuth capability="CUSTOMER"><CustomerOwnerRequest /></RequireAuth>} />
    <Route path="/admin/owner-requests" element={<RequireAuth capability="ADMIN"><AdminOwnerRequestList /></RequireAuth>} />
    <Route path="/admin/owner-requests/:request_id" element={<RequireAuth capability="ADMIN"><AdminOwnerRequestDetail /></RequireAuth>} />
    <Route path="/admin/amenities" element={<RequireAuth capability="ADMIN"><AdminAmenityCatalog /></RequireAuth>} />
    <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
    <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
    <Route path="/forgot-password" element={<GuestOnly><ForgotPage /></GuestOnly>} />
    <Route path="/reset-password" element={<ResetPage tokenVault={tokenVault} />} />
    <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
    <Route path="*" element={<AuthLayout title="Không tìm thấy trang"><Link to="/login">Về đăng nhập</Link></AuthLayout>} />
  </Routes></Suspense></BookingDraftProvider>;
}
