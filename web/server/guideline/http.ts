import { ReviewError } from '../../shared/review.ts';
import { extractGuideline, type GuidelineExtraction } from './model-call.ts';
import { externalExtract } from './external.ts';
import type { Json, Req, Res } from '../types.ts';

// A guideline is prose, so it is far larger than the project fields readJson() accepts.
const MAX_BYTES = 512 * 1024;

// POST /api/guideline/analyze { text } → rule drafts from the model, for a person to review.
// Nothing is stored and no project is touched.
export async function handleGuideline(
  req: Req,
  res: Res,
  pathname: string,
  {
    json,
    extract,
  }: { json: Json; extract?: (text: string, apiKey?: string) => Promise<GuidelineExtraction> },
) {
  if (pathname !== '/api/guideline/analyze') return false;
  if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new ReviewError(415, 'Expected application/json.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= MAX_BYTES) chunks.push(chunk);
  }
  if (size > MAX_BYTES) throw new ReviewError(413, 'Guideline tối đa 512 KB văn bản để phân tích.');
  let text: unknown, key: unknown;
  try {
    ({ text, api_key: key } = JSON.parse(Buffer.concat(chunks).toString('utf8')) ?? {});
  } catch {
    throw new ReviewError(400, 'Invalid JSON.');
  }
  if (typeof text !== 'string' || !text.trim()) throw new ReviewError(400, 'Guideline rỗng.');
  // The person's own Gemini key, for this one call: it goes only into the request header to
  // Gemini and is never stored or logged. Without one the backend's GEMINI_API_KEY is used.
  if (key !== undefined && (typeof key !== 'string' || key.length > 200 || /\s/.test(key.trim())))
    throw new ReviewError(400, 'Gemini API key không hợp lệ.');
  const apiKey = (key as string | undefined)?.trim() || undefined;
  if (!apiKey && !process.env.GEMINI_API_KEY && !extract)
    throw new ReviewError(400, 'Hãy nhập Gemini API key để phân tích guideline.');
  const dir = process.env.GUIDELINE_RULES_DIR;
  const run =
    extract ??
    (dir
      ? externalExtract(dir)
      : (guideline: string, apiKey?: string) =>
          extractGuideline(guideline, apiKey ? { apiKey } : {}));
  try {
    json(res, 200, await run(text, apiKey));
  } catch (e) {
    // The module's messages name the cause (quota, schema, timeout) and carry no secrets.
    throw new ReviewError(
      502,
      `Không phân tích được guideline: ${(e as Error).message}`.slice(0, 500),
    );
  }
  return true;
}
