/**
 * POST /api/v1/auth/register — open self-service registration.
 * New accounts are created with role='user'.
 *
 * Email + password only; email verification deferred to a later phase.
 */

import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { errorResponse, AppError } from '@/lib/utils/errors';
import { createToken } from '@/lib/utils/auth';
import prisma from '@/lib/db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email, password, name } = body as {
      email?: unknown;
      password?: unknown;
      name?: unknown;
    };

    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new AppError('ERR_VALIDATION', 'Email 與密碼為必填', 400);
    }
    if (email.length > 255 || password.length > 128) {
      throw new AppError('ERR_VALIDATION', '輸入過長', 400);
    }
    if (!EMAIL_RE.test(email)) {
      throw new AppError('ERR_VALIDATION', 'Email 格式錯誤', 400);
    }
    if (password.length < MIN_PASSWORD_LEN) {
      throw new AppError(
        'ERR_VALIDATION',
        `密碼至少 ${MIN_PASSWORD_LEN} 字`,
        400
      );
    }
    if (typeof name === 'string' && name.length > 100) {
      throw new AppError('ERR_VALIDATION', '名稱過長', 400);
    }

    if (!process.env.DATABASE_URL) {
      throw new AppError(
        'ERR_CONFIG',
        'DATABASE_URL 未設定，請於 Zeabur Service Variables（或本機 .env）設定後重新部署',
        503
      );
    }

    const normalizedEmail = email.toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      // Don't leak which emails are registered — return a generic 409
      throw new AppError('ERR_EMAIL_TAKEN', 'Email 已被註冊', 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: typeof name === 'string' && name.trim() ? name.trim() : null,
        role: 'user',
        status: 'active',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    const token = await createToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return Response.json(
      {
        data: {
          token,
          user,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
