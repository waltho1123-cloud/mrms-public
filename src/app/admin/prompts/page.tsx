'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import TextArea from '@/components/ui/TextArea';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { PromptTemplateFull } from '@/lib/types';
import { formatDateTime } from '@/lib/utils/format';
import { getAuthHeaders } from '@/lib/utils/admin-fetch';

interface PromptForm {
  name: string;
  description: string;
  content: string;
  isDefault: boolean;
}

const emptyForm: PromptForm = {
  name: '',
  description: '',
  content: '',
  isDefault: false,
};

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptTemplateFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromptForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchPrompts = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/prompts', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('載入失敗');
      const data = await res.json();
      setPrompts(data.data || data || []);
    } catch {
      // API not ready
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (prompt: PromptTemplateFull) => {
    setEditingId(prompt.id);
    setForm({
      name: prompt.name,
      description: prompt.description || '',
      content: prompt.content,
      isDefault: prompt.isDefault,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.content.trim()) return;
    setSaving(true);

    try {
      const url = editingId
        ? `/api/v1/admin/prompts/${editingId}`
        : '/api/v1/admin/prompts';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error('儲存失敗');
      setModalOpen(false);
      fetchPrompts();
    } catch {
      alert('儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除此 Prompt 範本？')) return;
    setDeleting(id);

    try {
      const res = await fetch(`/api/v1/admin/prompts/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('刪除失敗');
      fetchPrompts();
    } catch {
      alert('刪除失敗，請稍後再試');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prompt 範本管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            管理會議紀錄整理所使用的 Prompt 範本
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新增 Prompt
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner text="載入中..." />
        </div>
      ) : prompts.length === 0 ? (
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">尚無 Prompt 範本</h3>
          <p className="text-sm text-gray-500 mb-4">建立您的第一個 Prompt 範本</p>
          <Button onClick={openCreateModal} size="sm">新增 Prompt</Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  名稱
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  描述
                </th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  預設
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  建立時間
                </th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prompts.map((prompt) => (
                <tr key={prompt.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-medium text-gray-900">{prompt.name}</span>
                  </td>
                  <td className="px-6 py-4 hidden sm:table-cell">
                    <span className="text-gray-500 line-clamp-1">
                      {prompt.description || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {prompt.isDefault ? (
                      <Badge variant="success">預設</Badge>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    <span className="text-gray-500">{formatDateTime(prompt.createdAt)}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(prompt)}
                      >
                        編輯
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(prompt.id)}
                        loading={deleting === prompt.id}
                      >
                        刪除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? '編輯 Prompt 範本' : '新增 Prompt 範本'}
        maxWidth="lg"
      >
        <div className="space-y-4">
          <Input
            label="名稱"
            placeholder="例如：標準會議紀錄"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />

          <Input
            label="描述"
            placeholder="簡短描述此範本的用途（選填）"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />

          <TextArea
            label="Prompt 內容"
            placeholder="請輸入 Prompt 內容，可使用 {{transcript}} 作為逐字稿的佔位符..."
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            rows={12}
            className="font-mono text-sm"
            required
          />

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">設為預設範本</span>
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={saving}
              onClick={handleSave}
              disabled={!form.name.trim() || !form.content.trim()}
            >
              {editingId ? '更新' : '建立'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
