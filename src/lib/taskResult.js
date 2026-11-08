const fs = require('node:fs');
const path = require('node:path');

function parseResult(text) {
  let raw = String(text || '').replace(/^\uFEFF/, '').trim();
  const fence = raw.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i);
  if (fence) raw = fence[1];
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('결과가 JSON 객체가 아닙니다.');
  return value;
}
function validResult(value, fileName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const status = String(value.status || '').toLowerCase();
  if (!['success', 'partial', 'failed', 'pass', 'revision', 'block', 'duplicate_retry'].includes(status)) return false;
  if (['failed', 'block', 'revision', 'duplicate_retry'].includes(status)) return true;
  if (fileName === 'agent-result.json') return typeof value.article === 'string' && value.article.trim().length > 0 && typeof value.title === 'string' && value.title.trim().length > 0;
  if (fileName === 'research-title-result.json') return typeof value.finalTitle === 'string' && value.finalTitle.trim().length > 0;
  return true;
}
function collectResult({ jobDir, fileName, responseFile, assistantMessages = [] }) {
  const destination = path.join(jobDir, fileName);
  const candidates = [];
  // Prefer the CLI's final response over an intermediate file an agent might have left.
  if (fs.existsSync(responseFile)) candidates.push(fs.readFileSync(responseFile, 'utf8'));
  candidates.push(...assistantMessages.slice().reverse());
  if (fs.existsSync(destination)) candidates.push(fs.readFileSync(destination, 'utf8'));
  for (const raw of candidates) {
    let result;
    try { result = parseResult(raw); } catch { continue; }
    if (!validResult(result, fileName)) continue;
    const temporary = destination + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(result, null, 2), 'utf8');
    fs.renameSync(temporary, destination);
    return result;
  }
  const error = new Error('AI 응답은 끝났지만 유효한 결과를 받지 못했습니다 (' + fileName + '). 최종 응답은 작업 폴더에 보관했습니다. 자동으로 재호출하지 않았습니다.');
  error.code = 'CODEX_RESULT_INVALID';
  throw error;
}
function resultTransportPrompt(prompt) {
  return prompt + '\n\nAPPLICATION RESULT DELIVERY (takes precedence over earlier save/print instructions):\n'
    + '- Your final assistant message MUST be the complete JSON object in the Required output shape above. No markdown or explanation.\n'
    + '- The application saves that final JSON to Output JSON path. Do not use shell tools merely to save the result JSON.\n'
    + '- Do not finish with BLOGAUTO_RESULT_READY or a description of work you plan to do. Return the actual result object.\n'
    + '- Files needed by the article, including generated images, still must exist at the paths you return. Do not fabricate paths or sources.\n';
}
module.exports = { collectResult, validResult, parseResult, resultTransportPrompt };
