# 리팩토링 체크리스트

> 리팩토링 전 현재 기능 상태를 기록하여, 리팩토링 후 검증에 활용합니다.
> 작성일: 2026-01-19
> 최종 업데이트: 2026-01-19

---

## 1. 핵심 기능 체크리스트

### 1.1 로그 블록 관리

- [x] 블록 추가 (+ 버튼)
- [x] 블록 삭제 (삭제 버튼 + confirm 모달)
- [x] 블록 복제 (복제 버튼)
- [x] 블록 접기/펼치기 (토글 버튼)
- [x] 블록 드래그 앤 드롭 재정렬
- [x] 블록 키보드 이동 (Alt+↑/↓)
- [x] 블록 제목 편집
- [x] 블록 내용 편집 (contenteditable)
- [x] 이미지 붙여넣기 + 압축
- [x] 블록 접기 상태 Undo/Redo 반영

### 1.2 미리보기 (Preview)

- [x] PC 모드 미리보기
- [x] 모바일 모드 미리보기 (토글)
- [x] 미리보기 실시간 업데이트
- [x] 미리보기 클릭 → 편집기 이동
- [x] 미리보기 클릭 이동 확인 토글 (헤더 switch)
- [x] caret 위치 스크롤 + 플래시 하이라이트

### 1.3 출력 탭

- [x] 미리보기 탭
- [x] HTML 코드 탭
- [x] 직접 수정 탭 (편집 가능한 HTML)
- [x] 탭 전환 동작
- [x] 코드 복사 버튼

### 1.4 Undo/Redo

- [x] Ctrl+Z Undo
- [x] Ctrl+Y / Ctrl+Shift+Z Redo
- [x] 히스토리 스택 관리
- [x] 접기/펼치기 상태 히스토리 반영

### 1.5 찾기/바꾸기

- [x] 찾기/바꾸기 모달 열기 (Ctrl+H)
- [x] 라이브 매치 카운트 (입력 중 실시간)
- [x] 대소문자 구분 옵션
- [x] 정규식 옵션
- [x] 전체 바꾸기
- [x] 즐겨찾기 저장/적용/삭제

### 1.6 설정 (Settings)

- [x] 기본 정보 설정 (캐릭터명, 유저명, 모델 등)
- [x] 색상 설정 (배경, 텍스트, 말풍선 등)
- [x] 폰트 설정 (패밀리, 크기, 두께)
- [x] 레이아웃 설정 (너비, 패딩, 간격 등)
- [x] 컨테이너 배경 그라디언트
- [x] 헤더 배경 그라디언트
- [x] 말풍선 배경 그라디언트
- [x] 설정 LocalStorage 저장/불러오기
- [x] 설정 내보내기 (JSON)
- [x] 설정 가져오기 (JSON)

### 1.7 프리셋

- [x] 시스템 프리셋 적용
- [x] 사용자 프리셋 저장
- [x] 사용자 프리셋 불러오기
- [x] 사용자 프리셋 삭제

### 1.8 테마

- [x] 라이트/다크 테마 전환
- [x] 시스템 테마 감지

### 1.9 마크다운 파싱

- [x] **굵게** 파싱
- [x] *기울임* 파싱
- [x] "대화" 파싱 (색상 적용)
- [x] > 인용구 파싱
- [x] # 제목 파싱 (h1~h6)
- [x] --- 구분선 파싱
- [x] 이미지 태그 유지
- [x] 줄바꿈 처리

### 1.10 말풍선 스타일

- [x] 채팅형 말풍선 (AI/User 구분)
- [x] [메시지] 캡슐 스타일 (SMS)
- [x] 네임태그 표시 토글
- [x] 아바타 표시 토글

### 1.11 유틸리티 기능

- [x] 대괄호 텍스트 일괄 제거
- [x] 연속 개행 줄이기
- [x] RisuAI JSON 가져오기
- [x] 전체 초기화
- [x] 도움말 모달

### 1.12 키보드 단축키

- [x] Ctrl+Z: Undo
- [x] Ctrl+Y / Ctrl+Shift+Z: Redo
- [x] Ctrl+H: 찾기/바꾸기
- [x] Alt+↑/↓: 블록 이동
- [x] Ctrl+B: 굵게 마커 삽입
- [x] Ctrl+I: 기울임 마커 삽입
- [x] Escape: 모달 닫기

---

## 2. main.js 현재 섹션 구조

