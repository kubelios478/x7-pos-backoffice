import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MerchantFrame } from './components/MerchantFrame/MerchantFrame';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ResetPasswordSuccessPage } from './pages/ResetPasswordSuccessPage';
import SaaSFrame from './components/SaaSFrame/SaaSFrame';
import { CompanyStepPage } from './pages/onboarding/CompanyStepPage';
import { MerchantStepPage } from './pages/onboarding/MerchantStepPage';
import { OnboardingRoutes } from './pages/onboarding/OnboardingRoutes';
import { SubscriptionStepPage } from './pages/onboarding/SubscriptionStepPage';
import { UserStepPage } from './pages/onboarding/UserStepPage';
import { isAuthenticated } from './lib/auth-storage';

function RootRedirect() {
  return (
    <Navigate replace to={isAuthenticated() ? '/dashboard' : '/login'} />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/reset-password/success"
          element={<ResetPasswordSuccessPage />}
        />
        <Route element={<OnboardingRoutes />}>
          <Route path="/register" element={<SubscriptionStepPage />} />
          <Route path="/register/company" element={<CompanyStepPage />} />
          <Route path="/register/merchant" element={<MerchantStepPage />} />
          <Route path="/register/user" element={<UserStepPage />} />
        </Route>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <MerchantFrame />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/products"
          element={
            <ProtectedRoute>
              <MerchantFrame />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/categories"
          element={
            <ProtectedRoute>
              <MerchantFrame />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/company-configurations"
          element={
            <ProtectedRoute>
              <MerchantFrame />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/company-profile"
          element={
            <ProtectedRoute>
              <MerchantFrame />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/merchants"
          element={
            <ProtectedRoute>
              <MerchantFrame />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/users"
          element={
            <ProtectedRoute>
              <MerchantFrame />
            </ProtectedRoute>
          }
        />
        <Route
          path="/legal/privacy-policy"
          element={
            <ProtectedRoute>
              <MerchantFrame />
            </ProtectedRoute>
          }
        />
        <Route
          path="/legal/terms-of-service"
          element={
            <ProtectedRoute>
              <MerchantFrame />
            </ProtectedRoute>
          }
        />
        <Route
          path="/support/help-center"
          element={
            <ProtectedRoute>
              <MerchantFrame />
            </ProtectedRoute>
          }
        />
        <Route path="/saas-admin" element={<SaaSFrame />} />
        <Route path="*" element={<Navigate replace to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}
