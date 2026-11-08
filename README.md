# 자동화 블로그

## 기존 크롬 로그인으로 실행 — 권장 테스트 방식

[크롬 확장 프로그램 설치 안내](chrome-extension/README.md)를 따라 chrome://extensions 에서 chrome-extension 폴더를 로드합니다. 평소 크롬에서 로그인한 dakdariz 새 글을 연 뒤 확장 프로그램에서 초안을 검토하고 입력합니다. Node.js나 별도 브라우저가 필요 없습니다. 사진 첨부와 최종 발행은 직접 진행합니다. 실제 네이버 동작은 PC에서 검증해야 합니다.

상위 요소에서 편집 권한을 받는 입력 칸, 안내 문구, 여러 줄 입력, 중복 입력 및 이미지가 있는 글에서의 차단을 로컬 Chromium으로 검증했습니다.

테스트 블로그: [dakdariz](https://blog.naver.com/dakdariz)

## Windows PC에서 테스트

[Windows 실행 안내](WINDOWS-GUIDE.md)를 따라 Node.js LTS 설치 → Code / Download ZIP → 압축 해제 → start-windows.bat 실행 순서로 진행합니다.

별도 브라우저에서 사용자가 네이버에 로그인한 후 빈 편집기에 제목·본문을 입력합니다. 사진 첨부와 최종 발행은 사용자가 직접 진행합니다. 실제 네이버 편집기와 Windows에서의 동작은 아직 검증되지 않았습니다. 로컬 브라우저 모의 편집기에서는 본문 변환, 빈 글 입력, 기존 내용 덮어쓰기 방지, 영역 불명확 시 중단을 확인했습니다(npm test).

- [첫 글 초안](posts/001-posture.md)
- [관리 화면 소스](index.html) — 웹 호스팅 미설정
- [발행 상태](posts/001-status.json)

첫 글 게시 요청은 받았으나 실제 게시 완료는 확인되지 않았습니다. 설명 이미지는 이전 대화에 있으며 PC에 다운로드한 후 첨부해야 합니다. .local/last-result.json은 로컬 사용자 입력 기록이며 GitHub 상태를 자동 변경하지 않습니다.

AI 글 생성, 최근 이슈 수집, 사진 자동 첨부, 최종 자동 발행은 아직 구현하지 않았습니다. 일반 운영은 확인 후 발행합니다.

비밀번호, 인증번호, 로그인 쿠키, API 키는 저장소에 저장하지 않습니다. .local과 node_modules는 Git에서 제외했습니다.
