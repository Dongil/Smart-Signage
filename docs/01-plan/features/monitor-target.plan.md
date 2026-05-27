# monitor-target — Plan (v1.7.0)

| Field | Value |
|-------|-------|
| Feature ID | monitor-target |
| Target Version | v1.7.0 |
| Created | 2026-05-27 |
| Owner | kdi@xenoglobal.co.kr |
| Phase | Plan |
| Predecessor | v1.6.0 ui-polish |

## Executive Summary

| Perspective | Summary |
|-------------|---------|
| Problem | 운영 중 NVIDIA Surround가 종종 해제되면 OS가 3개의 1920×1080 모니터를 따로 보고, 현재 `getSecondaryDisplay()`는 "primary가 아닌 첫 디스플레이"를 자동 선택한다. 그 결과 개별모드(5760 캔버스 × 3타일 가정)가 1920 폭에 압축되어 표시된다. |
| Solution | 운영 옵션에 "출력 모니터" select를 추가하고, 감지된 확장 모니터를 콤보로 노출. 사용자가 모니터를 지정하면 main process가 `signageWin`을 그 모니터로 배치한다. 개별모드 + 모니터 지정 시 타일링을 끄고(`tileCount=1`) 네이티브 1920×1080으로 출력. |
| Function UX Effect | Surround 해제 환경에서도 사용자가 의도한 1개의 1920×1080 모니터에 슬라이드가 깨끗하게 표시됨. Surround 활성 환경(가상 5760×1080 모니터)에서는 기존 자동 선택과 동일 동작 유지(회귀 0). |
| Core Value | "Surround 가용성에 의존하지 않는 출력 보장" — OS/드라이버 상태와 무관하게 현장 운영자가 어느 모니터에 출력할지를 직접 통제. |

## Context Anchor

| Key | Value |
|-----|-------|
| WHY | 실제 운영 환경에서 NVIDIA Surround가 OS/드라이버 이유로 해제되는 사고가 반복됨. 현재 코드는 Surround가 무조건 살아있다고 가정해서 secondary=5760×1080을 자동으로 잡지만, 해제 후에는 1920×1080 한 장에 3타일이 압축되는 사용 불능 상태로 빠진다. v1.7은 이 단일 가정에서 벗어나 "운영자가 출력 모니터를 명시 지정" 하는 통제권을 추가한다. |
| WHO | 단일 호스트 운영자 (kdi). 한 호스트에 4개 디스플레이가 물려 있으며(편집기 1 + 사이니지 후보 3), Surround on/off 상태가 임의로 바뀔 수 있다. 모니터 선택은 운영 옵션 패널에서 즉시 변경 가능해야 한다. |
| RISK | • 디스플레이 핫플러그/리부트 시 `display.id`가 안정적이지 않을 수 있음(Electron `screen.getAllDisplays()` ID는 OS/드라이버 의존). • Surround on↔off 전환 시 모니터 목록이 통째로 바뀌어 저장된 ID가 매칭 안 됨 → 명확한 폴백 필요. • 개별모드 + 모니터 지정 시 타일링이 꺼지면서 컨텐츠 가독성 변화(슬라이드는 1920 폭으로 단독 표시). |
| SUCCESS | (1) Surround 해제 환경에서 사용자가 지정한 모니터에 1920×1080 네이티브로 슬라이드 표시(압축 없음). (2) Surround 활성 환경에서 기존 동작 회귀 0건. (3) 저장된 ID가 없으면(또는 매칭 실패) 첫 확장 모니터로 자동 폴백 + 로그 남김. (4) 콤보의 모니터 목록은 부팅·디스플레이 변경 이벤트 시 갱신. (5) 선택값은 settings 테이블에 영속화되어 재시작 후에도 유지. |
| SCOPE | In: `signage.targetDisplayId` 옵션 추가, OperationOptionsPanel 동적 콤보, main process placement 분기, `useDisplayMetrics`의 mode+target 분기, settings 영속화, 디스플레이 변경 이벤트 리스너. Out: 다중 모니터 동시 출력(여러 signage 창), 모니터별 슬라이드 다르게 출력, NVIDIA Surround 자동 토글, OS 디스플레이 회전/스케일 제어. |

## 1. Overview

