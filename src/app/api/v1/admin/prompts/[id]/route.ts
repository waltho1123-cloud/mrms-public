/**
 * PUT    /api/v1/admin/prompts/:id - Update a prompt template
 * DELETE /api/v1/admin/prompts/:id - Delete a prompt template (cannot delete last one)
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

    const existing = await prisma.promptTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('ERR_NOT_FOUND', `Prompt template not found: ${id}`, 404);
    }

    const body = await request.json();
    const { name, description, content, isDefault, isActive } = body;

    // If setting as default, unset other defaults first
    if (isDefault === true) {
      await prisma.promptTemplate.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.promptTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(content !== undefined && { content }),
        ...(isDefault !== undefined && { isDefault }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return Response.json({ data: updated });
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

    const existing = await prisma.promptTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('ERR_NOT_FOUND', `Prompt template not found: ${id}`, 404);
    }

    // Check if this is the last active prompt template
    const activeCount = await prisma.promptTemplate.count({
      where: { isActive: true },
    });

    if (activeCount <= 1 && existing.isActive) {
      throw new AppError(
        'ERR_CONSTRAINT',
        'Cannot delete the last active prompt template',
        400
      );
    }

    await prisma.promptTemplate.delete({ where: { id } });

    return Response.json({ data: { message: 'Prompt template deleted' } });
  } catch (error) {
    return errorResponse(error);
  }
}
