/**
 * Task Management Service
 * Handles task state machine transitions, CRUD, and SSE notifications.
 */

import { TaskStatus } from '@prisma/client';
import prisma from '@/lib/db';
import { TASK_STATUS_PROGRESS } from '@/lib/utils/constants';

/**
 * Valid state transitions for the task state machine
 */
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  uploaded: ['queued', 'error'],
  queued: ['transcribing', 'error'],
  transcribing: ['summarizing', 'error'],
  summarizing: ['review', 'pushing', 'error'],
  review: ['pushing', 'summarizing', 'error'],
  pushing: ['completed', 'push_failed', 'error'],
  completed: ['summarizing'], // allow re-summarization
  push_failed: ['pushing', 'summarizing', 'error'],
  error: ['queued', 'summarizing'], // allow retry
};

/**
 * Validate and transition a task to a new status
 */
export async function transitionStatus(
  taskId: string,
  newStatus: TaskStatus,
  errorMsg?: string
): Promise<void> {
  const task = await prisma.meetingTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const allowed = VALID_TRANSITIONS[task.status];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid status transition: ${task.status} -> ${newStatus}`
    );
  }

  const progressPct = TASK_STATUS_PROGRESS[newStatus] ?? 0;

  await prisma.meetingTask.update({
    where: { id: taskId },
    data: {
      status: newStatus,
      progressPct,
      errorMsg: newStatus === 'error' ? errorMsg : null,
    },
  });

  // Log state transition
  await prisma.systemLog.create({
    data: {
      taskId,
      level: newStatus === 'error' ? 'error' : 'info',
      stage: 'status_transition',
      message: `${task.status} -> ${newStatus}`,
      metadata: errorMsg ? { errorMsg } : undefined,
    },
  });
}

/**
 * Create a new meeting task
 */
export async function createTask(data: {
  userId: string;
  meetingTopic: string;
  meetingDate?: Date;
  participants?: string;
  audioFilePath: string;
  audioFileSize: number;
}): Promise<string> {
  const task = await prisma.meetingTask.create({
    data: {
      userId: data.userId,
      meetingTopic: data.meetingTopic,
      meetingDate: data.meetingDate ?? new Date(),
      participants: data.participants,
      audioFilePath: data.audioFilePath,
      audioFileSize: data.audioFileSize,
      status: 'uploaded',
      progressPct: TASK_STATUS_PROGRESS['uploaded'],
    },
  });

  await prisma.systemLog.create({
    data: {
      taskId: task.id,
      level: 'info',
      stage: 'task_created',
      message: `Task created: ${data.meetingTopic}`,
    },
  });

  return task.id;
}

/**
 * Get a task by ID with related data
 */
export async function getTaskById(taskId: string) {
  return prisma.meetingTask.findUnique({
    where: { id: taskId },
    include: {
      transcript: true,
      minutes: {
        include: { promptTemplate: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      pushLogs: {
        include: { webhook: { select: { id: true, name: true } } },
        orderBy: { sentAt: 'desc' },
      },
    },
  });
}

/**
 * List tasks with cursor-based pagination and optional filters
 */
export async function listTasks(params: {
  userId?: string;
  cursor?: string;
  limit?: number;
  topic?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const limit = Math.min(params.limit ?? 20, 100);

  const where: Record<string, unknown> = {};
  if (params.userId) where.userId = params.userId;

  if (params.topic) {
    where.meetingTopic = { contains: params.topic, mode: 'insensitive' };
  }

  if (params.dateFrom || params.dateTo) {
    const meetingDate: Record<string, Date> = {};
    if (params.dateFrom) meetingDate.gte = new Date(params.dateFrom);
    if (params.dateTo) meetingDate.lte = new Date(params.dateTo);
    where.meetingDate = meetingDate;
  }

  const tasks = await prisma.meetingTask.findMany({
    where,
    take: limit + 1, // fetch one extra to determine if there's a next page
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      meetingTopic: true,
      meetingDate: true,
      participants: true,
      status: true,
      progressPct: true,
      audioFileSize: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const hasNext = tasks.length > limit;
  const items = hasNext ? tasks.slice(0, limit) : tasks;
  const nextCursor = hasNext ? items[items.length - 1].id : undefined;

  return {
    items,
    nextCursor,
    hasNext,
  };
}

/**
 * Get task status
 */
export async function getTaskStatus(taskId: string) {
  const task = await prisma.meetingTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      status: true,
      progressPct: true,
      errorMsg: true,
      updatedAt: true,
    },
  });

  if (!task) throw new Error(`Task not found: ${taskId}`);
  return task;
}