> 리팩토링 후 8개 카테고리로 재정리됨 (약 6,180줄)

| 카테고리 | 섹션 |
|----------|------|
| [1] 초기화 & 상수 | DOM 요소, LocalStorage 키, 디버그 유틸리티 |
| [2] 유틸리티 함수 | HTML 이스케이프, 이미지 처리, ContentEditable 헬퍼 |
| [3] 데이터 & 상태 관리 | LocalStorage 저장/불러오기, 프리셋, 로그 블록, Undo/Redo |
| [4] 설정 (Settings) | 설정 객체, 마이그레이션 |
| [5] 렌더링 & 파싱 | 마크다운 파싱, HTML 생성, 미리보기 업데이트 |
| [6] UI 이벤트 핸들러 | 탭 전환, 설정 동기화, 드래그, 키보드 단축키 |
| [7] 모달 & 다이얼로그 | 도움말, 찾기/바꾸기, Confirm |
| [8] 기능별 UI | 테마, 프리셋 UI, JSON 가져오기, 설정 내보내기 |

### 상세 섹션 목록

| 라인 | 섹션 이름 |
|------|-----------|
| 1 | 섹션 인덱스 주석 |
| 55 | [1] 초기화 & 상수 |
| 59 | DOM 요소 |
| 66 | 모바일 디버그 로그 (테스트용) |
| 83 | LocalStorage 키 |
| 91 | [2] 유틸리티 함수 |
| 95 | HTML 이스케이프 |
| 124 | 이미지 처리 유틸리티 |
| 580 | [3] 데이터 & 상태 관리 |
| 584 | LocalStorage 저장/불러오기 |
| 717 | 로그 블록 관리 |
| 721 | Undo/Redo 히스토리 시스템 |
| 1001 | 드래그 앤 드롭 |
| 1261 | [4] 설정 (Settings) |
| 1265 | 설정 객체 |
| 2402 | [5] 렌더링 & 파싱 |
| 2406 | 마크다운 파싱 |
| 2973 | HTML 생성 |
| 3153 | 미리보기 업데이트 |
| 3545 | [6] UI 이벤트 핸들러 |
| 3549 | 초기 미리보기 업데이트 |
| 3554 | 탭 전환 |
| 3571 | 설정 입력 동기화 |
| 4024 | 출력 탭 전환 |
| 4940 | 키보드 단축키 |
| 5181 | [7] 모달 & 다이얼로그 |
| 5185 | 도움말 모달 |
| 5401 | Confirm 모달 |
| 5565 | 찾기 및 바꾸기 |
| 5997 | [8] 기능별 UI |
| 6001 | JSON 가져오기 (RisuAI 형식) |
| 6066 | 대괄호 텍스트 제거 |
| 6118 | 연속 개행 줄이기 |
| 6173 | 전체 초기화 |
| 6036 | 설정 내보내기/가져오기 |
| 634 | Undo/Redo 히스토리 시스템 |
| 914 | 드래그 앤 드롭 |
| 1174 | 설정 상태 |
| 2311 | 마크다운 파싱 |
| 2878 | HTML 생성 (인라인 스타일 div) |
| 3075 | 미리보기 업데이트 |
| 3457 | 이벤트 리스너 설정 |
| 3462 | 탭 전환 |
| 3479 | 설정 입력 동기화 |
| 3932 | 출력 탭 전환 |
| 4250 | 네임태그 토글 |
| 4263 | 복사 버튼 |
| 4311 | 블록 추가 버튼 |
| 4318 | 초기화: LocalStorage에서 불러오기 |
| 4548 | 미리보기 클릭 이동 확인 토글(헤더) |
| 4572 | 미리보기 클릭 → 편집기 이동 |
| 4713 | 사용자 프리셋 UI |
| 4817 | 테마 토글 |
| 4841 | 키보드 단축키 |
| 4921 | 블록 키보드 이동 |
| 4958 | 마커 삽입 함수 |
| 5071 | showToast |
| 5089 | 도움말 모달 |
| 5189 | 모바일 미리보기 토글 |
| 5205 | JSON 가져오기 (RisuAI 형식) |
| 5270 | 대괄호 텍스트 제거 |
| 5322 | 연속 개행 줄이기(단축 버튼) |
| 5485 | 찾기 및 바꾸기 |
| 5897 | 전체 초기화 |
| 5954 | 설정 내보내기/가져오기 |

---

## 3. 리팩토링 대상 분석

