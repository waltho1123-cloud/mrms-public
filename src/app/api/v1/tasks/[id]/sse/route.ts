/**
 * GET /api/v1/tasks/:id/sse - SSE real-time status stream
 * Uses DB polling since Worker runs in a separate process.
 */

import { NextRequest } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  // Verify task exists
  const task = await prisma.meetingTask.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, progressPct: true, errorMsg: true },
  });

  if (!task) {
    return Response.json(
      { error: { code: 'ERR_NOT_FOUND', message: `Task not found: ${taskId}` } },
      { status: 404 }
    );
  }

  let lastStatus = task.status;
  let lastProgressPct = task.progressPct;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial status
      const initialData = `event: status\ndata: ${JSON.stringify({
        taskId: task.id,
        status: task.status,
        progressPct: task.progressPct,
        errorMsg: task.errorMsg,
        updatedAt: new Date().toISOString(),
      })}\n\n`;
      controller.enqueue(encoder.encode(initialData));

      // Poll DB every 2 seconds for status changes
      const pollInterval = setInterval(async () => {
        try {
          const current = await prisma.meetingTask.findUnique({
            where: { id: taskId },
            select: { status: true, progressPct: true, errorMsg: true },
          });

          if (!current) {
            clearInterval(pollInterval);
            controller.close();
            return;
          }

          // Only send if something changed
          if (current.status !== lastStatus || current.progressPct !== lastProgressPct) {
            lastStatus = current.status;
            lastProgressPct = current.progressPct;

            const data = `event: status\ndata: ${JSON.stringify({
              taskId,
              status: current.status,
              progressPct: current.progressPct,
              errorMsg: current.errorMsg,
              updatedAt: new Date().toISOString(),
            })}\n\n`;
            controller.enqueue(encoder.encode(data));

            // Close stream on terminal states
            if (['completed', 'error', 'push_failed', 'review'].includes(current.status)) {
              // Send one more time then close after a small delay
              setTimeout(() => {
                clearInterval(pollInterval);
                try { controller.close(); } catch { /* already closed */ }
              }, 1000);
            }
          }
        } catch {
          // DB query failed, send heartbeat to keep alive
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            clearInterval(pollInterval);
          }
        }
      }, 2000);

      // Cleanup on client disconnect
      _request.signal.addEventListener('abort', () => {
        clearInterval(pollInterval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