v1.7.0 사이클은 **운영 안정성 패치** 다. 신규 도메인 모델/엔티티는 없고, 기존 옵션 레지스트리·signage 윈도우 배치 로직 위에 모니터 지정 레이어를 얹는다.

핵심 변경 3가지:

1. **새 옵션 `signage.targetDisplayId`** — `number | null`. null = 기존 자동 선택(첫 확장 모니터). 값 있음 = 그 ID의 디스플레이로 배치.
2. **동적 select 옵션** — OPTION_REGISTRY의 정적 옵션과 달리, 모니터 목록은 런타임에 `screen.getAllDisplays()`에서 채워야 함. OperationOptionsPanel에서 `get-displays` IPC를 호출해 목록을 받고, `(자동)` + 각 확장 모니터를 항목으로 표시. 디스플레이 변경 이벤트(`display-added/removed/metrics-changed`)에 반응해 목록 재조회.
3. **Placement + Mode 분기** — main process의 `placeSignageOnSecondary()` (이름 그대로 두되 내부 로직 확장)가 `signage.mode`와 `signage.targetDisplayId`를 모두 보고 결정:
   - mode === 'surround' OR targetId === null → 기존 동작(첫 확장 모니터 자동 선택)
   - mode === 'individual' AND targetId === <valid id> → 해당 모니터로 배치
   - mode === 'individual' AND targetId === <stale id> → 첫 확장 모니터로 폴백 + log warn

renderer 측 `useDisplayMetrics`는 mode='individual' + 유효한 targetId가 잡혀 있으면 `tileCount=1`로 내려보내 SignageRenderer의 3타일 렌더링을 끈다. Surround 모드는 그대로 5760×h 단일 캔버스.

Surround 모드에서는 콤보가 비활성/숨김(요구사항대로 "개별모드에서만 적용"). UI는 Individual 선택 시에만 콤보가 펼쳐지도록.

## 2. Functional Requirements

| FR | Title | Description |
|----|-------|-------------|
| FR-01 | settings에 targetDisplayId 키 추가 | `signage.targetDisplayId` (nullable integer). 기본값 null. SQLite settings 테이블에 JSON으로 저장. |
| FR-02 | OPTION_REGISTRY 확장 | 새 옵션 스키마 entry 추가. type='select', dynamic 표시(옵션 목록은 런타임 주입). |
| FR-03 | get-displays IPC 확장 | 현재 반환값에 isPrimary 외에 width/height/label/id를 명확히 포함. (현재 코드 이미 반환 중이므로 변경 최소.) |
| FR-04 | 디스플레이 변경 이벤트 푸시 | main process가 `screen.on('display-added/removed/metrics-changed')`를 구독해 editor에 IPC 이벤트 전송. UI는 이벤트 수신 시 콤보 목록 갱신. |
| FR-05 | OperationOptionsPanel 동적 콤보 | mode='individual'일 때만 "출력 모니터" select 렌더. `(자동 — 첫 확장 모니터)` 항목 + 감지된 확장 모니터 항목(label + 해상도) 나열. |
| FR-06 | Placement 분기 | `placeSignageOnSecondary()`가 mode + targetDisplayId를 읽어 분기. stale ID는 폴백 + 경고 로그. |
| FR-07 | useDisplayMetrics 분기 | mode='individual' + 유효 targetId 잡힘 → tileCount=1, w=res.h<=1080?1920:res.w 등 1물리 모니터 기준. Surround 모드는 변경 없음. |
| FR-08 | 옵션 변경 시 placement 재적용 | targetDisplayId가 변경되면(또는 mode 변경) main이 즉시 `placeSignageOnSecondary()`를 재실행해 창을 옮긴다. signage가 hide 상태면 다음 show 시 반영. |
| FR-09 | 폴백 로깅 | targetDisplayId가 설정돼 있으나 매칭 실패 → `log.warn('targetDisplayId stale, falling back to first secondary')` + 폴백 실행. UI는 변화 없이 동작. |
| FR-10 | Surround 모드 회귀 0 | mode='surround'일 때는 기존 코드 경로(getSecondaryDisplay → placeSignageOnSecondary) 그대로 사용. 콤보 비표시. |

## 3. Acceptance Criteria

