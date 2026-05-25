/**
 * POST /api/v1/tasks/:id/regenerate - Regenerate meeting minutes with a new prompt
 */

import { NextRequest } from 'next/server';
import { errorResponse, AppError } from '@/lib/utils/errors';
import { requireUser } from '@/lib/utils/auth';
import { assertPromptAccessible } from '@/lib/services/ai.service';
import prisma from '@/lib/db';
import meetingQueue from '@/lib/queue/queue';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireUser(request);
    const { id: taskId } = await params;

    // Verify task exists and is owned by caller (admin may regenerate any)
    const task = await prisma.meetingTask.findUnique({
      where: { id: taskId },
    });

    if (!task || (me.role !== 'admin' && task.userId !== me.sub)) {
      throw new AppError('ERR_NOT_FOUND', `Task not found: ${taskId}`, 404);
    }

    // Only allow regeneration from certain states
    const allowedStatuses = ['review', 'completed', 'push_failed', 'error'];
    if (!allowedStatuses.includes(task.status)) {
      throw new AppError(
        'ERR_INVALID_STATE',
        `Cannot regenerate from status: ${task.status}. Allowed: ${allowedStatuses.join(', ')}`,
        400
      );
    }

    // Parse body
    const body = await request.json();
    const { promptTemplateId } = body;

    if (!promptTemplateId) {
      throw new AppError('ERR_VALIDATION', 'promptTemplateId is required', 400);
    }

    // Verify transcript exists, and that the prompt is accessible to the
    // task's owner. We scope to task.userId (not me.sub) because the worker
    // will run as the task owner — an admin shouldn't be able to bind a
    // user's task to a prompt that user has no access to.
    const transcript = await prisma.transcript.findUnique({ where: { taskId } });
    if (!transcript) {
      throw new AppError(
        'ERR_PREREQUISITE',
        'No transcript found. Task must have been transcribed before regeneration.',
        400
      );
    }
    await assertPromptAccessible(task.userId, promptTemplateId);

    // Add regenerate job to queue — uses task owner's OpenAI key
    await meetingQueue.add('regenerate' as string, {
      taskId,
      userId: task.userId,
      promptTemplateId,
      type: 'regenerate' as const,
    });

    return Response.json({
      data: {
        taskId,
        message: 'Regeneration job queued',
        promptTemplateId,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
