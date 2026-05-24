/**
 * GET /api/v1/tasks/:id/status - Get task status
 */

import { NextRequest } from 'next/server';
import { errorResponse, AppError } from '@/lib/utils/errors';
import { getTaskStatus } from '@/lib/services/task.service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    try {
      const status = await getTaskStatus(id);
      return Response.json({ data: status });
    } catch {
      throw new AppError('ERR_NOT_FOUND', `Task not found: ${id}`, 404);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