| AC | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AC-01 | 첫 부팅 (옵션 미설정) | targetDisplayId=null | 개별모드로 사이니지 표시 | 기존처럼 첫 확장 모니터에 표시. 회귀 없음. |
| AC-02 | Surround 활성, 개별모드 | targetDisplayId=null, OS=Surround on | 사이니지 표시 | 5760×1080 가상 모니터에 ×3 타일링 (v1.6 동작 유지). |
| AC-03 | Surround 해제, 개별모드, 모니터 지정 | targetDisplayId=<2번 모니터 ID>, OS=Surround off | 사이니지 표시 | 2번 1920×1080 모니터에 1슬라이드 단독 표시(타일링 없음). |
| AC-04 | 콤보에서 모니터 변경 | 사이니지 표시 중, 콤보 → 3번 모니터 | 옵션 저장 | 즉시 3번 모니터로 사이니지 창 이동. |
| AC-05 | 저장된 ID가 더 이상 없음 | targetDisplayId=<old id> | 앱 재시작, 그 모니터가 해제됨 | 첫 확장 모니터로 폴백 + main.log에 stale 경고 1줄. |
| AC-06 | 디스플레이 핫플러그 추가 | 사이니지 표시 중 | OS가 새 모니터 인식 | 콤보 목록에 추가 항목 자동 노출. 현재 선택은 유지. |
| AC-07 | 디스플레이 핫플러그 제거 | 현재 출력 중인 모니터가 해제 | OS에서 모니터 빠짐 | 첫 확장 모니터로 폴백 + 로그. UI는 다음 변경까지 같은 ID 유지(자동 재설정 안 함). |
| AC-08 | Surround 모드 전환 | 개별모드 + 모니터 지정 상태에서 서라운드로 변경 | 옵션 변경 | 콤보 비표시, 자동 선택 로직 복귀. targetDisplayId 값은 settings에 남음(다음 개별 전환 시 재사용). |
| AC-09 | 옵션 영속화 | 콤보에서 모니터 선택 | 앱 재시작 | 선택 값이 복구됨(매칭 가능하면). |
| AC-10 | TypeScript 무결성 | 전체 코드 | `tsc --noEmit` | any 0건, 에러 0건. |

## 4. Success Criteria

| SC | Criterion | Verify How |
|----|-----------|------------|
| SC-1 | AC-1~AC-10 전부 통과 | Manual + tsc + dev log |
| SC-2 | Surround 해제 + 모니터 지정 시 1슬라이드가 압축 없이 1920×1080 native로 표시 | 화면 확인 + signage 윈도우 bounds 로그 |
| SC-3 | Surround on/off 전환 후에도 placement가 정확히 추적 | display-added/removed 이벤트 발생 시 main.log에 추적 |
| SC-4 | 옵션 변경 → 사이니지 창 이동까지 < 500ms | timestamp diff (옵션 저장 IPC ↔ placement log) |
| SC-5 | any 0건, build 클린 | tsc --noEmit + electron-builder dry run |

## 5. Out of Scope

| Item | Reason |
|------|--------|
| 다중 모니터 동시 출력 (signageWin 여러 개) | 영향 범위가 큼. v1.7은 단일 출력 보장만. |
| 모니터별로 다른 슬라이드 라우팅 | playback/state machine 변경 필요. 별도 사이클. |
| NVIDIA Surround 자동 활성화/감지 알림 | OS/드라이버 의존성 큼. 사용자 통제권 부여로 충분. |
| OS 디스플레이 회전·DPI 스케일 제어 | Electron `screen` API 범위 밖. |
| 모니터 선택 hotkey | UX 미요청. |

## 6. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `display.id`가 재부팅 후 바뀜 | Medium | Medium | 폴백 로직(AC-05) + label+bounds까지 보조 매칭은 v1.7에서는 하지 않음(YAGNI). 운영자가 다시 콤보에서 선택. |
| Surround on↔off 빈번 전환 | High | Low | display 이벤트 구독 → 자동 재배치. Surround on이면 targetId 무시(기존 경로). |
| 개별모드 + tileCount=1 전환 시 SignageRenderer의 layout 깨짐 | Low | Medium | useDisplayMetrics 단일 변경점. SignageRenderer의 `tileCount<=1` 분기 이미 존재(line 162). |
| 옵션 변경이 signage 창에 즉시 반영 안 됨 | Low | Low | OperationOptionsPanel 저장 시 IPC로 main에 `placement-refresh` 신호. |
| 잘못된 ID 입력으로 창이 사라짐 | Very Low | High | UI는 select(자유 입력 없음). main 폴백 보장. |

