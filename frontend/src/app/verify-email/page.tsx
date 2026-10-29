'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const emailParam = searchParams.get('email') || '';
  const purposeParam = (searchParams.get('purpose') as 'register' | 'reset') || 'register';

  const [email, setEmail] = useState(emailParam);
  const [purpose, setPurpose] = useState<'register' | 'reset'>(purposeParam);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (emailParam) setEmail(emailParam);
    if (purposeParam) setPurpose(purposeParam);
  }, [emailParam, purposeParam]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('http://127.0.0.1:8000/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose, code }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Verification failed.');
      }

      setMessage({ type: 'success', text: 'Email verified successfully!' });
      
      if (purpose === 'register') {
        setTimeout(() => router.push('/login'), 1500);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'An error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Verify Your Email</h1>
          <p className="text-sm text-gray-600 mt-1">
            Enter the 6-digit code sent to <span className="font-semibold">{email || 'your email'}</span>
          </p>
        </div>

        {message && (
          <div className={`p-4 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-orange-500 focus:border-orange-500"
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Verification Code</label>
            <input
              type="text"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 block w-full px-3 py-2 tracking-widest text-center text-xl font-bold border border-gray-300 rounded-lg shadow-sm focus:ring-orange-500 focus:border-orange-500"
              placeholder="123456"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify Code'}
          </button>
        </form>

        <div className="text-center text-sm">
          <Link href="/login" className="text-orange-600 hover:text-orange-500 font-medium">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Loading verification page...</div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}