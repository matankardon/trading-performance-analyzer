export function buildOpenAiRequestBody(
  model: string,
  maxTokens: number,
  temperature: number,
  messages: Array<{ role: string; content: unknown }>,
  stream: boolean,
  responseFormat?: { type: "json_object" },
) {
  return {
    model,
    max_tokens: maxTokens,
    temperature,
    ...(stream ? { stream: true } : {}),
    ...(responseFormat ? { response_format: responseFormat } : {}),
    messages,
  };
}
