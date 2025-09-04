import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  PlusIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
  LinkIcon,
  CalendarIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';

interface PaymentLink {
  id: string;
  title: string;
  description: string;
  amount: number;
  currency: 'sbtc' | 'usd';
  status: 'active' | 'inactive' | 'expired';
  expires_at?: string;
  success_url?: string;
  cancel_url?: string;
  collect_shipping_address: boolean;
  collect_phone_number: boolean;
  allow_custom_amounts: boolean;
  min_amount?: number;
  max_amount?: number;
  usage_count: number;
  usage_limit?: number;
  created_at: string;
  updated_at: string;
}

export default function PaymentLinksPage() {
  const { user, token } = useAuth();
  const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLink, setEditingLink] = useState<PaymentLink | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    amount: '',
    currency: 'sbtc' as 'sbtc' | 'usd',
    expires_at: '',
    success_url: '',
    cancel_url: '',
    collect_shipping_address: false,
    collect_phone_number: false,
    allow_custom_amounts: false,
    min_amount: '',
    max_amount: '',
    usage_limit: ''
  });

  useEffect(() => {
    fetchPaymentLinks();
  }, []);

  const fetchPaymentLinks = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/payment-links`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPaymentLinks(data.data);
      } else {
        console.error('Failed to fetch payment links');
      }
    } catch (error) {
      console.error('Error fetching payment links:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData = {
      ...formData,
      amount: parseFloat(formData.amount),
      min_amount: formData.min_amount ? parseFloat(formData.min_amount) : undefined,
      max_amount: formData.max_amount ? parseFloat(formData.max_amount) : undefined,
      usage_limit: formData.usage_limit ? parseInt(formData.usage_limit) : undefined,
      expires_at: formData.expires_at || undefined,
    };

    try {
      const url = editingLink 
        ? `${import.meta.env.VITE_API_URL}/payment-links/${editingLink.id}`
        : `${import.meta.env.VITE_API_URL}/payment-links`;
      
      const method = editingLink ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData),
      });

      if (response.ok) {
        setShowCreateModal(false);
        setShowEditModal(false);
        setEditingLink(null);
        resetForm();
        fetchPaymentLinks();
      } else {
        const error = await response.json();
        const errorMessage = error.error?.message || error.error || error.message || 'Unknown error occurred';
        alert(`Error: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error saving payment link:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save payment link';
      alert(errorMessage);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this payment link?')) {
      return;
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/payment-links/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        fetchPaymentLinks();
      } else {
        alert('Failed to delete payment link');
      }
    } catch (error) {
      console.error('Error deleting payment link:', error);
      alert('Failed to delete payment link');
    }
  };

  const copyPaymentLink = (id: string) => {
    const url = `${window.location.origin}/pay/${id}`;
    navigator.clipboard.writeText(url);
    setCopiedLinkId(id);
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      amount: '',
      currency: 'sbtc',
      expires_at: '',
      success_url: '',
      cancel_url: '',
      collect_shipping_address: false,
      collect_phone_number: false,
      allow_custom_amounts: false,
      min_amount: '',
      max_amount: '',
      usage_limit: ''
    });
  };

  const openEditModal = (link: PaymentLink) => {
    setEditingLink(link);
    setFormData({
      title: link.title,
      description: link.description,
      amount: link.amount.toString(),
      currency: link.currency,
      expires_at: link.expires_at ? link.expires_at.split('T')[0] : '',
      success_url: link.success_url || '',
      cancel_url: link.cancel_url || '',
      collect_shipping_address: link.collect_shipping_address,
      collect_phone_number: link.collect_phone_number,
      allow_custom_amounts: link.allow_custom_amounts,
      min_amount: link.min_amount?.toString() || '',
      max_amount: link.max_amount?.toString() || '',
      usage_limit: link.usage_limit?.toString() || ''
    });
    setShowEditModal(true);
  };

  const formatAmount = (amount: number, currency: string) => {
    return currency === 'sbtc' ? `${amount} sBTC` : `$${amount.toFixed(2)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100';
      case 'inactive': return 'text-gray-600 bg-gray-100';
      case 'expired': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bitcoin-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Links</h1>
          <p className="text-gray-600">Create shareable payment links for no-code payments</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="btn-primary flex items-center space-x-2"
        >
          <PlusIcon className="h-5 w-5" />
          <span>Create Link</span>
        </button>
      </div>

      {/* Payment Links List */}
      <div className="card">
        {paymentLinks.length === 0 ? (
          <div className="text-center py-12">
            <LinkIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No payment links yet</h3>
            <p className="text-gray-600 mb-4">
              Create your first payment link to start accepting payments
            </p>
            <button
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
              className="btn-primary"
            >
              Create Payment Link
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Link
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usage
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paymentLinks.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-gray-900">{link.title}</div>
                        <div className="text-sm text-gray-500">{link.description}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <CurrencyDollarIcon className="h-4 w-4 text-gray-400 mr-1" />
                        {formatAmount(link.amount, link.currency)}
                      </div>
                      {link.allow_custom_amounts && (
                        <div className="text-xs text-gray-500">
                          Custom amounts allowed
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(link.status)}`}>
                        {link.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {link.usage_count}{link.usage_limit ? ` / ${link.usage_limit}` : ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(link.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => copyPaymentLink(link.id)}
                          className="text-gray-400 hover:text-gray-600"
                          title="Copy payment link"
                        >
                          {copiedLinkId === link.id ? (
                            <CheckIcon className="h-5 w-5 text-green-600" />
                          ) : (
                            <ClipboardDocumentIcon className="h-5 w-5" />
                          )}
                        </button>
                        <button
                          onClick={() => window.open(`/pay/${link.id}`, '_blank')}
                          className="text-gray-400 hover:text-gray-600"
                          title="Preview payment page"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => openEditModal(link)}
                          className="text-gray-400 hover:text-gray-600"
                          title="Edit payment link"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(link.id)}
                          className="text-gray-400 hover:text-red-600"
                          title="Delete payment link"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {editingLink ? 'Edit Payment Link' : 'Create Payment Link'}
              </h3>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Title *
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="input"
                      required
                      placeholder="Product or service name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount *
                    </label>
                    <div className="flex">
                      <input
                        type="number"
                        step="0.00000001"
                        min="0"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        className="input rounded-r-none"
                        required
                        placeholder="0.001"
                      />
                      <select
                        value={formData.currency}
                        onChange={(e) => setFormData({ ...formData, currency: e.target.value as 'sbtc' | 'usd' })}
                        className="px-3 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-gray-700"
                      >
                        <option value="sbtc">sBTC</option>
                        <option value="usd">USD</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input"
                    rows={3}
                    required
                    placeholder="Describe what the customer is paying for"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Success URL
                    </label>
                    <input
                      type="url"
                      value={formData.success_url}
                      onChange={(e) => setFormData({ ...formData, success_url: e.target.value })}
                      className="input"
                      placeholder="https://example.com/success"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cancel URL
                    </label>
                    <input
                      type="url"
                      value={formData.cancel_url}
                      onChange={(e) => setFormData({ ...formData, cancel_url: e.target.value })}
                      className="input"
                      placeholder="https://example.com/cancel"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Expires At
                    </label>
                    <input
                      type="date"
                      value={formData.expires_at}
                      onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                      className="input"
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Usage Limit
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.usage_limit}
                      onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
                      className="input"
                      placeholder="Unlimited"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.allow_custom_amounts}
                      onChange={(e) => setFormData({ ...formData, allow_custom_amounts: e.target.checked })}
                      className="rounded border-gray-300 text-bitcoin-600 focus:ring-bitcoin-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Allow custom amounts</span>
                  </label>

                  {formData.allow_custom_amounts && (
                    <div className="ml-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Minimum Amount
                        </label>
                        <input
                          type="number"
                          step="0.00000001"
                          min="0"
                          value={formData.min_amount}
                          onChange={(e) => setFormData({ ...formData, min_amount: e.target.value })}
                          className="input"
                          placeholder="0.0001"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Maximum Amount
                        </label>
                        <input
                          type="number"
                          step="0.00000001"
                          min="0"
                          value={formData.max_amount}
                          onChange={(e) => setFormData({ ...formData, max_amount: e.target.value })}
                          className="input"
                          placeholder="1.0"
                        />
                      </div>
                    </div>
                  )}

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.collect_shipping_address}
                      onChange={(e) => setFormData({ ...formData, collect_shipping_address: e.target.checked })}
                      className="rounded border-gray-300 text-bitcoin-600 focus:ring-bitcoin-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Collect shipping address</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.collect_phone_number}
                      onChange={(e) => setFormData({ ...formData, collect_phone_number: e.target.checked })}
                      className="rounded border-gray-300 text-bitcoin-600 focus:ring-bitcoin-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Collect phone number</span>
                  </label>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setShowEditModal(false);
                      setEditingLink(null);
                      resetForm();
                    }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingLink ? 'Update' : 'Create'} Payment Link
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}