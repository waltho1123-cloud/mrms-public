/**
 * GET /api/v1/prompts - List active prompt templates available to the caller.
 *   - System-wide templates (userId = null) are always returned.
 *   - If the caller is authenticated, their own templates are also returned.
 *
 * Used by the upload form to populate the prompt dropdown.
 */

import { NextRequest } from 'next/server';
import { errorResponse } from '@/lib/utils/errors';
import { verifyToken } from '@/lib/utils/auth';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Auth is optional here — anonymous callers still get system templates
    let userId: string | undefined;
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = await verifyToken(authHeader.slice(7));
        userId = payload.sub;
      } catch {
        // bad token: ignore, treat as anonymous
      }
    }

    const templates = await prisma.promptTemplate.findMany({
      where: {
        isActive: true,
        OR: userId ? [{ userId: null }, { userId }] : [{ userId: null }],
      },
      select: {
        id: true,
        name: true,
        description: true,
        isDefault: true,
        userId: true,
      },
      orderBy: [{ userId: 'asc' }, { isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    // Tag with `owner` so UI can distinguish system vs personal
    const shaped = templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      isDefault: t.isDefault,
      owner: t.userId === null ? 'system' : 'me',
    }));

    return Response.json({ data: shaped });
  } catch (error) {
    return errorResponse(error);
  }
}
