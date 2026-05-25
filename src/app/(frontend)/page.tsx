'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import FileUpload from '@/components/ui/FileUpload';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import StatusTracker from '@/components/ui/StatusTracker';
import { useTaskUpload } from '@/lib/hooks/useTaskUpload';
import { useSSE } from '@/lib/hooks/useSSE';
import type { TaskStatus, PromptTemplateBase } from '@/lib/types';
import { getAuthHeaders, getStoredToken, getStoredUser, type StoredUser } from '@/lib/utils/admin-fetch';

export default function HomePage() {
  const router = useRouter();
  const upload = useTaskUpload();

  const [me, setMe] = useState<StoredUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [hasOpenAiKey, setHasOpenAiKey] = useState<boolean | null>(null);

  const [meetingTopic, setMeetingTopic] = useState('');
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split('T')[0]);
  const [participants, setParticipants] = useState('');
  const [promptTemplateId, setPromptTemplateId] = useState('');
  const [prompts, setPrompts] = useState<PromptTemplateBase[]>([]);
  const [formError, setFormError] = useState('');

  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const [taskProgress, setTaskProgress] = useState(0);

  useEffect(() => {
    setMe(getStoredUser());
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    if (!me) return;
    fetch('/api/v1/setup/api-keys', { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((data) => {
        const s = data?.data?.statuses?.find?.((x: { name: string }) => x.name === 'OPENAI_API_KEY');
        setHasOpenAiKey(!!s?.configured);
      })
      .catch(() => setHasOpenAiKey(false));
  }, [me]);

  // Re-fetch prompts whenever auth state changes so personal templates
  // appear after login. `/api/v1/prompts` requires the bearer token to
  // include user-owned prompts.
  useEffect(() => {
    if (!authChecked) return;
    fetch('/api/v1/prompts', { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((data) => {
        const raw = data?.data ?? data;
        const list: PromptTemplateBase[] = Array.isArray(raw) ? raw : [];
        setPrompts(list);
        const def = list.find((p) => p.isDefault);
        if (def) setPromptTemplateId(def.id);
      })
      .catch(() => { /* prompts endpoint not ready */ });
  }, [authChecked, me]);

  const sseToken = getStoredToken();
  const { isConnected: sseConnected } = useSSE({
    url: upload.taskId && sseToken
      ? `/api/v1/tasks/${upload.taskId}/sse?token=${encodeURIComponent(sseToken)}`
      : '',
    enabled: !!upload.taskId && taskStatus !== 'completed' && taskStatus !== 'error',
    onMessage: useCallback(
      (event: { event: string; data: unknown }) => {
        if (!event.data || typeof event.data !== 'object') return;
        const data = event.data as Record<string, unknown>;
        if (data.status) setTaskStatus(data.status as TaskStatus);
        if (typeof data.progressPct === 'number') setTaskProgress(data.progressPct);
        if (data.status === 'review' || data.status === 'completed') {
          setTimeout(() => { router.push(`/tasks/${upload.taskId}`); }, 1500);
        }
      },
      [router, upload.taskId]
    ),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!meetingTopic.trim()) { setFormError('請輸入會議主題'); return; }
    if (!upload.file) { setFormError('請選擇音檔'); return; }

    const taskId = await upload.upload({
      meetingTopic: meetingTopic.trim(),
      meetingDate,
      participants: participants.trim() || undefined,
      promptTemplateId: promptTemplateId || undefined,
    });
    if (taskId) {
      setTaskStatus('uploaded');
      setTaskProgress(10);
    }
  };

  const isProcessing = upload.uploading || (upload.taskId && taskStatus !== 'completed' && taskStatus !== 'error');

  if (!authChecked) return null;

  // Landing page for unauthenticated visitors
  if (!me) {
    return (
      <div className="max-w-3xl mx-auto text-center py-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">MRMS 會議錄音整理</h1>
        <p className="text-base text-gray-600 mb-2">上傳會議錄音 → 自動轉錄 → AI 整理為結構化會議紀錄</p>
        <p className="text-sm text-gray-500 mb-8">使用您自己的 OpenAI API key，費用直接從 OpenAI 帳號扣除。</p>
        <div className="flex justify-center gap-3 mb-12">
          <Link
            href="/register"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-blue-600 text-white text-base font-medium hover:bg-blue-700"
          >
            免費註冊
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-white border border-gray-300 text-gray-700 text-base font-medium hover:bg-gray-50"
          >
            登入
          </Link>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 text-left">
          {[
            { title: '隱私', desc: 'API key 存在您自己的帳號下，僅限您本人使用' },
            { title: '可控成本', desc: '使用您自己的 OpenAI 帳號，用多少付多少' },
            { title: '即時推送', desc: '整理完可選擇推送到您的 LINE 群組' },
          ].map((f) => (
            <div key={f.title} className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-900">{f.title}</h3>
              <p className="text-xs text-gray-500 mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Authenticated but missing OpenAI key — gate before upload
  if (hasOpenAiKey === false) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white border border-blue-200 rounded-xl p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-2">先設定您的 OpenAI API key</h1>
          <p className="text-sm text-gray-600 mb-4">
            為了讓您能上傳並處理錄音，請先在「我的設定」填入您自己的 OpenAI API key。
            費用會直接從您的 OpenAI 帳號扣除。
          </p>
          <Link
            href="/me/settings?welcome=1"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            前往設定
          </Link>
        </div>
      </div>
    );
  }

  // Loading state while checking key
  if (hasOpenAiKey === null) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">上傳會議錄音</h1>
        <p className="mt-1 text-sm text-gray-500">上傳音檔後，系統將自動進行語音轉錄與摘要整理</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">音檔上傳</h2>
          <FileUpload
            onFileSelect={upload.setFile}
            fileName={upload.fileName}
            progress={upload.uploading ? upload.progress : undefined}
            disabled={!!isProcessing}
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">會議資訊</h2>
          <Input label="會議主題" placeholder="請輸入會議主題" value={meetingTopic} onChange={(e) => setMeetingTopic(e.target.value)} required disabled={!!isProcessing} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="會議日期" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} disabled={!!isProcessing} />
            <Select
              label="Prompt 範本"
              options={prompts.map((p) => ({ value: p.id, label: p.name + (p.isDefault ? ' (預設)' : '') }))}
              value={promptTemplateId}
              onChange={(e) => setPromptTemplateId(e.target.value)}
              placeholder="使用預設範本"
              disabled={!!isProcessing}
            />
          </div>
          <Input label="參與者" placeholder="多位參與者請用逗號分隔（選填）" value={participants} onChange={(e) => setParticipants(e.target.value)} helperText="例如：張三, 李四, 王五" disabled={!!isProcessing} />
        </div>

        {(formError || upload.error) && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-red-700">{formError || upload.error}</p>
          </div>
        )}

        {!upload.taskId && (
          <Button type="submit" size="lg" className="w-full" loading={upload.uploading} disabled={upload.uploading || !upload.file}>
            {upload.uploading ? '上傳中...' : '開始處理'}
          </Button>
        )}
      </form>

      {upload.taskId && taskStatus && (
        <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">處理進度</h2>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-xs text-gray-500">{sseConnected ? '即時更新中' : '連線中...'}</span>
            </div>
          </div>
          <StatusTracker status={taskStatus} progressPct={taskProgress} />
          {(taskStatus === 'review' || taskStatus === 'completed') && (
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600 mb-3">處理完成！即將跳轉至詳情頁...</p>
              <Button variant="primary" onClick={() => router.push(`/tasks/${upload.taskId}`)}>查看會議紀錄</Button>
            </div>
          )}
          {taskStatus === 'error' && (
            <div className="mt-6 text-center">
              <p className="text-sm text-red-600 mb-3">處理失敗，請重新上傳</p>
              <Button variant="secondary" onClick={upload.reset}>重新上傳</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
