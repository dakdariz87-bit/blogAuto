const crypto = require('node:crypto');
function neckDeskSources(options = {}) {
  const text = [options.topic, options.keyword, options.researchGuidance].join(' ');
  if (!/(목|어깨|neck|shoulder)/i.test(text) || !/(자세|앉|뻐근|통증|불편|posture|desk|pain)/i.test(text)) return [];
  return [
    ['https://www.nhs.uk/conditions/neck-pain-and-stiff-neck/', 'NHS 목 통증·같은 자세 유지·자가 관리 주의사항'],
    ['https://www.osha.gov/etools/computer-workstations/positions', 'OSHA 목 어깨·앉은 자세와 화면 작업 환경 점검'],
    ['https://www.hse.gov.uk/msd/dse/workstation.htm', 'HSE 앉은 자세·목 어깨 작업 환경 점검'],
    ['https://www.hse.gov.uk/msd/dse/work-routine.htm', 'HSE 화면 작업 중 자세 변화와 휴식']
  ].map(([url, title]) => ({ url, title, provider: 'institution' }));
}
function canonicalUrl(value) {
  try {
    const u = new URL(value); u.hash = '';
    if (['blog.naver.com', 'm.blog.naver.com'].includes(u.hostname)) {
      const blog = u.searchParams.get('blogId'), post = u.searchParams.get('logNo');
      const parts = u.pathname.split('/').filter(Boolean);
      if (blog && post) return 'https://blog.naver.com/' + blog + '/' + post;
      if (parts.length === 2 && /^\d+$/.test(parts[1])) return 'https://blog.naver.com/' + parts.join('/');
    }
    u.search = ''; return u.toString().replace(/\/$/, '');
  } catch { return String(value || ''); }
}
function mergeEvidence(...groups) {
  const merged = [], keys = new Map(), bodies = new Map();
  for (const item of groups.flat()) {
    if (!item || !item.url) continue;
    const key = canonicalUrl(item.fetchedUrl || item.url);
    const body = String(item.excerpt || '').replace(/\s+/g, ' ').trim();
    const fingerprint = body.length >= 300 ? crypto.createHash('sha256').update(body).digest('hex') : '';
    const index = keys.get(key) ?? (fingerprint ? bodies.get(fingerprint) : undefined);
    if (index !== undefined) {
      if (body.length > String(merged[index].excerpt || '').length) merged[index] = { ...item };
      keys.set(key, index); if (fingerprint) bodies.set(fingerprint, index);
    } else {
      keys.set(key, merged.length); if (fingerprint) bodies.set(fingerprint, merged.length);
      merged.push({ ...item });
    }
  }
  return merged.slice(0, 20).map(item => ({ ...item, sourceId: 'source-' + crypto.createHash('sha256').update(canonicalUrl(item.fetchedUrl || item.url)).digest('hex').slice(0, 12) }));
}
module.exports = { neckDeskSources, mergeEvidence, canonicalUrl };
