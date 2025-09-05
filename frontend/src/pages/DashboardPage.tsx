import { useQuery } from '@tanstack/react-query';
import { useAuthenticatedRequest } from '@/hooks/useAuth';
import {
  CreditCardIcon,
  CurrencyDollarIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';

interface DashboardStats {
  total_payments: number;
  successful_payments: number;
  failed_payments: number;
  pending_payments: number;
  total_volume_sats: number;
  total_volume_usd: number;
  recent_payments: Array<{
    id: string;
    amount_sats: number;
    amount_usd: number;
    status: string;
    created_at: number;
  }>;
}

export default function DashboardPage() {
  const apiRequest = useAuthenticatedRequest();

  const { data: stats, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiRequest('/merchants/stats'),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-md">
        Failed to load dashboard data: {(error as Error).message}
      </div>
    );
  }

  const successRate = stats?.total_payments 
    ? Math.round((stats.successful_payments / stats.total_payments) * 100)
    : 0;

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
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    const statusClasses = {
      succeeded: 'badge-success',
      failed: 'badge-error',
      processing: 'badge-warning',
      requires_payment: 'badge-info',
    };

    return (
      <span className={statusClasses[status as keyof typeof statusClasses] || 'badge-info'}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const statCards = [
    {
      title: 'Total Payments',
      value: stats?.total_payments || 0,
      icon: CreditCardIcon,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Successful',
      value: stats?.successful_payments || 0,
      icon: CheckCircleIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Failed',
      value: stats?.failed_payments || 0,
      icon: XCircleIcon,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      title: 'Pending',
      value: stats?.pending_payments || 0,
      icon: ClockIcon,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Monitor your sBTC payment performance</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div key={stat.title} className="stat-card">
            <div className="flex items-center">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                <p className="text-2xl font-semibold text-gray-900 animate-count-up">
                  {stat.value.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Volume Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="stat-card">
          <div className="flex items-center">
            <div className="p-2 rounded-lg bg-bitcoin-50">
              <CurrencyDollarIcon className="h-6 w-6 text-bitcoin-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Bitcoin Volume</p>
              <p className="text-xl font-semibold text-gray-900">
                ₿ {formatBTC(stats?.total_volume_sats || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center">
            <div className="p-2 rounded-lg bg-green-50">
              <CurrencyDollarIcon className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">USD Volume</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatUSD(stats?.total_volume_usd || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center">
            <div className="p-2 rounded-lg bg-purple-50">
              <ArrowTrendingUpIcon className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Success Rate</p>
              <p className="text-xl font-semibold text-gray-900">
                {successRate}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Payments */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Recent Payments</h2>
          <a href="/payments" className="text-bitcoin-600 hover:text-bitcoin-500 text-sm font-medium">
            View all
          </a>
        </div>

        {stats?.recent_payments && stats.recent_payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Payment ID</th>
                  <th>Amount</th>
                  <th>USD Value</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="font-mono text-sm">
                      {payment.id.substring(0, 12)}...
                    </td>
                    <td className="font-semibold">
                      ₿ {formatBTC(payment.amount_sats)}
                    </td>
                    <td>
                      {formatUSD(payment.amount_usd)}
                    </td>
                    <td>
                      {getStatusBadge(payment.status)}
                    </td>
                    <td className="text-gray-500">
                      {formatDate(payment.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <CreditCardIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No payments yet</h3>
            <p className="text-gray-500 mb-6">
              Start accepting sBTC payments by integrating our API or widget
            </p>
            <a
              href="/integration"
              className="btn-primary"
            >
              View Integration Guide
            </a>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Integration</h3>
          <p className="text-gray-600 mb-4">
            Get started with our API and widget
          </p>
          <a href="/integration" className="btn-primary">
            View Docs
          </a>
        </div>

        <div className="card text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Webhooks</h3>
          <p className="text-gray-600 mb-4">
            Configure payment notifications
          </p>
          <a href="/webhooks" className="btn-primary">
            Setup Webhooks
          </a>
        </div>

        <div className="card text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">API Keys</h3>
          <p className="text-gray-600 mb-4">
            Manage your API credentials
          </p>
          <a href="/settings" className="btn-primary">
            View Keys
          </a>
        </div>
      </div>
    </div>
  );
}