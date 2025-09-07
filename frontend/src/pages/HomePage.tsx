import React from 'react';
import { Link } from 'react-router-dom';
import {
  CheckIcon,
  BoltIcon,
  CodeBracketIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  CursorArrowRaysIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import logoImage from '../assets/stacksgate.png';

export default function HomePage() {
  return (
    <div className="bg-white">
      {/* Navigation */}
      <nav className="relative max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center">
          <Link to="/" className="flex items-center space-x-2">
            <img 
              src={logoImage} 
              alt="StacksGate" 
              className="h-8 w-auto"
            />
            <span className="text-2xl font-bold text-bitcoin-500">StacksGate</span>
          </Link>
        </div>
        <div className="hidden md:flex items-center space-x-8">
          <a href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">
            Features
          </a>
          <a href="#pricing" className="text-gray-600 hover:text-gray-900 transition-colors">
            Pricing
          </a>
          <a href="#docs" className="text-gray-600 hover:text-gray-900 transition-colors">
            Docs
          </a>
          <Link 
            to="/login"
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="bg-bitcoin-500 text-white px-4 py-2 rounded-lg hover:bg-bitcoin-600 transition-colors"
          >
            Get started
          </Link>
        </div>
        <div className="md:hidden">
          <Link
            to="/register"
            className="bg-bitcoin-500 text-white px-4 py-2 rounded-lg hover:bg-bitcoin-600 transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <div className="text-center">
            <h1 className="text-5xl lg:text-7xl font-bold text-gray-900 leading-tight">
              Accept{' '}
              <span className="bg-gradient-to-r from-bitcoin-500 to-stacks-500 bg-clip-text text-transparent">
                sBTC payments
              </span>
              <br />
              on Stacks
            </h1>
            <p className="mt-6 text-xl lg:text-2xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              sBTC payment infrastructure powered by the <a href="https://docs.stacks.co/" target="_blank" rel="noopener noreferrer" className="text-stacks-600 hover:text-stacks-700 underline">Stacks blockchain</a>. Start accepting Bitcoin-backed payments in minutes, not days.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/register"
                className="inline-flex items-center px-8 py-4 text-lg font-medium text-white bg-bitcoin-500 rounded-xl hover:bg-bitcoin-600 transition-all duration-200 transform hover:scale-105"
              >
                Start now
                <ArrowRightIcon className="ml-2 h-5 w-5" />
              </Link>
              <a
                href="#docs"
                className="inline-flex items-center px-8 py-4 text-lg font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                <DocumentTextIcon className="mr-2 h-5 w-5" />
                View docs
              </a>
            </div>
          </div>
          
          {/* Dashboard Mockup */}
          <div className="mt-20 relative">
            <div className="relative mx-auto max-w-5xl">
              <div className="rounded-2xl bg-gray-900 p-2 shadow-2xl">
                <div className="rounded-xl bg-white p-8">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-semibold text-gray-900">Payment Dashboard</h3>
                    <div className="flex space-x-2">
                      <div className="w-3 h-3 rounded-full bg-red-400"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                      <div className="w-3 h-3 rounded-full bg-green-400"></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-gradient-to-br from-bitcoin-50 to-bitcoin-100 p-6 rounded-lg">
                      <div className="text-2xl font-bold text-bitcoin-600">$12,543</div>
                      <div className="text-sm text-bitcoin-700">Total Volume</div>
                    </div>
                    <div className="bg-gradient-to-br from-stacks-50 to-stacks-100 p-6 rounded-lg">
                      <div className="text-2xl font-bold text-stacks-600">156</div>
                      <div className="text-sm text-stacks-700">Transactions</div>
                    </div>
                    <div className="bg-gradient-to-br from-success-50 to-success-100 p-6 rounded-lg">
                      <div className="text-2xl font-bold text-success-600">98.5%</div>
                      <div className="text-sm text-success-700">Success Rate</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[
                      { id: '#2314', amount: '0.001 BTC', status: 'Completed', time: '2 min ago' },
                      { id: '#2313', amount: '0.005 BTC', status: 'Completed', time: '5 min ago' },
                      { id: '#2312', amount: '0.002 BTC', status: 'Pending', time: '8 min ago' },
                    ].map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="w-2 h-2 rounded-full bg-bitcoin-400"></div>
                          <span className="font-mono text-sm">{payment.id}</span>
                          <span className="font-semibold">{payment.amount}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            payment.status === 'Completed' 
                              ? 'bg-success-100 text-success-700' 
                              : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {payment.status}
                          </span>
                          <span className="text-gray-500 text-sm">{payment.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Everything you need to accept sBTC payments
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Built on <a href="https://docs.stacks.co/" target="_blank" rel="noopener noreferrer" className="text-stacks-600 hover:text-stacks-700 underline">Stacks</a> for developers, designed for scale. Accept Bitcoin-backed sBTC payments with the same simplicity as traditional payment processors.
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="flex items-start space-x-4">
                <div className="bg-bitcoin-100 p-3 rounded-lg">
                  <CursorArrowRaysIcon className="h-6 w-6 text-bitcoin-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Developer-first</h3>
                  <p className="text-gray-600">
                    Simple APIs, comprehensive documentation, and SDKs in multiple languages. Get started in minutes.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="bg-stacks-100 p-3 rounded-lg">
                  <BoltIcon className="h-6 w-6 text-stacks-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Lightning fast</h3>
                  <p className="text-gray-600">
                    Instant sBTC settlements on the <a href="https://docs.stacks.co/" target="_blank" rel="noopener noreferrer" className="text-stacks-600 hover:text-stacks-700 underline">Stacks blockchain</a>. No waiting for Bitcoin L1 confirmations.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="bg-success-100 p-3 rounded-lg">
                  <CodeBracketIcon className="h-6 w-6 text-success-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Easy integration</h3>
                  <p className="text-gray-600">
                    Drop-in widgets, webhooks, and complete checkout flows. Integrate in any application.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="bg-gray-100 p-3 rounded-lg">
                  <ShieldCheckIcon className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Secure</h3>
                  <p className="text-gray-600">
                    Enterprise-grade security with multi-signature wallets and secure key management.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="relative">
              <div className="bg-gradient-to-br from-bitcoin-500 to-stacks-500 p-1 rounded-2xl">
                <div className="bg-white p-8 rounded-xl">
                  <div className="mb-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Payment Widget</h4>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                        <span className="text-gray-700">Premium Subscription</span>
                        <span className="font-semibold">$29.99</span>
                      </div>
                      <div className="space-y-3">
                        <button className="w-full bg-stacks-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-stacks-600 transition-colors">
                          Pay with sBTC
                        </button>
                        <button className="w-full bg-bitcoin-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-bitcoin-600 transition-colors">
                          Pay with Bitcoin
                        </button>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-500">Powered by</div>
                        <div className="text-sm font-semibold text-bitcoin-500">StacksGate</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Code Example Section */}
      <section id="docs" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Start accepting sBTC payments in minutes
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Our Stacks-powered APIs are designed to be simple and intuitive. Get up and running with Bitcoin-backed payments using just a few lines of code.
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <div className="bg-gray-900 rounded-xl p-6 text-sm font-mono text-gray-300 overflow-x-auto">
                <div className="text-green-400 mb-2">// Install the StacksGate SDK</div>
                <div className="text-blue-400 mb-4">npm install stacksgate</div>
                
                <div className="text-green-400 mb-2">// Initialize StacksGate</div>
                <div className="text-purple-400">import</div> <span className="text-yellow-400">StacksGate</span> <div className="text-purple-400 inline">from</div> <div className="text-green-300 inline">'stacksgate'</div>;
                
                <div className="mt-4 text-yellow-400">StacksGate</div>.<div className="text-blue-400">init</div>({'{'}
                <div className="ml-4">
                  <span className="text-red-400">apiKey:</span> <span className="text-green-300">'pk_live_your_key_here'</span>
                </div>
                {'}'});
                
                <div className="mt-4 text-green-400">// Create a payment intent</div>
                <div className="text-purple-400">const</div> <span className="text-yellow-400">payment</span> = <div className="text-purple-400 inline">await</div> <span className="text-yellow-400">StacksGate</span>.<div className="text-blue-400">createPaymentIntent</div>({'{'}
                <div className="ml-4">
                  <span className="text-red-400">amount:</span> <span className="text-orange-400">50000</span>, <span className="text-green-400">// 50k sats</span>
                </div>
                <div className="ml-4">
                  <span className="text-red-400">description:</span> <span className="text-green-300">'Premium subscription'</span>
                </div>
                {'}'});
                
                <div className="mt-4 text-green-400">// Display the payment widget</div>
                <div className="text-purple-400">const</div> <span className="text-yellow-400">widget</span> = <span className="text-yellow-400">StacksGate</span>.<div className="text-blue-400">createWidget</div>(<span className="text-yellow-400">payment</span>.<div className="text-blue-400">id</div>);
                <div className="text-yellow-400">widget</div>.<div className="text-blue-400">mount</div>();
              </div>
            </div>
            
            <div className="order-1 lg:order-2 space-y-6">
              <div className="flex items-start space-x-4">
                <div className="bg-bitcoin-100 p-2 rounded-lg">
                  <CheckIcon className="h-5 w-5 text-bitcoin-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Simple Integration</h3>
                  <p className="text-gray-600">Just a few lines of code to start accepting sBTC payments on Stacks</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="bg-bitcoin-100 p-2 rounded-lg">
                  <CheckIcon className="h-5 w-5 text-bitcoin-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Flexible Widgets</h3>
                  <p className="text-gray-600">Customizable payment widgets that match your brand</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="bg-bitcoin-100 p-2 rounded-lg">
                  <CheckIcon className="h-5 w-5 text-bitcoin-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Real-time Updates</h3>
                  <p className="text-gray-600">Webhooks and real-time status updates for all transactions</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Simple, transparent pricing
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              No monthly fees. No setup costs. Pay only for what you use.
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Starter */}
            <div className="bg-white rounded-2xl p-8 border border-gray-200">
              <div className="mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Starter</h3>
                <p className="text-gray-600">Perfect for small businesses and side projects</p>
              </div>
              
              <div className="mb-8">
                <div className="text-4xl font-bold text-gray-900 mb-2">
                  2.9%
                  <span className="text-lg font-normal text-gray-600"> per transaction</span>
                </div>
              </div>
              
              <ul className="space-y-4 mb-8">
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-success-500 mr-3" />
                  <span className="text-gray-600">Accept sBTC on Stacks</span>
                </li>
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-success-500 mr-3" />
                  <span className="text-gray-600">Payment widgets</span>
                </li>
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-success-500 mr-3" />
                  <span className="text-gray-600">Webhook support</span>
                </li>
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-success-500 mr-3" />
                  <span className="text-gray-600">API access</span>
                </li>
              </ul>
              
              <Link
                to="/register"
                className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors text-center block"
              >
                Get started
              </Link>
            </div>

            {/* Pro */}
            <div className="bg-white rounded-2xl p-8 border-2 border-bitcoin-500 relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="bg-bitcoin-500 text-white px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </span>
              </div>
              
              <div className="mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Pro</h3>
                <p className="text-gray-600">For growing businesses with higher volume</p>
              </div>
              
              <div className="mb-8">
                <div className="text-4xl font-bold text-gray-900 mb-2">
                  2.5%
                  <span className="text-lg font-normal text-gray-600"> per transaction</span>
                </div>
              </div>
              
              <ul className="space-y-4 mb-8">
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-success-500 mr-3" />
                  <span className="text-gray-600">Everything in Starter</span>
                </li>
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-success-500 mr-3" />
                  <span className="text-gray-600">Priority support</span>
                </li>
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-success-500 mr-3" />
                  <span className="text-gray-600">Advanced analytics</span>
                </li>
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-success-500 mr-3" />
                  <span className="text-gray-600">Custom branding</span>
                </li>
              </ul>
              
              <Link
                to="/register"
                className="w-full bg-bitcoin-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-bitcoin-600 transition-colors text-center block"
              >
                Get started
              </Link>
            </div>

            {/* Enterprise */}
            <div className="bg-white rounded-2xl p-8 border border-gray-200">
              <div className="mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Enterprise</h3>
                <p className="text-gray-600">For large organizations with custom needs</p>
              </div>
              
              <div className="mb-8">
                <div className="text-4xl font-bold text-gray-900 mb-2">
                  Custom
                  <span className="text-lg font-normal text-gray-600"> pricing</span>
                </div>
              </div>
              
              <ul className="space-y-4 mb-8">
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-success-500 mr-3" />
                  <span className="text-gray-600">Everything in Pro</span>
                </li>
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-success-500 mr-3" />
                  <span className="text-gray-600">Dedicated support</span>
                </li>
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-success-500 mr-3" />
                  <span className="text-gray-600">Custom integrations</span>
                </li>
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-success-500 mr-3" />
                  <span className="text-gray-600">SLA guarantees</span>
                </li>
              </ul>
              
              <a
                href="mailto:enterprise@stacksgate.com"
                className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors text-center block"
              >
                Contact sales
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-24 bg-gradient-to-br from-bitcoin-500 to-stacks-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
            Join developers building the future of sBTC payments
          </h2>
          <p className="text-xl text-bitcoin-100 max-w-3xl mx-auto mb-10">
            Start accepting Bitcoin-backed sBTC payments today with our <a href="https://docs.stacks.co/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-bitcoin-100 underline">Stacks-powered</a> developer platform.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/register"
              className="inline-flex items-center px-8 py-4 text-lg font-medium text-bitcoin-600 bg-white rounded-xl hover:bg-gray-50 transition-all duration-200 transform hover:scale-105"
            >
              Start building now
              <ArrowRightIcon className="ml-2 h-5 w-5" />
            </Link>
            <a
              href="#docs"
              className="inline-flex items-center px-8 py-4 text-lg font-medium text-white border border-bitcoin-300 rounded-xl hover:bg-bitcoin-400 transition-colors"
            >
              <DocumentTextIcon className="mr-2 h-5 w-5" />
              Read documentation
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <img 
                  src={logoImage} 
                  alt="StacksGate" 
                  className="h-6 w-auto"
                />
                <span className="text-2xl font-bold text-bitcoin-500">StacksGate</span>
              </div>
              <p className="text-gray-400">
                The simplest way to accept sBTC payments on the <a href="https://docs.stacks.co/" target="_blank" rel="noopener noreferrer" className="text-stacks-400 hover:text-stacks-300 underline">Stacks blockchain</a> for developers.
              </p>
            </div>
            
            <div>
              <h3 className="text-white font-semibold mb-4">Product</h3>
              <ul className="space-y-2">
                <li><a href="#features" className="text-gray-400 hover:text-white">Features</a></li>
                <li><a href="#pricing" className="text-gray-400 hover:text-white">Pricing</a></li>
                <li><a href="#docs" className="text-gray-400 hover:text-white">Documentation</a></li>
                <li><a href="/app" className="text-gray-400 hover:text-white">Dashboard</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-white font-semibold mb-4">Company</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white">About</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Blog</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Careers</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Contact</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-white font-semibold mb-4">Legal</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white">Privacy</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Terms</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Security</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-12 pt-8 text-center">
            <p className="text-gray-400">
              © 2024 StacksGate. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}