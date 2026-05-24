/**
 * GET /api/v1/tasks/:id - Get task details including transcript and minutes
 */

import { NextRequest } from 'next/server';
import { errorResponse, AppError } from '@/lib/utils/errors';
import { getTaskById } from '@/lib/services/task.service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = await getTaskById(id);

    if (!task) {
      throw new AppError('ERR_NOT_FOUND', `Task not found: ${id}`, 404);
    }

    return Response.json({ data: task });
  } catch (error) {
    return errorResponse(error);
  }
}
