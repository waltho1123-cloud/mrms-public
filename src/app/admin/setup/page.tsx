'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { getAuthHeaders } from '@/lib/utils/admin-fetch';

type ApiKeyName = 'OPENAI_API_KEY';

interface ApiKeyStatus {
  name: ApiKeyName;
  configured: boolean;
  masked: string;
}

interface ApiKeyResponse {
  statuses: ApiKeyStatus[];
  updatedAt?: string;
}

interface FieldMeta {
  name: ApiKeyName;
  label: string;
  helper: string;
  placeholder: string;
  link: { href: string; text: string };
}

const FIELDS: FieldMeta[] = [
  {
    name: 'OPENAI_API_KEY',
    label: 'OpenAI API Key',
    helper: '用於語音轉錄 (gpt-4o-mini-transcribe) 與 AI 摘要 (gpt-5.4-mini)',
    placeholder: 'sk-...',
    link: {
      href: 'https://platform.openai.com/api-keys',
      text: '前往 OpenAI 取得',
    },
  },
];

interface TestResult {
  ok: boolean;
  message: string;
}
type FeedbackKind = 'success' | 'error' | 'info';
interface Feedback {
  kind: FeedbackKind;
  message: string;
}

// API key now lives only in the DB (no env fallback in multi-tenant mode),
// so the UI just shows configured vs not.

