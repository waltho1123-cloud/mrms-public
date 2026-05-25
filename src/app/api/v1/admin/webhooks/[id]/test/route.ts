/**
 * POST /api/v1/admin/webhooks/:id/test - Send a test message to a LINE Bot
 */

import { NextRequest } from 'next/server';
import { errorResponse, AppError } from '@/lib/utils/errors';
import { requireUser } from '@/lib/utils/auth';
import { testLineWebhook } from '@/lib/services/line.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireUser(request);
    const { id } = await params;

    const result = await testLineWebhook(id, me.sub);

    if (!result.success) {
      throw new AppError('ERR_PUSH_FAILED', result.message, 502);
    }

    return Response.json({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
}
