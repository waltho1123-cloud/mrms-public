/**
 * GET /api/v1/tasks/:id - Get task details including transcript and minutes
 * Ownership-scoped: regular users only see their own tasks; admin sees any.
 */

import { NextRequest } from 'next/server';
import { errorResponse, AppError } from '@/lib/utils/errors';
import { requireUser } from '@/lib/utils/auth';
import { getTaskById } from '@/lib/services/task.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireUser(request);
    const { id } = await params;
    const task = await getTaskById(id);

    if (!task || (me.role !== 'admin' && task.userId !== me.sub)) {
      throw new AppError('ERR_NOT_FOUND', `Task not found: ${id}`, 404);
    }

    return Response.json({ data: task });
  } catch (error) {
    return errorResponse(error);
  }
}
