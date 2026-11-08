# 네이버 블로그 자동화 관리

## 새 권장 실행 방식

공유받은 boksajang 소스의 후속판을 바탕으로 **검토 후 승인** 방식의 데스크톱 앱을 추가했습니다.

1. 전체 ZIP을 다운로드하고 압축을 풉니다.
2. `desktop/start-windows.cmd`를 실행합니다. Node.js 24 이상과 Chrome이 필요합니다.
3. Codex CLI가 없다면 `desktop/setup-codex.cmd`로 설치·로그인합니다.
4. 앱에서 실제 카테고리와 `dakdariz` 계정을 확인하고 동반 확장을 연결합니다.
5. 초안과 그림 생성 → 전체 검토 → 승인 후 네이버 임시저장/발행 순서입니다.

[자세한 실행 안내](desktop/README.md) · [원본 분석과 변경 사항](desktop/ANALYSIS.md)

최초 테스트는 임시저장으로 진행하세요. Windows와 실제 네이버 발행은 아직 검증되지 않았습니다. 실행용 소스이며 빌드된 EXE는 아닙니다.

## 이전 단독 확장

기존 [chrome-extension](chrome-extension/README.md)과 [첫 글 초안](posts/001-posture.md)은 보존했습니다. 새 데스크톱 앱의 동반 확장은 `desktop/extension`이며 서로 다른 프로그램입니다. 새 앱을 사용할 때 이전 단독 확장은 꺼두세요.

개인 원고, 로그인 정보, 로컬 연결 토큰, API 키는 GitHub에 올리지 않습니다. 후속판 소스의 MIT 라이선스와 제3자 고지는 desktop 폴더에 보존했습니다.
