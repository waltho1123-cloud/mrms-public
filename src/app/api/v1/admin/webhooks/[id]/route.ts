/**
 * PUT    /api/v1/admin/webhooks/:id - Update a webhook
 * DELETE /api/v1/admin/webhooks/:id - Delete a webhook
 */

import { NextRequest } from 'next/server';
import { errorResponse, AppError } from '@/lib/utils/errors';
import { requireAuth } from '@/lib/utils/auth';
import prisma from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const existing = await prisma.dingTalkWebhook.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('ERR_NOT_FOUND', `Webhook not found: ${id}`, 404);
    }

    const body = await request.json();
    const { name, webhookUrl, secret, isDefault, isActive } = body;

    // If setting as default, unset other defaults first
    if (isDefault === true) {
      await prisma.dingTalkWebhook.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.dingTalkWebhook.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(webhookUrl !== undefined && { webhookUrl }),
        ...(secret !== undefined && { secret }),
        ...(isDefault !== undefined && { isDefault }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return Response.json({
      data: {
        id: updated.id,
        name: updated.name,
        webhookUrl: updated.webhookUrl,
        isDefault: updated.isDefault,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const existing = await prisma.dingTalkWebhook.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('ERR_NOT_FOUND', `Webhook not found: ${id}`, 404);
    }

    await prisma.dingTalkWebhook.delete({ where: { id } });

    return Response.json({ data: { message: 'Webhook deleted' } });
  } catch (error) {
    return errorResponse(error);
  }
}
