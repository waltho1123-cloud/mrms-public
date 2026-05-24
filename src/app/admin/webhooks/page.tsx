'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatDate } from '@/lib/utils/format';
import { getAuthHeaders } from '@/lib/utils/admin-fetch';

interface Webhook {
  id: string;
  name: string;
  webhookUrl: string;
  // secret is intentionally omitted from GET listing for security
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

const emptyForm: WebhookForm = {
  name: '',
  webhookUrl: '',
  secret: '',
  isDefault: false,
};

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WebhookForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    success: boolean;
    message: string;
  } | null>(null);

  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/webhooks', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('載入失敗');
      const data = await res.json();
      setWebhooks(data.data || data || []);
    } catch {
      // API not ready
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const maskGroupId = (groupId: string) => {
    if (groupId.length > 20) {
      return `${groupId.slice(0, 8)}...${groupId.slice(-6)}`;
    }
    return groupId;
  };

  const openCreateModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (webhook: Webhook) => {
    setEditingId(webhook.id);
    setForm({
      name: webhook.name,
      webhookUrl: webhook.webhookUrl,
      secret: '', // Secret is not returned from the API; user must re-enter to change
      isDefault: webhook.isDefault,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.webhookUrl.trim()) return;
    // Channel Access Token is required for new LINE Bots
    if (!editingId && !form.secret.trim()) return;
    setSaving(true);

    try {
      const url = editingId
        ? `/api/v1/admin/webhooks/${editingId}`
        : '/api/v1/admin/webhooks';
      const method = editingId ? 'PUT' : 'POST';

      // For edit, only send secret if it was changed (non-empty)
      const payload = editingId
        ? {
            name: form.name,
            webhookUrl: form.webhookUrl,
            isDefault: form.isDefault,
            ...(form.secret.trim() ? { secret: form.secret } : {}),
          }
        : form;

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('儲存失敗');
      setModalOpen(false);
      fetchWebhooks();
    } catch {
      alert('儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除此 LINE Bot？')) return;
    setDeleting(id);

    try {
      const res = await fetch(`/api/v1/admin/webhooks/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('刪除失敗');
      fetchWebhooks();
    } catch {
      alert('刪除失敗，請稍後再試');
    } finally {
      setDeleting(null);
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    setTestResult(null);

    try {
      const res = await fetch(`/api/v1/admin/webhooks/${id}/test`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setTestResult({
        id,
        success: res.ok,
        message: data.message || (res.ok ? '測試推送成功' : '測試推送失敗'),
      });
    } catch {
      setTestResult({
        id,
        success: false,
        message: '測試推送失敗，請檢查網路連線',
      });
    } finally {
      setTesting(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">LINE Bot 設定</h1>
          <p className="text-sm text-gray-500 mt-1">
            管理 LINE Bot 推送設定
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新增 LINE Bot
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner text="載入中..." />
        </div>
      ) : webhooks.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <svg
            className="w-12 h-12 mx-auto text-gray-300 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">尚無 LINE Bot</h3>
          <p className="text-sm text-gray-500 mb-4">新增一個 LINE Bot 以啟用推送功能</p>
          <Button onClick={openCreateModal} size="sm">新增 LINE Bot</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {webhook.name}
                    </h3>
                    {webhook.isDefault && <Badge variant="success">預設</Badge>}
                    {!webhook.isActive && <Badge variant="neutral">已停用</Badge>}
                  </div>
                  <p className="text-xs text-gray-500 font-mono truncate">
                    Group ID: {maskGroupId(webhook.webhookUrl)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    建立於 {formatDate(webhook.createdAt)}
                  </p>
                </div>

                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleTest(webhook.id)}
                    loading={testing === webhook.id}
                  >
                    測試
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditModal(webhook)}
                  >
                    編輯
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDelete(webhook.id)}
                    loading={deleting === webhook.id}
                  >
                    刪除
                  </Button>
                </div>
              </div>

              {/* Test result */}
              {testResult?.id === webhook.id && (
                <div
                  className={`mt-3 p-3 rounded-lg text-sm flex items-center gap-2 ${
                    testResult.success
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {testResult.success ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  {testResult.message}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? '編輯 LINE Bot' : '新增 LINE Bot'}
      >
        <div className="space-y-4">
          <Input
            label="Bot 名稱"
            placeholder="例如：產品團隊群組"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />

          <Input
            label="Group ID（LINE 群組 ID）"
            placeholder="C1234567890abcdef..."
            value={form.webhookUrl}
            onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))}
            required
          />

          <Input
            label="Channel Access Token"
            placeholder="LINE Channel Access Token..."
            value={form.secret}
            onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
            helperText={editingId ? '留空表示不變更 Token' : 'LINE Bot 的 Channel Access Token'}
            required={!editingId}
          />

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">設為預設 LINE Bot</span>
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={saving}
              onClick={handleSave}
              disabled={!form.name.trim() || !form.webhookUrl.trim()}
            >
              {editingId ? '更新' : '建立'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
