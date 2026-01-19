# 설정 키 가이드 (docs/settings.md)

이 문서는 `main.js`의 `settings` 객체를 기준으로, 자주 건드리는 옵션들의 의미/단위/범위/유지보수 포인트를 정리합니다.

> 목표: 다른 세션/다른 LLM/다른 사람이 봐도 “어디를 고치면 되는지” 바로 알 수 있게.

## 설정 시스템 구조

- 기본값: `settings` 객체 선언에 하드코딩
- 초기화용 스냅샷: `defaultSettings = JSON.parse(JSON.stringify(settings))`
  - LocalStorage 로드로 기본값이 오염되는 것을 막기 위함
- 마이그레이션/값 보정: `migrateSettingsFromLoadedObject(loaded)`
  - 레거시 키 변환
  - 누락된 키 기본값 채우기
  - `clampNumber()`, `Boolean()` 등으로 유효범위 강제

## 저장/백업

- 자동 저장: `saveToStorage()`가 LocalStorage에 `settings`, `logBlocks`, `blockIdCounter`를 저장
- 자동 로드: `loadFromStorage()`가 LocalStorage에서 읽어 `Object.assign(settings, parsed)` 후 `migrateSettingsFromLoadedObject(parsed)` 실행
- 백업 JSON: 내보내기는 `{ version: 1, exportedAt, settings, blocks }` 구조

## 자주 쓰는 설정 (발췌)

### 1) 출력/컨테이너

- `disableHeader` (boolean)
  - `true`면 헤더 영역 자체를 만들지 않음
- `disableContainerStyle` (boolean)
  - `true`면 컨테이너 배경/테두리/둥글기/그림자 적용 안 함 + 미리보기 캔버스 배경 흰색 고정
- `containerWidth` (px)
- `containerPadding` (em)
- `containerOuterMarginY` (em)
- `borderRadius` (px)
- `shadowIntensity` (0~100)

### 2) 말풍선(bubble)

- `aiBubbleColor`, `userBubbleColor` (hex)
- `bubbleRadius` (px)
- `bubblePadding` (em)
- `bubbleMaxWidth` (%)
- `bubbleGap` (em)

### 3) 줄/문단

- `lineHeight` (배수)
  - 빈 줄 spacer 높이에도 영향을 줌
- `paragraphSpacing` (em)
  - 나레이션/일반 문단 간격
- `blockLineHeight` (배수)

### 4) 이미지

- `imageMaxWidth` (px)
- `imageMargin` (em)
- `imageBorderRadius` (px)
- `imageAlign` (`left|center|right`)
- `imageBorderWidth` (px)
- `imageBorderColor` (hex)
- `imageShadow` (`none|soft|medium|strong|glow`)

### 5) 메시지 캡슐([])

캡슐은 “한 줄 전체가 `[ ... ]`”일 때만 적용됩니다.

- `smsPillDisabled` (boolean)
  - `true`면 `[...]` 감지를 꺼서 대괄호가 그대로 텍스트로 출력됨
- `smsPillAiBgColor`, `smsPillAiBorderColor` (hex)
- `smsPillUserBgColor`, `smsPillUserBorderColor` (hex)
- `smsPillBorderWidth` (px, 0~8)
- `smsPillRadius` (px, 0~40)
- `smsPillTailPercent` (%, 0~100)
  - `tailPx = radiusPx * (tailPercent / 100)`
  - 100%: 꼬리 코너도 완전 둥글게(꼬리 없음)
  - 0%: 해당 코너 완전 각지게
- `smsPillPaddingY`, `smsPillPaddingX` (em)
- `smsPillFontSize` (em)
- `smsPillMaxWidth` (%)
- `smsPillShadowIntensity` (0~100)

## 새 설정을 추가하는 표준 절차(권장)

1) `settings`에 기본값 추가
2) `migrateSettingsFromLoadedObject()`에서
   - `if (!has("newKey")) settings.newKey = <default or derived>`
   - `settings.newKey = clampNumber(...)` 또는 `Boolean(...)` 등으로 보정
3) UI 입력이 있다면
   - 색상: `syncUIFromSettings()`의 `colorMap` + `colorInputs`
   - 슬라이더: `rangeInputs` + `syncAllUIFromSettings()`의 `rangeMap`
   - 토글: 이벤트 리스너 + `syncAllUIFromSettings()`에 동기화
4) `updatePreview()` 및 `generateHTML()` 둘 다에 영향이 필요한지 확인
5) 백업(JSON) 호환성
   - `exportSettings()`는 `settings: { ...settings }`이므로 자동 포함됨
   - 로드/가져오기 시 `migrateSettingsFromLoadedObject()`가 값 보정/레거시 변환 담당

## 레거시/호환성 메모

- 컨테이너 외부 여백은 현재 `containerOuterMarginY` 중심이며, 과거의 4방향 값들은 렌더링에는 사용하지 않지만 값 보정은 남아있습니다.
- 캡슐 꼬리는 과거 px 기반(`smsPillTailRadius`)을 `%` 기반(`smsPillTailPercent`)으로 마이그레이션합니다.
