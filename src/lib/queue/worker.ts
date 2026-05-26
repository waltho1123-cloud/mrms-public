/**
 * BullMQ Worker
 * Processes meeting-processing jobs: transcribe -> summarize -> push (if AUTO_PUSH=true)
 */

import { Worker, Job } from 'bullmq';
import { connection, QUEUE_NAME, type JobData, type MeetingJobData, type RegenerateJobData, type PushJobData } from './queue';
import { processTranscription } from './processors/transcribe.processor';
import { processSummarization } from './processors/summarize.processor';
import { processPush } from './processors/push.processor';
import { transitionStatus } from '@/lib/services/task.service';
import prisma from '@/lib/db';

function isMeetingJob(data: JobData): data is MeetingJobData {
  return !('type' in data) || data.type === 'process-meeting';
}

function isRegenerateJob(data: JobData): data is RegenerateJobData {
  return 'type' in data && data.type === 'regenerate';
}

function isPushJob(data: JobData): data is PushJobData {
  return 'type' in data && data.type === 'push';
}

async function processJob(job: Job<JobData>): Promise<void> {
  const data = job.data;

  if (isMeetingJob(data)) {
    // Full pipeline: transcribe -> summarize -> (optional push)
    const { taskId, userId, audioFilePath, meetingTopic, meetingDate, participants, promptTemplateId, autoPush } = data;

    // Stage 1: Transcription (uses owner's OpenAI key).
    // Skipped when the user supplied a transcript directly — in that case
    // the API route already wrote the Transcript row before queueing.
    if (audioFilePath) {
      await processTranscription(taskId, userId, audioFilePath);
    }

    // Stage 2: Summarization
    await processSummarization(taskId, userId, meetingTopic, meetingDate, participants, promptTemplateId);

    // Stage 3: Push or Review
    if (autoPush) {
      await processPush(taskId, userId);
    } else {
      await transitionStatus(taskId, 'review');
    }
  } else if (isRegenerateJob(data)) {
    // Re-summarize with a new prompt template
    const { taskId, userId, promptTemplateId } = data;
    const task = await prisma.meetingTask.findUnique({
      where: { id: taskId },
      select: { meetingTopic: true, meetingDate: true, participants: true },
    });
    if (!task) throw new Error(`Task not found: ${taskId}`);

    await processSummarization(
      taskId,
      userId,
      task.meetingTopic,
      task.meetingDate.toISOString(),
      task.participants ?? undefined,
      promptTemplateId
    );

    await transitionStatus(taskId, 'review');
  } else if (isPushJob(data)) {
    // Manual push
    const { taskId, userId, webhookId, markdownOverride } = data;
    await processPush(taskId, userId, webhookId, markdownOverride);
  }
}

/**
 * Create and start the worker.
 * Should be called from a separate process or during app initialization.
 */
export function createWorker(): Worker<JobData> {
  const worker = new Worker<JobData>(QUEUE_NAME, processJob, {
    connection,
    concurrency: 2,
  });

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed for task: ${job.data.taskId}`);
  });

  worker.on('failed', (job, error) => {
    if (job) {
      console.error(`Job ${job.id} failed for task ${job.data.taskId}:`, error.message);
    } else {
      console.error('Job failed (no job reference):', error.message);
    }
  });

  worker.on('error', (error) => {
    console.error('Worker error:', error);
  });

  return worker;
}

// Auto-start worker when this module is imported in a worker process
let workerInstance: Worker<JobData> | null = null;

export function getWorker(): Worker<JobData> {
  if (!workerInstance) {
    workerInstance = createWorker();
  }
  return workerInstance;
}

export default getWorker;
