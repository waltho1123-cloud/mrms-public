/**
 * GET  /api/v1/admin/webhooks - List the calling admin's webhooks
 * POST /api/v1/admin/webhooks - Create a webhook owned by the calling admin
 *
 * NOTE: This is the legacy admin-scoped endpoint kept for the existing
 * /admin/webhooks page. In Phase 5 it will be moved to /api/v1/me/webhooks
 * (per-user). For now it operates on the calling user's own UserWebhook rows.
 */

import { NextRequest } from 'next/server';
import { errorResponse, AppError } from '@/lib/utils/errors';
import { requireUser } from '@/lib/utils/auth';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const me = await requireUser(request);

    const webhooks = await prisma.userWebhook.findMany({
      where: { userId: me.sub },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        groupId: true,
        // accessToken intentionally omitted from listing
        isDefault: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Shape the response to match the old client expectations
    // (the page still expects `webhookUrl` — we'll rename in Phase 5)
    return Response.json({
      data: webhooks.map((w) => ({
        id: w.id,
        name: w.name,
        webhookUrl: w.groupId, // legacy field name
        isDefault: w.isDefault,
        isActive: w.isActive,
        createdAt: w.createdAt,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const me = await requireUser(request);

    const body = await request.json();
    const { name, webhookUrl, secret, isDefault } = body;
    const groupId = webhookUrl; // legacy client sends groupId as `webhookUrl`
    const accessToken = secret; // legacy client sends LINE Channel token as `secret`

    if (!name || !groupId || !accessToken) {
      throw new AppError('ERR_VALIDATION', 'name, webhookUrl, and secret are required', 400);
    }

    if (name.length > 100) {
      throw new AppError('ERR_VALIDATION', 'name must be 100 characters or less', 400);
    }

    if (isDefault) {
      await prisma.userWebhook.updateMany({
        where: { userId: me.sub, isDefault: true },
        data: { isDefault: false },
      });
    }

    const webhook = await prisma.userWebhook.create({
      data: {
        userId: me.sub,
        name,
        groupId,
        accessToken,
        isDefault: isDefault ?? false,
        isActive: true,
      },
    });

    return Response.json(
      {
        data: {
          id: webhook.id,
          name: webhook.name,
          webhookUrl: webhook.groupId, // legacy
          isDefault: webhook.isDefault,
          isActive: webhook.isActive,
          createdAt: webhook.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
