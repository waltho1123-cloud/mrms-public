/**
 * PUT    /api/v1/admin/prompts/:id - Update a prompt template
 * DELETE /api/v1/admin/prompts/:id - Delete a prompt template
 *
 * Guard rail: at least one *system-wide* (userId=null) active prompt must
 * remain. Personal prompts cannot rescue this — users without a personal
 * prompt would otherwise have nothing to summarize with.
 */

import { NextRequest } from 'next/server';
import { errorResponse, AppError } from '@/lib/utils/errors';
import { requireAdmin } from '@/lib/utils/auth';
import prisma from '@/lib/db';

async function assertNotLastActiveSystemPrompt(
  existing: { id: string; userId: string | null; isActive: boolean },
  action: 'delete' | 'deactivate'
): Promise<void> {
  if (existing.userId !== null) return;       // user-owned: unrelated
  if (!existing.isActive) return;             // already inactive: no-op for this guard
  const remaining = await prisma.promptTemplate.count({
    where: { isActive: true, userId: null, id: { not: existing.id } },
  });
  if (remaining === 0) {
    throw new AppError(
      'ERR_CONSTRAINT',
      action === 'delete'
        ? '無法刪除最後一個系統範本（所有使用者都需要至少一個系統範本可選用）'
        : '無法停用最後一個系統範本',
      400
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(request);
    const { id } = await params;

    const existing = await prisma.promptTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('ERR_NOT_FOUND', `Prompt template not found: ${id}`, 404);
    }

    const body = await request.json();
    const { name, description, content, isDefault, isActive } = body;

    if (isActive === false) {
      await assertNotLastActiveSystemPrompt(existing, 'deactivate');
    }

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
    await requireAdmin(request);
    const { id } = await params;

    const existing = await prisma.promptTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('ERR_NOT_FOUND', `Prompt template not found: ${id}`, 404);
    }

    await assertNotLastActiveSystemPrompt(existing, 'delete');

    await prisma.promptTemplate.delete({ where: { id } });

    return Response.json({ data: { message: 'Prompt template deleted' } });
  } catch (error) {
    return errorResponse(error);
  }
}
