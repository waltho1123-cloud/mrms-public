/**
 * Transcription Processor
 * Handles the STT stage of meeting processing.
 */

import prisma from '@/lib/db';
import { transcribeAudio } from '@/lib/services/stt.service';
import { transitionStatus } from '@/lib/services/task.service';
import { getErrorMessage } from '@/lib/utils/format';

export async function processTranscription(
  taskId: string,
  userId: string,
  audioFilePath: string
): Promise<void> {
  await transitionStatus(taskId, 'transcribing');

  try {
    const result = await transcribeAudio(userId, audioFilePath);

    // Store transcript in DB
    const transcriptData = {
      rawText: result.rawText,
      language: result.language,
      durationSeconds: result.durationSeconds,
      wordCount: result.wordCount,
      segments: result.segments as unknown as Parameters<typeof prisma.transcript.create>[0]['data']['segments'],
    };
    await prisma.transcript.upsert({
      where: { taskId },
      create: { taskId, ...transcriptData },
      update: transcriptData,
    });

    // Update audio duration on the task
    await prisma.meetingTask.update({
      where: { id: taskId },
      data: { audioDuration: result.durationSeconds },
    });

    await prisma.systemLog.create({
      data: {
        taskId,
        level: 'info',
        stage: 'transcription',
        message: `Transcription complete: ${result.wordCount} words, ${result.durationSeconds}s`,
        metadata: { language: result.language },
      },
    });
  } catch (error) {
    await transitionStatus(taskId, 'error', getErrorMessage(error, 'Transcription failed'));
    throw error;
  }
}
