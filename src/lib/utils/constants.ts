import type { TaskStatus } from '@/lib/types';

export const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',      // mp3
  'audio/mp4',       // m4a
  'audio/x-m4a',     // m4a
  'audio/wav',       // wav
  'audio/x-wav',     // wav
  'audio/ogg',       // ogg
  'audio/webm',      // webm
];

export const ALLOWED_EXTENSIONS = ['mp3', 'm4a', 'wav', 'ogg', 'webm'];

export const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '200', 10);
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const STT_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB OpenAI limit

export const TASK_STATUS_PROGRESS: Record<TaskStatus, number> = {
  uploaded: 10,
  queued: 15,
  transcribing: 20,
  summarizing: 50,
  review: 80,
  pushing: 85,
  completed: 100,
  push_failed: 80,
  error: 0,
};

export const LINE_RATE_LIMIT = 20; // messages per minute
export const PUSH_MAX_RETRIES = 3;
export const PUSH_RETRY_DELAY_MS = 30_000; // 30 seconds
