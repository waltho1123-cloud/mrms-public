'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Pagination from '@/components/ui/Pagination';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { TaskStatus } from '@/lib/types';
import { formatDate } from '@/lib/utils/format';
import { getAuthHeaders, getStoredUser } from '@/lib/utils/admin-fetch';

interface TaskItem {
  id: string;
  meetingTopic: string;
  meetingDate: string;
  participants: string | null;
  status: TaskStatus;
  progressPct: number;
  audioFileSize: number | null;
  createdAt: string;
  updatedAt: string;
}

export default function HistoryPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    if (!getStoredUser()) {
      router.replace('/login?next=/history');
    } else {
      setAuthChecked(true);
    }
  }, [router]);

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Filters
  const [keyword, setKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');

  // Debounce keyword
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 400);
    return () => clearTimeout(timer);
  }, [keyword]);

  const fetchTasks = useCallback(
    async (loadMore = false) => {
      if (loadMore) setLoadingMore(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams();
        params.set('limit', '12');
        if (loadMore && cursor) params.set('cursor', cursor);
        if (debouncedKeyword) params.set('topic', debouncedKeyword);
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);

        const res = await fetch(`/api/v1/tasks?${params}`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error('載入失敗');
        const data = await res.json();

        const result = data.data || data;
        const list = result.items || result.tasks || [];
        const nextCursor = result.nextCursor || result.cursor || null;

        if (loadMore) {
          setTasks((prev) => [...prev, ...list]);
        } else {
          setTasks(list);
        }
        setCursor(nextCursor);
        setHasMore(!!nextCursor);
      } catch {
        // Handle error silently
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [cursor, debouncedKeyword, dateFrom, dateTo]
  );

  // Fetch on filter change (only after we know user is logged in)
  useEffect(() => {
    if (!authChecked) return;
    setCursor(null);
    fetchTasks(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, debouncedKeyword, dateFrom, dateTo]);

  if (!authChecked) return null;

  const timeSince = (dateStr: string) => {
    const created = new Date(dateStr).getTime();
    const now = Date.now();
    const diff = now - created;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} 分鐘前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小時前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
  };

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">歷史紀錄</h1>
        <p className="mt-1 text-sm text-gray-500">
          瀏覽所有會議錄音處理紀錄
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            placeholder="搜尋會議主題..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Input
            type="date"
            placeholder="開始日期"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <Input
            type="date"
            placeholder="結束日期"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <LoadingSpinner text="載入中..." />
        </div>
      )}

      {/* Empty State */}
      {!loading && tasks.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">尚無紀錄</h3>
          <p className="text-sm text-gray-500 mb-4">上傳你的第一個會議錄音吧</p>
          <button
            onClick={() => router.push('/')}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            前往上傳
          </button>
        </div>
      )}

      {/* Task Cards */}
      {!loading && tasks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map((task) => (
            <div
              key={task.id}
              onClick={() => router.push(`/tasks/${task.id}`)}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                  {task.meetingTopic}
                </h3>
                <Badge status={task.status} className="shrink-0 ml-2" />
              </div>

              <div className="space-y-2 text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span>{formatDate(task.meetingDate)}</span>
                </div>

                {task.participants && (
                  <div className="flex items-center gap-1.5">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    <span className="line-clamp-1">{task.participants}</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>{timeSince(task.createdAt)}</span>
                </div>
              </div>

              {/* Progress bar for in-progress tasks */}
              {task.status !== 'completed' && task.status !== 'error' && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${task.progressPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1 text-right">
                    {task.progressPct}%
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <Pagination
        hasMore={hasMore}
        onLoadMore={() => fetchTasks(true)}
        loading={loadingMore}
      />
    </div>
  );
}
