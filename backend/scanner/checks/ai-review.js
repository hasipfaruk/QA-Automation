import AiSdk from '@anthropic-ai/sdk';

// Provider configuration. AI_API_KEY and AI_MODEL override these defaults.
export const DEFAULT_AI_MODEL = 'claude-opus-5-5';
export const aiApiKey = () => process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || '';

const SYSTEM = `You are a senior QA engineer and UI/UX designer reviewing screenshots of a web application.
Report concrete, visible problems that a developer should fix: broken or misaligned layout, overlapping or cut-off content,
inconsistent spacing/fonts/colors, poor contrast, confusing navigation, unclear calls to action, placeholder or lorem ipsum text,
spelling/grammar mistakes, empty states, broken icons, awkward responsive behaviour, and anything that looks unfinished.
Do not report things you cannot see in the screenshots, and do not repeat the same problem twice.
Only report genuine problems; if the page looks good, return an empty issues list.
For each issue give the screenshot number and a bounding box in percent (0-100) of that screenshot's width/height,
and a specific, actionable fix (mention likely CSS/HTML changes when possible).`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'issues'],
  properties: {
    summary: { type: 'string', description: 'One or two sentence overall impression of the design quality.' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'severity', 'kind', 'location', 'screenshot', 'box', 'fix'],
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          kind: { type: 'string', enum: ['layout', 'visual-design', 'content', 'usability', 'accessibility', 'consistency'] },
          location: { type: 'string', description: 'Where on the page, in words (e.g. "header, right of the logo").' },
          screenshot: { type: 'integer', description: '1-based index of the screenshot the issue appears in.' },
          box: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'y', 'w', 'h'],
            description: 'Bounding box in percent (0-100) of the screenshot width/height.',
            properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
          },
          fix: { type: 'string' },
        },
      },
    },
  },
};

let client;

/**
 * slices: [{ buffer (jpeg), offsetY, width, height }]
 * Returns { summary, issues[] } where issues have page-coordinate rects.
 */
export async function aiReview({ slices, url, viewportName, viewport, model, effort }) {
  client ??= new AiSdk({ apiKey: aiApiKey() || undefined });
  const content = [];
  slices.forEach((s, i) => {
    content.push({ type: 'text', text: `Screenshot ${i + 1} (page area y=${s.offsetY}-${s.offsetY + s.height}px):` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: s.buffer.toString('base64') } });
  });
  content.push({
    type: 'text',
    text: `Page: ${url}\nDevice: ${viewportName} (${viewport.width}x${viewport.height}${viewport.isMobile ? ', touch device' : ''}).\nReview these screenshots (top to bottom of the same page) and list the problems to fix.`,
  });

  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort, format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') {
    return { summary: `AI review declined (${response.stop_details?.category ?? 'unknown reason'}).`, issues: [] };
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { summary: 'AI review returned an unreadable response' + (response.stop_reason === 'max_tokens' ? ' (output limit reached).' : '.'), issues: [] };
  }

  const issues = (parsed.issues || []).map((it) => {
    const s = slices[Math.min(Math.max(1, it.screenshot), slices.length) - 1];
    const clamp = (v) => Math.min(100, Math.max(0, Number(v) || 0));
    const b = it.box || { x: 0, y: 0, w: 0, h: 0 };
    const rect = {
      x: Math.round((clamp(b.x) / 100) * s.width),
      y: Math.round(s.offsetY + (clamp(b.y) / 100) * s.height),
      w: Math.round((clamp(b.w) / 100) * s.width),
      h: Math.round((clamp(b.h) / 100) * s.height),
    };
    return {
      rule: `ai:${it.kind}`,
      category: 'ai',
      severity: it.severity,
      title: it.title,
      description: `Location: ${it.location}`,
      fix: it.fix,
      selector: null,
      element: null,
      rect: rect.w > 4 && rect.h > 4 ? rect : null,
      detail: { kind: it.kind, approximate: true },
    };
  });
  return { summary: parsed.summary || '', issues, usage: response.usage };
}

/** Errors that mean "AI review can't work at all" (stop trying for remaining pages). */
export function isFatalAiError(err) {
  return err instanceof AiSdk.AuthenticationError
    || err instanceof AiSdk.PermissionDeniedError
    || err instanceof AiSdk.NotFoundError
    || err instanceof AiSdk.BadRequestError
    // client-side setup errors (e.g. no API key configured) are SDK errors but not API errors
    || (err instanceof AiSdk.AnthropicError && !(err instanceof AiSdk.APIError));
}
