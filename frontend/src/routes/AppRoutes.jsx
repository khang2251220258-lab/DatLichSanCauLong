import { Link, Route, Routes } from 'react-router';
import App from '../App';
import { FacilityList } from '../features/facilities/FacilityList';
import { FacilityDetail } from '../features/facilities/FacilityDetail';
import { LoginPage, RegisterPage, ForgotPage, ResetPage } from '../features/auth/AuthPages';
import { GuestOnly, RequireAuth } from '../features/auth/guards';
import { BookingDraftProvider } from '../features/bookings/draft';
import { BookingConfirm } from '../features/bookings/BookingConfirm';
import { BookingList } from '../features/bookings/BookingList';
import { BookingDetail } from '../features/bookings/BookingDetail';
import { PaymentPage } from '../features/payments/PaymentPage';
import { OwnerBookingList, OwnerBookingDetail } from '../features/owner/OwnerPages';
import { OwnerCourtCreate, OwnerCourtEdit, OwnerCourtList, OwnerFacilityCreate, OwnerFacilityDetail, OwnerFacilityEdit, OwnerFacilityList, OwnerPricing } from '../features/owner/OwnerFacilityPages';
import { AdminFacilityDetail, AdminFacilityList } from '../features/admin/AdminFacilityPages';
import { OwnerBankAccount } from '../features/owner/OwnerBankAccount';
import { OwnerFacilityPresentation } from '../features/owner/OwnerFacilityPresentation';
import { OwnerCancellationPolicy } from '../features/owner/OwnerCancellationPolicy';
import { CustomerOwnerRequest, AdminOwnerRequestList, AdminOwnerRequestDetail } from '../features/ownerRequests/OwnerRequestPages';
import { AdminAmenityCatalog } from '../features/admin/AdminAmenityCatalog';
import { AuthLayout } from '../features/auth/AuthUI';
export function AppRoutes({ tokenVault }) {
  return <BookingDraftProvider><Routes>
    <Route path="/" element={<App />} />
    <Route path="/facilities" element={<FacilityList />} />
    <Route path="/facilities/:facility_id" element={<FacilityDetail />} />
    <Route path="/facilities/:facility_id/booking-confirm" element={<RequireAuth capability="CUSTOMER"><BookingConfirm /></RequireAuth>} />
    <Route path="/bookings" element={<RequireAuth capability="CUSTOMER"><BookingList /></RequireAuth>} />
    <Route path="/bookings/:id" element={<RequireAuth capability="CUSTOMER"><BookingDetail /></RequireAuth>} />
    <Route path="/bookings/:id/payment" element={<RequireAuth capability="CUSTOMER"><PaymentPage /></RequireAuth>} />
    <Route path="/owner/bookings" element={<RequireAuth capability="OWNER"><OwnerBookingList /></RequireAuth>} />
    <Route path="/owner/bookings/:booking_id" element={<RequireAuth capability="OWNER"><OwnerBookingDetail /></RequireAuth>} />
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
    <Route path="*" element={<AuthLayout title="Không tìm thấy trang"><Link to="/login">Về đăng nhập</Link></AuthLayout>} />
  </Routes></BookingDraftProvider>;
}
