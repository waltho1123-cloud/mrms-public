/**
 * POST /api/v1/tasks - Upload audio file and create a new task
 * GET  /api/v1/tasks - List tasks with cursor-based pagination
 */

import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { errorResponse, AppError } from '@/lib/utils/errors';
import {
  ALLOWED_AUDIO_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/utils/constants';
import { createTask, listTasks, transitionStatus } from '@/lib/services/task.service';
import { assertPromptAccessible } from '@/lib/services/ai.service';
import meetingQueue from '@/lib/queue/queue';
import { requireUser } from '@/lib/utils/auth';
import { getApiKey } from '@/lib/settings/api-keys';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/mrms-uploads';
const AUTO_PUSH = process.env.AUTO_PUSH === 'true';

export async function POST(request: NextRequest) {
  try {
    const me = await requireUser(request);

    // Gate: user must have their own OpenAI key before they can upload
    const openaiKey = await getApiKey(me.sub, 'OPENAI_API_KEY');
    if (!openaiKey) {
      throw new AppError(
        'ERR_CONFIG',
        '請先到設定頁填入您的 OpenAI API key',
        400
      );
    }

    const formData = await request.formData();

    // Extract fields
    const audioFile = formData.get('audioFile') as File | null;
    const meetingTopic = formData.get('meetingTopic') as string | null;
    const meetingDate = formData.get('meetingDate') as string | null;
    const participants = formData.get('participants') as string | null;
    const promptTemplateId = formData.get('promptTemplateId') as string | null;

    // Validate required fields
    if (!audioFile) {
      throw new AppError('ERR_VALIDATION', 'audioFile is required', 400);
    }

    // If a specific prompt was selected, reject up-front. Otherwise the
    // worker fails after we've already spent STT tokens on transcription.
    if (promptTemplateId) {
      await assertPromptAccessible(me.sub, promptTemplateId);
    }
    if (!meetingTopic || meetingTopic.trim() === '') {
      throw new AppError('ERR_VALIDATION', 'meetingTopic is required', 400);
    }

    // Validate file extension
    const ext = path.extname(audioFile.name).toLowerCase().replace('.', '');
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new AppError(
        'ERR_VALIDATION',
        `Unsupported file type: .${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
        400
      );
    }

    // Validate MIME type (additional layer of security)
    if (audioFile.type && !ALLOWED_AUDIO_TYPES.includes(audioFile.type)) {
      throw new AppError(
        'ERR_VALIDATION',
        `Unsupported MIME type: ${audioFile.type}`,
        400
      );
    }

    // Validate file size
    if (audioFile.size > MAX_FILE_SIZE_BYTES) {
      throw new AppError(
        'ERR_VALIDATION',
        `File too large. Maximum: ${process.env.MAX_FILE_SIZE_MB || 200}MB`,
        400
      );
    }

    // Ensure upload directory exists
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });

    // Save file to disk - use UUID for filename to prevent path traversal
    const fileId = uuidv4();
    const fileName = `${fileId}.${ext}`;
    const filePath = path.join(UPLOAD_DIR, fileName);

    // Verify the resolved path is within the upload directory
    const resolvedPath = path.resolve(filePath);
    const resolvedUploadDir = path.resolve(UPLOAD_DIR);
    if (!resolvedPath.startsWith(resolvedUploadDir)) {
      throw new AppError('ERR_VALIDATION', 'Invalid file path', 400);
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    await fs.promises.writeFile(filePath, Buffer.from(arrayBuffer));

    // Validate meeting date if provided
    let parsedMeetingDate: Date | undefined;
    if (meetingDate) {
      parsedMeetingDate = new Date(meetingDate);
      if (isNaN(parsedMeetingDate.getTime())) {
        throw new AppError('ERR_VALIDATION', 'Invalid meetingDate format', 400);
      }
    }

    // Create task in DB (owned by the calling user)
    const taskId = await createTask({
      userId: me.sub,
      meetingTopic: meetingTopic.trim(),
      meetingDate: parsedMeetingDate,
      participants: participants?.trim() || undefined,
      audioFilePath: filePath,
      audioFileSize: audioFile.size,
    });

    // Transition to queued and add to BullMQ
    await transitionStatus(taskId, 'queued');

    await meetingQueue.add('process-meeting' as string, {
      taskId,
      userId: me.sub,
      audioFilePath: filePath,
      meetingTopic: meetingTopic.trim(),
      meetingDate: meetingDate || new Date().toISOString(),
      participants: participants?.trim() || undefined,
      promptTemplateId: promptTemplateId || undefined,
      autoPush: AUTO_PUSH,
    });

    return Response.json(
      {
        data: {
          taskId,
          status: 'queued',
          message: 'Task created and queued for processing',
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const me = await requireUser(request);
    const { searchParams } = request.nextUrl;

    const cursor = searchParams.get('cursor') || undefined;
    const rawLimit = searchParams.get('limit');
    const limit = rawLimit ? Math.max(1, parseInt(rawLimit, 10) || 20) : undefined;
    const topic = searchParams.get('topic') || undefined;
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;

    const result = await listTasks({
      userId: me.role === 'admin' ? undefined : me.sub,
      cursor,
      limit,
      topic,
      dateFrom,
      dateTo,
    });

    return Response.json({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
}
