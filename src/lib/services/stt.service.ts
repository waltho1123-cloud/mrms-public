/**
 * OpenAI STT Service
 * Handles audio transcription via OpenAI gpt-4o-mini-transcribe.
 * Supports automatic chunking for files > 25MB using ffmpeg silencedetect.
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';
import { STT_MAX_FILE_SIZE } from '@/lib/utils/constants';
import { getApiKey } from '@/lib/settings/api-keys';

const execFileAsync = promisify(execFile);

async function getOpenAI(userId: string): Promise<OpenAI> {
  const apiKey = await getApiKey(userId, 'OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY 未設定，請於設定頁填入您自己的 OpenAI API key');
  }
  return new OpenAI({ apiKey });
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  rawText: string;
  language: string;
  durationSeconds: number;
  wordCount: number;
  segments: TranscriptSegment[];
}

/**
 * Extended transcription response shape from OpenAI (includes fields beyond the base type)
 */
interface TranscriptionResponseExt {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string }>;
}

/**
 * Transcribe a single audio file via OpenAI
 */
async function transcribeSingle(userId: string, filePath: string, retries = 3): Promise<OpenAI.Audio.Transcription> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const fileStream = fs.createReadStream(filePath);
      const openai = await getOpenAI(userId);
      const transcription = await openai.audio.transcriptions.create({
        model: 'gpt-4o-mini-transcribe',
        file: fileStream,
        response_format: 'json',
      });
      return transcription;
    } catch (error) {
      if (attempt === retries) throw error;
      // Exponential backoff: 1s, 2s, 4s
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }
  throw new Error('Unreachable');
}

/**
 * Get audio duration using ffprobe
 */
async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath,
    ]);
    return Math.ceil(parseFloat(stdout.trim()));
  } catch {
    return 0;
  }
}

/**
 * Split audio at a specific time point using ffmpeg
 */
async function splitAudio(
  inputPath: string,
  outputDir: string,
  startTime: number,
  endTime: number | null,
  index: number
): Promise<string> {
  const ext = path.extname(inputPath);
  const outputPath = path.join(outputDir, `chunk_${index}${ext}`);
  const args = ['-y', '-i', inputPath, '-ss', String(startTime)];
  if (endTime !== null) {
    args.push('-to', String(endTime));
  }
  args.push('-c', 'copy', outputPath);
  await execFileAsync('ffmpeg', args);
  return outputPath;
}

/**
 * Split audio by equal time segments
 */
async function splitByTime(filePath: string, totalDuration: number, forceNumChunks?: number): Promise<string[]> {
  const fileSize = fs.statSync(filePath).size;
  const numChunks = forceNumChunks || Math.ceil(fileSize / STT_MAX_FILE_SIZE);

  if (numChunks <= 1) return [filePath];

  const duration = totalDuration || 600; // default 10 min if unknown
  const chunkDuration = Math.floor(duration / numChunks);

  const tmpDir = path.join(path.dirname(filePath), `chunks_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const chunks: string[] = [];
  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkDuration;
    const end = i === numChunks - 1 ? null : (i + 1) * chunkDuration;
    const chunkPath = await splitAudio(filePath, tmpDir, start, end, i);
    chunks.push(chunkPath);
  }

  return chunks;
}

/**
 * Clean up temporary chunk files
 */
function cleanupChunks(chunks: string[], originalPath: string): void {
  for (const chunk of chunks) {
    if (chunk !== originalPath) {
      try {
        fs.unlinkSync(chunk);
      } catch { /* ignore */ }
    }
  }
  // Remove temp directory
  if (chunks.length > 0 && chunks[0] !== originalPath) {
    const dir = path.dirname(chunks[0]);
    try {
      fs.rmdirSync(dir);
    } catch { /* ignore */ }
  }
}

/**
 * Normalize audio file to a format OpenAI reliably accepts.
 * Converts to 16kHz mono mp3 at 48kbps (compact but clear for speech).
 */
async function normalizeAudio(filePath: string): Promise<string> {
  const normalizedPath = filePath.replace(/(\.[^.]+)$/, '_normalized.mp3');
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-i', filePath,
      '-ar', '16000', '-ac', '1', '-b:a', '48k',
      '-map_metadata', '-1',
      normalizedPath,
    ]);
    return normalizedPath;
  } catch {
    // If ffmpeg fails, return original file
    return filePath;
  }
}

/**
 * Main transcription entry point.
 * Normalizes audio, then handles file splitting if > 25MB.
 */
export async function transcribeAudio(userId: string, filePath: string): Promise<TranscriptionResult> {
  // Normalize audio to ensure OpenAI compatibility
  const normalizedPath = await normalizeAudio(filePath);
  const fileSize = fs.statSync(normalizedPath).size;
  const duration = await getAudioDuration(normalizedPath);
  let chunks: string[];

  // Split if file > 25MB OR duration > 15 minutes (token limit safety)
  const MAX_CHUNK_DURATION = 15 * 60; // 15 minutes in seconds
  if (fileSize > STT_MAX_FILE_SIZE || duration > MAX_CHUNK_DURATION) {
    const numChunksBySize = Math.ceil(fileSize / STT_MAX_FILE_SIZE);
    const numChunksByDuration = Math.ceil(duration / MAX_CHUNK_DURATION);
    const numChunks = Math.max(numChunksBySize, numChunksByDuration);

    if (numChunks > 1) {
      chunks = await splitByTime(normalizedPath, duration > 0 ? duration : 600, numChunks);
    } else {
      chunks = [normalizedPath];
    }
  } else {
    chunks = [normalizedPath];
  }

  const allSegments: TranscriptSegment[] = [];
  let fullText = '';
  let totalDuration = 0;
  let language = 'zh';
  let timeOffset = 0;

  try {
    for (const chunk of chunks) {
      const result = await transcribeSingle(userId, chunk) as unknown as TranscriptionResponseExt;

      if (result.language) {
        language = result.language;
      }

      const chunkDuration = result.duration ?? 0;

      // Extract segments
      const segments = result.segments;
      if (segments && Array.isArray(segments)) {
        for (const seg of segments) {
          allSegments.push({
            start: seg.start + timeOffset,
            end: seg.end + timeOffset,
            text: seg.text,
          });
        }
      }

      fullText += (fullText ? '\n' : '') + result.text;
      timeOffset += chunkDuration;
      totalDuration += chunkDuration;
    }
  } finally {
    cleanupChunks(chunks, normalizedPath);
    // Clean up normalized file if different from original
    if (normalizedPath !== filePath) {
      try { fs.unlinkSync(normalizedPath); } catch { /* ignore */ }
    }
  }

  const wordCount = fullText.replace(/\s+/g, '').length;

  // OpenAI gpt-4o-mini-transcribe doesn't return duration in its JSON
  // response (only whisper-1 + verbose_json does), so totalDuration from
  // the API will be 0. Fall back to ffprobe on the source file.
  const finalDuration = totalDuration > 0 ? Math.ceil(totalDuration) : duration;

  return {
    rawText: fullText,
    language,
    durationSeconds: finalDuration,
    wordCount,
    segments: allSegments,
  };
}
