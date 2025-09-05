import { Link } from 'react-router-dom';
import { HomeIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full text-center">
        {/* 404 Icon */}
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-bitcoin-500">404</h1>
        </div>

        {/* Error Message */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Page Not Found</h2>
          <p className="text-gray-600">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/dashboard"
            className="btn-primary flex items-center justify-center space-x-2"
          >
            <HomeIcon className="h-5 w-5" />
            <span>Go to Dashboard</span>
          </Link>
          
          <button
            onClick={() => window.history.back()}
            className="btn-secondary flex items-center justify-center space-x-2"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            <span>Go Back</span>
          </button>
        </div>

        {/* Additional Links */}
        <div className="mt-8 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500 mb-4">
            Need help? Try these common pages:
          </p>
          <div className="space-y-2">
            <Link
              to="/payments"
              className="block text-bitcoin-600 hover:text-bitcoin-500 text-sm"
            >
              View Payments
            </Link>
            <Link
              to="/integration"
              className="block text-bitcoin-600 hover:text-bitcoin-500 text-sm"
            >
              Integration Guide
            </Link>
            <Link
              to="/settings"
              className="block text-bitcoin-600 hover:text-bitcoin-500 text-sm"
            >
              Account Settings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}