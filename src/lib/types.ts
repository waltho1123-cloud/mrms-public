export type TaskStatus = 'uploaded' | 'queued' | 'transcribing' | 'summarizing' | 'review' | 'pushing' | 'completed' | 'push_failed' | 'error';

export interface PromptTemplateBase {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
}

export interface PromptTemplateFull extends PromptTemplateBase {
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
