import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthenticatedRequest } from '@/hooks/useAuth';
import {
  BellIcon,
  PlayIcon,
  EyeIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';

interface WebhookLog {
  id: string;
  payment_intent_id?: string;
  event_type: string;
  webhook_url: string;
  response_status?: number;
  delivered: boolean;
  attempt_number: number;
  created_at: number;
}

interface WebhookStats {
  total_webhooks: number;
  successful_webhooks: number;
  failed_webhooks: number;
  success_rate: number;
  avg_attempts: number;
  unique_event_types: number;
}

interface WebhookLogsResponse {
  object: 'list';
  data: WebhookLog[];
  has_more: boolean;
}

export default function WebhooksPage() {
  const apiRequest = useAuthenticatedRequest();
  const queryClient = useQueryClient();
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);

  // Fetch webhook stats
  const { data: stats, isLoading: statsLoading } = useQuery<WebhookStats>({
    queryKey: ['webhook-stats'],
    queryFn: () => apiRequest('/webhooks/stats'),
  });

  // Fetch webhook logs
  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } = useQuery<WebhookLogsResponse>({
    queryKey: ['webhook-logs'],
    queryFn: () => apiRequest('/webhooks/logs?limit=50'),
    refetchInterval: 30000,
  });

  // Test webhook mutation
  const testWebhookMutation = useMutation({
    mutationFn: () => apiRequest('/webhooks/test', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-logs'] });
      queryClient.invalidateQueries({ queryKey: ['webhook-stats'] });
    },
  });

  // Retry webhook mutation
  const retryWebhookMutation = useMutation({
    mutationFn: (paymentIntentId: string) =>
      apiRequest(`/webhooks/retry/${paymentIntentId}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-logs'] });
    },
  });

  const logs = logsData?.data || [];

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getStatusIcon = (delivered: boolean, responseStatus?: number) => {
    if (delivered && responseStatus && responseStatus >= 200 && responseStatus < 300) {
      return <CheckCircleIcon className="h-5 w-5 text-success-500" />;
    } else {
      return <XCircleIcon className="h-5 w-5 text-error-500" />;
    }
  };

  const getStatusBadge = (delivered: boolean, responseStatus?: number) => {
    if (delivered && responseStatus && responseStatus >= 200 && responseStatus < 300) {
      return <span className="badge-success">Delivered</span>;
    } else {
      return <span className="badge-error">Failed</span>;
    }
  };

  const eventTypeColors: Record<string, string> = {
    'payment_intent.created': 'bg-blue-100 text-blue-800',
    'payment_intent.processing': 'bg-yellow-100 text-yellow-800',
    'payment_intent.succeeded': 'bg-success-100 text-success-800',
    'payment_intent.failed': 'bg-error-100 text-error-800',
    'payment_intent.canceled': 'bg-gray-100 text-gray-800',
    'test.webhook': 'bg-purple-100 text-purple-800',
  };

  const LogDetailModal = () => {
    if (!selectedLog) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Webhook Log Details</h2>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Event Type</label>
                  <p className="mt-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      eventTypeColors[selectedLog.event_type] || 'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedLog.event_type}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <p className="mt-1">{getStatusBadge(selectedLog.delivered, selectedLog.response_status)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Webhook URL</label>
                  <p className="font-mono text-sm mt-1 break-all">{selectedLog.webhook_url}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Response Status</label>
                  <p className="mt-1">{selectedLog.response_status || 'N/A'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Attempt Number</label>
                  <p className="mt-1">{selectedLog.attempt_number}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Timestamp</label>
                  <p className="mt-1">{formatDate(selectedLog.created_at)}</p>
                </div>
              </div>

              {selectedLog.payment_intent_id && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Payment Intent ID</label>
                  <p className="font-mono text-sm mt-1">{selectedLog.payment_intent_id}</p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-between">
              {selectedLog.payment_intent_id && !selectedLog.delivered && (
                <button
                  onClick={() => {
                    retryWebhookMutation.mutate(selectedLog.payment_intent_id!);
                    setSelectedLog(null);
                  }}
                  disabled={retryWebhookMutation.isPending}
                  className="btn-primary flex items-center space-x-2"
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  <span>Retry Webhook</span>
                </button>
              )}
              
              <button
                onClick={() => setSelectedLog(null)}
                className="btn-secondary ml-auto"
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
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="text-gray-600">Monitor webhook deliveries and test your endpoints</p>
        </div>
        
        <button
          onClick={() => testWebhookMutation.mutate()}
          disabled={testWebhookMutation.isPending}
          className="btn-primary flex items-center space-x-2"
        >
          {testWebhookMutation.isPending ? (
            <LoadingSpinner size="small" />
          ) : (
            <PlayIcon className="h-4 w-4" />
          )}
          <span>Send Test Webhook</span>
        </button>
      </div>

      {/* Stats Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="stat-card animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="stat-card">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-blue-50">
                <BellIcon className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Webhooks</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.total_webhooks}</p>
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-success-50">
                <CheckCircleIcon className="h-6 w-6 text-success-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Success Rate</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.success_rate}%</p>
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-yellow-50">
                <ArrowPathIcon className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Avg Attempts</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.avg_attempts}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Test Webhook Results */}
      {testWebhookMutation.isError && (
        <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-md">
          Test webhook failed: {(testWebhookMutation.error as Error).message}
        </div>
      )}

      {testWebhookMutation.isSuccess && (
        <div className="bg-success-50 border border-success-200 text-success-700 px-4 py-3 rounded-md">
          Test webhook sent successfully! Check your endpoint logs.
        </div>
      )}

      {/* Configuration Help */}
      <div className="card">
        <div className="flex items-start space-x-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-gray-900">Webhook Configuration</h3>
            <p className="text-sm text-gray-600 mt-1">
              Configure your webhook URL in <a href="/settings" className="text-bitcoin-600 hover:text-bitcoin-500">Settings</a> to receive payment notifications.
              Make sure your endpoint returns a 200 status code and can handle webhook signature verification.
            </p>
          </div>
        </div>
      </div>

      {/* Webhook Logs */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Recent Webhook Deliveries</h2>
          <button
            onClick={() => refetchLogs()}
            className="btn-secondary flex items-center space-x-2 text-sm"
          >
            <ArrowPathIcon className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>

        {logsLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="large" />
          </div>
        ) : logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Event Type</th>
                  <th>Payment ID</th>
                  <th>Response</th>
                  <th>Attempts</th>
                  <th>Timestamp</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(log.delivered, log.response_status)}
                        {getStatusBadge(log.delivered, log.response_status)}
                      </div>
                    </td>
                    <td>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        eventTypeColors[log.event_type] || 'bg-gray-100 text-gray-800'
                      }`}>
                        {log.event_type}
                      </span>
                    </td>
                    <td className="font-mono text-sm">
                      {log.payment_intent_id ? 
                        `${log.payment_intent_id.substring(0, 8)}...${log.payment_intent_id.substring(log.payment_intent_id.length - 4)}` 
                        : '-'
                      }
                    </td>
                    <td>
                      <span className={`text-sm ${
                        log.response_status && log.response_status >= 200 && log.response_status < 300
                          ? 'text-success-600'
                          : 'text-error-600'
                      }`}>
                        {log.response_status || 'No response'}
                      </span>
                    </td>
                    <td>{log.attempt_number}</td>
                    <td className="text-gray-500 text-sm">
                      {new Date(log.created_at * 1000).toLocaleDateString()}
                    </td>
                    <td>
                      <button
                        onClick={() => setSelectedLog(log)}
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
            <BellIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No webhook deliveries yet</h3>
            <p className="text-gray-500 mb-6">
              Configure a webhook URL in Settings to start receiving payment notifications
            </p>
            <div className="space-x-4">
              <a href="/settings" className="btn-primary">
                Configure Webhooks
              </a>
              <button
                onClick={() => testWebhookMutation.mutate()}
                disabled={testWebhookMutation.isPending}
                className="btn-secondary"
              >
                Send Test Webhook
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Event Types Reference */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Webhook Event Types</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                payment_intent.created
              </span>
              <span className="text-sm text-gray-600">Payment intent created</span>
            </div>
            
            <div className="flex items-center space-x-3">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                payment_intent.processing
              </span>
              <span className="text-sm text-gray-600">Payment is being processed</span>
            </div>
            
            <div className="flex items-center space-x-3">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-100 text-success-800">
                payment_intent.succeeded
              </span>
              <span className="text-sm text-gray-600">Payment completed successfully</span>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-error-100 text-error-800">
                payment_intent.failed
              </span>
              <span className="text-sm text-gray-600">Payment failed</span>
            </div>
            
            <div className="flex items-center space-x-3">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                payment_intent.canceled
              </span>
              <span className="text-sm text-gray-600">Payment was canceled</span>
            </div>
            
            <div className="flex items-center space-x-3">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                test.webhook
              </span>
              <span className="text-sm text-gray-600">Test webhook event</span>
            </div>
          </div>
        </div>
      </div>

      {/* Webhook Detail Modal */}
      <LogDetailModal />
    </div>
  );
}