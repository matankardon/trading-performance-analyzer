export function buildOpenAiRequestBody(
  model: string,
  maxTokens: number,
  temperature: number,
  messages: Array<{ role: string; content: string }>,
  stream: boolean,
) {
  return {
    model,
    max_tokens: maxTokens,
    temperature,
    ...(stream ? { stream: true } : {}),
    messages,
  };
}
