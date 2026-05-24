'use client';

import React from 'react';
import Button from './Button';

interface PaginationProps {
  hasMore: boolean;
  onLoadMore: () => void;
  loading?: boolean;
  className?: string;
}

export default function Pagination({
  hasMore,
  onLoadMore,
  loading = false,
  className = '',
}: PaginationProps) {
  if (!hasMore) return null;

  return (
    <div className={`flex justify-center py-6 ${className}`}>
      <Button
        variant="secondary"
        onClick={onLoadMore}
        loading={loading}
        disabled={loading}
      >
        {loading ? '載入中...' : '載入更多'}
      </Button>
    </div>
  );
}
