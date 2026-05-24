/**
 * GET  /api/v1/admin/webhooks     - List all LINE Bot configurations
 * POST /api/v1/admin/webhooks     - Create a new LINE Bot configuration
 */

import { NextRequest } from 'next/server';
import { errorResponse, AppError } from '@/lib/utils/errors';
import { requireAuth } from '@/lib/utils/auth';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const webhooks = await prisma.dingTalkWebhook.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        webhookUrl: true,
        // Omit secret from listing for security
        isDefault: true,
        isActive: true,
        createdAt: true,
      },
    });

    return Response.json({ data: webhooks });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);

    const body = await request.json();
    const { name, webhookUrl, secret, isDefault } = body;

    if (!name || !webhookUrl || !secret) {
      throw new AppError('ERR_VALIDATION', 'name, webhookUrl, and secret are required', 400);
    }

    if (name.length > 100) {
      throw new AppError('ERR_VALIDATION', 'name must be 100 characters or less', 400);
    }

    // If setting as default, unset other defaults first
    if (isDefault) {
      await prisma.dingTalkWebhook.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const webhook = await prisma.dingTalkWebhook.create({
      data: {
        name,
        webhookUrl,
        secret,
        isDefault: isDefault ?? false,
        isActive: true,
      },
    });

    return Response.json(
      {
        data: {
          id: webhook.id,
          name: webhook.name,
          webhookUrl: webhook.webhookUrl,
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
