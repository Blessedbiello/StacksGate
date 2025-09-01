import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function RegisterPage() {
  const { user, register, isLoading } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    business_name: '',
    website_url: '',
    webhook_url: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in
  if (user && !isLoading) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate form
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsSubmitting(true);

    try {
      const registerData = {
        email: formData.email,
        password: formData.password,
        business_name: formData.business_name,
        website_url: formData.website_url || undefined,
        webhook_url: formData.webhook_url || undefined,
      };

      await register(registerData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="text-center text-3xl font-bold text-bitcoin-500 mb-2">
            StacksGate
          </h1>
          <h2 className="text-center text-2xl font-bold text-gray-900">
            Create your merchant account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-medium text-bitcoin-600 hover:text-bitcoin-500"
            >
              Sign in
            </Link>
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="business_name" className="form-label">
                Business Name *
              </label>
              <input
                id="business_name"
                name="business_name"
                type="text"
                required
                className="input-field"
                placeholder="Enter your business name"
                value={formData.business_name}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label htmlFor="email" className="form-label">
                Email Address *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="input-field"
                placeholder="Enter your email"
                value={formData.email}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>
            
            <div>
              <label htmlFor="password" className="form-label">
                Password *
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="input-field"
                placeholder="Choose a strong password"
                value={formData.password}
                onChange={handleChange}
                disabled={isSubmitting}
              />
              <p className="text-xs text-gray-500 mt-1">
                Must be at least 8 characters long
              </p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="form-label">
                Confirm Password *
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                className="input-field"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label htmlFor="website_url" className="form-label">
                Website URL (optional)
              </label>
              <input
                id="website_url"
                name="website_url"
                type="url"
                className="input-field"
                placeholder="https://example.com"
                value={formData.website_url}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label htmlFor="webhook_url" className="form-label">
                Webhook URL (optional)
              </label>
              <input
                id="webhook_url"
                name="webhook_url"
                type="url"
                className="input-field"
                placeholder="https://example.com/webhooks/stacksgate"
                value={formData.webhook_url}
                onChange={handleChange}
                disabled={isSubmitting}
              />
              <p className="text-xs text-gray-500 mt-1">
                We'll send payment notifications to this URL
              </p>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-bitcoin-600 hover:bg-bitcoin-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bitcoin-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="small" className="mr-2" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </div>

          <div className="mt-6">
            <div className="text-center">
              <p className="text-xs text-gray-500">
                By creating an account, you agree to our{' '}
                <a href="#" className="text-bitcoin-600 hover:text-bitcoin-500">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="#" className="text-bitcoin-600 hover:text-bitcoin-500">
                  Privacy Policy
                </a>
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}