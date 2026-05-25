'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import TextArea from '@/components/ui/TextArea';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { getAuthHeaders, getStoredUser } from '@/lib/utils/admin-fetch';
import { formatDate } from '@/lib/utils/format';

interface ApiKeyStatus {
  name: 'OPENAI_API_KEY';
  configured: boolean;
  masked: string;
}

interface ApiKeyResponse {
  statuses: ApiKeyStatus[];
  updatedAt?: string;
}

interface Webhook {
  id: string;
  name: string;
  webhookUrl: string; // = groupId
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

interface WebhookForm {
  name: string;
  webhookUrl: string;
  secret: string;
  isDefault: boolean;
}

const emptyWebhookForm: WebhookForm = { name: '', webhookUrl: '', secret: '', isDefault: false };

interface MyPrompt {
  id: string;
  name: string;
  description: string | null;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MyPromptsResponse {
  items: MyPrompt[];
  count: number;
  max: number;
}

interface PromptForm {
  name: string;
  description: string;
  content: string;
}

const emptyPromptForm: PromptForm = { name: '', description: '', content: '' };

// useSearchParams forces CSR bailout; without Suspense, `next build` fails.
export default function MeSettingsPage() {
  return (
    <Suspense fallback={null}>
      <MeSettingsInner />
    </Suspense>
  );
}

function MeSettingsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const showWelcome = search.get('welcome') === '1';

  const [authChecked, setAuthChecked] = useState(false);
  const [apiData, setApiData] = useState<ApiKeyResponse | null>(null);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);

