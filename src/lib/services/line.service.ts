/**
 * LINE Messaging API Push Service
 * Sends meeting minutes to LINE groups via the Push Message API.
 * Uses the UserWebhook table (per-user):
 *   - name         -> LINE Bot name
 *   - groupId      -> LINE Group ID
 *   - accessToken  -> LINE Channel Access Token
 */

import prisma from '@/lib/db';
import { PUSH_MAX_RETRIES, PUSH_RETRY_DELAY_MS } from '@/lib/utils/constants';

export interface PushPayload {
  taskId: string;
  userId: string;
  webhookId?: string;
  markdownTitle: string;
  markdownContent: string;
}

export interface PushResult {
  success: boolean;
  webhookId: string;
  responseCode?: number;
  responseBody?: string;
  retryCount: number;
}

/**
 * Convert Markdown to plain text suitable for LINE messages.
 * LINE does not support Markdown rendering, so we strip/convert
 * common Markdown syntax into readable plain text.
 */
export function markdownToPlainText(markdown: string): string {
  let text = markdown;

  // Convert ## headings to 【heading】
  text = text.replace(/^#{1,6}\s+(.+)$/gm, (_match, heading: string) => {
    return `【${heading.trim()}】`;
  });

  // Convert **bold** and __bold__ to the inner text
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  text = text.replace(/__(.+?)__/g, '$1');

  // Convert *italic* and _italic_ to the inner text
  text = text.replace(/\*(.+?)\*/g, '$1');
  text = text.replace(/_(.+?)_/g, '$1');

  // Convert ~~strikethrough~~ to the inner text
  text = text.replace(/~~(.+?)~~/g, '$1');

  // Convert `inline code` to the inner text
  text = text.replace(/`(.+?)`/g, '$1');

  // Convert [link text](url) to "link text (url)"
  text = text.replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)');

  // Convert unordered list markers (-, *, +) to bullet
  text = text.replace(/^[\s]*[-*+]\s+/gm, '  - ');

  // Convert ordered list markers (1., 2., etc.)
  text = text.replace(/^[\s]*(\d+)\.\s+/gm, '  $1. ');

  // Remove horizontal rules (---, ***, ___)
  text = text.replace(/^[-*_]{3,}\s*$/gm, '━━━━━━━━━━━━━━━━');

  // Remove code block fences
  text = text.replace(/^```[\s\S]*?```$/gm, (match) => {
    return match.replace(/^```\w*\n?/gm, '').replace(/```$/gm, '');
  });

  // Remove blockquote markers
  text = text.replace(/^>\s+/gm, '');

  // Remove image syntax ![alt](url)
  text = text.replace(/!\[.*?\]\(.*?\)/g, '');

  // Collapse multiple blank lines into at most two
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Send a single push message to a LINE group via the Messaging API.
 */
async function sendToLine(
  groupId: string,
  channelAccessToken: string,
  textContent: string
): Promise<{ statusCode: number; body: string }> {
  const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

  const payload = {
    to: groupId,
    messages: [
      {
        type: 'text',
        text: textContent,
      },
    ],
  };

  const response = await fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  return { statusCode: response.status, body };
}

/**
 * Push meeting minutes to LINE group(s) with retry logic.
 * Records PushLog for each attempt.
 */
export async function pushToLine(payload: PushPayload): Promise<PushResult[]> {
  // Resolve owner's webhook(s) — scoped to payload.userId for tenant isolation
  let webhooks;
  if (payload.webhookId) {
    const webhook = await prisma.userWebhook.findFirst({
      where: { id: payload.webhookId, userId: payload.userId },
    });
    if (!webhook) throw new Error(`LINE Bot not found: ${payload.webhookId}`);
    if (!webhook.isActive) throw new Error(`LINE Bot is inactive: ${payload.webhookId}`);
    webhooks = [webhook];
  } else {
    webhooks = await prisma.userWebhook.findMany({
      where: { userId: payload.userId, isDefault: true, isActive: true },
    });
    if (webhooks.length === 0) {
      throw new Error('No default active LINE Bots configured for this user');
    }
  }

  const results: PushResult[] = [];

  // Convert markdown to plain text once (invariant across webhooks)
  const plainText = markdownToPlainText(payload.markdownContent);
  const messageText = [
    `\u{1F4CB} ${payload.markdownTitle}`,
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    '',
    plainText,
  ].join('\n');

  for (const webhook of webhooks) {
    let success = false;
    let lastStatusCode: number | undefined;
    let lastBody: string | undefined;
    let retryCount = 0;

    for (let attempt = 0; attempt < PUSH_MAX_RETRIES; attempt++) {
      try {
        const { statusCode, body } = await sendToLine(
          webhook.groupId,
          webhook.accessToken,
          messageText
        );

        lastStatusCode = statusCode;
        lastBody = body;
        retryCount = attempt;

        // LINE returns 200 with empty body on success
        if (statusCode === 200) {
          success = true;
          break;
        }
      } catch (error) {
        lastBody = error instanceof Error ? error.message : String(error);
        retryCount = attempt;
      }

      // Wait before retry (skip wait on last attempt)
      if (attempt < PUSH_MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, PUSH_RETRY_DELAY_MS));
      }
    }

    // Record PushLog
    await prisma.pushLog.create({
      data: {
        taskId: payload.taskId,
        webhookId: webhook.id,
        status: success ? 'success' : 'failed',
        responseCode: lastStatusCode,
        responseBody: lastBody?.substring(0, 2000),
        retryCount,
      },
    });

    results.push({
      success,
      webhookId: webhook.id,
      responseCode: lastStatusCode,
      responseBody: lastBody,
      retryCount,
    });
  }

  return results;
}

/**
 * Send a test message to a specific LINE Bot / Group.
 */
export async function testLineWebhook(webhookId: string, userId: string): Promise<{ success: boolean; message: string }> {
  const webhook = await prisma.userWebhook.findFirst({
    where: { id: webhookId, userId },
  });

  if (!webhook) {
    return { success: false, message: 'LINE Bot not found' };
  }

  try {
    const testMessage = [
      '\u{1F4CB} MRMS \u6E2C\u8A66\u8A0A\u606F',
      '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
      '',
      '\u9019\u662F\u4E00\u5247\u4F86\u81EA MRMS \u7CFB\u7D71\u7684\u6E2C\u8A66\u8A0A\u606F\uFF0C\u8868\u793A LINE Bot \u914D\u7F6E\u6B63\u78BA\u3002',
    ].join('\n');

    const { statusCode, body } = await sendToLine(
      webhook.groupId,
      webhook.accessToken,
      testMessage
    );

    if (statusCode === 200) {
      return { success: true, message: 'Test message sent successfully' };
    }

    let errorMsg = body;
    try {
      const parsed = JSON.parse(body);
      errorMsg = parsed.message || body;
    } catch {
      // body is not JSON, use as-is
    }

    return { success: false, message: `LINE API error: ${errorMsg}` };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
