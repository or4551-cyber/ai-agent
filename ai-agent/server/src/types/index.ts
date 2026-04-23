export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallResult[];
}

export interface ToolCallResult {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  status: 'running' | 'success' | 'error';
  requiresApproval?: boolean;
  approved?: boolean;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface AgentConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  workspaceDir: string;
  systemPrompt: string;
}

export interface WSMessage {
  type: 'chat' | 'approval_response' | 'abort';
  payload: Record<string, unknown>;
}

export interface WSResponse {
  type: 'text_delta' | 'tool_call_start' | 'tool_call_end' | 'message_done' | 'error' | 'approval_request';
  payload: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type DangerLevel = 'safe' | 'moderate' | 'dangerous';
