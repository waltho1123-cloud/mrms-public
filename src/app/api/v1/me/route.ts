/**
 * GET /api/v1/me — return the calling user's profile.
 */

import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/utils/auth';
import { errorResponse, AppError } from '@/lib/utils/errors';
import prisma from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser(req);
    const user = await prisma.user.findUnique({
      where: { id: me.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
    if (!user) {
      throw new AppError('ERR_NOT_FOUND', '帳號不存在或已被移除', 404);
    }
    if (user.status === 'disabled') {
      throw new AppError('ERR_AUTH', '帳號已被停用', 403);
    }
    return Response.json({ data: user });
  } catch (err) {
    return errorResponse(err);
  }
}
