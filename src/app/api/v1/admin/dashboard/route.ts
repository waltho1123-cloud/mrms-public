/**
 * GET /api/v1/admin/dashboard - Dashboard statistics
 * Parameters: period (today | week | month)
 */

import { NextRequest } from 'next/server';
import { errorResponse } from '@/lib/utils/errors';
import { requireAuth } from '@/lib/utils/auth';
import prisma from '@/lib/db';

function getPeriodStart(period: string): Date {
  const now = new Date();

  switch (period) {
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case 'week': {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case 'month': {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    default:
      return new Date(0); // all time
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const period = request.nextUrl.searchParams.get('period') || 'today';
    const periodStart = getPeriodStart(period);

    const whereCreated = { createdAt: { gte: periodStart } };

    // Total tasks in period
    const totalTasks = await prisma.meetingTask.count({
      where: whereCreated,
    });

    // Completed tasks
    const completedTasks = await prisma.meetingTask.count({
      where: {
        ...whereCreated,
        status: 'completed',
      },
    });

    // Error tasks
    const errorTasks = await prisma.meetingTask.count({
      where: {
        ...whereCreated,
        status: { in: ['error', 'push_failed'] },
      },
    });

    // Success rate
    const successRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Average processing time (from created to completed)
    const completedTasksWithTime = await prisma.meetingTask.findMany({
      where: {
        ...whereCreated,
        status: 'completed',
      },
      select: {
        createdAt: true,
        updatedAt: true,
      },
    });

    let avgProcessTime = 0;
    if (completedTasksWithTime.length > 0) {
      const totalMs = completedTasksWithTime.reduce((sum, t) => {
        return sum + (t.updatedAt.getTime() - t.createdAt.getTime());
      }, 0);
      avgProcessTime = Math.round(totalMs / completedTasksWithTime.length / 1000); // seconds
    }

    // Status breakdown
    const statusBreakdown = await prisma.meetingTask.groupBy({
      by: ['status'],
      where: whereCreated,
      _count: { status: true },
    });

    const statusCounts: Record<string, number> = {};
    for (const item of statusBreakdown) {
      statusCounts[item.status] = item._count.status;
    }

    return Response.json({
      data: {
        period,
        totalTasks,
        completedTasks,
        errorTasks,
        successRate,
        avgProcessTime,
        statusBreakdown: statusCounts,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
