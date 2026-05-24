'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import Pagination from '@/components/ui/Pagination';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { getAuthHeaders } from '@/lib/utils/admin-fetch';

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  id: string;
  taskId: string | null;
  level: LogLevel;
  stage: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const levelBadgeVariant: Record<LogLevel, 'info' | 'warning' | 'danger'> = {
  info: 'info',
  warn: 'warning',
  error: 'danger',
};

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Filters
  const [level, setLevel] = useState('');
  const [taskId, setTaskId] = useState('');
  const [debouncedTaskId, setDebouncedTaskId] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTaskId(taskId), 400);
    return () => clearTimeout(timer);
  }, [taskId]);

  const fetchLogs = useCallback(
    async (loadMore = false) => {
      if (loadMore) setLoadingMore(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams();
        params.set('limit', '30');
        if (loadMore && cursor) params.set('cursor', cursor);
        if (level) params.set('level', level);
        if (debouncedTaskId) params.set('taskId', debouncedTaskId);

        const res = await fetch(`/api/v1/admin/logs?${params}`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error('載入失敗');
        const data = await res.json();

        const result = data.data || data;
        const list = result.items || result.logs || [];
        const nextCursor = result.nextCursor || result.cursor || null;

        if (loadMore) {
          setLogs((prev) => [...prev, ...list]);
        } else {
          setLogs(list);
        }
        setCursor(nextCursor);
        setHasMore(!!nextCursor);
      } catch {
        // API not ready
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [cursor, level, debouncedTaskId]
  );

  useEffect(() => {
    setCursor(null);
    fetchLogs(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, debouncedTaskId]);

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-TW', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">系統日誌</h1>
        <p className="text-sm text-gray-500 mt-1">查看系統處理記錄</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            options={[
              { value: 'info', label: 'Info' },
              { value: 'warn', label: 'Warning' },
              { value: 'error', label: 'Error' },
            ]}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            placeholder="全部等級"
          />
          <Input
            placeholder="依任務 ID 篩選..."
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
          />
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner text="載入中..." />
        </div>
      ) : logs.length === 0 ? (
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
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">尚無日誌</h3>
          <p className="text-sm text-gray-500">系統日誌將在任務處理時自動產生</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">
                    時間
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">
                    等級
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">
                    階段
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    訊息
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">
                    任務 ID
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono whitespace-nowrap">
                      {formatTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={levelBadgeVariant[log.level]}>
                        {log.level.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">
                        {log.stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-md">
                      <p className="line-clamp-2">{log.message}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                      {log.taskId ? log.taskId.slice(0, 8) + '...' : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {logs.map((log) => (
              <div key={log.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant={levelBadgeVariant[log.level]}>
                    {log.level.toUpperCase()}
                  </Badge>
                  <span className="text-xs text-gray-400 font-mono">
                    {formatTime(log.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">
                    {log.stage}
                  </span>
                  {log.taskId && (
                    <span className="text-xs text-gray-400 font-mono">
                      {log.taskId.slice(0, 8)}...
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-700 line-clamp-2">{log.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Pagination
        hasMore={hasMore}
        onLoadMore={() => fetchLogs(true)}
        loading={loadingMore}
      />
    </div>
  );
}
