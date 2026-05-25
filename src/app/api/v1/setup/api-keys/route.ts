/**
 * Per-user API key endpoints.
 * Each user manages their own OPENAI_API_KEY in the UserSetting table.
 */

import { NextRequest } from 'next/server';
import {
  API_KEY_NAMES,
  ApiKeyName,
  getApiKeyStatuses,
  setApiKeys,
} from '@/lib/settings/api-keys';
import { AppError, errorResponse } from '@/lib/utils/errors';
import { requireUser } from '@/lib/utils/auth';

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser(req);
    const data = await getApiKeyStatuses(me.sub);
    return Response.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}

interface PostBody {
  OPENAI_API_KEY?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as PostBody;
    const updates: Partial<Record<ApiKeyName, string | null>> = {};
    for (const name of API_KEY_NAMES) {
      if (name in body) updates[name] = body[name] ?? null;
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError('ERR_BAD_REQUEST', '請至少提供一個 API key', 400);
    }

    for (const [name, value] of Object.entries(updates)) {
      if (!value) continue;
      if (name === 'OPENAI_API_KEY' && !value.startsWith('sk-')) {
        throw new AppError(
          'ERR_BAD_REQUEST',
          'OpenAI API key 應以 "sk-" 開頭',
          400
        );
      }
    }

    await setApiKeys(me.sub, updates, me.email);
    return Response.json({ data: await getApiKeyStatuses(me.sub) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const me = await requireUser(req);
    const { searchParams } = new URL(req.url);
    const target = searchParams.get('name');
    if (!target || !API_KEY_NAMES.includes(target as ApiKeyName)) {
      throw new AppError('ERR_BAD_REQUEST', '無效的 key 名稱', 400);
    }
    await setApiKeys(me.sub, { [target as ApiKeyName]: null });
    return Response.json({ data: await getApiKeyStatuses(me.sub) });
  } catch (err) {
    return errorResponse(err);
  }
}
