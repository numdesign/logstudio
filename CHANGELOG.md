# Changelog

이 프로젝트는 배포/릴리스 체계가 별도로 없으므로, 유지보수 시점에 큰 변경(파싱/렌더/설정 키 변경)을 여기에 기록합니다.

## 2026-01-20

### 코드 정리

- **미사용 함수 삭제**:
  - `htmlToText()`: 정의만 있고 호출 없음 → 삭제
  - `getImageHTML()`: 정의만 있고 호출 없음 → 삭제
- **리팩토링 체크리스트 업데이트**: 유지 중인 중복/레거시 코드 기록 (의도적 유지 사유 명시)

---

## 2026-01-21

### 타이포그래피

- **폰트 프리셋 추가**: 기본(설정 없음) / 바탕체(serif) / 고딕체(Pretendard)
- **문단 들여쓰기 추가**: 토글(ON일 때 `text-indent = fontSize(px)`, OFF일 때 속성 미출력)

## 2026-01-19 (2차)

### 코드 리팩토링

- **UI 설정 상수 추출**:
  - `COLOR_INPUT_CONFIG`: 색상 입력 설정 통합 (28개 항목)
  - `RANGE_INPUT_CONFIG`: 레인지 슬라이더 설정 통합 (42개 항목)
  - 중복 배열 제거 (`colorInputs`, `colorMap`, `rangeInputs`, `rangeMap` → 상수 재사용)
- **UI 동기화 헬퍼 함수 추가**:
  - `syncToggleUI()`: 토글 스위치 UI 동기화
  - `syncSelectUI()`: Select 요소 UI 동기화
  - `syncAllUIFromSettings()` 약 70줄 → 45줄로 간소화
- **상수/기본값 정리**:
  - `APP_CONSTANTS` 상수 객체 추가 (MAX_HISTORY_SIZE, SAVE_DEBOUNCE_DELAY, IMAGE_MAX_SIZE, IMAGE_QUALITY, TOAST_DURATION)
  - 중복 상수 제거 (`const MAX_HISTORY_SIZE = 30` → `APP_CONSTANTS.MAX_HISTORY_SIZE` 사용)
  - `STORAGE_KEYS`에 `FIND_REPLACE_FAVORITES` 추가, 기존 별도 상수 제거
  - `settings` 객체에 JSDoc 주석 및 카테고리 구분 추가
- **섹션 인덱스 추가**: main.js 상단에 8개 카테고리별 섹션 인덱스 주석 추가
  - [1] 초기화 & 상수
  - [2] 유틸리티 함수
  - [3] 데이터 & 상태 관리
  - [4] 설정 (Settings)
  - [5] 렌더링 & 파싱
  - [6] UI 이벤트 핸들러
  - [7] 모달 & 다이얼로그
  - [8] 기능별 UI
- **중복 함수 통합**:
  - `escapeHTMLContent()` 삭제 → `escapeHTML()` 사용
  - `escapeAttr()` 삭제 → `escapeHtmlAttr()` 사용
  - `escapeHtml()`, `escapeHtmlAttr()`를 유틸리티 섹션으로 이동 + JSDoc 주석 추가
- **긴 함수 분리**:
  - `renderLogBlocks()` → `createBlockHtml()`, `setupBlockContentEvents()`, `setupBlockImageDropEvents()`, `setupBlockHeaderEvents()`
  - `createFindReplaceModal()` → `createFindReplaceModalHtml()`, `FIND_REPLACE_SPECIAL_PRESETS`, `setupFindReplacePresets()`, `renderFindReplaceFavorites()`, `setupFindReplaceEvents()`
  - `updatePreviewNow()` → `getBadgeStyle()`, `buildPreviewHeaderHTML()`, `buildPreviewBlockInnerHTML()`, `applyPreviewContainerStyle()`
- **리팩토링 체크리스트 문서 작성**: `docs/REFACTORING_CHECKLIST.md`

### 버그 수정

- **이미지 붙여넣기(Ctrl+V) 안 됨**: 이미지 파일 직접 붙여넣기를 HTML 처리보다 우선하도록 순서 변경
- **찾기/바꾸기 후 Undo 안 됨**:
  - `replaceAll()`에서 `pushHistory()` 호출 추가 (변경 전/후 모두 저장)
  - `const findText` → `let findText`로 수정 (정규식 미사용 모드에서 런타임 에러 발생 원인)
  - Ctrl+Z가 contenteditable에서도 전역 Undo로 작동하도록 수정
- **찾기/바꾸기에서 개행(\n) 이스케이프 시퀀스 미지원**: `countMatches()`, `replaceAll()`, `computeRegexForFind()`에서 정규식 모드가 아닐 때 `\n` → 실제 개행 변환 추가
- **contenteditable에서 Enter 입력 시 개행 누락**: `getContentEditableContent()`에서 div/p 블록 요소 앞에 개행 추가 로직 보완 (Chrome은 Enter 시 `<div>`로 줄 감싸기 때문)
- **프리뷰 클릭 → 편집기 이동 시 이미지 포함 블록에서 라인 위치 오류**:
  - `placeCaretAtLineStart()` 완전 재작성
  - `parseContentLineStructure()`: content를 parseBlockContent()와 동일하게 파싱하여 라인 구조 추출
  - `buildEditorLineMap()`: 편집기 DOM 노드 맵 구축
  - 라인 타입(text/image/blank)과 인덱스로 역추적하여 정확한 위치 찾기

---

## 2026-01-19

- 빈 줄(내용 없는 개행) 보존: 파서가 빈 줄을 `blank` 타입으로 유지하고 렌더에서 spacer로 반영
- preview/export 렌더링 경로 통일: 미리보기만 따로 필터링하던 로직 제거(동일 파서 경로 사용)
- 메시지 캡슐(SMS-like) 기능
  - 한 줄 전체 `[ ... ]`만 캡슐 적용
  - `>> [ ... ]` / `<< [ ... ]`도 캡슐 지원(AI/User 구분)
  - AI/User 캡슐 스타일 분리(배경/테두리)
  - 꼬리 코너를 `%` 기반(`smsPillTailPercent`)으로 변경
  - `smsPillRadius` 조절 범위를 0~40으로 정리
  - 캡슐 비활성화 토글 추가(`smsPillDisabled`: true면 대괄호를 문자 그대로 출력)
