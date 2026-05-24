/**
 * Claude AI Summarization Service
 * Uses Anthropic Claude claude-sonnet-4-6 to generate structured meeting minutes.
 */

import Anthropic from '@anthropic-ai/sdk';
import prisma from '@/lib/db';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

const REQUIRED_SECTIONS = ['整體概要', '討論重點', '情緒分析', '行動計畫'] as const;

/**
 * Get the prompt template content from DB.
 * Falls back to the default template if specific ID not found.
 */
async function getPromptContent(templateId?: string): Promise<{ id: string; content: string }> {
  let template;

  if (templateId) {
    template = await prisma.promptTemplate.findUnique({
      where: { id: templateId },
    });
  }

  if (!template) {
    template = await prisma.promptTemplate.findFirst({
      where: { isDefault: true, isActive: true },
    });
  }

  if (!template) {
    template = await prisma.promptTemplate.findFirst({
      where: { isActive: true },
    });
  }

  if (!template) {
    throw new Error('No active prompt template found');
  }

  return { id: template.id, content: template.content };
}

/**
 * Build the user message with meeting metadata and transcript
 */
function buildUserMessage(metadata: MeetingMetadata, transcript: string): string {
  const parts = [
    `## 會議資訊`,
    `- 主題: ${metadata.meetingTopic}`,
    `- 日期: ${metadata.meetingDate}`,
  ];

  if (metadata.participants) {
    parts.push(`- 參與者: ${metadata.participants}`);
  }

  parts.push('', '## 會議逐字稿', '', transcript);

  return parts.join('\n');
}

/**
 * Parse the AI response into structured sections
 */
function parseResponse(content: string): SummarizationResult {
  // Extract sections by headers
  const extractSection = (sectionName: string): string => {
    // Look for the section header (with ## or # prefix)
    const regex = new RegExp(`#+\\s*${sectionName}[\\s\\S]*?(?=#+\\s|$)`, 'g');
    const match = regex.exec(content);
    if (match) {
      return match[0].replace(new RegExp(`^#+\\s*${sectionName}\\s*`), '').trim();
    }
    return '';
  };

  return {
    summary: extractSection('整體概要'),
    keyPoints: extractSection('討論重點'),
    sentimentAnalysis: extractSection('情緒分析'),
    actionItems: extractSection('行動計畫'),
    markdownOutput: content,
  };
}

/**
 * Validate that the output contains all required sections
 */
function validateOutput(content: string): string[] {
  const missing: string[] = [];
  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) {
      missing.push(section);
    }
  }
  return missing;
}

/**
 * Main summarization entry point.
 * Calls Claude claude-sonnet-4-6 with the prompt template and transcript.
 */
export async function summarizeMeeting(
  metadata: MeetingMetadata,
  transcript: string,
  promptTemplateId?: string
): Promise<{ result: SummarizationResult; promptTemplateId: string }> {
  const { id: templateId, content: systemPrompt } = await getPromptContent(promptTemplateId);
  const userMessage = buildUserMessage(metadata, transcript);

  let attempt = 0;
  const maxAttempts = 2; // initial + 1 retry

  while (attempt < maxAttempts) {
    attempt++;

    const currentUserMessage = attempt === 1
      ? userMessage
      : `${userMessage}\n\n[重要提醒] 請確保輸出包含以下區塊：${REQUIRED_SECTIONS.join('、')}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: currentUserMessage,
        },
      ],
    });

    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const missingParts = validateOutput(textContent);

    if (missingParts.length === 0 || attempt >= maxAttempts) {
      const result = parseResponse(textContent);
      return { result, promptTemplateId: templateId };
    }

    // If missing sections and haven't exhausted retries, will loop back
    console.warn(`AI output missing sections: ${missingParts.join(', ')}. Retrying...`);
  }

  // Unreachable, but TypeScript needs it
  throw new Error('Summarization failed after retries');
}
