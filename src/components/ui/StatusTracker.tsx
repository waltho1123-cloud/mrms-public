'use client';

import React from 'react';
import type { TaskStatus } from '@/lib/types';

interface StatusTrackerProps {
  status: TaskStatus;
  progressPct?: number;
  className?: string;
}

const steps: { key: TaskStatus; label: string }[] = [
  { key: 'uploaded', label: '已上傳' },
  { key: 'queued', label: '排隊中' },
  { key: 'transcribing', label: '語音轉錄' },
  { key: 'summarizing', label: '摘要整理' },
  { key: 'review', label: '待審核' },
  { key: 'pushing', label: '推送中' },
  { key: 'completed', label: '已完成' },
];

const statusOrder: Record<string, number> = {
  uploaded: 0,
  queued: 1,
  transcribing: 2,
  summarizing: 3,
  review: 4,
  pushing: 5,
  completed: 6,
  push_failed: 5,
  error: -1,
};

export default function StatusTracker({
  status,
  progressPct,
  className = '',
}: StatusTrackerProps) {
  const currentIdx = statusOrder[status] ?? -1;
  const isError = status === 'error';
  const isPushFailed = status === 'push_failed';

  return (
    <div className={className}>
      {/* Error banner */}
      {isError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
          <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          處理過程中發生錯誤
        </div>
      )}

      {isPushFailed && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-sm text-amber-700">
          <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          推送失敗，請重試
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-6">
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              isError ? 'bg-red-500' : isPushFailed ? 'bg-amber-500' : 'bg-blue-600'
            }`}
            style={{ width: `${progressPct ?? 0}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-500">進度</span>
          <span className="text-xs font-medium text-gray-700">{progressPct ?? 0}%</span>
        </div>
      </div>

      {/* Steps */}
      <div className="flex items-center justify-between">
        {steps.map((step, idx) => {
          const isDone = currentIdx > idx;
          const isCurrent = currentIdx === idx;

          return (
            <React.Fragment key={step.key}>
              {idx > 0 && (
                <div
                  className={`flex-1 h-0.5 mx-1 ${
                    isDone ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                />
              )}
              <div className="flex flex-col items-center min-w-0">
                <div
                  className={`
                    w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium
                    transition-all duration-200
                    ${
                      isDone
                        ? 'bg-blue-600 text-white'
                        : isCurrent
                        ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-600 ring-offset-2'
                        : 'bg-gray-100 text-gray-400'
                    }
                  `}
                >
                  {isDone ? (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>
                <span
                  className={`mt-1.5 text-[10px] leading-tight text-center whitespace-nowrap ${
                    isDone || isCurrent ? 'text-gray-700 font-medium' : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
