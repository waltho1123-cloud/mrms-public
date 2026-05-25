/**
 * BullMQ Queue Definition
 * Defines the meeting-processing queue backed by Redis.
 */

import { Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Shared Redis connection for the queue
const globalForRedis = globalThis as unknown as { redisConnection: IORedis | undefined };
export const connection: ConnectionOptions = (globalForRedis.redisConnection ?? new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
})) as unknown as ConnectionOptions;
if (process.env.NODE_ENV !== 'production') globalForRedis.redisConnection = connection as unknown as IORedis;

export const QUEUE_NAME = 'meeting-processing';

export interface MeetingJobData {
  taskId: string;
  userId: string;
  audioFilePath: string;
  meetingTopic: string;
  meetingDate: string;
  participants?: string;
  promptTemplateId?: string;
  autoPush: boolean;
  type?: 'process-meeting';
}

export interface RegenerateJobData {
  taskId: string;
  userId: string;
  promptTemplateId: string;
  type: 'regenerate';
}

export interface PushJobData {
  taskId: string;
  userId: string;
  webhookId?: string;
  markdownOverride?: string;
  type: 'push';
}

export type JobData = MeetingJobData | RegenerateJobData | PushJobData;

// Singleton queue instance
const globalForQueue = globalThis as unknown as { meetingQueue: Queue<JobData> | undefined };
export const meetingQueue: Queue<JobData> =
  globalForQueue.meetingQueue ??
  new Queue<JobData>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
if (process.env.NODE_ENV !== 'production') globalForQueue.meetingQueue = meetingQueue;

export default meetingQueue;
