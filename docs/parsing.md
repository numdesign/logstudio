# 파싱 규칙 (docs/parsing.md)

이 문서는 “입력 텍스트/HTML이 어떻게 라인 타입으로 해석되고, 어떤 HTML로 렌더링되는지”를 설명합니다.

## 전체 흐름

- 블록의 `content`(문자열)를 `parseBlockContent(content, isForCode)`가 처리합니다.
- `parseBlockContent()`는 내부에서 라인을 만들어 `parseLine(line)`로 파싱하고,
- 파싱 결과를 `generateBubbleHTML(parsed, isForCode, { prevType })`로 HTML로 변환합니다.

핵심 원칙:

- **preview와 export는 같은 파서/렌더 경로를 사용해야** 출력 불일치 문제가 없습니다.

## 입력이 “순수 텍스트”인 경우

`content`에 `<`가 없으면 순수 텍스트로 보고 다음을 수행합니다.

- `\r?\n`로 라인 분리
- **마지막에 붙은 불필요한 공백 라인만 제거** (중간의 빈 줄은 보존)
- 각 라인을 `parseLine()`로 파싱

## 입력이 “HTML(이미지 포함)”인 경우

`content`에 `<`가 있으면 DOMParser로 파싱합니다.

- 텍스트 노드: `\n` 기준으로 라인 분리 후 `parseLine()` 적용
- `<img>`: 이미지 전용 HTML(div+img)로 출력
- `<br>`: **빈 줄로 취급**하여 `type:'blank'`를 출력(연속 개행 보존)
- `<div>`, `<p>`: 자식 노드를 재귀 처리

## 라인 타입 규칙 (`parseLine`)

`parseLine(line)`는 아래 순서로 규칙을 적용합니다(순서가 중요).

### 1) 빈 줄(blank)

- `line.trim() === ''`이면 `type:'blank'`
- 렌더는 실제 높이(spacer div)로 보존합니다.

### 2) 구분선(divider)

- `---` 또는 `===` 또는 `***` (같은 문자 3개 이상)

### 3) 마크다운 제목(heading)

- `# 제목` ~ `### 제목`

### 4) 대화 마커 (AI/User)

- `<< 내용`: `type:'user'`
- `>> 내용`: `type:'ai'`

추가 규칙: 마커 뒤 내용이 한 줄 전체 `[ ... ]` 형태면 메시지 캡슐(sms)로 처리될 수 있습니다.

### 5) 메시지 캡슐(sms)

- 마커가 없고 **라인 전체가 `[ ... ]`** 형태면 `type:'sms'`
- 라인 중간에 `[...]`가 섞인 문장은 캡슐로 확장하지 않습니다.

#### 캡슐 비활성화

- `settings.smsPillDisabled === true`이면, 위의 `[...]` 감지 자체를 스킵합니다.
- 이때 `[대괄호]`는 그대로 일반 텍스트로 렌더됩니다.

### 6) 나레이션(narration)

- 위 규칙에 해당하지 않으면 `type:'narration'`

## 렌더링 규칙 (`generateBubbleHTML`)

- `type:'blank'`: `div` spacer로 라인 높이를 보존
- `type:'divider'`: `<hr>`
- `type:'heading'`: `<p>`(크기/굵기 다름)
- `type:'ai'` / `type:'user'`:
  - `sms: true`면 캡슐 렌더
  - 아니면 말풍선(bubble) 렌더
- `type:'sms'`: 기본적으로 AI 스타일(왼쪽 정렬) 캡슐 렌더

## 입력 예시

아래 예시는 문서 이해를 위한 예시입니다.

- 빈 줄 보존

```
첫 줄

셋째 줄
```

- 캡슐(한 줄 전체만)

```
[이 줄은 캡슐]
이 줄은 [대괄호가 있어도] 캡슐 아님
```

- 마커 + 캡슐

```
>> [AI 캡슐]
<< [User 캡슐]
>> 일반 말풍선
<< 일반 말풍선
```
