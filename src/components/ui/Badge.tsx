'use client';

import React from 'react';
import type { TaskStatus } from '@/lib/types';

type BadgeVariant = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

interface BadgeProps {
  status?: TaskStatus;
  variant?: BadgeVariant;
  children?: React.ReactNode;
  className?: string;
}

const statusConfig: Record<TaskStatus, { label: string; variant: BadgeVariant }> = {
  uploaded: { label: '已上傳', variant: 'neutral' },
  queued: { label: '排隊中', variant: 'info' },
  transcribing: { label: '轉錄中', variant: 'info' },
  summarizing: { label: '整理中', variant: 'info' },
  review: { label: '待審核', variant: 'warning' },
  pushing: { label: '推送中', variant: 'info' },
  completed: { label: '已完成', variant: 'success' },
  push_failed: { label: '推送失敗', variant: 'danger' },
  error: { label: '錯誤', variant: 'danger' },
};

const variantStyles: Record<BadgeVariant, string> = {
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  success: 'bg-green-50 text-green-700 border-green-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-gray-50 text-gray-600 border-gray-200',
};

export default function Badge({ status, variant, children, className = '' }: BadgeProps) {
  const config = status ? statusConfig[status] : null;
  const resolvedVariant = variant || config?.variant || 'neutral';
  const label = children || config?.label || status;

  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
        ${variantStyles[resolvedVariant]}
        ${className}
      `}
    >
      {label}
    </span>
  );
}
