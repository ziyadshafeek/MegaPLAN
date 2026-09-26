/**
 * Server-only NVIDIA NIM client.
 *
 * NEVER import this file from public/ frontend code.
 * NEVER return the model id, provider name, or raw upstream errors to the browser.
 *
 * Env:
 *   NVIDIA_API_KEY          required for hosted chat
 *   NVIDIA_AGENT_MODEL      optional; defaults to DeepSeek V4.1 Flash on NIM
 *
 * GitHub Actions secrets are the source of truth. Vercel does not inherit them.
 * Instant /api/ai and /api/agent-plan need NVIDIA_API_KEY on the Vercel project.
 *
 * Endpoint: https://integrate.api.nvidia.com/v1/chat/completions
 */
const ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-ai/deepseek-v4.1-flash';

export function resolvedModel() {
  return process.env.NVIDIA_AGENT_MODEL || DEFAULT_MODEL;
}

export function providerConfigured() {
  return Boolean(process.env.NVIDIA_API_KEY);
}

export function publicError(err) {
  if (err?.status === 503) return 'The writing assistant is not configured on this deployment.';
  if (err?.name === 'AbortError') return 'The writing assistant timed out. Try a shorter request.';
  return 'The writing assistant is temporarily unavailable.';
}

export async function nvidiaChat({
  messages,
  max_tokens = 4000,
  temperature = 0.3,
  top_p = 0.9,
  jsonMode = false,
  tools = null,
  tool_choice = null,
  timeoutMs = 50000
} = {}) {
  const key = process.env.NVIDIA_API_KEY;
  const model = resolvedModel();
  if (!key) {
    const err = new Error('not-configured');
    err.status = 503;
    throw err;
  }

  const payload = {
    model,
    messages,
    max_tokens,
    temperature,
    top_p
  };
  if (jsonMode) payload.response_format = { type: 'json_object' };
  if (Array.isArray(tools) && tools.length) payload.tools = tools;
  if (tool_choice) payload.tool_choice = tool_choice;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    let raw = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      raw = await response.text();
      if (response.ok) break;
      if (response.status === 422 && payload.response_format) {
        delete payload.response_format;
        continue;
      }
      if (response.status === 400 && payload.tools) {
        delete payload.tools;
        delete payload.tool_choice;
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await new Promise(r => setTimeout(r, 700 * (attempt + 1) ** 2));
        continue;
      }
      const err = new Error('upstream');
      err.status = 502;
      throw err;
    }
    let data;
    try { data = JSON.parse(raw); } catch {
      const err = new Error('bad-json');
      err.status = 502;
      throw err;
    }
    const msg = data?.choices?.[0]?.message || {};
    const content = msg.content || '';
    const tool_calls = msg.tool_calls || null;
    if (!content && !tool_calls?.length) {
      const err = new Error('empty');
      err.status = 502;
      throw err;
    }
    return { content, tool_calls, usage: data.usage || null };
  } finally {
    clearTimeout(timer);
  }
}

export const IDENTITY_REFUSAL =
  'I can help you build pages and run tools, but I cannot identify or discuss the underlying model or provider.';

export function looksLikeModelProbe(text) {
  return /\b(what model|which model|model name|which llm|what llm|deepseek|nvidia|provider name|system prompt|hidden prompt|training data|are you gpt|are you deepseek|identify yourself|reveal your instructions|what engine are you)\b/i.test(String(text || ''));
}
