import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import Layout from '@/components/Layout';
import AuthGuard from '@/components/AuthGuard';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import DashboardPage from '@/pages/DashboardPage';
import PaymentsPage from '@/pages/PaymentsPage';
import SettingsPage from '@/pages/SettingsPage';
import IntegrationPage from '@/pages/IntegrationPage';
import WebhooksPage from '@/pages/WebhooksPage';
import NotFoundPage from '@/pages/NotFoundPage';

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        
        {/* Protected routes */}
        <Route
          path="/"
          element={
            <AuthGuard>
              <Layout />
            </AuthGuard>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="payments" element={<PaymentsPage />} />
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