  // OpenAI key state
  const [draft, setDraft] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState<{ kind: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [keyTest, setKeyTest] = useState<{ ok: boolean; message: string } | null>(null);

  // Webhook state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [whForm, setWhForm] = useState<WebhookForm>(emptyWebhookForm);
  const [savingWh, setSavingWh] = useState(false);
  const [deletingWh, setDeletingWh] = useState<string | null>(null);
  const [testingWh, setTestingWh] = useState<string | null>(null);
  const [whTestResult, setWhTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);

  // Prompt state
  const [prompts, setPrompts] = useState<MyPromptsResponse | null>(null);
  const [pModalOpen, setPModalOpen] = useState(false);
  const [pEditingId, setPEditingId] = useState<string | null>(null);
  const [pForm, setPForm] = useState<PromptForm>(emptyPromptForm);
  const [savingP, setSavingP] = useState(false);
  const [deletingP, setDeletingP] = useState<string | null>(null);
  const [pError, setPError] = useState('');

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/login?next=/me/settings');
      return;
    }
    setAuthChecked(true);
  }, [router]);

  const load = useCallback(async () => {
    if (!authChecked) return;
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [apiRes, whRes, pRes] = await Promise.all([
        fetch('/api/v1/setup/api-keys', { headers }).then((r) => r.json()),
        fetch('/api/v1/admin/webhooks', { headers }).then((r) => r.json()),
        fetch('/api/v1/me/prompts', { headers }).then((r) => r.json()),
      ]);
      if (apiRes?.data) setApiData(apiRes.data as ApiKeyResponse);
      const list = whRes?.data;
      setWebhooks(Array.isArray(list) ? list : []);
      if (pRes?.data) setPrompts(pRes.data as MyPromptsResponse);
    } finally {
      setLoading(false);
    }
  }, [authChecked]);

  useEffect(() => { load(); }, [load]);

  const openaiStatus = apiData?.statuses?.find((s) => s.name === 'OPENAI_API_KEY');

  // ---- OpenAI key handlers ----
  const handleSaveKey = async () => {
    const value = draft.trim();
    if (!value) {
      setKeyFeedback({ kind: 'error', message: '請填入 API key' });
      return;
    }
    setSavingKey(true);
    setKeyFeedback(null);
    setKeyTest(null);
    try {
      const res = await fetch('/api/v1/setup/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ OPENAI_API_KEY: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || '儲存失敗');
      setApiData(data.data as ApiKeyResponse);
      setDraft('');
      setKeyFeedback({ kind: 'success', message: '已儲存。即刻可上傳音檔。' });
    } catch (err) {
      setKeyFeedback({ kind: 'error', message: err instanceof Error ? err.message : '儲存失敗' });
    } finally {
      setSavingKey(false);
    }
  };

  const handleTestKey = async () => {
    setTestingKey(true);
    setKeyTest(null);
    try {
      const res = await fetch('/api/v1/setup/api-keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: 'OPENAI_API_KEY' }),
      });
      const data = await res.json();
      setKeyTest({
        ok: res.ok,
        message: res.ok ? data?.data?.message || '驗證成功' : data?.error?.message || '驗證失敗',
      });
    } catch (err) {
      setKeyTest({ ok: false, message: err instanceof Error ? err.message : '驗證失敗' });
    } finally {
      setTestingKey(false);
    }
  };

  const handleClearKey = async () => {
    if (!confirm('確定要清除 OpenAI API key？清除後將無法繼續上傳音檔。')) return;
    try {
      const res = await fetch('/api/v1/setup/api-keys?name=OPENAI_API_KEY', {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || '清除失敗');
      setApiData(data.data as ApiKeyResponse);
      setKeyFeedback({ kind: 'info', message: '已清除' });
      setKeyTest(null);
    } catch (err) {
      setKeyFeedback({ kind: 'error', message: err instanceof Error ? err.message : '清除失敗' });
    }
  };

  // ---- Webhook handlers ----
  const openCreate = () => {
    setEditingId(null);
    setWhForm(emptyWebhookForm);
    setModalOpen(true);
  };
  const openEdit = (w: Webhook) => {
    setEditingId(w.id);
    setWhForm({ name: w.name, webhookUrl: w.webhookUrl, secret: '', isDefault: w.isDefault });
    setModalOpen(true);
  };

  const saveWebhook = async () => {
    if (!whForm.name.trim() || !whForm.webhookUrl.trim()) return;
    if (!editingId && !whForm.secret.trim()) return;
    setSavingWh(true);
    try {
      const url = editingId ? `/api/v1/admin/webhooks/${editingId}` : '/api/v1/admin/webhooks';
      const payload = editingId
        ? {
            name: whForm.name,
            webhookUrl: whForm.webhookUrl,
            isDefault: whForm.isDefault,
            ...(whForm.secret.trim() ? { secret: whForm.secret } : {}),
          }
        : whForm;
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || '儲存失敗');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSavingWh(false);
    }
  };

  const deleteWebhook = async (id: string) => {
    if (!confirm('確定要刪除此 LINE Bot？')) return;
    setDeletingWh(id);
    try {
      const res = await fetch(`/api/v1/admin/webhooks/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('刪除失敗');
      load();
    } catch {
      alert('刪除失敗');
    } finally {
      setDeletingWh(null);
    }
  };

  const testWebhook = async (id: string) => {
    setTestingWh(id);
    setWhTestResult(null);
    try {
      const res = await fetch(`/api/v1/admin/webhooks/${id}/test`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setWhTestResult({
        id,
        ok: res.ok,
        message: data?.data?.message || data?.error?.message || (res.ok ? '推送成功' : '推送失敗'),
      });
    } catch {
      setWhTestResult({ id, ok: false, message: '推送失敗' });
    } finally {
      setTestingWh(null);
    }
  };

  // ---- Prompt handlers ----
  const openCreatePrompt = () => {
    setPEditingId(null);
    setPForm(emptyPromptForm);
    setPError('');
    setPModalOpen(true);
  };
  const openEditPrompt = (p: MyPrompt) => {
    setPEditingId(p.id);
    setPForm({ name: p.name, description: p.description ?? '', content: p.content });
    setPError('');
    setPModalOpen(true);
  };
  const savePrompt = async () => {
    const name = pForm.name.trim();
    const content = pForm.content.trim();
    if (!name) { setPError('請填入範本名稱'); return; }
    if (content.length < 10) { setPError('內容至少 10 字'); return; }
    setSavingP(true);
    setPError('');
    try {
      const url = pEditingId ? `/api/v1/me/prompts/${pEditingId}` : '/api/v1/me/prompts';
      const res = await fetch(url, {
        method: pEditingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name,
          description: pForm.description.trim() || null,
          content,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || '儲存失敗');
      setPModalOpen(false);
      load();
    } catch (err) {
      setPError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSavingP(false);
    }
  };
  const deletePrompt = async (id: string) => {
    if (!confirm('確定要刪除此範本？')) return;
    setDeletingP(id);
    try {
      const res = await fetch(`/api/v1/me/prompts/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('刪除失敗');
      load();
    } catch {
      alert('刪除失敗');
    } finally {
      setDeletingP(null);
    }
  };

  const maskTargetId = (g: string) => (g.length > 20 ? `${g.slice(0, 8)}…${g.slice(-6)}` : g);

  // LINE Target ID 格式：
  //   U + 32 hex → 個人 user
  //   C + 32 hex → 群組
  const detectTargetType = (id: string): { label: string; color: string } | null => {
    const t = id.trim();
    if (/^U[0-9a-f]{32}$/i.test(t)) return { label: '個人', color: 'bg-blue-100 text-blue-700' };
    if (/^C[0-9a-f]{32}$/i.test(t)) return { label: '群組', color: 'bg-green-100 text-green-700' };
    return null;
  };

  const isValidTargetId = (id: string): boolean => detectTargetType(id) !== null;

  if (!authChecked) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">我的設定</h1>
        <p className="mt-1 text-sm text-gray-500">所有設定僅屬於您的帳號，其他使用者看不到。</p>
      </div>

      {showWelcome && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <p className="font-medium">歡迎！</p>
          <p className="text-xs mt-0.5 text-blue-700">為了使用本服務，請先填入您自己的 OpenAI API key。費用會直接從您的 OpenAI 帳號扣除。</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner text="載入中..." /></div>
      ) : (
        <>
          {/* OpenAI API Key */}
          <section className="mb-8 bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">OpenAI API Key</h2>
                <p className="text-xs text-gray-500 mt-0.5">用於語音轉錄與 AI 摘要</p>
              </div>
              <span
                className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                  openaiStatus?.configured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {openaiStatus?.configured ? '已設定' : '未設定'}
              </span>
            </div>

            {openaiStatus?.configured && (
              <div className="mb-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-gray-700">目前: {openaiStatus.masked}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={handleClearKey}
                >
                  清除
                </Button>
              </div>
            )}

            <div className="relative">
              <Input
                label={openaiStatus?.configured ? '更新 Key' : '填入 Key'}
                type={showRaw ? 'text' : 'password'}
                placeholder="sk-..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={savingKey}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowRaw((p) => !p)}
                className="absolute right-3 top-[34px] text-xs text-gray-500 hover:text-gray-700"
                tabIndex={-1}
              >
                {showRaw ? '隱藏' : '顯示'}
              </button>
            </div>

            <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
              >
                前往 OpenAI 取得 API key →
              </a>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleTestKey}
                  loading={testingKey}
                  disabled={!openaiStatus?.configured || savingKey}
                >
                  測試連線
                </Button>
                <Button size="sm" onClick={handleSaveKey} loading={savingKey} disabled={!draft.trim()}>
                  儲存
                </Button>
              </div>
            </div>

            {keyFeedback && (
              <div
                className={`mt-3 px-3 py-2 rounded-lg text-xs ${
                  keyFeedback.kind === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : keyFeedback.kind === 'error'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}
              >
                {keyFeedback.message}
              </div>
            )}
            {keyTest && (
              <div
                className={`mt-2 px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 ${
                  keyTest.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {keyTest.ok ? '✓' : '✗'} {keyTest.message}
              </div>
            )}
          </section>

          {/* Webhooks */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">LINE Bot 推送設定</h2>
                <p className="text-xs text-gray-500 mt-0.5">摘要完成後可選擇推送到您的 LINE 群組</p>
              </div>
              <Button size="sm" onClick={openCreate}>新增</Button>
            </div>

            {webhooks.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-xl border border-gray-200">
                <p className="text-sm text-gray-500">尚未設定任何 LINE Bot</p>
              </div>
            ) : (
              <div className="space-y-3">
                {webhooks.map((w) => {
                  const t = detectTargetType(w.webhookUrl);
                  return (
                  <div key={w.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-gray-900">{w.name}</h3>
                          {t && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.color}`}>
                              {t.label}
                            </span>
                          )}
                          {w.isDefault && <Badge variant="success">預設</Badge>}
                          {!w.isActive && <Badge variant="neutral">停用</Badge>}
                        </div>
                        <p className="text-xs text-gray-500 font-mono truncate">
                          {t?.label === '個人' ? 'User ID' : t?.label === '群組' ? 'Group ID' : 'Target ID'}: {maskTargetId(w.webhookUrl)}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">建立於 {formatDate(w.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-1 ml-3">
                        <Button variant="secondary" size="sm" onClick={() => testWebhook(w.id)} loading={testingWh === w.id}>
                          測試
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(w)}>編輯</Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => deleteWebhook(w.id)}
                          loading={deletingWh === w.id}
                        >
                          刪除
                        </Button>
                      </div>
                    </div>
                    {whTestResult?.id === w.id && (
                      <div
                        className={`mt-3 p-2 rounded-lg text-xs ${
                          whTestResult.ok
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {whTestResult.message}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* My Prompt Templates */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">我的 Prompt 範本</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  最多 {prompts?.max ?? 5} 個，目前 {prompts?.count ?? 0} 個。上傳音檔時可從下拉選單選用您自己的範本（系統範本仍可使用）。
                </p>
              </div>
              <Button
                size="sm"
                onClick={openCreatePrompt}
                disabled={(prompts?.count ?? 0) >= (prompts?.max ?? 5)}
                title={
                  (prompts?.count ?? 0) >= (prompts?.max ?? 5)
                    ? '已達上限，請先刪除舊範本'
                    : ''
                }
              >
                新增範本
              </Button>
            </div>

            {!prompts || prompts.items.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-xl border border-gray-200">
                <p className="text-sm text-gray-500">尚未建立任何個人範本</p>
              </div>
            ) : (
              <div className="space-y-3">
                {prompts.items.map((p) => (
                  <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-gray-900">{p.name}</h3>
                          {!p.isActive && <Badge variant="neutral">停用</Badge>}
                        </div>
                        {p.description && (
                          <p className="text-xs text-gray-600 mb-1">{p.description}</p>
                        )}
                        <p className="text-xs text-gray-400">
                          {p.content.length} 字 · 更新於 {formatDate(p.updatedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => openEditPrompt(p)}>編輯</Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => deletePrompt(p.id)}
                          loading={deletingP === p.id}
                        >
                          刪除
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? '編輯 LINE Bot' : '新增 LINE Bot'}
      >
        <div className="space-y-4">
          <Input
            label="Bot 名稱"
            placeholder="例如：產品團隊群組"
            value={whForm.name}
            onChange={(e) => setWhForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <div>
            <Input
              label="LINE Target ID（推送目標）"
              placeholder="U... 或 C..."
              value={whForm.webhookUrl}
              onChange={(e) => setWhForm((f) => ({ ...f, webhookUrl: e.target.value }))}
              required
              error={
                whForm.webhookUrl && !isValidTargetId(whForm.webhookUrl)
                  ? '格式錯誤：需以 U 或 C 開頭，後接 32 個 hex 字'
                  : undefined
              }
              helperText={
                whForm.webhookUrl && isValidTargetId(whForm.webhookUrl)
                  ? `識別為「${detectTargetType(whForm.webhookUrl)?.label}」`
                  : '個人 user ID（U…）或群組 ID（C…）皆可'
              }
            />
            <ul className="mt-1.5 text-xs text-gray-500 list-disc list-inside space-y-0.5">
              <li><span className="font-mono">U</span> 開頭 → 個人 user（私訊）</li>
              <li><span className="font-mono">C</span> 開頭 → 群組</li>
            </ul>
          </div>
          <Input
            label="Channel Access Token"
            type="password"
            placeholder="LINE Channel Access Token..."
            value={whForm.secret}
            onChange={(e) => setWhForm((f) => ({ ...f, secret: e.target.value }))}
            helperText={editingId ? '留空表示不變更 Token' : 'LINE Bot 的 Channel Access Token'}
            required={!editingId}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={whForm.isDefault}
              onChange={(e) => setWhForm((f) => ({ ...f, isDefault: e.target.checked }))}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">設為預設</span>
          </label>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>取消</Button>
            <Button
              loading={savingWh}
              onClick={saveWebhook}
              disabled={
                !whForm.name.trim() ||
                !isValidTargetId(whForm.webhookUrl) ||
                (!editingId && !whForm.secret.trim())
              }
            >
              {editingId ? '更新' : '建立'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={pModalOpen}
        onClose={() => setPModalOpen(false)}
        title={pEditingId ? '編輯 Prompt 範本' : '新增 Prompt 範本'}
      >
        <div className="space-y-4">
          <Input
            label="範本名稱"
            placeholder="例如：技術會議、課程筆記、客戶訪談"
            value={pForm.name}
            onChange={(e) => setPForm((f) => ({ ...f, name: e.target.value }))}
            required
            maxLength={100}
          />
          <Input
            label="簡短說明（選填）"
            placeholder="一句話描述適用情境"
            value={pForm.description}
            onChange={(e) => setPForm((f) => ({ ...f, description: e.target.value }))}
            maxLength={300}
          />
          <TextArea
            label="Prompt 內容"
            placeholder="輸入完整 prompt（system prompt）..."
            value={pForm.content}
            onChange={(e) => setPForm((f) => ({ ...f, content: e.target.value }))}
            rows={12}
            helperText={`AI 摘要必須輸出四個欄位：summary / keyPoints / sentimentAnalysis / actionItems（schema 強制）。您的 prompt 可以重新詮釋每個欄位的語意，例如把 sentimentAnalysis 改作「補充說明」。${pForm.content.length} / 50000 字`}
          />
          {pError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {pError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setPModalOpen(false)}>取消</Button>
            <Button
              loading={savingP}
              onClick={savePrompt}
              disabled={!pForm.name.trim() || pForm.content.trim().length < 10}
            >
              {pEditingId ? '更新' : '建立'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
