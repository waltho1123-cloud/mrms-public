/**
 * GET /api/v1/tasks/:id/status - Get task status
 * Ownership-scoped.
 */

import { NextRequest } from 'next/server';
import { errorResponse, AppError } from '@/lib/utils/errors';
import { requireUser } from '@/lib/utils/auth';
import prisma from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireUser(request);
    const { id } = await params;

    const task = await prisma.meetingTask.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        progressPct: true,
        errorMsg: true,
        updatedAt: true,
      },
    });

    if (!task || (me.role !== 'admin' && task.userId !== me.sub)) {
      throw new AppError('ERR_NOT_FOUND', `Task not found: ${id}`, 404);
    }

    const { userId: _omit, ...status } = task;
    void _omit;
    return Response.json({ data: status });
  } catch (error) {
    return errorResponse(error);
  }
}
