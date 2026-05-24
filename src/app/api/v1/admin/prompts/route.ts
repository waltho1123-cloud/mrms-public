/**
 * GET  /api/v1/admin/prompts     - List all prompt templates
 * POST /api/v1/admin/prompts     - Create a new prompt template
 */

import { NextRequest } from 'next/server';
import { errorResponse, AppError } from '@/lib/utils/errors';
import { requireAuth } from '@/lib/utils/auth';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const templates = await prisma.promptTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return Response.json({ data: templates });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);

    const body = await request.json();
    const { name, description, content, isDefault } = body;

    if (!name || !content) {
      throw new AppError('ERR_VALIDATION', 'name and content are required', 400);
    }

    if (typeof name !== 'string' || typeof content !== 'string') {
      throw new AppError('ERR_VALIDATION', 'name and content must be strings', 400);
    }

    if (name.length > 100) {
      throw new AppError('ERR_VALIDATION', 'name must be 100 characters or less', 400);
    }

    if (content.length > 50000) {
      throw new AppError('ERR_VALIDATION', 'content must be 50000 characters or less', 400);
    }

    // If setting as default, unset other defaults first
    if (isDefault) {
      await prisma.promptTemplate.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.promptTemplate.create({
      data: {
        name,
        description: description || null,
        content,
        isDefault: isDefault ?? false,
        isActive: true,
      },
    });

    return Response.json({ data: template }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
