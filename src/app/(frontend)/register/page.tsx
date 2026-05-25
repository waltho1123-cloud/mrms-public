'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { getStoredUser, storeAuth } from '@/lib/utils/admin-fetch';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (getStoredUser()) router.replace('/');
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '註冊失敗');

      const token = data.token || data.data?.token;
      const user = data.user || data.data?.user;
      storeAuth(token, {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });
      // First-time users go directly to settings to fill in their OpenAI key
      router.replace('/me/settings?welcome=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : '註冊失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">建立帳號</h1>
      <p className="text-sm text-gray-500 mb-6">註冊後請填入您自己的 OpenAI API key 才能使用服務。</p>

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
            label="顯示名稱（選填）"
            placeholder="你的名字"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
          <Input
            label="密碼"
            type="password"
            placeholder="至少 8 字"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            helperText="至少 8 字"
          />
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            建立帳號
          </Button>
        </form>
      </div>

      <p className="text-center text-sm text-gray-500 mt-4">
        已有帳號？{' '}
        <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
          直接登入
        </Link>
      </p>
    </div>
  );
}