### 3.1 중복/유사 함수

- ~~`escapeHTML()` vs `escapeHTMLContent()` vs `escapeHtml()` vs `escapeHtmlAttr()` vs `escapeAttr()`~~
  → ✅ **완료**: `escapeHTMLContent` 삭제, `escapeAttr` → `escapeHtmlAttr`로 교체, 유틸리티 섹션에 통합

### 3.2 긴 함수 (분리 권장 - 향후 작업)

- `renderLogBlocks()` (~160줄): 블록 렌더링 + 이벤트 바인딩 혼재
- `updatePreviewNow()` (~290줄): 미리보기 업데이트 + HTML 생성 혼재
- `syncUIFromSettings()` (~180줄): 모든 UI 동기화
- `syncAllUIFromSettings()` (~200줄): 전체 초기화 + UI 동기화
- `migrateSettingsFromLoadedObject()` (~220줄): 마이그레이션 로직
- `createFindReplaceModal()` (~290줄): 모달 생성 + 이벤트 바인딩

### 3.3 settings 객체 (향후 작업)

- 100개 이상의 속성
- 기본값/마이그레이션 로직이 분산됨
- → 별도 `DEFAULT_SETTINGS` 객체 + 마이그레이션 함수 분리 권장

### 3.4 이벤트 리스너 등록

- 파일 여러 곳에 분산되어 있음
- → 섹션별로 그룹화 완료 (카테고리 헤더 추가)

---

## 4. 리팩토링 진행 상황 (A 방식: 섹션/함수 정리)

### Phase 1: 섹션 헤더 정규화 ✅ 완료

1. ✅ 파일 상단에 섹션 인덱스 추가
2. ✅ 8개 주요 카테고리 헤더 추가:
   - [1] 초기화 & 상수
   - [2] 유틸리티 함수
   - [3] 데이터 & 상태 관리
   - [4] 설정 (Settings)
   - [5] 렌더링 & 파싱
   - [6] UI 이벤트 핸들러
   - [7] 모달 & 다이얼로그
   - [8] 기능별 UI
3. ✅ 서브 섹션 헤더 유지 및 정규화

### Phase 2: 중복 함수 통합 ✅ 완료

1. ✅ `escapeHTMLContent` 호출부를 `escapeHTML`로 변경
2. ✅ `escapeHTMLContent` 함수 정의 삭제
3. ✅ `escapeAttr` 호출부를 `escapeHtmlAttr`로 변경
4. ✅ `escapeAttr` 함수 정의 삭제
5. ✅ `escapeHtml`, `escapeHtmlAttr`를 유틸리티 섹션으로 이동

### Phase 3: 긴 함수 분리 ✅ 완료

1. ✅ `renderLogBlocks()` 분리:
   - `createBlockHtml()`: 블록 HTML 생성
   - `setupBlockContentEvents()`: 컨텐츠 이벤트 바인딩
   - `setupBlockImageDropEvents()`: 이미지 드롭 이벤트
   - `setupBlockHeaderEvents()`: 헤더 이벤트 바인딩
2. ✅ `createFindReplaceModal()` 분리:
   - `createFindReplaceModalHtml()`: 모달 HTML 생성
   - `FIND_REPLACE_SPECIAL_PRESETS`: 특수문자 프리셋 상수
   - `setupFindReplacePresets()`: 프리셋 드롭다운 설정
   - `renderFindReplaceFavorites()`: 즐겨찾기 렌더링
   - `setupFindReplaceEvents()`: 이벤트 바인딩
3. ✅ `updatePreviewNow()` 분리:
   - `getBadgeStyle()`: 배지 스타일 생성
   - `buildPreviewHeaderHTML()`: 헤더 HTML 생성
   - `buildPreviewBlockInnerHTML()`: 블록 내부 HTML 생성
   - `applyPreviewContainerStyle()`: 컨테이너 스타일 적용
4. ✅ 프리뷰→편집기 이동 버그 수정 (역추적 방식):
   - `parseContentLineStructure()`: 라인 구조 추출
   - `buildEditorLineMap()`: 편집기 DOM 노드 맵
   - `placeCaretAtLineStart()`: 역추적 방식으로 재작성

### Phase 4: 상수/기본값 정리 ✅ 완료

