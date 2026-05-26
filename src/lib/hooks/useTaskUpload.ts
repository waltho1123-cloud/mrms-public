'use client';

import { useState, useCallback, useRef } from 'react';
import { getStoredToken } from '@/lib/utils/admin-fetch';

interface UploadState {
  file: File | null;
  fileName: string;
  transcriptText: string;
  progress: number;
  uploading: boolean;
  error: string | null;
  taskId: string | null;
}

interface UploadParams {
  meetingTopic: string;
  meetingDate: string;
  participants?: string;
  promptTemplateId?: string;
}

interface UseTaskUploadReturn extends UploadState {
  setFile: (file: File) => void;
  setTranscriptText: (text: string) => void;
  upload: (params: UploadParams) => Promise<string | null>;
  reset: () => void;
}

export function useTaskUpload(): UseTaskUploadReturn {
  const [state, setState] = useState<UploadState>({
    file: null,
    fileName: '',
    transcriptText: '',
    progress: 0,
    uploading: false,
    error: null,
    taskId: null,
  });
  const fileRef = useRef<File | null>(null);
  const transcriptRef = useRef<string>('');

  const setFile = useCallback((file: File) => {
    fileRef.current = file;
    transcriptRef.current = '';
    setState((prev) => ({
      ...prev,
      file,
      fileName: file.name,
      transcriptText: '',
      error: null,
      taskId: null,
      progress: 0,
    }));
  }, []);

  const setTranscriptText = useCallback((text: string) => {
    transcriptRef.current = text;
    fileRef.current = null;
    setState((prev) => ({
      ...prev,
      transcriptText: text,
      file: null,
      fileName: '',
      error: null,
      // do not reset taskId/progress on every keystroke; just on submit
    }));
  }, []);

  const upload = useCallback(
    async (params: UploadParams): Promise<string | null> => {
      const currentFile = fileRef.current;
      const currentTranscript = transcriptRef.current.trim();

      if (!currentFile && !currentTranscript) {
        setState((prev) => ({ ...prev, error: '請選擇音檔或輸入逐字稿' }));
        return null;
      }

      setState((prev) => ({ ...prev, uploading: true, error: null, progress: 0 }));

      try {
        const formData = new FormData();
        if (currentFile) {
          formData.append('audioFile', currentFile);
        } else {
          formData.append('transcriptText', currentTranscript);
        }
        formData.append('meetingTopic', params.meetingTopic);
        formData.append('meetingDate', params.meetingDate);
        if (params.participants) {
          formData.append('participants', params.participants);
        }
        if (params.promptTemplateId) {
          formData.append('promptTemplateId', params.promptTemplateId);
        }

        // XHR upload — progress bar is meaningful for audio files; for
        // transcript-only submissions the request body is small so the
        // bar just jumps to 100%, which is fine.
        const taskId = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
              const pct = Math.round((event.loaded / event.total) * 100);
              setState((prev) => ({ ...prev, progress: pct }));
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const resp = JSON.parse(xhr.responseText);
                resolve(resp.data?.taskId || resp.data?.id || resp.taskId || resp.id);
              } catch {
                reject(new Error('無法解析伺服器回應'));
              }
            } else {
              try {
                const resp = JSON.parse(xhr.responseText);
                reject(new Error(resp.error?.message || `上傳失敗 (${xhr.status})`));
              } catch {
                reject(new Error(`上傳失敗 (${xhr.status})`));
              }
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('網路錯誤，請檢查連線'));
          });

          xhr.addEventListener('abort', () => {
            reject(new Error('上傳已取消'));
          });

          xhr.open('POST', '/api/v1/tasks');
          const token = getStoredToken();
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.send(formData);
        });

        setState((prev) => ({
          ...prev,
          uploading: false,
          progress: 100,
          taskId,
        }));

        return taskId;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '上傳失敗';
        setState((prev) => ({
          ...prev,
          uploading: false,
          error: errorMsg,
          progress: 0,
        }));
        return null;
      }
    },
    []
  );

  const reset = useCallback(() => {
    fileRef.current = null;
    transcriptRef.current = '';
    setState({
      file: null,
      fileName: '',
      transcriptText: '',
      progress: 0,
      uploading: false,
      error: null,
      taskId: null,
    });
  }, []);

  return {
    ...state,
    setFile,
    setTranscriptText,
    upload,
    reset,
  };
}

export default useTaskUpload;
