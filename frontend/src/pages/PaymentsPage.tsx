import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthenticatedRequest } from '@/hooks/useAuth';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';

interface PaymentIntent {
  id: string;
  amount: number;
  amount_sats: number;
  amount_usd: number;
  currency: string;
  status: 'requires_payment' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  description?: string;
  metadata: Record<string, string>;
  stacks_address?: string;
  bitcoin_address?: string;
  sbtc_tx_id?: string;
  confirmation_count?: number;
  created: number;
  expires_at: number;
}

interface PaymentsResponse {
  object: 'list';
  data: PaymentIntent[];
  has_more: boolean;
}

export default function PaymentsPage() {
  const apiRequest = useAuthenticatedRequest();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState<PaymentIntent | null>(null);

  const { data: paymentsData, isLoading, error, refetch } = useQuery<PaymentsResponse>({
    queryKey: ['payments', searchTerm, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('limit', '50');
      
      if (searchTerm) {
        params.set('search', searchTerm);
      }
      
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      return apiRequest(`/merchants/payment-intents?${params.toString()}`);
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const payments = paymentsData?.data || [];

  const formatBTC = (sats: number) => {
    return (sats / 100000000).toFixed(8);
  };

  const formatUSD = (usd: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(usd);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    const statusClasses = {
      succeeded: 'badge-success',
      failed: 'badge-error',
      processing: 'badge-warning',
      requires_payment: 'badge-info',
      canceled: 'badge-error',
    };

    const statusLabels = {
      succeeded: 'Succeeded',
      failed: 'Failed',
      processing: 'Processing',
      requires_payment: 'Pending',
      canceled: 'Canceled',
    };

    return (
      <span className={statusClasses[status as keyof typeof statusClasses] || 'badge-info'}>
        {statusLabels[status as keyof typeof statusLabels] || status}
      </span>
    );
  };

  const truncateId = (id: string) => {
    return `${id.substring(0, 8)}...${id.substring(id.length - 4)}`;
  };

  const exportPayments = () => {
    const csvContent = [
      ['ID', 'Amount (BTC)', 'Amount (USD)', 'Status', 'Description', 'Created'].join(','),
      ...payments.map(payment => [
        payment.id,
        formatBTC(payment.amount_sats),
        payment.amount_usd?.toFixed(2) || '0',
        payment.status,
        payment.description || '',
        formatDate(payment.created),
      ].join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stacksgate-payments-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const PaymentDetailModal = () => {
    if (!selectedPayment) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Payment Details</h2>
              <button
                onClick={() => setSelectedPayment(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Payment ID</label>
                  <p className="font-mono text-sm mt-1">{selectedPayment.id}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <p className="mt-1">{getStatusBadge(selectedPayment.status)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Amount (BTC)</label>
                  <p className="text-lg font-semibold text-bitcoin-600 mt-1">
                    ₿ {formatBTC(selectedPayment.amount_sats)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Amount (USD)</label>
                  <p className="text-lg font-semibold mt-1">
                    {selectedPayment.amount_usd ? formatUSD(selectedPayment.amount_usd) : 'N/A'}
                  </p>
                </div>
              </div>

              {selectedPayment.description && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Description</label>
                  <p className="mt-1">{selectedPayment.description}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Created</label>
                  <p className="mt-1">{formatDate(selectedPayment.created)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Expires</label>
                  <p className="mt-1">{formatDate(selectedPayment.expires_at)}</p>
                </div>
              </div>

              {selectedPayment.stacks_address && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Stacks Address</label>
                  <p className="font-mono text-sm mt-1 break-all">{selectedPayment.stacks_address}</p>
                </div>
              )}

              {selectedPayment.bitcoin_address && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Bitcoin Address</label>
                  <p className="font-mono text-sm mt-1 break-all">{selectedPayment.bitcoin_address}</p>
                </div>
              )}

              {selectedPayment.sbtc_tx_id && (
                <div>
                  <label className="text-sm font-medium text-gray-500">sBTC Transaction ID</label>
                  <p className="font-mono text-sm mt-1 break-all">{selectedPayment.sbtc_tx_id}</p>
                </div>
              )}

              {selectedPayment.confirmation_count !== undefined && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Confirmations</label>
                  <p className="mt-1">{selectedPayment.confirmation_count}/6</p>
                </div>
              )}

              {Object.keys(selectedPayment.metadata).length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Metadata</label>
                  <div className="mt-2 bg-gray-50 rounded-md p-3">
                    <pre className="text-sm text-gray-600">
                      {JSON.stringify(selectedPayment.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedPayment(null)}
                className="btn-secondary"
              >
                Close
              </button>
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
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-gray-600">Manage and track your sBTC payments</p>
        </div>
        
        <button
          onClick={exportPayments}
          className="btn-secondary flex items-center space-x-2"
          disabled={payments.length === 0}
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by payment ID or description..."
                className="input-field pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <FunnelIcon className="h-5 w-5 text-gray-400" />
            <select
              className="input-field"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="succeeded">Succeeded</option>
              <option value="processing">Processing</option>
              <option value="requires_payment">Pending</option>
              <option value="failed">Failed</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>
          
          <button
            onClick={() => refetch()}
            className="btn-secondary"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Payments Table */}
      <div className="card">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="large" />
          </div>
        ) : error ? (
          <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-md">
            Failed to load payments: {(error as Error).message}
          </div>
        ) : payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Payment ID</th>
                  <th>Amount</th>
                  <th>USD Value</th>
                  <th>Status</th>
                  <th>Description</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="font-mono text-sm">
                      {truncateId(payment.id)}
                    </td>
                    <td className="font-semibold">
                      ₿ {formatBTC(payment.amount_sats)}
                    </td>
                    <td>
                      {payment.amount_usd ? formatUSD(payment.amount_usd) : 'N/A'}
                    </td>
                    <td>
                      {getStatusBadge(payment.status)}
                    </td>
                    <td className="max-w-xs truncate">
                      {payment.description || '-'}
                    </td>
                    <td className="text-gray-500">
                      {new Date(payment.created * 1000).toLocaleDateString()}
                    </td>
                    <td>
                      <button
                        onClick={() => setSelectedPayment(payment)}
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
            <div className="text-gray-300 mb-4">
              <svg className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No payments found</h3>
            <p className="text-gray-500 mb-6">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your search or filter criteria' 
                : 'Start accepting payments to see them here'
              }
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <a href="/integration" className="btn-primary">
                View Integration Guide
              </a>
            )}
          </div>
        )}
      </div>

      {/* Load More */}
      {paymentsData?.has_more && (
        <div className="text-center">
          <button className="btn-secondary">
            Load More Payments
          </button>
        </div>
      )}

      {/* Payment Detail Modal */}
      <PaymentDetailModal />
    </div>
  );
}