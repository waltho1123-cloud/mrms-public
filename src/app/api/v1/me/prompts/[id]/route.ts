/**
 * PUT    /api/v1/me/prompts/:id - update one of caller's own prompts
 * DELETE /api/v1/me/prompts/:id - delete it
 */

import { NextRequest } from 'next/server';
import { errorResponse, AppError } from '@/lib/utils/errors';
import { requireUser } from '@/lib/utils/auth';
import prisma from '@/lib/db';

const NAME_MAX = 100;
const DESC_MAX = 300;
const CONTENT_MIN = 10;
const CONTENT_MAX = 50_000;

async function findOwnedOrThrow(id: string, userId: string) {
  const found = await prisma.promptTemplate.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!found) throw new AppError('ERR_NOT_FOUND', `Prompt not found: ${id}`, 404);
  return found;
}

interface PutBody {
  name?: string;
  description?: string | null;
  content?: string;
  isActive?: boolean;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireUser(req);
    const { id } = await params;
    await findOwnedOrThrow(id, me.sub);

    const body = (await req.json().catch(() => ({}))) as PutBody;
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const v = body.name.trim();
      if (!v) throw new AppError('ERR_VALIDATION', '名稱不可為空', 400);
      if (v.length > NAME_MAX) throw new AppError('ERR_VALIDATION', `名稱最多 ${NAME_MAX} 字`, 400);
      data.name = v;
    }
    if (body.description !== undefined) {
      const v = body.description?.trim() || null;
      if (v && v.length > DESC_MAX) throw new AppError('ERR_VALIDATION', `說明最多 ${DESC_MAX} 字`, 400);
      data.description = v;
    }
    if (body.content !== undefined) {
      const v = body.content.trim();
      if (v.length < CONTENT_MIN) throw new AppError('ERR_VALIDATION', `內容至少 ${CONTENT_MIN} 字`, 400);
      if (v.length > CONTENT_MAX) throw new AppError('ERR_VALIDATION', `內容最多 ${CONTENT_MAX} 字`, 400);
      data.content = v;
    }
    if (body.isActive !== undefined) {
      data.isActive = !!body.isActive;
    }

    if (Object.keys(data).length === 0) {
      throw new AppError('ERR_VALIDATION', '沒有任何欄位變更', 400);
    }

    const updated = await prisma.promptTemplate.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        description: true,
        content: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return Response.json({ data: updated });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireUser(req);
    const { id } = await params;
    await findOwnedOrThrow(id, me.sub);

    await prisma.promptTemplate.delete({ where: { id } });
    return Response.json({ data: { message: 'Prompt deleted' } });
  } catch (err) {
    return errorResponse(err);
  }
}
