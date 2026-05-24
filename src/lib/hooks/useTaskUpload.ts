'use client';

import { useState, useCallback, useRef } from 'react';

interface UploadState {
  file: File | null;
  fileName: string;
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
  upload: (params: UploadParams) => Promise<string | null>;
  reset: () => void;
}

export function useTaskUpload(): UseTaskUploadReturn {
  const [state, setState] = useState<UploadState>({
    file: null,
    fileName: '',
    progress: 0,
    uploading: false,
    error: null,
    taskId: null,
  });
  const fileRef = useRef<File | null>(null);

  const setFile = useCallback((file: File) => {
    fileRef.current = file;
    setState((prev) => ({
      ...prev,
      file,
      fileName: file.name,
      error: null,
      taskId: null,
      progress: 0,
    }));
  }, []);

  const upload = useCallback(
    async (params: UploadParams): Promise<string | null> => {
      const currentFile = fileRef.current;
      if (!currentFile) {
        setState((prev) => ({ ...prev, error: '請先選擇音檔' }));
        return null;
      }

      setState((prev) => ({ ...prev, uploading: true, error: null, progress: 0 }));

      try {
        const formData = new FormData();
        formData.append('audioFile', currentFile);
        formData.append('meetingTopic', params.meetingTopic);
        formData.append('meetingDate', params.meetingDate);
        if (params.participants) {
          formData.append('participants', params.participants);
        }
        if (params.promptTemplateId) {
          formData.append('promptTemplateId', params.promptTemplateId);
        }

        // Simulate progress with XMLHttpRequest for upload tracking
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
    setState({
      file: null,
      fileName: '',
      progress: 0,
      uploading: false,
      error: null,
      taskId: null,
    });
  }, []);

  return {
    ...state,
    setFile,
    upload,
    reset,
  };
}

export default useTaskUpload;
