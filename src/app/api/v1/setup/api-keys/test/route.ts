/**
 * Validate the calling user's OpenAI API key via a minimal models.list call.
 */

import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { ApiKeyName, getApiKey } from '@/lib/settings/api-keys';
import { AppError, errorResponse } from '@/lib/utils/errors';
import { requireUser } from '@/lib/utils/auth';

interface Body {
  name?: ApiKeyName;
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;
    const name = body.name;
    if (name !== 'OPENAI_API_KEY') {
      throw new AppError('ERR_BAD_REQUEST', '無效的 key 名稱', 400);
    }
    const key = await getApiKey(me.sub, name);
    if (!key) {
      throw new AppError('ERR_BAD_REQUEST', `${name} 尚未設定`, 400);
    }

    const client = new OpenAI({ apiKey: key });
    await client.models.list();
    return Response.json({ data: { ok: true, message: 'OpenAI API key 驗證成功' } });
  } catch (err) {
    if (err instanceof AppError) return errorResponse(err);
    const message = err instanceof Error ? err.message : 'API key 驗證失敗';
    return Response.json(
      { error: { code: 'ERR_KEY_INVALID', message } },
      { status: 400 }
    );
  }
}
