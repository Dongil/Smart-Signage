# Signage App - Claude Code 컨텍스트

## 프로젝트 개요
디지털 사이니지 앱. Electron + Next.js 기반.
- 1번 모니터: 편집 UI (BrowserWindow A)
- 2+3+4번 모니터: NVIDIA Surround로 묶인 단일 디스플레이 → 사이니지 출력 (BrowserWindow B)

## 기술 스택
- Electron (멀티 윈도우, IPC, 풀스크린 제어)
- Next.js 14 + React (UI)
- Zustand (상태 관리)
- TypeScript

## 주요 규칙
- TypeScript 사용, any 타입 금지
- 컴포넌트는 /components 폴더에 분리
- IPC 채널명은 kebab-case (예: show-on-signage)
- 슬라이드 데이터는 JSON으로 /data 폴더에 저장

## 실행 명령어
- 개발: `npm run dev`
- 빌드: `npm run build`
- Electron 실행: `npm run electron`
