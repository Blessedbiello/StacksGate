import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthenticatedRequest } from '@/hooks/useAuth';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  EyeIcon,
  PencilIcon,
  XMarkIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  UserIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';

interface Subscription {
  id: string;
  status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'paused';
  amount: number;
  currency: 'sbtc' | 'usd';
  interval: 'day' | 'week' | 'month' | 'year';
  interval_count: number;
  product_name: string;
  description?: string;
  current_period_start: number;
  current_period_end: number;
  next_billing_date: number;
  customer_info: {
    name?: string;
    email?: string;
  };
  created_at: number;
  updated_at: number;
}

interface SubscriptionsResponse {
  data: Subscription[];
  has_more: boolean;
  total_count: number;
}

const statusColors = {
  active: 'bg-success-100 text-success-800',
  canceled: 'bg-gray-100 text-gray-800',
  past_due: 'bg-error-100 text-error-800',
  incomplete: 'bg-yellow-100 text-yellow-800',
  paused: 'bg-blue-100 text-blue-800',
};

const intervalLabels = {
  day: 'Daily',
  week: 'Weekly', 
  month: 'Monthly',
  year: 'Yearly',
};

export default function SubscriptionsPage() {
  const apiRequest = useAuthenticatedRequest();
  const queryClient = useQueryClient();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch subscriptions
  const { data: subscriptionsData, isLoading, error } = useQuery<SubscriptionsResponse>({
    queryKey: ['subscriptions', searchTerm, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('limit', '50');
      
      if (searchTerm) {
        params.set('search', searchTerm);
      }
      
      if (statusFilter && statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      
      return apiRequest(`/subscriptions?${params.toString()}`);
    },
  });

  // Cancel subscription mutation
  const cancelSubscriptionMutation = useMutation({
    mutationFn: (subscriptionId: string) => 
      apiRequest(`/subscriptions/${subscriptionId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      setSelectedSubscription(null);
    },
  });

  const subscriptions = subscriptionsData?.data || [];

  const formatCurrency = (amount: number, currency: string) => {
    if (currency === 'sbtc') {
      return `${(amount / 100000000).toFixed(8)} sBTC`;
    }
    return `$${(amount / 100).toFixed(2)}`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const formatInterval = (interval: string, count: number) => {
    const label = intervalLabels[interval as keyof typeof intervalLabels] || interval;
    return count > 1 ? `Every ${count} ${label.toLowerCase()}s` : label;
  };

  const getStatusBadge = (status: string) => {
    const colorClass = statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800';
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
        {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
      </span>
    );
  };

  const SubscriptionDetailModal = () => {
    if (!selectedSubscription) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Subscription Details</h2>
              <button
                onClick={() => setSelectedSubscription(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Product Name</label>
                  <p className="mt-1 font-medium">{selectedSubscription.product_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <p className="mt-1">{getStatusBadge(selectedSubscription.status)}</p>
                </div>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Amount</label>
                  <p className="mt-1 font-medium">
                    {formatCurrency(selectedSubscription.amount, selectedSubscription.currency)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Billing Cycle</label>
                  <p className="mt-1">
                    {formatInterval(selectedSubscription.interval, selectedSubscription.interval_count)}
                  </p>
                </div>
              </div>

              {/* Customer Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Customer Name</label>
                  <p className="mt-1">{selectedSubscription.customer_info.name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Customer Email</label>
                  <p className="mt-1">{selectedSubscription.customer_info.email || 'N/A'}</p>
                </div>
              </div>

              {/* Billing Dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Current Period</label>
                  <p className="mt-1">
                    {formatDate(selectedSubscription.current_period_start)} - {formatDate(selectedSubscription.current_period_end)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Next Billing Date</label>
                  <p className="mt-1">{formatDate(selectedSubscription.next_billing_date)}</p>
                </div>
              </div>

              {/* Description */}
              {selectedSubscription.description && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Description</label>
                  <p className="mt-1 text-gray-900">{selectedSubscription.description}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between pt-4 border-t">
                {selectedSubscription.status === 'active' && (
                  <button
                    onClick={() => {
                      if (window.confirm('Are you sure you want to cancel this subscription?')) {
                        cancelSubscriptionMutation.mutate(selectedSubscription.id);
                      }
                    }}
                    disabled={cancelSubscriptionMutation.isPending}
                    className="bg-error-600 hover:bg-error-700 text-white px-4 py-2 rounded-md font-medium disabled:opacity-50"
                  >
                    {cancelSubscriptionMutation.isPending ? 'Canceling...' : 'Cancel Subscription'}
                  </button>
                )}
                
                <button
                  onClick={() => setSelectedSubscription(null)}
                  className="btn-secondary ml-auto"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
          <p className="text-gray-600">Manage recurring payments and subscriptions</p>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center space-x-2"
        >
          <PlusIcon className="h-4 w-4" />
          <span>Create Subscription</span>
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search subscriptions..."
                className="input-field pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <FunnelIcon className="h-4 w-4 text-gray-500" />
              <select
                className="input-field min-w-[120px]"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="canceled">Canceled</option>
                <option value="past_due">Past Due</option>
                <option value="incomplete">Incomplete</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Subscriptions List */}
      <div className="card">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="large" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-error-600">Failed to load subscriptions</p>
          </div>
        ) : subscriptions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Billing</th>
                  <th>Status</th>
                  <th>Next Payment</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((subscription) => (
                  <tr key={subscription.id}>
                    <td>
                      <div>
                        <p className="font-medium">{subscription.product_name}</p>
                        {subscription.description && (
                          <p className="text-sm text-gray-500 truncate max-w-[200px]">
                            {subscription.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td>
                      <div>
                        <p className="font-medium">{subscription.customer_info.name || 'N/A'}</p>
                        <p className="text-sm text-gray-500">{subscription.customer_info.email || 'N/A'}</p>
                      </div>
                    </td>
                    <td className="font-mono">
                      {formatCurrency(subscription.amount, subscription.currency)}
                    </td>
                    <td>
                      {formatInterval(subscription.interval, subscription.interval_count)}
                    </td>
                    <td>
                      {getStatusBadge(subscription.status)}
                    </td>
                    <td className="text-gray-500 text-sm">
                      {formatDate(subscription.next_billing_date)}
                    </td>
                    <td className="text-gray-500 text-sm">
                      {formatDate(subscription.created_at)}
                    </td>
                    <td>
                      <button
                        onClick={() => setSelectedSubscription(subscription)}
                        className="text-bitcoin-600 hover:text-bitcoin-500 p-1"
                        title="View details"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <CalendarIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No subscriptions yet</h3>
            <p className="text-gray-500 mb-6">
              Create your first subscription to start accepting recurring payments
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
            >
              Create Subscription
            </button>
          </div>
        )}
      </div>

      {/* Subscription Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="stat-card">
          <div className="flex items-center">
            <div className="p-2 rounded-lg bg-success-50">
              <CalendarIcon className="h-6 w-6 text-success-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Active</p>
              <p className="text-2xl font-semibold text-gray-900">
                {subscriptions.filter(s => s.status === 'active').length}
              </p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center">
            <div className="p-2 rounded-lg bg-blue-50">
              <CurrencyDollarIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total MRR</p>
              <p className="text-2xl font-semibold text-gray-900">
                ${subscriptions.filter(s => s.status === 'active' && s.currency === 'usd').reduce((sum, s) => {
                  const monthlyAmount = s.interval === 'month' ? s.amount : 
                                     s.interval === 'year' ? s.amount / 12 : 
                                     s.interval === 'week' ? s.amount * 4.33 :
                                     s.amount * 30;
                  return sum + monthlyAmount;
                }, 0) / 100}
              </p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center">
            <div className="p-2 rounded-lg bg-yellow-50">
              <ClockIcon className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Past Due</p>
              <p className="text-2xl font-semibold text-gray-900">
                {subscriptions.filter(s => s.status === 'past_due').length}
              </p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center">
            <div className="p-2 rounded-lg bg-gray-50">
              <UserIcon className="h-6 w-6 text-gray-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total</p>
              <p className="text-2xl font-semibold text-gray-900">
                {subscriptions.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <SubscriptionDetailModal />
      
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Create Subscription</h3>
            <p className="text-gray-600 mb-6">
              Subscription creation is available via API. Check the Integration page for examples.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn-secondary"
              >
                Close
              </button>
              <a href="/integration" className="btn-primary">
                View Integration Guide
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}