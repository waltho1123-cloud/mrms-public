/**
 * AI Summarization Service
 * Uses OpenAI gpt-5.4-mini (Chat Completions) with Structured Outputs to
 * generate strictly-typed meeting minutes — no more brittle markdown regex.
 */

import OpenAI from 'openai';
import prisma from '@/lib/db';
import { getApiKey } from '@/lib/settings/api-keys';
import { AppError } from '@/lib/utils/errors';

const SUMMARY_MODEL = 'gpt-5.4-mini';
const MAX_OUTPUT_TOKENS = 8192;

async function getOpenAI(userId: string): Promise<OpenAI> {
  const apiKey = await getApiKey(userId, 'OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY 未設定，請於設定頁填入您自己的 OpenAI API key');
  }
  return new OpenAI({ apiKey });
}

export interface MeetingMetadata {
  meetingTopic: string;
  meetingDate: string;
  participants?: string;
}

export interface SummarizationResult {
  summary: string;
  keyPoints: string;
  sentimentAnalysis: string;
  actionItems: string;
  markdownOutput: string;
}

/**
 * JSON Schema enforced via Structured Outputs.
 * OpenAI strict mode requires: all properties listed in `required`, and
 * `additionalProperties: false`.
 */
const MINUTES_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: '整體概要：2-3 段，使用繁體中文，客觀中立。',
    },
    keyPoints: {
      type: 'string',
      description:
        '討論重點：列出會議主要議題與重要觀點，每個議題用簡短段落或條列，使用繁體中文。',
    },
    sentimentAnalysis: {
      type: 'string',
      description:
        '情緒分析：分析與會者整體情緒傾向（正面/中立/負面）及對各議題的態度與共識程度，使用繁體中文。',
    },
    actionItems: {
      type: 'string',
      description:
        '行動計畫：以 markdown 條列形式列出後續行動，每項包含描述、負責人（若有）、預計完成時間（若有）；無資訊時標註「[不確定]」。',
    },
  },
  required: ['summary', 'keyPoints', 'sentimentAnalysis', 'actionItems'],
  additionalProperties: false,
} as const;

interface MinutesJson {
  summary: string;
  keyPoints: string;
  sentimentAnalysis: string;
  actionItems: string;
}

/**
 * Throw AppError if the prompt template is not active or not accessible
 * to this user. Call this *before* enqueueing a job so the upload doesn't
 * spend STT/AI tokens only to fail at the summarize step.
 */
export async function assertPromptAccessible(
  userId: string,
  templateId: string
): Promise<void> {
  const t = await prisma.promptTemplate.findFirst({
    where: {
      id: templateId,
      isActive: true,
      OR: [{ userId: null }, { userId }],
    },
    select: { id: true },
  });
  if (!t) {
    throw new AppError(
      'ERR_VALIDATION',
      `Prompt template not accessible: ${templateId}`,
      400
    );
  }
}

async function getPromptContent(
  userId: string,
  templateId?: string
): Promise<{ id: string; content: string }> {
  // Scope: caller can only use system templates (userId=null) or their own
  const scope = { OR: [{ userId: null }, { userId }], isActive: true };

  // Explicit ID path: must exist in scope; do NOT silently fall back, or
  // the caller will get a different prompt than they asked for and never
  // know.
  if (templateId) {
    const template = await prisma.promptTemplate.findFirst({
      where: { id: templateId, ...scope },
    });
    if (!template) {
      throw new Error(
        `Prompt template not found or not accessible: ${templateId}`
      );
    }
    return { id: template.id, content: template.content };
  }

  // Implicit selection (caller passed no ID): prefer system default,
  // then any active template in scope.
  let template = await prisma.promptTemplate.findFirst({
    where: { isDefault: true, ...scope },
  });
  if (!template) {
    template = await prisma.promptTemplate.findFirst({ where: scope });
  }
  if (!template) {
    throw new Error('No active prompt template found');
  }
  return { id: template.id, content: template.content };
}

function buildUserMessage(metadata: MeetingMetadata, transcript: string): string {
  const parts = [
    `## 會議資訊`,
    `- 主題: ${metadata.meetingTopic}`,
    `- 日期: ${metadata.meetingDate}`,
  ];
  if (metadata.participants) parts.push(`- 參與者: ${metadata.participants}`);
  parts.push('', '## 會議逐字稿', '', transcript);
  return parts.join('\n');
}

/**
 * Assemble markdown for downstream consumers (LINE push, UI) from the
 * strictly-typed JSON. Section headers are fixed so consumers can rely on
 * the structure.
 */
function toMarkdown(data: MinutesJson): string {
  return [
    '## 整體概要',
    data.summary.trim(),
    '',
    '## 討論重點',
    data.keyPoints.trim(),
    '',
    '## 情緒分析',
    data.sentimentAnalysis.trim(),
    '',
    '## 行動計畫',
    data.actionItems.trim(),
  ].join('\n');
}

/**
 * Main summarization entry point.
 * Returns structured fields + a freshly-assembled markdown view.
 */
export async function summarizeMeeting(
  userId: string,
  metadata: MeetingMetadata,
  transcript: string,
  promptTemplateId?: string
): Promise<{ result: SummarizationResult; promptTemplateId: string }> {
  const { id: templateId, content: systemPrompt } = await getPromptContent(userId, promptTemplateId);
  const userMessage = buildUserMessage(metadata, transcript);

  const openai = await getOpenAI(userId);
  const response = await openai.chat.completions.create({
    model: SUMMARY_MODEL,
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'meeting_minutes',
        schema: MINUTES_SCHEMA,
        strict: true,
      },
    },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  const choice = response.choices[0];
  if (choice?.finish_reason === 'length') {
    throw new Error(`摘要輸出超過 ${MAX_OUTPUT_TOKENS} tokens 上限，請縮減逐字稿或調高 MAX_OUTPUT_TOKENS`);
  }

  const raw = choice?.message?.content ?? '';
  if (!raw) {
    throw new Error('AI 回應為空');
  }

  let data: MinutesJson;
  try {
    data = JSON.parse(raw) as MinutesJson;
  } catch (err) {
    throw new Error(
      `AI 回應不是合法 JSON（${err instanceof Error ? err.message : 'parse error'}）: ${raw.slice(0, 200)}`
    );
  }

  const result: SummarizationResult = {
    summary: data.summary,
    keyPoints: data.keyPoints,
    sentimentAnalysis: data.sentimentAnalysis,
    actionItems: data.actionItems,
    markdownOutput: toMarkdown(data),
  };

  return { result, promptTemplateId: templateId };
}
