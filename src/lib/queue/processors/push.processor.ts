/**
 * Push Processor
 * Handles the LINE push stage of meeting processing.
 */

import prisma from '@/lib/db';
import { pushToLine } from '@/lib/services/line.service';
import { transitionStatus } from '@/lib/services/task.service';
import { getErrorMessage } from '@/lib/utils/format';

export async function processPush(
  taskId: string,
  userId: string,
  webhookId?: string,
  markdownOverride?: string
): Promise<void> {
  await transitionStatus(taskId, 'pushing');

  try {
    // Get the latest minutes and task info in parallel
    const [minutes, task] = await Promise.all([
      prisma.minutes.findFirst({
        where: { taskId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.meetingTask.findUnique({
        where: { id: taskId },
      }),
    ]);

    if (!minutes) {
      throw new Error(`No minutes found for task: ${taskId}`);
    }

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const markdownContent = markdownOverride || minutes.markdownOutput;

    const results = await pushToLine({
      taskId,
      userId,
      webhookId,
      markdownTitle: `會議紀錄 - ${task.meetingTopic}`,
      markdownContent,
    });

    const allSuccess = results.every((r) => r.success);

    if (allSuccess) {
      await transitionStatus(taskId, 'completed');
      await prisma.systemLog.create({
        data: {
          taskId,
          level: 'info',
          stage: 'push',
          message: `Push completed to ${results.length} webhook(s)`,
        },
      });
    } else {
      const failedCount = results.filter((r) => !r.success).length;
      await transitionStatus(taskId, 'push_failed', `${failedCount}/${results.length} push(es) failed`);
      await prisma.systemLog.create({
        data: {
          taskId,
          level: 'error',
          stage: 'push',
          message: `Push partially failed: ${failedCount}/${results.length} failed`,
          metadata: { results: JSON.parse(JSON.stringify(results)) },
        },
      });
    }
  } catch (error) {
    const msg = getErrorMessage(error, 'Push failed');
    await transitionStatus(taskId, 'push_failed', msg);
    await prisma.systemLog.create({
      data: {
        taskId,
        level: 'error',
        stage: 'push',
        message: msg,
      },
    });
    throw error;
  }
}
