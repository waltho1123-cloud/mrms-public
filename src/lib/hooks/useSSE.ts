'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface SSEEvent {
  event: string;
  data: unknown;
}

interface UseSSEOptions {
  url: string;
  enabled?: boolean;
  onMessage?: (event: SSEEvent) => void;
  onError?: (error: Event) => void;
  reconnectInterval?: number;
  maxRetries?: number;
}

interface UseSSEReturn {
  lastEvent: SSEEvent | null;
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

export function useSSE({
  url,
  enabled = true,
  onMessage,
  onError,
  reconnectInterval = 3000,
  maxRetries = 10,
}: UseSSEOptions): UseSSEReturn {
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use refs for callbacks to avoid re-creating EventSource when callbacks change
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    cleanup();
    if (!enabled || !url) return;

    try {
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
        setError(null);
        retriesRef.current = 0;
      };

      const handleEvent = (type: string, rawData: string) => {
        let data: unknown;
        try {
          data = JSON.parse(rawData);
        } catch {
          data = rawData;
        }
        const sseEvent: SSEEvent = { event: type, data };
        setLastEvent(sseEvent);
        onMessageRef.current?.(sseEvent);
      };

      es.onmessage = (event) => {
        handleEvent(event.type || 'message', event.data);
      };

      // Listen for named events
      const eventTypes = ['status', 'progress', 'complete', 'error'];
      eventTypes.forEach((type) => {
        es.addEventListener(type, (event: MessageEvent) => {
          handleEvent(type, event.data);
        });
      });

      es.onerror = (event) => {
        setIsConnected(false);
        onErrorRef.current?.(event);

        if (retriesRef.current < maxRetries) {
          retriesRef.current++;
          setError(`連線中斷，${reconnectInterval / 1000} 秒後重試... (${retriesRef.current}/${maxRetries})`);
          reconnectTimerRef.current = setTimeout(connect, reconnectInterval);
        } else {
          setError('連線失敗，已達最大重試次數');
          cleanup();
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立 SSE 連線失敗');
    }
  }, [url, enabled, reconnectInterval, maxRetries, cleanup]);

  const reconnect = useCallback(() => {
    retriesRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  return { lastEvent, isConnected, error, reconnect };
}

export default useSSE;