## 7. Checkpoint 2 Decisions Summary

| Q | Decision | Implication |
|---|----------|-------------|
| 출력 형태 | 선택 모니터 1개에 1슬라이드 (타일링 OFF) | useDisplayMetrics에서 mode+target 분기. tileCount=1. |
| Surround 모드 처리 | 개별모드에서만 적용 | OperationOptionsPanel 콤보는 individual에서만 노출. |
| 폴백 전략 | 첫 확장 모니터로 자동 폴백 | log.warn + 무중단 동작. UI는 변화 없음. |
| 저장 범위 | settings 테이블 영속 | DB key: `signage.targetDisplayId`. |

## 8. Implementation Sketch (High Level)

### 8.1 Files Touched (예상)

| File | Type | Change |
|------|------|--------|
| `lib/options/registry.ts` | M | `signage.targetDisplayId` 스키마 추가(dynamic 플래그) |
| `lib/options/types.ts` | M | dynamic 옵션 타입 보강 (필요 시) |
| `electron/main.ts` | M | placeSignageOnSecondary 분기 + display 이벤트 구독 + placement-refresh IPC |
| `electron/preload.ts` | M | 새 이벤트 채널 화이트리스트 추가 |
| `hooks/useDisplayMetrics.ts` | M | mode+target 분기로 tileCount 계산 |
| `components/OperationOptionsPanel.tsx` | M | 개별모드일 때만 동적 모니터 콤보 렌더 |
| `hooks/useDisplays.ts` (신규) | C | 디스플레이 목록 + 이벤트 구독 hook |
| `electron/db/schema.sql` | M (선택) | settings에 default row 추가(불필요할 수도) |
| `types/slide.ts` 또는 신규 | M | TargetDisplayId 타입 |

예상 신규 1, 수정 7. ~250 LOC.

### 8.2 Data Flow

```
[OperationOptionsPanel] -- useDisplays() --> screen API (via get-displays IPC)
                       \-- setOption('signage.targetDisplayId', id) ----> [settings DB]
                                                                            ↓ SSE/IPC
[useOption hook] <----------------------------------------------------------/
       ↓
[useDisplayMetrics] -- mode+target --> tileCount / w / h
       ↓
[SignageRenderer] -- renders 1 or 3 tiles

[main process]
  on settings change (signage.mode or signage.targetDisplayId)
    → placeSignageOnSecondary()
  on screen events (display-added/removed/metrics-changed)
    → emit 'displays-changed' IPC
    → re-evaluate placement if signage visible
```

### 8.3 Edge Cases (요약)

- **모든 모니터가 primary밖에 없음** → 콤보 빈 목록(자동 항목만), placement 실패 시 기존 'no-secondary-display' 응답 그대로.
- **Editor와 같은 모니터를 target으로 지정** → 허용(요구사항상 막을 이유 없음). 운영자 책임.
- **target 모니터가 4K 등 1920×1080 아닌 해상도** → 그 모니터 bounds 그대로 fullscreen. 슬라이드는 useDisplayMetrics가 결정하는 logical canvas 위에 contain-fit 형태로 렌더(기존 Preview/SignageRenderer 동작).

## 9. Migration / Compatibility

- 새 옵션 키만 추가. 기존 DB 마이그레이션 불필요(settings 테이블은 key/value 패턴).
- 처음 부팅 시 `signage.targetDisplayId`는 settings에 없음 → useOption이 default(null) 반환 → 기존 동작 그대로.
- 다운그레이드(v1.7→v1.6): 잉여 settings row가 남지만 영향 없음.

## 10. Open Questions for Design Phase

| Q | Note |
|---|------|
| `OPTION_REGISTRY`에 dynamic 옵션을 어떻게 표현할 것인가 | (a) `optionsProvider: 'displays'` 같은 enum, (b) 별도 special-case 컴포넌트 — Design에서 결정. |
| 콤보 항목 label 형식 | "SAMSUNG (1920×1080)" 또는 "Display 2841568472 (1920×1080)" — 운영자가 식별 가능한 정보 우선. |
| placement-refresh를 즉시 적용할지(visible window 이동) vs 다음 show 때 적용할지 | Design에서 단순함 우선으로 결정. AC-04는 "즉시 이동" 가정. |

---

**다음 단계**: `/pdca design monitor-target`
