/**
 * GET /api/v1/admin/logs - System log query
 * Parameters: level, taskId, cursor, limit
 */

import { NextRequest } from 'next/server';
import { LogLevel } from '@prisma/client';
import { errorResponse } from '@/lib/utils/errors';
import { requireAdmin } from '@/lib/utils/auth';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { searchParams } = request.nextUrl;
    const level = searchParams.get('level') as LogLevel | null;
    const taskId = searchParams.get('taskId') || undefined;
    const cursor = searchParams.get('cursor') || undefined;
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '50', 10),
      200
    );

    const where: Record<string, unknown> = {};
    if (level) where.level = level;
    if (taskId) where.taskId = taskId;

    const logs = await prisma.systemLog.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        task: {
          select: { id: true, meetingTopic: true, status: true },
        },
      },
    });

    const hasNext = logs.length > limit;
    const items = hasNext ? logs.slice(0, limit) : logs;
    const nextCursor = hasNext ? items[items.length - 1].id : undefined;

    return Response.json({
      data: {
        items,
        nextCursor,
        hasNext,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
