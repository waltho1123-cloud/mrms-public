/**
 * Summarization Processor
 * Handles the AI summarization stage of meeting processing.
 */

import prisma from '@/lib/db';
import { summarizeMeeting } from '@/lib/services/ai.service';
import { transitionStatus } from '@/lib/services/task.service';
import { getErrorMessage } from '@/lib/utils/format';

export async function processSummarization(
  taskId: string,
  meetingTopic: string,
  meetingDate: string,
  participants?: string,
  promptTemplateId?: string
): Promise<void> {
  await transitionStatus(taskId, 'summarizing');

  try {
    // Get transcript from DB
    const transcript = await prisma.transcript.findUnique({
      where: { taskId },
    });

    if (!transcript) {
      throw new Error(`No transcript found for task: ${taskId}`);
    }

    const { result, promptTemplateId: usedTemplateId } = await summarizeMeeting(
      {
        meetingTopic,
        meetingDate,
        participants,
      },
      transcript.rawText,
      promptTemplateId
    );

    // Store minutes in DB
    await prisma.minutes.create({
      data: {
        taskId,
        promptTemplateId: usedTemplateId,
        summary: result.summary,
        keyPoints: result.keyPoints,
        sentimentAnalysis: result.sentimentAnalysis,
        actionItems: result.actionItems,
        markdownOutput: result.markdownOutput,
      },
    });

    await prisma.systemLog.create({
      data: {
        taskId,
        level: 'info',
        stage: 'summarization',
        message: `Summarization complete using template: ${usedTemplateId}`,
      },
    });
  } catch (error) {
    await transitionStatus(taskId, 'error', getErrorMessage(error, 'Summarization failed'));
    throw error;
  }
}