export default function SetupPage() {
  const [data, setData] = useState<ApiKeyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const [drafts, setDrafts] = useState<Record<ApiKeyName, string>>({
    OPENAI_API_KEY: '',
  });
  const [showRaw, setShowRaw] = useState<Record<ApiKeyName, boolean>>({
    OPENAI_API_KEY: false,
  });
  const [saving, setSaving] = useState<ApiKeyName | null>(null);
  const [testing, setTesting] = useState<ApiKeyName | null>(null);
  const [clearing, setClearing] = useState<ApiKeyName | null>(null);
  const [feedback, setFeedback] = useState<Partial<Record<ApiKeyName, Feedback>>>({});
  const [testResults, setTestResults] = useState<Partial<Record<ApiKeyName, TestResult>>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/setup/api-keys', { headers: getAuthHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || '載入失敗');
      setData(json.data as ApiKeyResponse);
      setPageError('');
    } catch (err) {
      setPageError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (name: ApiKeyName) => {
    const value = drafts[name].trim();
    if (!value) {
      setFeedback((p) => ({ ...p, [name]: { kind: 'error', message: '請填入 API key' } }));
      return;
    }
    setSaving(name);
    setFeedback((p) => ({ ...p, [name]: undefined }));
    setTestResults((p) => ({ ...p, [name]: undefined }));
    try {
      const res = await fetch('/api/v1/setup/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ [name]: value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || '儲存失敗');
      setData(json.data as ApiKeyResponse);
      setDrafts((p) => ({ ...p, [name]: '' }));
      setFeedback((p) => ({
        ...p,
        [name]: { kind: 'success', message: '已儲存到資料庫，最多 30 秒內全部 process 生效' },
      }));
    } catch (err) {
      setFeedback((p) => ({
        ...p,
        [name]: { kind: 'error', message: err instanceof Error ? err.message : '儲存失敗' },
      }));
    } finally {
      setSaving(null);
    }
  };

  const handleTest = async (name: ApiKeyName) => {
    setTesting(name);
    setTestResults((p) => ({ ...p, [name]: undefined }));
    try {
      const res = await fetch('/api/v1/setup/api-keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) {
        setTestResults((p) => ({
          ...p,
          [name]: { ok: false, message: json?.error?.message || '驗證失敗' },
        }));
      } else {
        setTestResults((p) => ({
          ...p,
          [name]: { ok: true, message: json?.data?.message || '驗證成功' },
        }));
      }
    } catch (err) {
      setTestResults((p) => ({
        ...p,
        [name]: { ok: false, message: err instanceof Error ? err.message : '驗證失敗' },
      }));
    } finally {
      setTesting(null);
    }
  };

  const handleClear = async (name: ApiKeyName) => {
    if (!confirm(`確定要從資料庫清除 ${name}？（若環境變數中有設值，會回退使用環境變數）`)) {
      return;
    }
    setClearing(name);
    try {
      const res = await fetch(`/api/v1/setup/api-keys?name=${name}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || '清除失敗');
      setData(json.data as ApiKeyResponse);
      setFeedback((p) => ({ ...p, [name]: { kind: 'info', message: '已清除' } }));
      setTestResults((p) => ({ ...p, [name]: undefined }));
    } catch (err) {
      setFeedback((p) => ({
        ...p,
        [name]: { kind: 'error', message: err instanceof Error ? err.message : '清除失敗' },
      }));
    } finally {
      setClearing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner text="載入設定中..." />
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {pageError}
        </div>
      </div>
    );
  }

  const statusMap = new Map((data?.statuses ?? []).map((s) => [s.name, s] as const));

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
        <p className="mt-1 text-sm text-gray-500">
          僅限已登入的 admin 可存取與修改。儲存後立即在本 process 生效；其他 process（worker）最多 30 秒內生效。
        </p>
      </div>

      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 space-y-1">
        <p className="font-medium">儲存位置</p>
        <ul className="list-disc list-inside text-xs space-y-0.5 text-blue-700">
          <li>寫入 PostgreSQL（<code className="px-1 bg-blue-100 rounded">AppSetting</code> table），Zeabur redeploy 後仍保留</li>
          <li>若 DB 中沒有設定，會 fallback 至環境變數 <code className="px-1 bg-blue-100 rounded">OPENAI_API_KEY</code></li>
          <li>DB 中的值優先於環境變數</li>
        </ul>
      </div>

      <div className="space-y-4">
        {FIELDS.map((meta) => {
          const status = statusMap.get(meta.name);
          const fb = feedback[meta.name];
          const tr = testResults[meta.name];
          const isSaving = saving === meta.name;
          const isTesting = testing === meta.name;
          const isClearing = clearing === meta.name;

          return (
            <div key={meta.name} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{meta.label}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{meta.helper}</p>
                </div>
                <span
                  className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                    status?.configured
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {status?.configured ? '已設定' : '未設定'}
                </span>
              </div>

              {status?.configured && (
                <div className="mb-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-gray-700 break-all">
                    目前: {status.masked}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
                    onClick={() => handleClear(meta.name)}
                    loading={isClearing}
                    title="從資料庫清除"
                  >
                    清除
                  </Button>
                </div>
              )}

              <div className="relative">
                <Input
                  label={status?.configured ? '更新 Key' : '填入 Key'}
                  type={showRaw[meta.name] ? 'text' : 'password'}
                  placeholder={meta.placeholder}
                  value={drafts[meta.name]}
                  onChange={(e) =>
                    setDrafts((p) => ({ ...p, [meta.name]: e.target.value }))
                  }
                  disabled={isSaving}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowRaw((p) => ({ ...p, [meta.name]: !p[meta.name] }))
                  }
                  className="absolute right-3 top-[34px] text-xs text-gray-500 hover:text-gray-700"
                  tabIndex={-1}
                >
                  {showRaw[meta.name] ? '隱藏' : '顯示'}
                </button>
              </div>

              <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
                <a
                  href={meta.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                >
                  {meta.link.text}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleTest(meta.name)}
                    loading={isTesting}
                    disabled={!status?.configured || isSaving}
                  >
                    測試連線
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSave(meta.name)}
                    loading={isSaving}
                    disabled={!drafts[meta.name].trim()}
                  >
                    儲存
                  </Button>
                </div>
              </div>

              {fb && (
                <div
                  className={`mt-3 px-3 py-2 rounded-lg text-xs ${
                    fb.kind === 'success'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : fb.kind === 'error'
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}
                >
                  {fb.message}
                </div>
              )}

              {tr && (
                <div
                  className={`mt-2 px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 ${
                    tr.ok
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {tr.ok ? '✓' : '✗'} {tr.message}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {data?.updatedAt && (
        <p className="mt-6 text-xs text-gray-400 text-center">
          最後更新：{new Date(data.updatedAt).toLocaleString('zh-TW')}
        </p>
      )}
    </div>
  );
}
