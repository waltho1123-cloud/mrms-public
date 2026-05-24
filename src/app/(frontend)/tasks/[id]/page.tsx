'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import TextArea from '@/components/ui/TextArea';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import StatusTracker from '@/components/ui/StatusTracker';
import MarkdownPreview from '@/components/ui/MarkdownPreview';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useSSE } from '@/lib/hooks/useSSE';
import type { TaskStatus, PromptTemplateBase } from '@/lib/types';
import { formatDate, formatDateTime, formatDuration, formatFileSize } from '@/lib/utils/format';

interface Task {
  id: string;
  meetingTopic: string;
  meetingDate: string;
  participants: string | null;
  status: TaskStatus;
  progressPct: number;
  errorMsg: string | null;
  audioFileSize: number;
  audioDuration: number | null;
  createdAt: string;
  updatedAt: string;
  transcript?: {
    rawText: string;
    language: string;
    durationSeconds: number | null;
    wordCount: number | null;
  };
  minutes?: {
    id: string;
    markdownOutput: string;
    summary: string;
    keyPoints: string;
    actionItems: string;
    promptTemplateId: string | null;
    createdAt: string;
  }[];
}

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  // Regenerate
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [prompts, setPrompts] = useState<PromptTemplateBase[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  // Push
  const [pushing, setPushing] = useState(false);

  // Transcript toggle
  const [showTranscript, setShowTranscript] = useState(false);

  // Copy
  const [copied, setCopied] = useState(false);

  // Fetch task
  const fetchTask = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/tasks/${taskId}`);
      if (!res.ok) throw new Error('無法載入任務');
      const data = await res.json();
      setTask(data.data || data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  // Fetch prompts for regenerate
  useEffect(() => {
    fetch('/api/v1/prompts')
      .then((r) => r.json())
      .then((data) => setPrompts(data.data || data || []))
      .catch(() => {});
  }, []);

  // SSE for live updates
  const isTerminal = task?.status === 'completed' || task?.status === 'error';
  useSSE({
    url: `/api/v1/tasks/${taskId}/sse`,
    enabled: !isTerminal && !!task,
    onMessage: useCallback(
      (event: { event: string; data: unknown }) => {
        if (!event.data || typeof event.data !== 'object') return;
        const data = event.data as Record<string, unknown>;
        setTask((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status: (data.status as TaskStatus) || prev.status,
            progressPct:
              typeof data.progressPct === 'number'
                ? data.progressPct
                : prev.progressPct,
          };
        });
        // Refresh full task on key status changes
        if (
          data.status === 'review' ||
          data.status === 'completed' ||
          data.status === 'error'
        ) {
          fetchTask();
        }
      },
      [fetchTask]
    ),
  });

  // Handlers
  const handlePush = async () => {
    setPushing(true);
    try {
      const res = await fetch(`/api/v1/tasks/${taskId}/push`, { method: 'POST' });
      if (!res.ok) throw new Error('推送失敗');
      fetchTask();
    } catch {
      alert('推送失敗，請稍後再試');
    } finally {
      setPushing(false);
    }
  };

  const handleRegenerate = async () => {
    if (!selectedPrompt) {
      alert('請選擇一個 Prompt 範本');
      return;
    }
    setRegenerating(true);
    try {
      const res = await fetch(`/api/v1/tasks/${taskId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptTemplateId: selectedPrompt }),
      });
      if (!res.ok) throw new Error('重新整理失敗');
      setShowRegenerateModal(false);
      fetchTask();
    } catch {
      alert('重新整理失敗，請稍後再試');
    } finally {
      setRegenerating(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      const res = await fetch(`/api/v1/tasks/${taskId}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdownOverride: editContent }),
      });
      if (!res.ok) throw new Error('推送失敗');
      setIsEditing(false);
      fetchTask();
    } catch {
      alert('推送失敗，請稍後再試');
    }
  };

  // minutes are ordered by createdAt: 'desc' from the API, so first = latest
  const latestMinutes = task?.minutes?.[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="載入中..." />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          {error || '找不到此任務'}
        </h2>
        <Button variant="secondary" onClick={() => router.push('/')}>
          返回首頁
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{task.meetingTopic}</h1>
        </div>
        <Badge status={task.status} />
      </div>

      {/* Task Metadata */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">會議日期</span>
            <p className="font-medium text-gray-900 mt-0.5">
              {formatDate(task.meetingDate)}
            </p>
          </div>
          <div>
            <span className="text-gray-500">參與者</span>
            <p className="font-medium text-gray-900 mt-0.5">
              {task.participants || '-'}
            </p>
          </div>
          <div>
            <span className="text-gray-500">檔案大小</span>
            <p className="font-medium text-gray-900 mt-0.5">
              {formatFileSize(task.audioFileSize)}
            </p>
          </div>
          <div>
            <span className="text-gray-500">建立時間</span>
            <p className="font-medium text-gray-900 mt-0.5">
              {formatDateTime(task.createdAt)}
            </p>
          </div>
        </div>
        {task.audioDuration && (
          <div className="mt-3 pt-3 border-t border-gray-100 text-sm">
            <span className="text-gray-500">音檔時長：</span>
            <span className="font-medium">{formatDuration(task.audioDuration)}</span>
          </div>
        )}
      </div>

      {/* Status Tracker */}
      {!isTerminal && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">處理進度</h2>
          <StatusTracker status={task.status} progressPct={task.progressPct} />
        </div>
      )}

      {/* Error Message */}
      {task.errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
          <span className="font-medium">錯誤訊息：</span> {task.errorMsg}
        </div>
      )}

      {/* Meeting Minutes */}
      {latestMinutes && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">會議紀錄</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(latestMinutes.markdownOutput);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? '已複製' : '複製'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditContent(latestMinutes.markdownOutput);
                  setIsEditing(!isEditing);
                }}
              >
                {isEditing ? '取消編輯' : '手動編輯'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowRegenerateModal(true)}
              >
                重新整理
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={pushing}
                onClick={handlePush}
                disabled={task.status === 'pushing' || task.status === 'completed'}
              >
                確認推送
              </Button>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <TextArea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={20}
                className="font-mono text-sm"
                placeholder="在此編輯會議紀錄 (Markdown 格式)..."
              />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setIsEditing(false)}>
                  取消
                </Button>
                <Button variant="primary" onClick={handleSaveEdit}>
                  儲存並推送
                </Button>
              </div>
            </div>
          ) : (
            <MarkdownPreview content={latestMinutes.markdownOutput} />
          )}
        </div>
      )}

      {/* Transcript */}
      {task.transcript && (
        <div className="bg-white rounded-xl border border-gray-200 mb-6">
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="w-full flex items-center justify-between px-6 py-4 text-sm font-semibold text-gray-900 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span>逐字稿</span>
              {task.transcript.wordCount && (
                <span className="text-xs text-gray-500 font-normal">
                  ({task.transcript.wordCount} 字)
                </span>
              )}
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${
                showTranscript ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {showTranscript && (
            <div className="px-6 pb-6 border-t border-gray-100">
              <div className="mt-4 p-4 bg-gray-50 rounded-lg max-h-96 overflow-y-auto">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {task.transcript.rawText}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Regenerate Modal */}
      <Modal
        isOpen={showRegenerateModal}
        onClose={() => setShowRegenerateModal(false)}
        title="重新整理會議紀錄"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            選擇不同的 Prompt 範本重新產生會議紀錄。此操作不會影響原始逐字稿。
          </p>
          <Select
            label="Prompt 範本"
            options={prompts.map((p) => ({
              value: p.id,
              label: p.name + (p.isDefault ? ' (預設)' : ''),
            }))}
            value={selectedPrompt}
            onChange={(e) => setSelectedPrompt(e.target.value)}
            placeholder="使用預設範本"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setShowRegenerateModal(false)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              loading={regenerating}
              onClick={handleRegenerate}
            >
              重新整理
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
