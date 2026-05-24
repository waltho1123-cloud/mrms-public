/**
 * POST /api/v1/tasks/:id/push - Manually trigger LINE push
 */

import { NextRequest } from 'next/server';
import { errorResponse, AppError } from '@/lib/utils/errors';
import prisma from '@/lib/db';
import meetingQueue from '@/lib/queue/queue';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    // Verify task exists
    const task = await prisma.meetingTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new AppError('ERR_NOT_FOUND', `Task not found: ${taskId}`, 404);
    }

    // Only allow push from review, completed, or push_failed states
    const allowedStatuses = ['review', 'completed', 'push_failed'];
    if (!allowedStatuses.includes(task.status)) {
      throw new AppError(
        'ERR_INVALID_STATE',
        `Cannot push from status: ${task.status}. Allowed: ${allowedStatuses.join(', ')}`,
        400
      );
    }

    // Verify minutes exist
    const minutes = await prisma.minutes.findFirst({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    });

    if (!minutes) {
      throw new AppError('ERR_NOT_FOUND', 'No minutes found for this task', 404);
    }

    // Parse body
    let webhookId: string | undefined;
    let markdownOverride: string | undefined;
    try {
      const body = await request.json();
      webhookId = body.webhookId;
      markdownOverride = body.markdownOverride;
    } catch {
      // Empty body is OK - use defaults
    }

    // Add push job to queue
    await meetingQueue.add('push' as string, {
      taskId,
      webhookId,
      markdownOverride,
      type: 'push' as const,
    });

    return Response.json({
      data: {
        taskId,
        message: 'Push job queued',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
