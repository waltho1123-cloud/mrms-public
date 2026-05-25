'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { getStoredUser, safeRedirect, storeAuth } from '@/lib/utils/admin-fetch';

// `useSearchParams` causes the App Router to bail out of static prerendering;
// without a Suspense boundary, `next build` fails with the
// "missing-suspense-with-csr-bailout" error. Wrap the inner form so the
// outer page can still be statically shelled.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = safeRedirect(search.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (getStoredUser()) router.replace(next);
  }, [router, next]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '登入失敗');

      const token = data.token || data.data?.token;
      const user = data.user || data.data?.user;
      storeAuth(token, {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">登入</h1>
      <p className="text-sm text-gray-500 mb-6">登入後可上傳會議錄音並管理您的設定。</p>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="電子信箱"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Input
            label="密碼"
            type="password"
            placeholder="請輸入密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            登入
          </Button>
        </form>
      </div>

      <p className="text-center text-sm text-gray-500 mt-4">
        還沒有帳號？{' '}
        <Link href="/register" className="text-blue-600 hover:text-blue-700 font-medium">
          建立新帳號
        </Link>
      </p>
    </div>
  );
}
