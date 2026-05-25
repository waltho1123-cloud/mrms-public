/**
 * POST /api/v1/auth/login - Admin login
 * Validates email + password, returns JWT token.
 */

import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { errorResponse, AppError } from '@/lib/utils/errors';
import prisma from '@/lib/db';
import { createToken } from '@/lib/utils/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      throw new AppError('ERR_VALIDATION', 'Email and password are required', 400);
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new AppError('ERR_VALIDATION', 'Email and password must be strings', 400);
    }

    if (email.length > 255 || password.length > 128) {
      throw new AppError('ERR_VALIDATION', 'Input too long', 400);
    }

    if (!process.env.DATABASE_URL) {
      throw new AppError(
        'ERR_CONFIG',
        'DATABASE_URL 未設定，請於 Zeabur Service Variables（或本機 .env）設定後重新部署',
        503
      );
    }

    let user;
    try {
      user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });
    } catch (dbErr) {
      const message = dbErr instanceof Error ? dbErr.message : String(dbErr);
      throw new AppError(
        'ERR_CONFIG',
        `資料庫連線失敗，請確認 DATABASE_URL 與 PostgreSQL 是否正常運作。詳細: ${message.split('\n')[0]}`,
        503
      );
    }

    if (!user) {
      throw new AppError('ERR_AUTH', 'Invalid email or password', 401);
    }

    if (user.status === 'disabled') {
      throw new AppError('ERR_AUTH', '帳號已被停用', 403);
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new AppError('ERR_AUTH', 'Invalid email or password', 401);
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate JWT
    const token = await createToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return Response.json({
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
