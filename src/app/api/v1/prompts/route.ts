/**
 * GET /api/v1/prompts - List active prompt templates (public, no auth required)
 * This is used by the upload form to show available prompt templates.
 */

import { errorResponse } from '@/lib/utils/errors';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const templates = await prisma.promptTemplate.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        isDefault: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return Response.json({ data: templates });
  } catch (error) {
    return errorResponse(error);
  }
}
