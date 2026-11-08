class JobProgress {
  constructor() { this.percent = 0; this.stage = '작업 대기'; this.terminal = false; }
  task({ agent, fileName, state }) {
    if (this.terminal) return this.snapshot();
    let label, start, end;
    if (agent === 'imageStyle') [label, start, end] = ['이미지 스타일 준비', 5, 10];
    else if (agent === 'research') [label, start, end] = ['자료 조사·제목 선정', 10, 30];
    else if (fileName === 'writer-contract-result.json') [label, start, end] = ['글 구성 준비', 30, 35];
    else if (agent === 'writer') [label, start, end] = ['본문 작성', 35, 65];
    else if (agent === 'image') [label, start, end] = ['이미지 생성·확인', 80, 90];
    else [label, start, end] = ['본문 검토', 65, 80];
    this.percent = Math.max(this.percent, state === 'completed' ? end : start);
    this.stage = label + (state === 'completed' ? ' 완료' : ' 중');
    return this.snapshot();
  }
  status(status, detail) {
    if (['success', 'generated'].includes(status)) { this.percent = 100; this.terminal = true; this.stage = status === 'generated' ? '초안 완성' : '발행 완료'; }
    else if (['failed', 'codex_exec_failed', 'codex_usage_limit', 'session_expired', 'duplicate_retry'].includes(status)) { this.terminal = true; this.stage = '중단 · ' + (detail || '진행 상황을 확인하세요'); }
    else if (!this.terminal && status === 'publishing') { this.percent = Math.max(this.percent, 92); this.stage = detail || '발행 중'; }
    else if (!this.terminal && this.percent === 0 && status === 'generating') { this.percent = 3; this.stage = '작업 준비 중'; }
    return this.snapshot();
  }
  snapshot() { return { percent: this.percent, stage: this.stage, terminal: this.terminal }; }
}
module.exports = { JobProgress };
