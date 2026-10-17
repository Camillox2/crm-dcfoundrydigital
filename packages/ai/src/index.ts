export interface AiProviderConfig {
  primaryProvider: 'gemini' | 'ollama';
  modelName: string;
  maxDailyTokens: number;
}
