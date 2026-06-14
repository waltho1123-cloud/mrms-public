/**
 * Maps raw processor/API error messages (often English / technical, e.g.
 * "429 You exceeded your current quota") into user-friendly Traditional
 * Chinese messages with an actionable hint.
 *
 * The raw message is still stored in `meetingTask.errorMsg` and visible in
 * admin logs, so technical detail is never lost — this only governs how the
 * error is *presented* to the end user.
 */

export interface FriendlyError {
  /** Short, human-readable summary of what went wrong. */
  title: string;
  /** Optional suggested next action for the user. */
  hint?: string;
}

export function humanizeError(raw?: string | null): FriendlyError {
  if (!raw) return { title: '處理過程中發生錯誤' };

  const msg = raw.toLowerCase();

  // OpenAI API key 尚未設定
  if (raw.includes('未設定') || msg.includes('api_key_missing')) {
    return {
      title: '尚未設定 OpenAI API key',
      hint: '請先至「我的設定」填入您的 OpenAI API key 後再試一次。',
    };
  }

  // OpenAI 額度用盡 / 帳單問題
  if (
    msg.includes('quota') ||
    msg.includes('insufficient_quota') ||
    msg.includes('429') ||
    msg.includes('billing')
  ) {
    return {
      title: 'OpenAI API 額度已用盡',
      hint: '請至 OpenAI 帳戶確認用量與付款設定，或於「我的設定」更換 API key 後重試。',
    };
  }

  // API key 無效 / 認證失敗
  if (
    msg.includes('invalid_api_key') ||
    msg.includes('incorrect api key') ||
    msg.includes('invalid api key') ||
    msg.includes('401') ||
    msg.includes('authentication')
  ) {
    return {
      title: 'OpenAI API key 無效',
      hint: '請至「我的設定」確認並重新填入正確的 API key。',
    };
  }

  // 請求過於頻繁
  if (msg.includes('rate limit') || msg.includes('rate_limit')) {
    return {
      title: 'AI 服務請求過於頻繁',
      hint: '請稍候片刻再重新嘗試。',
    };
  }

  // 音訊處理工具異常（ffmpeg/ffprobe）
  if (msg.includes('ffmpeg') || msg.includes('ffprobe') || msg.includes('enoent')) {
    return {
      title: '音訊處理元件異常',
      hint: '系統音訊工具可能尚未就緒，請稍後重試；若持續發生請聯絡管理員。',
    };
  }

  // 連線逾時 / 網路問題
  if (
    msg.includes('timeout') ||
    msg.includes('etimedout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('network') ||
    msg.includes('fetch failed')
  ) {
    return {
      title: '連線逾時或網路異常',
      hint: '請稍後再重新嘗試。',
    };
  }

  // 找不到逐字稿
  if (msg.includes('no transcript')) {
    return {
      title: '找不到逐字稿內容',
      hint: '請重新上傳音檔或貼入逐字稿。',
    };
  }

  // 找不到摘要
  if (msg.includes('no minutes')) {
    return {
      title: '找不到會議摘要',
      hint: '請重新產生摘要後再試。',
    };
  }

  // 模型設定錯誤
  if (
    msg.includes('model') &&
    (msg.includes('does not exist') || msg.includes('not found') || msg.includes('not exist'))
  ) {
    return {
      title: 'AI 模型設定有誤',
      hint: '請聯絡管理員確認模型設定。',
    };
  }

  // 音檔格式無法處理
  if (
    msg.includes('decode') ||
    msg.includes('could not be decoded') ||
    msg.includes('unsupported') ||
    msg.includes('invalid file format')
  ) {
    return {
      title: '音檔格式無法處理',
      hint: '請改用 mp3、m4a 或 wav 等常見格式重新上傳。',
    };
  }

  // LINE 推送失敗
  if (msg.includes('push') && msg.includes('fail')) {
    return {
      title: '推送至 LINE 失敗',
      hint: '請確認 LINE Webhook 設定後重試。',
    };
  }

  // 其他：直接顯示原始訊息（仍比通用的「處理過程中發生錯誤」明確）
  return { title: '處理失敗', hint: raw };
}
