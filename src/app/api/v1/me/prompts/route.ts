/**
 * GET  /api/v1/me/prompts - list prompts owned by the caller
 * POST /api/v1/me/prompts - create a new prompt (max 5 per user)
 */

import { NextRequest } from 'next/server';
import { errorResponse, AppError } from '@/lib/utils/errors';
import { requireUser } from '@/lib/utils/auth';
import prisma from '@/lib/db';

const MAX_PROMPTS_PER_USER = 5;
const NAME_MAX = 100;
const DESC_MAX = 300;
const CONTENT_MIN = 10;
const CONTENT_MAX = 50_000;

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser(req);
    const prompts = await prisma.promptTemplate.findMany({
      where: { userId: me.sub },
      orderBy: { createdAt: 'desc' },
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
    return Response.json({
      data: { items: prompts, count: prompts.length, max: MAX_PROMPTS_PER_USER },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

interface PostBody {
  name?: string;
  description?: string;
  content?: string;
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as PostBody;

    const name = (body.name ?? '').trim();
    const description = (body.description ?? '').trim() || null;
    const content = (body.content ?? '').trim();

    if (!name) throw new AppError('ERR_VALIDATION', '請填入範本名稱', 400);
    if (name.length > NAME_MAX) throw new AppError('ERR_VALIDATION', `名稱最多 ${NAME_MAX} 字`, 400);
    if (description && description.length > DESC_MAX) throw new AppError('ERR_VALIDATION', `說明最多 ${DESC_MAX} 字`, 400);
    if (content.length < CONTENT_MIN) throw new AppError('ERR_VALIDATION', `內容至少 ${CONTENT_MIN} 字`, 400);
    if (content.length > CONTENT_MAX) throw new AppError('ERR_VALIDATION', `內容最多 ${CONTENT_MAX} 字`, 400);

    const count = await prisma.promptTemplate.count({ where: { userId: me.sub } });
    if (count >= MAX_PROMPTS_PER_USER) {
      throw new AppError(
        'ERR_LIMIT',
        `每位使用者最多 ${MAX_PROMPTS_PER_USER} 個範本（目前已有 ${count}）`,
        400
      );
    }

    const created = await prisma.promptTemplate.create({
      data: {
        userId: me.sub,
        name,
        description,
        content,
        isDefault: false, // user-owned prompts never set as system default
        isActive: true,
      },
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

    return Response.json({ data: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