1. ✅ `APP_CONSTANTS` 상수 객체 추가:
   - `MAX_HISTORY_SIZE`: 30
   - `SAVE_DEBOUNCE_DELAY`: 500
   - `IMAGE_MAX_SIZE`: 800
   - `IMAGE_QUALITY`: 0.8
   - `TOAST_DURATION`: 2000
2. ✅ 중복 상수 제거 (`const MAX_HISTORY_SIZE` → `APP_CONSTANTS` 사용)
3. ✅ `STORAGE_KEYS`에 `FIND_REPLACE_FAVORITES` 추가
4. ✅ `settings` 객체에 JSDoc 주석 및 카테고리 구분 추가
5. ✅ 하드코딩된 값 상수 참조로 변경:
   - `debouncedPushHistory()`: `APP_CONSTANTS.SAVE_DEBOUNCE_DELAY`
   - `showToast()`: `APP_CONSTANTS.TOAST_DURATION`
   - `compressImage()`: `APP_CONSTANTS.IMAGE_MAX_SIZE`, `IMAGE_QUALITY`

### Phase 5: UI 설정 통합 및 헬퍼 함수 ✅ 완료

1. ✅ `COLOR_INPUT_CONFIG` 상수 추출:
   - 28개 색상 입력 설정 통합
   - `colorInputs`, `colorMap` 중복 제거
   - `syncUIFromSettings()`, 이벤트 바인딩에서 공통 사용
2. ✅ `RANGE_INPUT_CONFIG` 상수 추출:
   - 42개 레인지 슬라이더 설정 통합
   - `rangeInputs`, `rangeMap` 중복 제거
   - `syncAllUIFromSettings()`, 이벤트 바인딩에서 공통 사용
3. ✅ UI 동기화 헬퍼 함수 추가:
   - `syncToggleUI()`: 토글 스위치 UI 동기화
   - `syncSelectUI()`: Select 요소 UI 동기화
4. ✅ `syncAllUIFromSettings()` 간소화:
   - 토글/select 동기화를 헬퍼 함수 호출로 대체
   - 약 70줄 → 45줄로 감소

### Phase 6: 미사용 코드 정리 ✅ 완료

1. ✅ 미사용 함수 삭제:
   - `htmlToText()`: 정의만 있고 호출 없음 → 삭제
   - `getImageHTML()`: 정의만 있고 호출 없음 → 삭제

### 유지 중인 중복/레거시 코드 (의도적)
>
> 아래 항목은 분석 후 의도적으로 유지한 코드입니다.

| 항목 | 설명 | 유지 사유 |
|------|------|-----------|
| `escapeHTML()` vs `escapeHtml()` | 이름이 비슷하지만 기능 다름 | `escapeHTML`: `& < >` 이스케이프 (렌더링용) / `escapeHtml`: `& < > " '` + null-safe (모달/동적 UI용) |
| `escapeHtmlAttr()` | `escapeHtml`의 별칭 | 의미적 명확성을 위해 유지 |
| `containerMarginTop/Right/Bottom/Left` | settings 객체 내 레거시 속성 | 렌더링에 사용 안 함, 마이그레이션 호환성 위해 유지 |
| `mobileLog()` | 모바일 디버깅 로그 | 12곳에서 사용 중, 프로덕션에서 `DEBUG=false`로 비활성화됨 |

### Phase 7: 추가 개선 (향후 작업)

- `migrateSettingsFromLoadedObject()` (~240줄) 논리적 그룹핑
- `DEFAULT_SETTINGS` 상수 객체 별도 분리
- `escapeHTML` / `escapeHtml` 함수명 통일 검토 (혼란 방지)

---

## 5. 테스트 체크리스트

리팩토링 후 아래 항목을 수동 검증:

### 기본 동작

- [ ] 페이지 로드 시 저장된 블록/설정 복원
- [ ] 블록 추가/삭제/복제
- [ ] 블록 드래그 재정렬
- [ ] 블록 접기/펼치기
- [ ] 미리보기 실시간 업데이트

### 설정

- [ ] 색상 변경 → 미리보기 반영
- [ ] 폰트 변경 → 미리보기 반영
- [ ] 프리셋 적용
- [ ] 설정 내보내기/가져오기

### 고급 기능

- [ ] Undo/Redo
- [ ] 찾기/바꾸기 + 라이브 카운트
- [ ] 미리보기 클릭 → 편집기 이동
- [ ] 키보드 단축키

### 출력

- [ ] HTML 코드 탭 → 복사
- [ ] 직접 수정 탭 → 편집 + 복사
