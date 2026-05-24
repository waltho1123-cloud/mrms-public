/**
 * POST /api/v1/tasks/:id/regenerate - Regenerate meeting minutes with a new prompt
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

    // Verify transcript and prompt template exist in parallel
    const [transcript, template] = await Promise.all([
      prisma.transcript.findUnique({
        where: { taskId },
      }),
      prisma.promptTemplate.findUnique({
        where: { id: promptTemplateId },
      }),
    ]);

    if (!transcript) {
      throw new AppError(
        'ERR_PREREQUISITE',
        'No transcript found. Task must have been transcribed before regeneration.',
        400
      );
    }

    if (!template || !template.isActive) {
      throw new AppError('ERR_NOT_FOUND', 'Prompt template not found or inactive', 404);
    }

    // Add regenerate job to queue
    await meetingQueue.add('regenerate' as string, {
      taskId,
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
