import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import Layout from '@/components/Layout';
import AuthGuard from '@/components/AuthGuard';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import DashboardPage from '@/pages/DashboardPage';
import PaymentsPage from '@/pages/PaymentsPage';
import PaymentLinksPage from '@/pages/PaymentLinksPage';
import SettingsPage from '@/pages/SettingsPage';
import IntegrationPage from '@/pages/IntegrationPage';
import WebhooksPage from '@/pages/WebhooksPage';
import SubscriptionsPage from '@/pages/SubscriptionsPage';
import PublicPaymentPage from '@/pages/PublicPaymentPage';
import NotFoundPage from '@/pages/NotFoundPage';

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/pay/:linkId" element={<PublicPaymentPage />} />
        
        {/* Protected app routes */}
        <Route
          path="/app"
          element={
            <AuthGuard>
              <Layout />
            </AuthGuard>
          }
        >
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="payment-links" element={<PaymentLinksPage />} />
          <Route path="subscriptions" element={<SubscriptionsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="integration" element={<IntegrationPage />} />
          <Route path="webhooks" element={<WebhooksPage />} />
        </Route>
        
        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;