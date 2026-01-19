# Log Studio (log generator)

브라우저에서 대화 로그(텍스트 + 이미지)를 입력하고, 미리보기/HTML 코드를 생성해 복사하거나 백업(JSON)으로 내보낼 수 있는 단일 페이지 앱(SPA)입니다.

## 빠른 실행

- Windows에서 그냥 [index.html](index.html)을 더블클릭해서 브라우저로 열면 됩니다.
- 별도 빌드/설치가 없는 순수 HTML/CSS/JS 프로젝트입니다.

## 핵심 개념 (유지보수 관점)

이 앱은 크게 3가지 레이어로 돌아갑니다.

1) **상태(state)**: 모든 옵션은 `settings` 객체에 들어있고 LocalStorage로 저장됩니다.
2) **파싱(parser)**: 블록 내용(contenteditable)을 라인 단위로 해석해 타입을 정합니다.
3) **렌더링(renderer)**: 파싱 결과를 HTML로 만들고, 미리보기/코드 출력이 같은 로직을 사용합니다.

"새 기능"이나 "버그 수정"을 할 때는 **미리보기와 export 결과가 항상 동일하게 나오도록** 파서/렌더 경로를 통일하는 게 가장 중요합니다.

- 파서 진입점: `parseBlockContent()` → `parseLine()`
- 렌더 진입점: `generateBubbleHTML()`

자세한 규칙은 문서 참고:

- 파싱 규칙: [docs/parsing.md](docs/parsing.md)
- 설정 키/단위/범위: [docs/settings.md](docs/settings.md)

## 입력 포맷(요약)

블록 안 텍스트는 “한 줄 = 한 아이템”처럼 처리됩니다.

- **빈 줄**: 그대로 보존됩니다(연속 개행 포함).
- **구분선**: `---` 또는 `===` 또는 `***` (같은 문자 3개 이상)
- **제목**: `#` ~ `###`
- **AI/USER 말풍선 마커**:
  - `>> 내용` : AI (왼쪽)
  - `<< 내용` : User (오른쪽)
- **메시지 캡슐(대괄호)**:
  - 한 줄 전체가 `[ ... ]`일 때만 캡슐로 렌더링됩니다.
  - `>> [ ... ]`, `<< [ ... ]`도 캡슐로 처리됩니다.
  - 설정에서 “메시지 캡슐 비활성화”를 켜면 `[ ... ]`는 그냥 일반 텍스트로 취급합니다.

## 백업/복구(JSON)

- 앱 우측(또는 UI에 있는) 설정에서 **내보내기**를 누르면 `log-studio-backup-YYYY-MM-DD.json`이 다운로드됩니다.
- 이 파일에는 `settings`와 `blocks`(제목/내용/접기여부)가 포함됩니다.
- 가져오기는 파일을 선택하면 `settings`를 적용하고, 마이그레이션/클램프 후 UI를 동기화합니다.

## 파일 구조

- [index.html](index.html): UI 마크업(탭/슬라이더/토글/프리셋 버튼 등)
- [style.css](style.css): 메인 스타일
- [main.js](main.js): 앱 로직(상태/저장/파싱/렌더/이벤트/백업)
- [post.html](post.html), [post.js](post.js), [post.css](post.css): 별도 페이지(있다면)용

## 가장 자주 하는 작업 가이드(체크리스트)

### 1) 설정(settings) 키를 추가하고 UI에 노출하고 싶다

- `main.js`의 `settings` 객체에 기본값 추가
- `migrateSettingsFromLoadedObject()`에:
  - 레거시 키가 있다면 변환
  - 기본값 채우기(해당 키가 없을 때)
  - `clampNumber()` / `Boolean()` 등으로 값 보정
- UI 바인딩 추가:
  - 색상: `syncUIFromSettings()`의 `colorMap` + `colorInputs` 목록
  - 슬라이더: `rangeInputs` 목록 + `syncAllUIFromSettings()`의 `rangeMap`
  - 토글: 토글 이벤트 리스너 + `syncAllUIFromSettings()`에 상태 반영

### 2) 새로운 문법(마커)을 파싱하고 싶다

- `parseLine()`에 규칙을 추가 (순서가 중요합니다)
- 기존 규칙과 충돌하지 않게 “가장 구체적인 것 → 일반적인 것” 순으로 배치
- 렌더는 `generateBubbleHTML()`에 타입 분기 추가
- 마지막으로 `parseBlockContent()`가 preview/export 모두 같은 결과를 만들고 있는지 확인

### 3) 메시지 캡슐 스타일을 바꾸고 싶다

- 파싱은 `parseLine()`에서 `sms` 플래그/타입이 결정됩니다.
- 캡슐 HTML은 `generateBubbleHTML()` 내부 `buildSmsPillHTML()`에서 만듭니다.
- 꼬리 코너는 `smsPillTailPercent`(0~100%)로 제어됩니다.

## 트러블슈팅

- "미리보기랑 export HTML이 다르게 나와요": preview쪽에만 별도 파싱/필터가 들어가면 발생합니다. `parseBlockContent()` 경로를 공유하도록 유지하세요.
- "빈 줄이 사라져요": `parseLine()`에서 `type:'blank'`가 유지되는지, 렌더가 spacer를 출력하는지 확인하세요.

## 변경 기록

- [CHANGELOG.md](CHANGELOG.md)
