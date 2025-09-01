import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, useAuthenticatedRequest } from '@/hooks/useAuth';
import {
  KeyIcon,
  EyeIcon,
  EyeSlashIcon,
  ClipboardDocumentIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';

interface MerchantData {
  id: string;
  email: string;
  business_name: string;
  website_url?: string;
  api_key_public: string;
  webhook_url?: string;
  webhook_secret?: string;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

interface ApiKeys {
  api_key_public: string;
  api_key_secret: string;
}

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const apiRequest = useAuthenticatedRequest();
  const queryClient = useQueryClient();
  
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    business_name: user?.business_name || '',
    website_url: user?.website_url || '',
  });
  const [webhookForm, setWebhookForm] = useState({
    webhook_url: '',
  });

  // Fetch merchant details
  const { data: merchantData, isLoading: merchantLoading } = useQuery<MerchantData>({
    queryKey: ['merchant-details'],
    queryFn: () => apiRequest('/merchants/me'),
  });

  // Fetch API keys
  const { data: apiKeys, isLoading: keysLoading } = useQuery<ApiKeys>({
    queryKey: ['api-keys'],
    queryFn: () => apiRequest('/merchants/keys'),
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: (data: { business_name: string; website_url?: string }) =>
      apiRequest('/merchants/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      updateUser(data);
      queryClient.invalidateQueries({ queryKey: ['merchant-details'] });
    },
  });

  // Update webhook mutation
  const updateWebhookMutation = useMutation({
    mutationFn: (data: { webhook_url?: string }) =>
      apiRequest('/merchants/webhook', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-details'] });
      setWebhookForm({ webhook_url: '' });
    },
  });

  // Regenerate API keys mutation
  const regenerateKeysMutation = useMutation({
    mutationFn: () =>
      apiRequest('/merchants/regenerate-keys', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  React.useEffect(() => {
    if (merchantData) {
      setProfileForm({
        business_name: merchantData.business_name,
        website_url: merchantData.website_url || '',
      });
      setWebhookForm({
        webhook_url: merchantData.webhook_url || '',
      });
    }
  }, [merchantData]);

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({
      business_name: profileForm.business_name,
      website_url: profileForm.website_url || undefined,
    });
  };

  const handleWebhookSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateWebhookMutation.mutate({
      webhook_url: webhookForm.webhook_url || undefined,
    });
  };

  const copyToClipboard = (text: string, itemType: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(itemType);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const handleRegenerateKeys = () => {
    if (window.confirm('Are you sure? This will invalidate your current API keys and break existing integrations until updated.')) {
      regenerateKeysMutation.mutate();
    }
  };

  if (merchantLoading || keysLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your account and API configuration</p>
      </div>

      {/* Account Information */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h2>
        
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="email" className="form-label">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={merchantData?.email || ''}
                disabled
                className="input-field bg-gray-50"
              />
              <p className="text-xs text-gray-500 mt-1">
                Contact support to change your email address
              </p>
            </div>

            <div>
              <label htmlFor="business_name" className="form-label">
                Business Name *
              </label>
              <input
                type="text"
                id="business_name"
                required
                className="input-field"
                value={profileForm.business_name}
                onChange={(e) => setProfileForm(prev => ({ ...prev, business_name: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label htmlFor="website_url" className="form-label">
              Website URL
            </label>
            <input
              type="url"
              id="website_url"
              className="input-field"
              placeholder="https://example.com"
              value={profileForm.website_url}
              onChange={(e) => setProfileForm(prev => ({ ...prev, website_url: e.target.value }))}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={updateProfileMutation.isPending}
              className="btn-primary"
            >
              {updateProfileMutation.isPending ? (
                <>
                  <LoadingSpinner size="small" className="mr-2" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>

          {updateProfileMutation.isError && (
            <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-md">
              Failed to update profile: {(updateProfileMutation.error as Error).message}
            </div>
          )}

          {updateProfileMutation.isSuccess && (
            <div className="bg-success-50 border border-success-200 text-success-700 px-4 py-3 rounded-md">
              Profile updated successfully!
            </div>
          )}
        </form>
      </div>

      {/* API Keys */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">API Keys</h2>
          <button
            onClick={handleRegenerateKeys}
            disabled={regenerateKeysMutation.isPending}
            className="btn-secondary flex items-center space-x-2 text-sm"
          >
            <ArrowPathIcon className="h-4 w-4" />
            <span>Regenerate Keys</span>
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <div className="flex items-start">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mt-0.5 mr-2" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium">Keep your secret key safe!</p>
                <p>Never share your secret key in publicly accessible areas like GitHub, client-side code, etc.</p>
              </div>
            </div>
          </div>

          <div>
            <label className="form-label">Publishable Key</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={apiKeys?.api_key_public || ''}
                readOnly
                className="input-field bg-gray-50 font-mono text-sm flex-1"
              />
              <button
                onClick={() => copyToClipboard(apiKeys?.api_key_public || '', 'public-key')}
                className="p-2 text-gray-400 hover:text-gray-600"
                title={copiedItem === 'public-key' ? 'Copied!' : 'Copy to clipboard'}
              >
                <ClipboardDocumentIcon className={`h-5 w-5 ${copiedItem === 'public-key' ? 'text-green-600' : ''}`} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Use this key in your client-side code. It's safe to expose publicly.
            </p>
          </div>

          <div>
            <label className="form-label">Secret Key</label>
            <div className="flex items-center space-x-2">
              <input
                type={showSecretKey ? 'text' : 'password'}
                value={apiKeys?.api_key_secret || ''}
                readOnly
                className="input-field bg-gray-50 font-mono text-sm flex-1"
              />
              <button
                onClick={() => setShowSecretKey(!showSecretKey)}
                className="p-2 text-gray-400 hover:text-gray-600"
                title={showSecretKey ? 'Hide' : 'Show'}
              >
                {showSecretKey ? (
                  <EyeSlashIcon className="h-5 w-5" />
                ) : (
                  <EyeIcon className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={() => copyToClipboard(apiKeys?.api_key_secret || '', 'secret-key')}
                className="p-2 text-gray-400 hover:text-gray-600"
                title={copiedItem === 'secret-key' ? 'Copied!' : 'Copy to clipboard'}
              >
                <ClipboardDocumentIcon className={`h-5 w-5 ${copiedItem === 'secret-key' ? 'text-green-600' : ''}`} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Keep this key secret! Use it only in server-side code.
            </p>
          </div>
        </div>

        {regenerateKeysMutation.isError && (
          <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-md mt-4">
            Failed to regenerate keys: {(regenerateKeysMutation.error as Error).message}
          </div>
        )}

        {regenerateKeysMutation.isSuccess && (
          <div className="bg-success-50 border border-success-200 text-success-700 px-4 py-3 rounded-md mt-4">
            API keys regenerated successfully! Update your integrations with the new keys.
          </div>
        )}
      </div>

      {/* Webhook Configuration */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Webhook Configuration</h2>
        
        <form onSubmit={handleWebhookSubmit} className="space-y-4">
          <div>
            <label htmlFor="webhook_url" className="form-label">
              Webhook URL
            </label>
            <input
              type="url"
              id="webhook_url"
              className="input-field"
              placeholder="https://example.com/webhooks/stacksgate"
              value={webhookForm.webhook_url}
              onChange={(e) => setWebhookForm(prev => ({ ...prev, webhook_url: e.target.value }))}
            />
            <p className="text-xs text-gray-500 mt-1">
              We'll send payment notifications to this URL. Leave blank to disable webhooks.
            </p>
          </div>

          {merchantData?.webhook_url && merchantData?.webhook_secret && (
            <div>
              <label className="form-label">Webhook Secret</label>
              <div className="flex items-center space-x-2">
                <input
                  type={showWebhookSecret ? 'text' : 'password'}
                  value={merchantData.webhook_secret}
                  readOnly
                  className="input-field bg-gray-50 font-mono text-sm flex-1"
                />
                <button
                  type="button"
                  onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                  className="p-2 text-gray-400 hover:text-gray-600"
                  title={showWebhookSecret ? 'Hide' : 'Show'}
                >
                  {showWebhookSecret ? (
                    <EyeSlashIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(merchantData.webhook_secret || '', 'webhook-secret')}
                  className="p-2 text-gray-400 hover:text-gray-600"
                  title={copiedItem === 'webhook-secret' ? 'Copied!' : 'Copy to clipboard'}
                >
                  <ClipboardDocumentIcon className={`h-5 w-5 ${copiedItem === 'webhook-secret' ? 'text-green-600' : ''}`} />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Use this secret to verify webhook signatures for security.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={updateWebhookMutation.isPending}
              className="btn-primary"
            >
              {updateWebhookMutation.isPending ? (
                <>
                  <LoadingSpinner size="small" className="mr-2" />
                  Saving...
                </>
              ) : (
                'Update Webhook'
              )}
            </button>
          </div>

          {updateWebhookMutation.isError && (
            <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-md">
              Failed to update webhook: {(updateWebhookMutation.error as Error).message}
            </div>
          )}

          {updateWebhookMutation.isSuccess && (
            <div className="bg-success-50 border border-success-200 text-success-700 px-4 py-3 rounded-md">
              Webhook configuration updated successfully!
            </div>
          )}
        </form>
      </div>

      {/* Account Status */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Status</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              merchantData?.is_active ? 'bg-success-100 text-success-800' : 'bg-error-100 text-error-800'
            }`}>
              {merchantData?.is_active ? 'Active' : 'Inactive'}
            </div>
            <p className="text-sm text-gray-500 mt-1">Account Status</p>
          </div>
          
          <div className="text-center">
            <p className="text-lg font-semibold text-gray-900">Testnet</p>
            <p className="text-sm text-gray-500 mt-1">Environment</p>
          </div>
          
          <div className="text-center">
            <p className="text-lg font-semibold text-gray-900">
              {merchantData?.created_at ? new Date(merchantData.created_at * 1000).toLocaleDateString() : '-'}
            </p>
            <p className="text-sm text-gray-500 mt-1">Member Since</p>
          </div>
        </div>
      </div>
    </div>
  );
}