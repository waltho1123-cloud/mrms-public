/**
 * PUT    /api/v1/admin/webhooks/:id - Update a webhook owned by the calling user
 * DELETE /api/v1/admin/webhooks/:id - Delete it
 *
 * Per-user scope: a webhook can only be touched by its owner. Phase 5 will
 * relocate this to /api/v1/me/webhooks/:id.
 */

import { NextRequest } from 'next/server';
import { errorResponse, AppError } from '@/lib/utils/errors';
import { requireUser } from '@/lib/utils/auth';
import prisma from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireUser(request);
    const { id } = await params;

    const existing = await prisma.userWebhook.findFirst({
      where: { id, userId: me.sub },
    });
    if (!existing) {
      throw new AppError('ERR_NOT_FOUND', `Webhook not found: ${id}`, 404);
    }

    const body = await request.json();
    const { name, webhookUrl, secret, isDefault, isActive } = body;

    if (isDefault === true) {
      await prisma.userWebhook.updateMany({
        where: { userId: me.sub, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.userWebhook.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(webhookUrl !== undefined && { groupId: webhookUrl }),
        ...(secret !== undefined && { accessToken: secret }),
        ...(isDefault !== undefined && { isDefault }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return Response.json({
      data: {
        id: updated.id,
        name: updated.name,
        webhookUrl: updated.groupId,
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
    const me = await requireUser(request);
    const { id } = await params;

    const existing = await prisma.userWebhook.findFirst({
      where: { id, userId: me.sub },
    });
    if (!existing) {
      throw new AppError('ERR_NOT_FOUND', `Webhook not found: ${id}`, 404);
    }

    await prisma.userWebhook.delete({ where: { id } });

    return Response.json({ data: { message: 'Webhook deleted' } });
  } catch (error) {
    return errorResponse(error);
  }
}
