import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CurrencyDollarIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

interface PaymentLinkData {
  id: string;
  title: string;
  description: string;
  amount: number;
  currency: 'sbtc' | 'usd';
  collect_shipping_address: boolean;
  collect_phone_number: boolean;
  allow_custom_amounts: boolean;
  min_amount?: number;
  max_amount?: number;
}

interface CustomerInfo {
  email: string;
  name: string;
  phone?: string;
  shipping_address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
}

export default function PublicPaymentPage() {
  const { linkId } = useParams<{ linkId: string }>();
  const navigate = useNavigate();
  
  const [paymentLink, setPaymentLink] = useState<PaymentLinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    email: '',
    name: '',
    phone: '',
    shipping_address: {
      line1: '',
      line2: '',
      city: '',
      state: '',
      postal_code: '',
      country: 'US'
    }
  });
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [widgetLoaded, setWidgetLoaded] = useState(false);

  useEffect(() => {
    if (linkId) {
      fetchPaymentLink(linkId);
      loadWidget();
    }
  }, [linkId]);

  const fetchPaymentLink = async (id: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/payment-links/public/${id}`);
      
      if (response.ok) {
        const data = await response.json();
        setPaymentLink(data);
        setPaymentAmount(data.amount.toString());
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Payment link not found');
      }
    } catch (err) {
      setError('Failed to load payment link');
    } finally {
      setLoading(false);
    }
  };

  const loadWidget = () => {
    // Load StacksGate widget
    const script = document.createElement('script');
    script.src = import.meta.env.VITE_WIDGET_URL || 'http://localhost:3001/stacksgate.js';
    script.onload = () => {
      if ((window as any).StacksGate) {
        (window as any).StacksGate.init({
          apiKey: 'pk_public', // Public payments don't need real API keys
          apiUrl: import.meta.env.VITE_API_URL,
          testMode: true
        });
        setWidgetLoaded(true);
      }
    };
    script.onerror = () => {
      setError('Failed to load payment widget');
    };
    
    if (!document.querySelector('script[src*="stacksgate.js"]')) {
      document.head.appendChild(script);
    } else {
      setWidgetLoaded(true);
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!paymentLink || !widgetLoaded) return;

    // Validate amount if custom amounts are allowed
    const finalAmount = parseFloat(paymentAmount);
    if (paymentLink.allow_custom_amounts) {
      if (paymentLink.min_amount && finalAmount < paymentLink.min_amount) {
        alert(`Amount must be at least ${paymentLink.min_amount} ${paymentLink.currency.toUpperCase()}`);
        return;
      }
      if (paymentLink.max_amount && finalAmount > paymentLink.max_amount) {
        alert(`Amount cannot exceed ${paymentLink.max_amount} ${paymentLink.currency.toUpperCase()}`);
        return;
      }
    }

    // Validate customer info
    if (!customerInfo.email || !customerInfo.name) {
      alert('Please fill in your name and email address');
      return;
    }

    if (paymentLink.collect_phone_number && !customerInfo.phone) {
      alert('Please provide your phone number');
      return;
    }

    if (paymentLink.collect_shipping_address) {
      const addr = customerInfo.shipping_address!;
      if (!addr.line1 || !addr.city || !addr.state || !addr.postal_code) {
        alert('Please fill in all shipping address fields');
        return;
      }
    }

    setPaymentProcessing(true);
    setPaymentStatus('processing');

    try {
      // Create payment intent from payment link
      const response = await fetch(`${import.meta.env.VITE_API_URL}/payment-links/public/${paymentLink.id}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: paymentLink.allow_custom_amounts ? finalAmount : undefined,
          customer_info: customerInfo
        }),
      });

      if (response.ok) {
        const paymentIntent = await response.json();
        
        // Clear the payment container
        const container = document.getElementById('payment-widget-container');
        if (container) {
          container.innerHTML = '';
        }

        // Create payment widget
        (window as any).StacksGate.createWidget(paymentIntent.id, {
          containerId: 'payment-widget-container',
          theme: 'light',
          onSuccess: (pi: any) => {
            setPaymentStatus('success');
            setPaymentProcessing(false);
            
            // Redirect to success URL if provided
            if (paymentLink.success_url) {
              setTimeout(() => {
                window.location.href = paymentLink.success_url!;
              }, 3000);
            }
          },
          onError: (error: Error) => {
            setPaymentStatus('error');
            setPaymentProcessing(false);
            alert('Payment failed: ' + error.message);
          },
          onCancel: () => {
            setPaymentStatus('idle');
            setPaymentProcessing(false);
          }
        });
      } else {
        const errorData = await response.json();
        alert('Error creating payment: ' + errorData.error);
        setPaymentProcessing(false);
        setPaymentStatus('error');
      }
    } catch (err) {
      alert('Failed to process payment');
      setPaymentProcessing(false);
      setPaymentStatus('error');
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    return currency === 'sbtc' ? `${amount} sBTC` : `$${amount.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bitcoin-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ExclamationTriangleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment Link Error</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!paymentLink) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 bg-bitcoin-600 rounded-lg flex items-center justify-center">
              <CurrencyDollarIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">StacksGate</h1>
              <p className="text-sm text-gray-500">Secure sBTC Payments</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {paymentStatus === 'success' ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h2>
            <p className="text-gray-600 mb-4">Thank you for your payment.</p>
            {paymentLink.success_url && (
              <p className="text-sm text-gray-500">
                Redirecting you in a few seconds...
              </p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {/* Payment Info */}
            <div className="px-8 py-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{paymentLink.title}</h2>
              <p className="text-gray-600 mb-4">{paymentLink.description}</p>
              
              <div className="flex items-center space-x-4">
                <div className="text-3xl font-bold text-gray-900">
                  {paymentLink.allow_custom_amounts ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.00000001"
                        min={paymentLink.min_amount || 0.00000001}
                        max={paymentLink.max_amount}
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        className="text-3xl font-bold border-b-2 border-gray-300 focus:border-bitcoin-600 bg-transparent outline-none w-32"
                      />
                      <span>{paymentLink.currency.toUpperCase()}</span>
                    </div>
                  ) : (
                    formatAmount(paymentLink.amount, paymentLink.currency)
                  )}
                </div>
                
                <div className="flex items-center text-green-600 bg-green-50 px-3 py-1 rounded-full">
                  <ShieldCheckIcon className="h-4 w-4 mr-1" />
                  <span className="text-sm font-medium">Secure</span>
                </div>
              </div>

              {paymentLink.allow_custom_amounts && (
                <div className="mt-2 text-sm text-gray-500">
                  {paymentLink.min_amount && paymentLink.max_amount ? (
                    `Amount between ${paymentLink.min_amount} - ${paymentLink.max_amount} ${paymentLink.currency.toUpperCase()}`
                  ) : paymentLink.min_amount ? (
                    `Minimum amount: ${paymentLink.min_amount} ${paymentLink.currency.toUpperCase()}`
                  ) : paymentLink.max_amount ? (
                    `Maximum amount: ${paymentLink.max_amount} ${paymentLink.currency.toUpperCase()}`
                  ) : (
                    'Enter any amount'
                  )}
                </div>
              )}
            </div>

            {/* Customer Info Form */}
            <form onSubmit={handlePayment} className="px-8 py-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={customerInfo.name}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-bitcoin-500 focus:border-transparent"
                    required
                    placeholder="Your full name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={customerInfo.email}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-bitcoin-500 focus:border-transparent"
                    required
                    placeholder="your@email.com"
                  />
                </div>
              </div>

              {paymentLink.collect_phone_number && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={customerInfo.phone}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-bitcoin-500 focus:border-transparent"
                    required
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              )}

              {paymentLink.collect_shipping_address && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Shipping Address</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Address Line 1 *
                      </label>
                      <input
                        type="text"
                        value={customerInfo.shipping_address!.line1}
                        onChange={(e) => setCustomerInfo({
                          ...customerInfo,
                          shipping_address: { ...customerInfo.shipping_address!, line1: e.target.value }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-bitcoin-500 focus:border-transparent"
                        required
                        placeholder="123 Main Street"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Address Line 2
                      </label>
                      <input
                        type="text"
                        value={customerInfo.shipping_address!.line2}
                        onChange={(e) => setCustomerInfo({
                          ...customerInfo,
                          shipping_address: { ...customerInfo.shipping_address!, line2: e.target.value }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-bitcoin-500 focus:border-transparent"
                        placeholder="Apartment, suite, etc."
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          City *
                        </label>
                        <input
                          type="text"
                          value={customerInfo.shipping_address!.city}
                          onChange={(e) => setCustomerInfo({
                            ...customerInfo,
                            shipping_address: { ...customerInfo.shipping_address!, city: e.target.value }
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-bitcoin-500 focus:border-transparent"
                          required
                          placeholder="New York"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          State *
                        </label>
                        <input
                          type="text"
                          value={customerInfo.shipping_address!.state}
                          onChange={(e) => setCustomerInfo({
                            ...customerInfo,
                            shipping_address: { ...customerInfo.shipping_address!, state: e.target.value }
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-bitcoin-500 focus:border-transparent"
                          required
                          placeholder="NY"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ZIP Code *
                        </label>
                        <input
                          type="text"
                          value={customerInfo.shipping_address!.postal_code}
                          onChange={(e) => setCustomerInfo({
                            ...customerInfo,
                            shipping_address: { ...customerInfo.shipping_address!, postal_code: e.target.value }
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-bitcoin-500 focus:border-transparent"
                          required
                          placeholder="10001"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Country *
                        </label>
                        <select
                          value={customerInfo.shipping_address!.country}
                          onChange={(e) => setCustomerInfo({
                            ...customerInfo,
                            shipping_address: { ...customerInfo.shipping_address!, country: e.target.value }
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-bitcoin-500 focus:border-transparent"
                          required
                        >
                          <option value="US">United States</option>
                          <option value="CA">Canada</option>
                          <option value="GB">United Kingdom</option>
                          <option value="AU">Australia</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Widget Container */}
              <div id="payment-widget-container" className="min-h-[200px]">
                {paymentStatus === 'idle' && (
                  <button
                    type="submit"
                    disabled={paymentProcessing || !widgetLoaded}
                    className="w-full bg-bitcoin-600 hover:bg-bitcoin-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-md transition-colors"
                  >
                    {paymentProcessing ? 'Processing...' : widgetLoaded ? 'Pay with sBTC' : 'Loading...'}
                  </button>
                )}
              </div>

              {/* Security Notice */}
              <div className="text-center text-sm text-gray-500">
                <div className="flex items-center justify-center space-x-2">
                  <ShieldCheckIcon className="h-4 w-4" />
                  <span>Secured by StacksGate • Powered by Bitcoin</span>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}