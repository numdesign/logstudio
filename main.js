// ===== DOM 요소 =====
const previewEl = document.querySelector("#log-preview");
const codeOutputEl = document.querySelector("#code-output");
const copyBtn = document.querySelector("#copy-btn");
const logBlocksContainer = document.querySelector("#log-blocks");
const addBlockBtn = document.querySelector("#add-block-btn");

// ===== LocalStorage 키 =====
const STORAGE_KEYS = {
    SETTINGS: "loggen_settings",
    BLOCKS: "loggen_blocks",
    BLOCK_COUNTER: "loggen_block_counter",
    USER_PRESETS: "loggen_user_presets"
};

// ===== 유틸리티 함수 =====
function escapeHTML(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// ===== 이미지 처리 유틸리티 =====
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function compressImage(base64, maxWidth = 800, quality = 0.8) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            // 이미 작으면 그대로 반환
            if (img.width <= maxWidth) {
                resolve(base64);
                return;
            }
            const canvas = document.createElement('canvas');
            const ratio = maxWidth / img.width;
            canvas.width = img.width * ratio;
            canvas.height = img.height * ratio;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(base64); // 실패 시 원본 반환
        img.src = base64;
    });
}

// contenteditable에서 텍스트+이미지 콘텐츠 추출 (정규화)
function getContentEditableContent(el) {
    // 임시 DOM으로 파싱
    const clone = el.cloneNode(true);

    // img 태그를 플레이스홀더로 임시 대체
    const imgPlaceholders = [];
    clone.querySelectorAll('img').forEach((img, i) => {
        const placeholder = `__IMG_PLACEHOLDER_${i}__`;
        imgPlaceholders.push({ placeholder, src: img.src });
        img.replaceWith(placeholder);
    });

    // br 태그를 줄바꿈으로
    clone.querySelectorAll('br').forEach(br => {
        br.replaceWith('\n');
    });

    // div, p 태그는 내용 뒤에 줄바꿈 추가
    clone.querySelectorAll('div, p').forEach(block => {
        // 블록 요소 앞뒤로 줄바꿈 추가
        if (block.previousSibling && block.previousSibling.nodeType === Node.TEXT_NODE) {
            const text = block.previousSibling.textContent;
            if (text && !text.endsWith('\n')) {
                block.before('\n');
            }
        }
    });

    // 텍스트 추출 (HTML 엔티티 자동 디코딩됨)
    let text = clone.textContent || '';

    // img 플레이스홀더를 실제 img 태그로 복원
    imgPlaceholders.forEach(({ placeholder, src }) => {
        text = text.replace(placeholder, `<img src="${src}">`);
    });

    // 연속 줄바꿈 정리 (3개 이상 -> 2개)
    text = text.replace(/\n{3,}/g, '\n\n');

    return text;
}

// contenteditable에 콘텐츠 설정 (텍스트 -> HTML 변환)
function setContentEditableContent(el, content) {
    // img 태그를 임시 플레이스홀더로
    const imgPlaceholders = [];
    let processed = content.replace(/<img\s+src="([^"]+)"[^>]*>/gi, (match, src) => {
        const placeholder = `__IMG_SET_${imgPlaceholders.length}__`;
        imgPlaceholders.push(src);
        return placeholder;
    });

    // HTML 특수문자 escape (< > & 등)
    processed = processed
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // 줄바꿈을 <br>로
    processed = processed.replace(/\n/g, '<br>');

    // img 플레이스홀더 복원
    imgPlaceholders.forEach((src, i) => {
        processed = processed.replace(`__IMG_SET_${i}__`, `<img src="${src}">`);
    });

    el.innerHTML = processed;
}

// 저장된 content를 contenteditable 표시용 HTML로 변환
function formatContentForEditable(content) {
    if (!content) return '';

    // img 태그를 임시 플레이스홀더로
    const imgPlaceholders = [];
    let processed = content.replace(/<img\s+src="([^"]+)"[^>]*>/gi, (match, src) => {
        const placeholder = `__IMG_FMT_${imgPlaceholders.length}__`;
        imgPlaceholders.push(src);
        return placeholder;
    });

    // HTML 특수문자 escape
    processed = processed
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // 줄바꿈을 <br>로
    processed = processed.replace(/\n/g, '<br>');

    // img 플레이스홀더 복원
    imgPlaceholders.forEach((src, i) => {
        processed = processed.replace(`__IMG_FMT_${i}__`, `<img src="${src}">`);
    });

    return processed;
}

// HTML에서 순수 텍스트 추출 (parseLine용)
function htmlToText(html) {
    const div = document.createElement('div');
    div.innerHTML = html;

    // img 태그를 플레이스홀더로 변환
    div.querySelectorAll('img').forEach((img, i) => {
        const placeholder = document.createTextNode(`{{IMG:${img.src.substring(0, 50)}...}}`);
        img.replaceWith(placeholder);
    });

    // br을 줄바꿈으로
    div.querySelectorAll('br').forEach(br => {
        br.replaceWith('\n');
    });

    // div, p 태그 뒤에 줄바꿈 추가
    div.querySelectorAll('div, p').forEach(block => {
        block.append('\n');
    });

    return div.textContent || '';
}

// Paste 이벤트 핸들러
async function handlePasteWithImages(e, blockId) {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return false;

    const items = clipboardData.items;
    const types = clipboardData.types;

    // HTML이 있으면 우선 처리 (이미지 포함 가능)
    if (types.includes('text/html')) {
        e.preventDefault();
        const html = clipboardData.getData('text/html');

        // HTML 파싱하여 이미지 추출 및 압축
        const processedHtml = await processHtmlWithImages(html);

        // 현재 선택 위치에 삽입
        document.execCommand('insertHTML', false, processedHtml);
        return true;
    }

    // 이미지 파일 직접 붙여넣기
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
                const base64 = await blobToBase64(file);
                const compressed = await compressImage(base64);
                const imgHtml = `<img src="${compressed}" style="max-width: 100%; border-radius: 8px; margin: 0.5em 0;">`;
                document.execCommand('insertHTML', false, imgHtml);
            }
            return true;
        }
    }

    // 일반 텍스트는 기본 동작
    return false;
}

// HTML 내 이미지 처리 (외부 URL -> base64, 압축)
async function processHtmlWithImages(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // ===== HTML Sanitize: 텍스트와 이미지만 추출 =====
    function sanitizeNode(node) {
        const result = [];

        for (const child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                // 텍스트 노드 - 공백 유지 (trim 하지 않음)
                const text = child.textContent;
                if (text) {
                    result.push(text);
                }
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const tagName = child.tagName.toLowerCase();

                if (tagName === 'img') {
                    // 이미지는 src만 보존
                    result.push({ type: 'img', src: child.src });
                } else if (tagName === 'br') {
                    // 줄바꿈
                    result.push({ type: 'br' });
                } else if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'].includes(tagName)) {
                    // 블록 요소: 재귀 처리 후 줄바꿈 추가
                    const childContent = sanitizeNode(child);
                    if (childContent.length > 0) {
                        result.push(...childContent);
                        result.push({ type: 'block-end' });
                    }
                } else {
                    // 기타 인라인 요소 (span, mark, strong 등): 재귀적으로 처리
                    const childContent = sanitizeNode(child);
                    result.push(...childContent);
                }
            }
        }

        return result;
    }

    const sanitized = sanitizeNode(doc.body);

    // 결과 조립: 텍스트와 이미지 분리
    let textParts = [];
    const imagesToProcess = [];

    for (const item of sanitized) {
        if (typeof item === 'string') {
            textParts.push(item);
        } else if (item.type === 'img') {
            imagesToProcess.push(item.src);
            textParts.push(`__IMG_PLACEHOLDER_${imagesToProcess.length - 1}__`);
        } else if (item.type === 'br') {
            textParts.push('\n');
        } else if (item.type === 'block-end') {
            // 블록 요소 끝에는 빈 줄 추가 (문단 구분)
            textParts.push('\n\n');
        }
    }

    // 텍스트 합치기
    let cleanHtml = textParts.join('');

    // 연속 공백을 하나로 (줄바꿈 제외)
    cleanHtml = cleanHtml.replace(/[^\S\n]+/g, ' ');

    // 줄바꿈 앞뒤 공백 제거
    cleanHtml = cleanHtml.replace(/ *\n */g, '\n');

    // 연속된 줄바꿈 정리 (3개 이상 -> 2개)
    cleanHtml = cleanHtml.replace(/\n{3,}/g, '\n\n').trim();

    // 이미지 처리 및 placeholder 교체
    for (let i = 0; i < imagesToProcess.length; i++) {
        const imgSrc = imagesToProcess[i];
        let base64 = null;

        try {
            if (imgSrc.startsWith('data:')) {
                base64 = imgSrc;
            } else if (imgSrc.startsWith('blob:')) {
                try {
                    const response = await fetch(imgSrc);
                    const blob = await response.blob();
                    base64 = await blobToBase64(blob);
                } catch (err) {
                    console.warn('Blob fetch 실패:', err);
                }
            } else if (imgSrc.startsWith('http')) {
                try {
                    const response = await fetch(imgSrc);
                    const blob = await response.blob();
                    base64 = await blobToBase64(blob);
                } catch (err) {
                    console.warn('외부 이미지 fetch 실패:', err);
                }
            }

            if (base64) {
                const compressed = await compressImage(base64);
                const imgHtml = `<img src="${compressed}" style="max-width:100%;border-radius:8px;margin:0.5em 0;">`;
                cleanHtml = cleanHtml.replace(`__IMG_PLACEHOLDER_${i}__`, '\n' + imgHtml + '\n');
            } else {
                cleanHtml = cleanHtml.replace(`__IMG_PLACEHOLDER_${i}__`, '');
            }
        } catch (err) {
            console.warn('이미지 처리 실패:', err);
            cleanHtml = cleanHtml.replace(`__IMG_PLACEHOLDER_${i}__`, '');
        }
    }

    return cleanHtml.trim();
}

// ===== LocalStorage 저장/불러오기 =====
function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        localStorage.setItem(STORAGE_KEYS.BLOCKS, JSON.stringify(logBlocks));
        localStorage.setItem(STORAGE_KEYS.BLOCK_COUNTER, blockIdCounter.toString());
    } catch (e) {
        console.warn("LocalStorage 저장 실패:", e);
    }
}

function loadFromStorage() {
    try {
        // 설정 불러오기
        const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            Object.assign(settings, parsed);
        }

        // 블록 불러오기
        const savedBlocks = localStorage.getItem(STORAGE_KEYS.BLOCKS);
        if (savedBlocks) {
            logBlocks = JSON.parse(savedBlocks);
        }

        // 블록 카운터 불러오기
        const savedCounter = localStorage.getItem(STORAGE_KEYS.BLOCK_COUNTER);
        if (savedCounter) {
            blockIdCounter = parseInt(savedCounter, 10);
        }

        return logBlocks.length > 0;
    } catch (e) {
        console.warn("LocalStorage 불러오기 실패:", e);
        return false;
    }
}

// 사용자 프리셋 저장/불러오기
function saveUserPreset(name) {
    try {
        const presets = getUserPresets();
        const preset = {
            name,
            createdAt: Date.now(),
            settings: { ...settings }
        };
        // 같은 이름이 있으면 덮어쓰기
        const existingIndex = presets.findIndex(p => p.name === name);
        if (existingIndex >= 0) {
            presets[existingIndex] = preset;
        } else {
            presets.push(preset);
        }
        localStorage.setItem(STORAGE_KEYS.USER_PRESETS, JSON.stringify(presets));
        return true;
    } catch (e) {
        console.warn("프리셋 저장 실패:", e);
        return false;
    }
}

function getUserPresets() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.USER_PRESETS);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
}

function deleteUserPreset(name) {
    try {
        const presets = getUserPresets().filter(p => p.name !== name);
        localStorage.setItem(STORAGE_KEYS.USER_PRESETS, JSON.stringify(presets));
        return true;
    } catch (e) {
        return false;
    }
}

function loadUserPreset(name) {
    const presets = getUserPresets();
    const preset = presets.find(p => p.name === name);
    if (preset) {
        Object.assign(settings, preset.settings);
        syncUIFromSettings();
        updatePreview();
        saveToStorage();
        return true;
    }
    return false;
}

function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== 로그 블록 관리 =====
let logBlocks = [];
let blockIdCounter = 0;

function createLogBlock(title = "", content = "", collapsible = false, skipSave = false) {
    const id = blockIdCounter++;
    // 현재 블록 개수 기준으로 제목 생성
    const blockNumber = logBlocks.length + 1;
    const block = {
        id,
        title: title || `블록 ${blockNumber}`,
        content,
        collapsible,
        collapsed: false
    };
    logBlocks.push(block);
    renderLogBlocks();
    updatePreview();
    if (!skipSave) saveToStorage();
    return block;
}

function removeLogBlock(id) {
    logBlocks = logBlocks.filter(b => b.id !== id);
    renderLogBlocks();
    updatePreview();
    saveToStorage();
}

function updateLogBlock(id, updates) {
    const block = logBlocks.find(b => b.id === id);
    if (block) {
        Object.assign(block, updates);
        updatePreview();
        saveToStorage();
    }
}

// ===== 드래그 앤 드롭 =====
let draggedBlockId = null;
let dragOverBlockId = null;

function setupBlockDragEvents(blockEl, blockId) {
    const dragHandle = blockEl.querySelector('.log-block-btn--drag');

    // 드래그 핸들에서만 드래그 시작 허용
    dragHandle.addEventListener('mousedown', () => {
        blockEl.setAttribute('draggable', 'true');
    });

    blockEl.addEventListener('dragstart', (e) => {
        draggedBlockId = blockId;
        blockEl.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', blockId.toString());
    });

    blockEl.addEventListener('dragend', () => {
        draggedBlockId = null;
        dragOverBlockId = null;
        blockEl.classList.remove('dragging');
        document.querySelectorAll('.log-block').forEach(el => {
            el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        });
    });

    blockEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (draggedBlockId === null || draggedBlockId === blockId) return;

        const rect = blockEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const isAbove = e.clientY < midY;

        blockEl.classList.remove('drag-over-top', 'drag-over-bottom');
        blockEl.classList.add(isAbove ? 'drag-over-top' : 'drag-over-bottom');
        dragOverBlockId = blockId;
    });

    blockEl.addEventListener('dragleave', () => {
        blockEl.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    blockEl.addEventListener('drop', (e) => {
        e.preventDefault();
        if (draggedBlockId === null || draggedBlockId === blockId) return;

        const rect = blockEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const isAbove = e.clientY < midY;

        // 블록 순서 재배치
        const draggedIndex = logBlocks.findIndex(b => b.id === draggedBlockId);
        const targetIndex = logBlocks.findIndex(b => b.id === blockId);

        if (draggedIndex !== -1 && targetIndex !== -1) {
            const [draggedBlock] = logBlocks.splice(draggedIndex, 1);
            let insertIndex = targetIndex;

            // 드래그된 블록이 위에서 왔으면 인덱스 조정
            if (draggedIndex < targetIndex) {
                insertIndex = isAbove ? targetIndex - 1 : targetIndex;
            } else {
                insertIndex = isAbove ? targetIndex : targetIndex + 1;
            }

            logBlocks.splice(insertIndex, 0, draggedBlock);
            renderLogBlocks();
            updatePreview();
            saveToStorage();
        }

        blockEl.classList.remove('drag-over-top', 'drag-over-bottom');
    });
}

function renderLogBlocks() {
    if (!logBlocksContainer) return;

    logBlocksContainer.innerHTML = logBlocks.map(block => {
        // content를 contenteditable에 맞게 HTML로 변환
        const contentHtml = formatContentForEditable(block.content);
        return `
        <div class="log-block ${block.collapsed ? 'collapsed' : ''}" data-block-id="${block.id}" draggable="true">
            <div class="log-block-header">
                <button type="button" class="log-block-btn log-block-btn--drag" title="드래그하여 순서 변경">☰</button>
                <button type="button" class="log-block-btn log-block-btn--collapse ${block.collapsed ? 'collapsed' : ''}" title="접기/펼치기">
                    <svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
                </button>
                <input type="text" class="log-block-title" value="${escapeAttr(block.title)}" placeholder="블록 제목">
                <div class="log-block-actions">
                    <button type="button" class="log-block-btn log-block-btn--delete" title="삭제">✕</button>
                </div>
            </div>
            <div class="log-block-textarea" contenteditable="true" data-placeholder="채팅 로그를 붙여넣으세요...">${contentHtml}</div>
            <div class="log-block-options">
                <label class="log-block-option">
                    <input type="checkbox" ${block.collapsible ? 'checked' : ''} data-option="collapsible">
                    <span>접기/펼치기 사용</span>
                </label>
            </div>
        </div>
    `}).join('');

    // 이벤트 리스너 연결
    logBlocksContainer.querySelectorAll('.log-block').forEach(blockEl => {
        const blockId = parseInt(blockEl.dataset.blockId);

        // 드래그 앤 드롭 이벤트
        setupBlockDragEvents(blockEl, blockId);

        // 콘텐츠 영역 (contenteditable)
        const contentEl = blockEl.querySelector('.log-block-textarea');

        // 입력 이벤트
        contentEl.addEventListener('input', (e) => {
            updateLogBlock(blockId, { content: getContentEditableContent(contentEl) });
        });

        // 붙여넣기 이벤트 (이미지 처리)
        contentEl.addEventListener('paste', async (e) => {
            const handled = await handlePasteWithImages(e, blockId);
            if (handled) {
                // 약간의 딜레이 후 저장 (DOM 업데이트 대기)
                setTimeout(() => {
                    updateLogBlock(blockId, { content: getContentEditableContent(contentEl) });
                }, 100);
            }
        });

        // 제목
        const titleInput = blockEl.querySelector('.log-block-title');
        titleInput.addEventListener('input', (e) => {
            updateLogBlock(blockId, { title: e.target.value });
        });

        // 접기/펼치기 버튼
        const collapseBtn = blockEl.querySelector('.log-block-btn--collapse');
        collapseBtn.addEventListener('click', () => {
            const block = logBlocks.find(b => b.id === blockId);
            if (block) {
                block.collapsed = !block.collapsed;
                renderLogBlocks();
            }
        });

        // 삭제 버튼
        const deleteBtn = blockEl.querySelector('.log-block-btn--delete');
        deleteBtn.addEventListener('click', () => {
            if (logBlocks.length > 1 || confirm('마지막 블록을 삭제하시겠습니까?')) {
                removeLogBlock(blockId);
            }
        });

        // 체크박스 옵션
        blockEl.querySelectorAll('[data-option]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const option = e.target.dataset.option;
                updateLogBlock(blockId, { [option]: e.target.checked });
            });
        });
    });
}

// ===== 설정 상태 =====
const settings = {
    // 캐릭터 정보
    logTitle: "",
    charName: "",
    charLink: "",
    userName: "",
    aiModel: "",
    promptName: "",
    subModel: "",
    // 스타일
    bgColor: "#ffffff",
    textColor: "#18181b",
    charColor: "#18181b",
    userColor: "#71717a",
    boldColor: "#dc2626",
    italicColor: "#6366f1",
    dialogueColor: "#059669",
    dialogueBgColor: "#ecfdf5",
    // 말풍선 색상
    aiBubbleColor: "#f4f4f5",
    userBubbleColor: "#dbeafe",
    fontFamily: "Pretendard, sans-serif",
    fontSize: 16,
    fontWeight: 400,
    containerWidth: 800,
    containerPadding: 2,
    borderRadius: 16,
    bubbleRadius: 16,
    bubblePadding: 1,
    bubbleMaxWidth: 85,
    bubbleGap: 1,
    blockGap: 1.5,
    lineHeight: 1.8,
    letterSpacing: 0,
    paragraphSpacing: 1.2,
    // 헤더 정렬
    headerAlign: "left",
    logTitleSize: 1.8,
    // 테두리 & 그림자
    borderWidth: 0,
    borderColor: "#e4e4e7",
    borderStyle: "solid",
    boxShadow: true,
    shadowIntensity: 30,
    // 배경 그라데이션
    bgGradient: false,
    bgGradientColor: "#e0e7ff",
    bgGradientDirection: "to bottom right",
    // 텍스트 정렬
    textAlign: "justify",
    // 뱃지 색상 & 스타일
    badgeModelColor: "#18181b",
    badgePromptColor: "#71717a",
    badgeSubColor: "#a1a1aa",
    badgeRadius: 20,
    badgeStyle: "filled",
    // 네임태그
    nametagFontSize: 0.75,
    // 말풍선 테두리
    bubbleBorder: false,
    bubbleBorderWidth: 2,
    bubbleBorderColor: "#6366f1",
    bubbleBorderLeftOnly: false,
    // 이미지 설정
    imageMaxWidth: 500,
    imageMargin: 0.5,
    imageBorderRadius: 8,
    imageAlign: "center",
    imageBorderWidth: 0,
    imageBorderColor: "#e5e5e5",
    imageShadow: "none",
    // 커스텀 옵션
    showNametag: true,
};

// 테마 프리셋 정의
const themePresets = {
    // Light Themes
    "light-pure": {
        bgColor: "#ffffff", textColor: "#171717", charColor: "#171717",
        boldColor: "#ef4444", italicColor: "#6366f1", dialogueColor: "#059669", dialogueBgColor: "#f0fdf4",
        badgeModelColor: "#171717", badgePromptColor: "#737373", badgeSubColor: "#a3a3a3",
        borderColor: "#e5e5e5",
        aiBubbleColor: "#f5f5f5", userBubbleColor: "#e0f2fe",
        bubbleBorderColor: "#6366f1", bgGradientColor: "#f5f5f5"
    },
    "light-peach": {
        bgColor: "#fff5f5", textColor: "#4c0519", charColor: "#be123c",
        boldColor: "#e11d48", italicColor: "#fb7185", dialogueColor: "#9f1239", dialogueBgColor: "#ffe4e6",
        badgeModelColor: "#be123c", badgePromptColor: "#fb7185", badgeSubColor: "#fda4af",
        borderColor: "#fecdd3",
        aiBubbleColor: "#ffe4e6", userBubbleColor: "#fecdd3",
        bubbleBorderColor: "#fb7185", bgGradientColor: "#ffe4e6"
    },
    "light-mint": {
        bgColor: "#f0fdfa", textColor: "#134e4a", charColor: "#0d9488",
        boldColor: "#0f766e", italicColor: "#2dd4bf", dialogueColor: "#115e59", dialogueBgColor: "#ccfbf1",
        badgeModelColor: "#0d9488", badgePromptColor: "#5eead4", badgeSubColor: "#99f6e4",
        borderColor: "#99f6e4",
        aiBubbleColor: "#ccfbf1", userBubbleColor: "#99f6e4",
        bubbleBorderColor: "#2dd4bf", bgGradientColor: "#ccfbf1"
    },
    "light-sky": {
        bgColor: "#f0f9ff", textColor: "#0c4a6e", charColor: "#0284c7",
        boldColor: "#0369a1", italicColor: "#38bdf8", dialogueColor: "#075985", dialogueBgColor: "#e0f2fe",
        badgeModelColor: "#0284c7", badgePromptColor: "#38bdf8", badgeSubColor: "#7dd3fc",
        borderColor: "#bae6fd",
        aiBubbleColor: "#e0f2fe", userBubbleColor: "#bae6fd",
        bubbleBorderColor: "#38bdf8", bgGradientColor: "#e0f2fe"
    },
    "light-lilac": {
        bgColor: "#faf5ff", textColor: "#4c1d95", charColor: "#7c3aed",
        boldColor: "#6d28d9", italicColor: "#a78bfa", dialogueColor: "#5b21b6", dialogueBgColor: "#ede9fe",
        badgeModelColor: "#7c3aed", badgePromptColor: "#a78bfa", badgeSubColor: "#c4b5fd",
        borderColor: "#ddd6fe",
        aiBubbleColor: "#ede9fe", userBubbleColor: "#ddd6fe",
        bubbleBorderColor: "#a78bfa", bgGradientColor: "#ede9fe"
    },
    // Dark Themes
    "dark-space": {
        bgColor: "#0f172a", textColor: "#f8fafc", charColor: "#94a3b8",
        boldColor: "#38bdf8", italicColor: "#818cf8", dialogueColor: "#22d3ee", dialogueBgColor: "#1e293b",
        badgeModelColor: "#334155", badgePromptColor: "#475569", badgeSubColor: "#64748b",
        borderColor: "#1e293b",
        aiBubbleColor: "#1e293b", userBubbleColor: "#334155",
        bubbleBorderColor: "#818cf8", bgGradientColor: "#1e293b"
    },
    "dark-charcoal": {
        bgColor: "#18181b", textColor: "#fafafa", charColor: "#fbbf24",
        boldColor: "#f59e0b", italicColor: "#fbbf24", dialogueColor: "#fb923c", dialogueBgColor: "#27272a",
        badgeModelColor: "#d97706", badgePromptColor: "#f59e0b", badgeSubColor: "#fbbf24",
        borderColor: "#27272a",
        aiBubbleColor: "#27272a", userBubbleColor: "#3f3f46",
        bubbleBorderColor: "#fbbf24", bgGradientColor: "#27272a"
    },
    "dark-forest": {
        bgColor: "#052e16", textColor: "#f0fdf4", charColor: "#4ade80",
        boldColor: "#22c55e", italicColor: "#86efac", dialogueColor: "#4ade80", dialogueBgColor: "#14532d",
        badgeModelColor: "#15803d", badgePromptColor: "#22c55e", badgeSubColor: "#4ade80",
        borderColor: "#14532d",
        aiBubbleColor: "#14532d", userBubbleColor: "#166534",
        bubbleBorderColor: "#4ade80", bgGradientColor: "#14532d"
    },
    "dark-navy": {
        bgColor: "#172554", textColor: "#eff6ff", charColor: "#60a5fa",
        boldColor: "#3b82f6", italicColor: "#93c5fd", dialogueColor: "#60a5fa", dialogueBgColor: "#1e3a8a",
        badgeModelColor: "#2563eb", badgePromptColor: "#3b82f6", badgeSubColor: "#60a5fa",
        borderColor: "#1e3a8a",
        aiBubbleColor: "#1e3a8a", userBubbleColor: "#1e40af",
        bubbleBorderColor: "#60a5fa", bgGradientColor: "#1e3a8a"
    },
    "dark-cyber": {
        bgColor: "#09090b", textColor: "#fdf4ff", charColor: "#d946ef",
        boldColor: "#e879f9", italicColor: "#f0abfc", dialogueColor: "#c026d3", dialogueBgColor: "#2a0a2e",
        badgeModelColor: "#a21caf", badgePromptColor: "#c026d3", badgeSubColor: "#e879f9",
        borderColor: "#27272a",
        aiBubbleColor: "#18181b", userBubbleColor: "#2a0a2e",
        bubbleBorderColor: "#d946ef", bgGradientColor: "#2a0a2e"
    },
    // Special Themes
    "special-sepia": {
        bgColor: "#f5f0e6", textColor: "#3d3020", charColor: "#6b5a3e",
        boldColor: "#8b6914", italicColor: "#a67c52", dialogueColor: "#5c4d3c", dialogueBgColor: "#ebe3d3",
        badgeModelColor: "#6b5a3e", badgePromptColor: "#8b7355", badgeSubColor: "#a69076",
        borderColor: "#d4c9b5",
        aiBubbleColor: "#ebe3d3", userBubbleColor: "#e0d5c1",
        bubbleBorderColor: "#a67c52", bgGradientColor: "#ebe3d3"
    },
    "special-noir": {
        bgColor: "#1a1a1a", textColor: "#c0c0c0", charColor: "#e0e0e0",
        boldColor: "#ffffff", italicColor: "#909090", dialogueColor: "#d0d0d0", dialogueBgColor: "#2a2a2a",
        badgeModelColor: "#505050", badgePromptColor: "#707070", badgeSubColor: "#808080",
        borderColor: "#333333",
        aiBubbleColor: "#252525", userBubbleColor: "#303030",
        bubbleBorderColor: "#606060", bgGradientColor: "#0d0d0d"
    },
    "special-neon": {
        bgColor: "#0a0a12", textColor: "#e0e0ff", charColor: "#00ffff",
        boldColor: "#ff00ff", italicColor: "#00ff88", dialogueColor: "#ffff00", dialogueBgColor: "#1a1a2e",
        badgeModelColor: "#ff0080", badgePromptColor: "#00ffff", badgeSubColor: "#80ff00",
        borderColor: "#2a2a4e",
        aiBubbleColor: "#12121f", userBubbleColor: "#1a1a2e",
        bubbleBorderColor: "#ff00ff", bgGradientColor: "#0f0f1a"
    }
};

// 색상 밝기 조절 헬퍼 (상단 이동)
function adjustColor(hex, amount) {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
    const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// ===== 마크다운 파싱 =====
function parseMarkdown(text) {
    // 플레이스홀더로 치환하여 충돌 방지
    const placeholders = [];
    let placeholderIndex = 0;

    // img 태그를 먼저 플레이스홀더로 대체 (escape 되지 않도록)
    let result = text.replace(/<img\s+src="([^"]+)"[^>]*>/gi, (match, src) => {
        const placeholder = `__IMG_${placeholderIndex++}__`;
        placeholders.push({
            placeholder,
            html: `<div style="${getImageWrapperStyle()}"><img src="${src}" style="${getImageStyle()}"></div>`
        });
        return placeholder;
    });

    // HTML 이스케이프 (img 제외)
    result = result
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // 볼드 (**text**) - 먼저 처리
    result = result.replace(/\*\*(.+?)\*\*/g, (match, content) => {
        const placeholder = `__BOLD_${placeholderIndex++}__`;
        placeholders.push({
            placeholder,
            html: `<strong style="font-weight: bold; color: ${settings.boldColor};">${content}</strong>`
        });
        return placeholder;
    });

    // 이탤릭 (*text*) - 볼드 처리 후
    result = result.replace(/\*([^*]+?)\*/g, (match, content) => {
        const placeholder = `__ITALIC_${placeholderIndex++}__`;
        placeholders.push({
            placeholder,
            html: `<em style="font-style: italic; color: ${settings.italicColor};">${content}</em>`
        });
        return placeholder;
    });

    // 대사 ("text") - 영문 큰따옴표
    result = result.replace(/"([^"]+)"/g, (match, content) => {
        const placeholder = `__DIALOGUE_${placeholderIndex++}__`;
        // 플레이스홀더가 있으면 먼저 복원
        let processedContent = content;
        placeholders.forEach(p => {
            processedContent = processedContent.replace(p.placeholder, p.html);
        });
        placeholders.push({
            placeholder,
            html: `<span style="color: ${settings.dialogueColor}; background: ${settings.dialogueBgColor}; padding: 0.1em 0.4em; border-radius: 4px;">"${processedContent}"</span>`
        });
        return placeholder;
    });

    // 대사 ("text") - 한글 큰따옴표
    result = result.replace(/\u201C([^\u201D]+)\u201D/g, (match, content) => {
        const placeholder = `__DIALOGUE_KR_${placeholderIndex++}__`;
        let processedContent = content;
        placeholders.forEach(p => {
            processedContent = processedContent.replace(p.placeholder, p.html);
        });
        placeholders.push({
            placeholder,
            html: `<span style="color: ${settings.dialogueColor}; background: ${settings.dialogueBgColor}; padding: 0.1em 0.4em; border-radius: 4px;">\u201C${processedContent}\u201D</span>`
        });
        return placeholder;
    });

    // 플레이스홀더 복원
    placeholders.forEach(p => {
        result = result.replace(p.placeholder, p.html);
    });

    return result;
}

// 문단 스타일 생성
function getParagraphStyle() {
    return `margin: 0 0 ${settings.paragraphSpacing}em 0; text-align: ${settings.textAlign}; word-break: keep-all;`;
}

// HTML 블록 콘텐츠 파싱 (이미지 + 텍스트 혼합 처리)
function parseBlockContent(htmlContent) {
    // HTML이 아니면 (순수 텍스트) 기존 방식으로 처리
    if (!htmlContent.includes('<')) {
        const lines = htmlContent.split(/\r?\n/).filter(line => line.trim() !== '');
        return lines.map(line => {
            const parsed = parseLine(line);
            return generateBubbleHTML(parsed, true);
        }).join('\n');
    }

    // HTML 파싱
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
    const container = doc.body.firstChild;

    const outputParts = [];

    // 재귀적으로 노드 처리
    function processNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            // 텍스트 노드: 라인별로 파싱
            const text = node.textContent;
            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
            lines.forEach(line => {
                const parsed = parseLine(line);
                outputParts.push(generateBubbleHTML(parsed, true));
            });
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();

            if (tag === 'img') {
                // 이미지: background-image div로 출력 (아카라이브 호환)
                outputParts.push(`    ${getImageDivHTML(node.src)}`);
            } else if (tag === 'br') {
                // br은 무시 (줄바꿈은 텍스트에서 처리)
            } else if (tag === 'div' || tag === 'p') {
                // div, p: 자식 처리
                node.childNodes.forEach(child => processNode(child));
            } else {
                // 기타 태그: 내부 텍스트 추출하여 처리
                const text = node.textContent;
                const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
                lines.forEach(line => {
                    const parsed = parseLine(line);
                    outputParts.push(generateBubbleHTML(parsed, true));
                });
            }
        }
    }

    container.childNodes.forEach(child => processNode(child));

    return outputParts.join('\n');
}

// 라인 파싱 (마커 감지)
function parseLine(line) {
    const trimmed = line.trim();

    // << 마커: User 대사 (왼쪽 방향 화살표 = 오른쪽 정렬)
    if (trimmed.startsWith('<<')) {
        return {
            type: 'user',
            content: trimmed.substring(2).trim()
        };
    }

    // >> 마커: AI 대사 (오른쪽 방향 화살표 = 왼쪽 정렬)
    if (trimmed.startsWith('>>')) {
        return {
            type: 'ai',
            content: trimmed.substring(2).trim()
        };
    }

    // 마커 없음: 일반 나레이션
    return {
        type: 'narration',
        content: trimmed
    };
}

// 배경색에 어울리는 텍스트 색상 계산
function getContrastTextColor(bgColor) {
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    // 밝기 계산 (YIQ 공식)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#1a1a1a' : '#f5f5f5';
}

// 그림자 스타일 생성
function getImageShadowStyle() {
    switch (settings.imageShadow) {
        case 'soft':
            return 'box-shadow: 0 4px 12px rgba(0,0,0,0.1);';
        case 'medium':
            return 'box-shadow: 0 6px 20px rgba(0,0,0,0.15);';
        case 'strong':
            return 'box-shadow: 0 8px 30px rgba(0,0,0,0.25);';
        case 'glow':
            return `box-shadow: 0 0 20px ${settings.imageBorderColor}80;`;
        default:
            return '';
    }
}

// 이미지 HTML 생성 (아카라이브 호환 - 단순 img + div 래퍼)
function getImageDivHTML(src) {
    // 정렬에 따른 마진
    let marginStyle = `margin: ${settings.imageMargin}em auto;`; // 기본 center
    if (settings.imageAlign === 'left') {
        marginStyle = `margin: ${settings.imageMargin}em auto ${settings.imageMargin}em 0;`;
    } else if (settings.imageAlign === 'right') {
        marginStyle = `margin: ${settings.imageMargin}em 0 ${settings.imageMargin}em auto;`;
    }

    // 테두리 스타일
    let borderStyle = '';
    if (settings.imageBorderWidth > 0) {
        borderStyle = `border: ${settings.imageBorderWidth}px solid ${settings.imageBorderColor};`;
    }

    // 그림자 스타일
    const shadowStyle = getImageShadowStyle();

    // div: 정렬, 마진, 너비
    const divStyle = `max-width: ${settings.imageMaxWidth}px; ${marginStyle} text-align: center;`;
    // img: border-radius, 테두리, 그림자
    const imgStyle = `max-width: 100%; border-radius: ${settings.imageBorderRadius}px; ${borderStyle} ${shadowStyle}`;

    return `<div style="${divStyle}"><img src="${src}" style="${imgStyle}"></div>`;
}

// 미리보기용 이미지 스타일 (img 태그 사용)
function getImageWrapperStyle() {
    // 정렬에 따른 스타일
    let alignStyle = 'text-align: left;';
    if (settings.imageAlign === 'center') {
        alignStyle = 'text-align: center;';
    } else if (settings.imageAlign === 'right') {
        alignStyle = 'text-align: right;';
    }

    return `${alignStyle} margin: ${settings.imageMargin}em 0;`;
}

function getImageStyle() {
    // 테두리 스타일
    let borderStyle = '';
    if (settings.imageBorderWidth > 0) {
        borderStyle = `border: ${settings.imageBorderWidth}px solid ${settings.imageBorderColor};`;
    }

    // 그림자 스타일
    const shadowStyle = getImageShadowStyle();

    return `max-width: ${settings.imageMaxWidth}px; height: auto; border-radius: ${settings.imageBorderRadius}px; ${borderStyle} ${shadowStyle}`;
}

// 이미지 HTML 생성 (래퍼 div 포함)
function getImageHTML(src) {
    return `<div style="${getImageWrapperStyle()}"><img src="${src}" style="${getImageStyle()}"></div>`;
}

// 말풍선용 마크다운 파싱 (대사 스타일 제외)
function parseMarkdownForBubble(text) {
    const placeholders = [];
    let placeholderIndex = 0;

    // img 태그를 먼저 플레이스홀더로 대체 (escape 되지 않도록)
    let result = text.replace(/<img\s+src="([^"]+)"[^>]*>/gi, (match, src) => {
        const placeholder = `__IMG_${placeholderIndex++}__`;
        placeholders.push({
            placeholder,
            html: `<div style="${getImageWrapperStyle()}"><img src="${src}" style="${getImageStyle()}"></div>`
        });
        return placeholder;
    });

    // HTML 이스케이프 (img 제외)
    result = result
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // 볼드 (**text**)
    result = result.replace(/\*\*(.+?)\*\*/g, (match, content) => {
        const placeholder = `__BOLD_${placeholderIndex++}__`;
        placeholders.push({
            placeholder,
            html: `<strong style="font-weight: bold;">${content}</strong>`
        });
        return placeholder;
    });

    // 이탤릭 (*text*)
    result = result.replace(/\*([^*]+?)\*/g, (match, content) => {
        const placeholder = `__ITALIC_${placeholderIndex++}__`;
        placeholders.push({
            placeholder,
            html: `<em style="font-style: italic;">${content}</em>`
        });
        return placeholder;
    });

    // 대사는 스타일 없이 그냥 따옴표만 유지
    // (말풍선에서는 대사 하이라이트 안 함)

    // 플레이스홀더 복원
    placeholders.forEach(p => {
        result = result.replace(p.placeholder, p.html);
    });

    return result;
}

// 말풍선 HTML 생성
function generateBubbleHTML(parsed, isForCode = false) {
    const indent = isForCode ? '    ' : '';
    const bubblePadding = `${settings.bubblePadding}em ${settings.bubblePadding * 1.25}em`;
    const bubbleRadius = `${settings.bubbleRadius}px`;
    const bubbleMaxWidth = `${settings.bubbleMaxWidth}%`;
    const bubbleMargin = `0 0 ${settings.bubbleGap}em 0`;

    // 말풍선 테두리 스타일
    let bubbleBorderStyle = "";
    if (settings.bubbleBorder) {
        if (settings.bubbleBorderLeftOnly) {
            bubbleBorderStyle = `border-left: ${settings.bubbleBorderWidth}px solid ${settings.bubbleBorderColor};`;
        } else {
            bubbleBorderStyle = `border: ${settings.bubbleBorderWidth}px solid ${settings.bubbleBorderColor};`;
        }
    }

    if (parsed.type === 'ai') {
        const textColor = getContrastTextColor(settings.aiBubbleColor);
        const content = parseMarkdownForBubble(parsed.content);
        const bubbleStyle = `display: block; margin: ${bubbleMargin}; padding: ${bubblePadding}; background: ${settings.aiBubbleColor}; color: ${textColor}; border-radius: ${bubbleRadius} ${bubbleRadius} ${bubbleRadius} 0.25em; max-width: ${bubbleMaxWidth}; text-align: left; word-break: keep-all; ${bubbleBorderStyle}`;
        const nametagStyle = `display: block; margin-bottom: 0.375em; font-size: ${settings.nametagFontSize}em; font-weight: 600; opacity: 0.7;`;
        const charName = settings.charName || 'AI';

        if (settings.showNametag) {
            return `${indent}<div style="${bubbleStyle}"><span style="${nametagStyle}">${escapeHTMLContent(charName)}</span>${content}</div>`;
        } else {
            return `${indent}<div style="${bubbleStyle}">${content}</div>`;
        }
    } else if (parsed.type === 'user') {
        const textColor = getContrastTextColor(settings.userBubbleColor);
        const content = parseMarkdownForBubble(parsed.content);
        const wrapperStyle = `display: block; text-align: right; margin: ${bubbleMargin};`;
        const userBubbleBorderStyle = settings.bubbleBorder
            ? (settings.bubbleBorderLeftOnly
                ? `border-right: ${settings.bubbleBorderWidth}px solid ${settings.bubbleBorderColor};`
                : `border: ${settings.bubbleBorderWidth}px solid ${settings.bubbleBorderColor};`)
            : "";
        const bubbleStyle = `display: inline-block; padding: ${bubblePadding}; background: ${settings.userBubbleColor}; color: ${textColor}; border-radius: ${bubbleRadius} ${bubbleRadius} 0.25em ${bubbleRadius}; max-width: ${bubbleMaxWidth}; text-align: left; word-break: keep-all; ${userBubbleBorderStyle}`;
        const nametagStyle = `display: block; margin-bottom: 0.375em; font-size: ${settings.nametagFontSize}em; font-weight: 600; opacity: 0.7; text-align: right;`;
        const userName = settings.userName || 'User';

        if (settings.showNametag) {
            return `${indent}<div style="${wrapperStyle}"><div style="${bubbleStyle}"><span style="${nametagStyle}">${escapeHTMLContent(userName)}</span>${content}</div></div>`;
        } else {
            return `${indent}<div style="${wrapperStyle}"><div style="${bubbleStyle}">${content}</div></div>`;
        }
    } else {
        // 나레이션 - 기존 parseMarkdown 사용 (대사 스타일 적용)
        const content = parseMarkdown(parsed.content);
        const pStyle = getParagraphStyle();
        return `${indent}<p style="${pStyle}">${content}</p>`;
    }
}

// ===== HTML 생성 (인라인 스타일 div) =====
function generateHTML() {
    // 모든 블록의 내용 수집 (HTML에서 텍스트 추출하여 비어있는지 확인)
    const blocksWithContent = logBlocks.filter(b => {
        const text = b.content.replace(/<[^>]*>/g, '').trim();
        return text !== '' || b.content.includes('<img');
    });

    if (blocksWithContent.length === 0) {
        return "";
    }

    // 뱃지 스타일 생성 함수
    function getBadgeStyle(color, isSubModel = false) {
        const baseStyle = `display: inline-block; margin: 0 8px 8px 0; padding: 6px 12px; border-radius: ${settings.badgeRadius}px; font-size: 0.75em; font-weight: 600; line-height: 1.2; text-align: center; box-sizing: border-box;`;

        if (settings.badgeStyle === "filled") {
            return `${baseStyle} background: ${color}; color: #fff;`;
        } else if (settings.badgeStyle === "outline") {
            return `${baseStyle} background: transparent; border: 1px solid ${color}; color: ${color};`;
        } else { // ghost
            return `${baseStyle} background: ${color}20; color: ${color};`;
        }
    }

    // 헤더 HTML 생성
    let headerHTML = "";
    const hasHeader = settings.logTitle || settings.charName || settings.aiModel || settings.promptName || settings.subModel;

    if (hasHeader) {
        const headerBgLight = adjustColor(settings.bgColor, 12);
        const headerBgDark = adjustColor(settings.bgColor, 6);
        const headerStyle = `margin-bottom: 1.5em; padding: 1.5em; background: linear-gradient(135deg, ${headerBgLight} 0%, ${headerBgDark} 100%); border-radius: 16px; border: 1px solid ${adjustColor(settings.bgColor, 25)}40;`;
        const headerTextAlign = settings.headerAlign;
        const justifyContent = headerTextAlign === 'center' ? 'center' : headerTextAlign === 'right' ? 'flex-end' : 'flex-start';

        // 캐릭터 이름 (상단 뱃지)
        let charBadgeHTML = "";
        if (settings.charName) {
            const charBadgeStyle = `display: inline-block; padding: 6px 14px; background: ${settings.charColor}; color: ${getContrastTextColor(settings.charColor)}; border-radius: ${settings.badgeRadius}px; font-size: 0.8em; font-weight: 700; letter-spacing: 0.02em;`;
            if (settings.charLink) {
                charBadgeHTML = `    <div style="display: flex; justify-content: ${justifyContent}; margin-bottom: 0.75em;"><a href="${settings.charLink}" target="_blank" style="text-decoration: none;"><span style="${charBadgeStyle}">${settings.charName}</span></a></div>\n`;
            } else {
                charBadgeHTML = `    <div style="display: flex; justify-content: ${justifyContent}; margin-bottom: 0.75em;"><span style="${charBadgeStyle}">${settings.charName}</span></div>\n`;
            }
        }

        // 로그 제목 (크게 중앙)
        let logTitleHTML = "";
        if (settings.logTitle) {
            const logTitleStyle = `margin: 0; font-size: ${settings.logTitleSize}em; font-weight: 800; color: ${settings.textColor}; letter-spacing: -0.02em; text-align: ${headerTextAlign};`;
            logTitleHTML = `    <p style="${logTitleStyle}">${settings.logTitle}</p>\n`;
        }

        // 태그들 (모델, 프롬프트, 보조)
        let tagsHTML = "";
        const tags = [];

        if (settings.aiModel) {
            tags.push(`<span style="${getBadgeStyle(settings.badgeModelColor)}">${settings.aiModel}</span>`);
        }
        if (settings.promptName) {
            tags.push(`<span style="${getBadgeStyle(settings.badgePromptColor)}">${settings.promptName}</span>`);
        }
        if (settings.subModel) {
            // 보조 모델은 항상 outline 스타일
            const subBadgeStyle = `display: inline-block; margin: 0 8px 8px 0; padding: 5px 11px; background: transparent; border: 1px solid ${settings.badgeSubColor}; border-radius: ${settings.badgeRadius}px; font-size: 0.75em; font-weight: 600; color: ${settings.badgeSubColor}; line-height: 1.2; text-align: center; box-sizing: border-box;`;
            tags.push(`<span style="${subBadgeStyle}">${settings.subModel}</span>`);
        }

        if (tags.length > 0) {
            const marginTop = (settings.logTitle || settings.charName) ? "margin-top: 1em;" : "";
            tagsHTML = `    <div style="${marginTop} display: flex; flex-wrap: wrap; justify-content: ${justifyContent};">${tags.join("")}</div>\n`;
        }

        headerHTML = `  <div style="${headerStyle}">\n${charBadgeHTML}${logTitleHTML}${tagsHTML}  </div>\n`;
    }

    // 블록별 HTML 생성
    const blocksHTML = blocksWithContent.map((block, index) => {
        // HTML 콘텐츠에서 라인별로 처리 (이미지 포함)
        const linesHTML = parseBlockContent(block.content);

        // 접기/펼치기 사용 여부
        if (block.collapsible) {
            const sectionStyle = `margin: ${index > 0 ? settings.blockGap + 'em' : '0'} 0; border: 1px solid ${adjustColor(settings.bgColor, 30)}; border-radius: 12px;`;
            const summaryStyle = `padding: 1em 1.25em; background: ${adjustColor(settings.bgColor, 10)}; border-radius: 11px; cursor: pointer; font-weight: 500; font-size: 1em; color: ${settings.charColor}; list-style: none; display: flex; align-items: center; gap: 0.5em;`;
            const contentStyle = `padding: 1.25em;`;

            return `  <details open style="${sectionStyle}">
    <summary style="${summaryStyle}">▼ ${escapeHTMLContent(block.title)}</summary>
    <div style="${contentStyle}">
${linesHTML}
    </div>
  </details>`;
        } else {
            // 블록이 여러 개일 때만 섹션 구분 추가
            if (blocksWithContent.length > 1) {
                const sectionStyle = `margin: ${index > 0 ? settings.blockGap + 'em' : '0'} 0 0 0; ${index > 0 ? `padding-top: ${settings.blockGap}em; border-top: 1px solid ${adjustColor(settings.bgColor, 25)};` : ''}`;
                const labelStyle = `margin: 0 0 1em 0; font-size: 0.75em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: ${adjustColor(settings.textColor, -60)};`;

                return `  <div style="${sectionStyle}">
    <p style="${labelStyle}">${escapeHTMLContent(block.title)}</p>
${linesHTML}
  </div>`;
            } else {
                return linesHTML;
            }
        }
    }).join("\n");

    // 컨테이너 스타일
    const containerStyleParts = [
        `max-width: ${settings.containerWidth}px`,
        `margin: 0 auto`,
        `padding: ${settings.containerPadding}em`,
        `color: ${settings.textColor}`,
        `font-family: ${settings.fontFamily}`,
        `font-size: ${settings.fontSize}px`,
        `font-weight: ${settings.fontWeight}`,
        `line-height: ${settings.lineHeight}`,
        `letter-spacing: ${settings.letterSpacing}em`,
        `border-radius: ${settings.borderRadius}px`,
        `box-sizing: border-box`,
    ];

    // 배경색 또는 그라데이션
    if (settings.bgGradient) {
        if (settings.bgGradientDirection === "radial") {
            containerStyleParts.push(`background: radial-gradient(circle, ${settings.bgColor} 0%, ${settings.bgGradientColor} 100%)`);
        } else {
            containerStyleParts.push(`background: linear-gradient(${settings.bgGradientDirection}, ${settings.bgColor} 0%, ${settings.bgGradientColor} 100%)`);
        }
    } else {
        containerStyleParts.push(`background: ${settings.bgColor}`);
    }

    // 테두리 추가
    if (settings.borderWidth > 0) {
        containerStyleParts.push(`border: ${settings.borderWidth}px ${settings.borderStyle} ${settings.borderColor}`);
    }

    // 그림자 추가
    if (settings.boxShadow) {
        const shadowOpacity = (settings.shadowIntensity / 100).toFixed(2);
        containerStyleParts.push(`box-shadow: 0 4px 24px rgba(0, 0, 0, ${shadowOpacity})`);
    }

    const containerStyle = containerStyleParts.join("; ");

    const html = `<div style="${containerStyle}">
${headerHTML}${blocksHTML}
</div>`;

    return html;
}

function escapeHTMLContent(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// ===== 미리보기 업데이트 =====
function updatePreview() {
    if (!previewEl) return;

    // 모든 블록의 내용 수집 (HTML에서 텍스트 추출하여 비어있는지 확인)
    const blocksWithContent = logBlocks.filter(b => {
        const text = b.content.replace(/<[^>]*>/g, '').trim();
        return text !== '' || b.content.includes('<img');
    });

    // 미리보기 스타일 적용 (컨테이너)
    previewEl.style.maxWidth = `${settings.containerWidth}px`;
    previewEl.style.margin = "0 auto";
    previewEl.style.padding = `${settings.containerPadding}em`;
    previewEl.style.color = settings.textColor;
    previewEl.style.fontFamily = settings.fontFamily.split(',')[0].replace(/['"]/g, ''); // 간단한 미리보기용
    previewEl.style.fontSize = `${settings.fontSize}px`;
    previewEl.style.fontWeight = settings.fontWeight;
    previewEl.style.lineHeight = settings.lineHeight;
    previewEl.style.letterSpacing = `${settings.letterSpacing}em`;
    previewEl.style.borderRadius = `${settings.borderRadius}px`;
    previewEl.style.boxSizing = "border-box";

    // 배경색 또는 그라데이션
    if (settings.bgGradient) {
        if (settings.bgGradientDirection === "radial") {
            previewEl.style.background = `radial-gradient(circle, ${settings.bgColor} 0%, ${settings.bgGradientColor} 100%)`;
        } else {
            previewEl.style.background = `linear-gradient(${settings.bgGradientDirection}, ${settings.bgColor} 0%, ${settings.bgGradientColor} 100%)`;
        }
    } else {
        previewEl.style.background = settings.bgColor;
    }

    // 테두리 적용
    if (settings.borderWidth > 0) {
        previewEl.style.border = `${settings.borderWidth}px ${settings.borderStyle} ${settings.borderColor}`;
    } else {
        previewEl.style.border = "none";
    }

    // 그림자 적용
    if (settings.boxShadow) {
        const shadowOpacity = (settings.shadowIntensity / 100).toFixed(2);
        previewEl.style.boxShadow = `0 4px 24px rgba(0, 0, 0, ${shadowOpacity})`;
    } else {
        previewEl.style.boxShadow = "none";
    }

    // 뱃지 스타일 생성 함수
    function getBadgeStyle(color) {
        const baseStyle = `display: inline-block; margin: 0 8px 8px 0; padding: 6px 12px; border-radius: ${settings.badgeRadius}px; font-size: 0.75em; font-weight: 600; line-height: 1.2; text-align: center; box-sizing: border-box;`;

        if (settings.badgeStyle === "filled") {
            return `${baseStyle} background: ${color}; color: #fff;`;
        } else if (settings.badgeStyle === "outline") {
            return `${baseStyle} background: transparent; border: 1px solid ${color}; color: ${color};`;
        } else { // ghost
            return `${baseStyle} background: ${color}20; color: ${color};`;
        }
    }

    if (blocksWithContent.length === 0) {
        previewEl.innerHTML = `<p class="placeholder-text">변환된 결과가 여기에 표시됩니다</p>`;
    } else {
        // 헤더 생성
        let headerHTML = "";
        const hasHeader = settings.logTitle || settings.charName || settings.aiModel || settings.promptName || settings.subModel;

        if (hasHeader) {
            const headerBgLight = adjustColor(settings.bgColor, 12);
            const headerBgDark = adjustColor(settings.bgColor, 6);
            const borderColor = adjustColor(settings.bgColor, 25);
            const headerTextAlign = settings.headerAlign;
            const justifyContent = headerTextAlign === 'center' ? 'center' : headerTextAlign === 'right' ? 'flex-end' : 'flex-start';

            // 캐릭터 이름 (상단 뼉지)
            let charBadgeHTML = "";
            if (settings.charName) {
                const charBadgeStyle = `display: inline-block; padding: 6px 14px; background: ${settings.charColor}; color: ${getContrastTextColor(settings.charColor)}; border-radius: ${settings.badgeRadius}px; font-size: 0.8em; font-weight: 700; letter-spacing: 0.02em;`;
                if (settings.charLink) {
                    charBadgeHTML = `<div style="display: flex; justify-content: ${justifyContent}; margin-bottom: 0.75em;"><a href="${settings.charLink}" target="_blank" style="text-decoration: none;"><span style="${charBadgeStyle}">${settings.charName}</span></a></div>`;
                } else {
                    charBadgeHTML = `<div style="display: flex; justify-content: ${justifyContent}; margin-bottom: 0.75em;"><span style="${charBadgeStyle}">${settings.charName}</span></div>`;
                }
            }

            // 로그 제목 (크게 중앙)
            let logTitleHTML = "";
            if (settings.logTitle) {
                logTitleHTML = `<p style="margin: 0; font-size: ${settings.logTitleSize}em; font-weight: 800; color: ${settings.textColor}; letter-spacing: -0.02em; text-align: ${headerTextAlign};">${settings.logTitle}</p>`;
            }

            // 태그들 (모델, 프롬프트, 보조모델)
            let tagsHTML = "";
            const tags = [];

            if (settings.aiModel) {
                tags.push(`<span style="${getBadgeStyle(settings.badgeModelColor)}">${settings.aiModel}</span>`);
            }
            if (settings.promptName) {
                tags.push(`<span style="${getBadgeStyle(settings.badgePromptColor)}">${settings.promptName}</span>`);
            }
            if (settings.subModel) {
                const subBadgeStyle = `display: inline-block; margin: 0 8px 8px 0; padding: 5px 11px; background: transparent; border: 1px solid ${settings.badgeSubColor}; border-radius: ${settings.badgeRadius}px; font-size: 0.75em; font-weight: 600; color: ${settings.badgeSubColor}; line-height: 1.2; text-align: center; box-sizing: border-box;`;
                tags.push(`<span style="${subBadgeStyle}">${settings.subModel}</span>`);
            }

            if (tags.length > 0) {
                const marginTop = (settings.logTitle || settings.charName) ? "margin-top: 1em;" : "";
                tagsHTML = `<div style="${marginTop} display: flex; flex-wrap: wrap; justify-content: ${justifyContent};">${tags.join("")}</div>`;
            }

            headerHTML = `<div style="margin-bottom: 1.5em; padding: 1.5em; background: linear-gradient(135deg, ${headerBgLight} 0%, ${headerBgDark} 100%); border-radius: 16px; border: 1px solid ${borderColor}40;">${charBadgeHTML}${logTitleHTML}${tagsHTML}</div>`;
        }

        // 블록별 HTML 생성
        const blocksHTML = blocksWithContent.map((block, index) => {
            const lines = block.content.split(/\r?\n/).filter((line) => line.trim() !== "");
            const linesHTML = lines.map((line) => {
                const parsed = parseLine(line);
                return generateBubbleHTML(parsed, false);
            }).join("");

            // 접기/펼치기 사용 여부
            if (block.collapsible) {
                const sectionStyle = `margin: ${index > 0 ? settings.blockGap + 'em' : '0'} 0; border: 1px solid ${adjustColor(settings.bgColor, 30)}; border-radius: 12px;`;
                const summaryStyle = `padding: 1em 1.25em; background: ${adjustColor(settings.bgColor, 10)}; border-radius: 11px; cursor: pointer; font-weight: 500; font-size: 1em; color: ${settings.charColor}; list-style: none; display: flex; align-items: center; gap: 0.5em;`;
                const contentStyle = `padding: 1.25em;`;

                return `<details open style="${sectionStyle}">
                    <summary style="${summaryStyle}">▼ ${escapeHTMLContent(block.title)}</summary>
                    <div style="${contentStyle}">${linesHTML}</div>
                </details>`;
            } else {
                // 블록이 여러 개일 때만 섹션 구분 추가
                if (blocksWithContent.length > 1) {
                    const sectionStyle = `margin: ${index > 0 ? settings.blockGap + 'em' : '0'} 0 0 0; ${index > 0 ? `padding-top: ${settings.blockGap}em; border-top: 1px solid ${adjustColor(settings.bgColor, 25)};` : ''}`;
                    const labelStyle = `margin: 0 0 1em 0; font-size: 0.75em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: ${adjustColor(settings.textColor, -60)};`;

                    return `<div style="${sectionStyle}">
                        <p style="${labelStyle}">${escapeHTMLContent(block.title)}</p>
                        ${linesHTML}
                    </div>`;
                } else {
                    return `<div>${linesHTML}</div>`;
                }
            }
        }).join("");

        previewEl.innerHTML = `${headerHTML}${blocksHTML}`;
    }

    // 코드 출력 업데이트
    const html = generateHTML();
    if (html) {
        codeOutputEl.innerHTML = `<code>${escapeHTML(html)}</code>`;
    } else {
        codeOutputEl.innerHTML = `<code class="placeholder-text">코드가 여기에 표시됩니다</code>`;
    }
}

// ===== 이벤트 리스너 설정 =====
if (previewEl) {
    updatePreview();
}

// ===== 탭 전환 =====
const tabBtns = document.querySelectorAll(".settings-tab");
const tabContents = document.querySelectorAll(".settings-content");

tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
        const tabId = btn.dataset.tab;

        tabBtns.forEach((b) => b.classList.remove("active"));
        tabContents.forEach((c) => c.classList.remove("active"));

        btn.classList.add("active");
        const tabContent = document.querySelector(`#tab-${tabId}`);
        if (tabContent) tabContent.classList.add("active");
    });
});

// ===== 설정 입력 동기화 =====
// 캐릭터 정보
const charInputs = {
    "log-title": "logTitle",
    "char-name": "charName",
    "char-link": "charLink",
    "user-name": "userName",
    "ai-model": "aiModel",
    "prompt-name": "promptName",
    "sub-model": "subModel",
};

Object.entries(charInputs).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener("input", (e) => {
            settings[key] = e.target.value;
            updatePreview();
            saveToStorage();
        });
    }
});

// 드롭다운 메뉴 설정
function setupDropdown(inputId, dropdownId, settingKey) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);

    if (!input || !dropdown) return;

    // 입력창 포커스 시 드롭다운 열기
    input.addEventListener("focus", () => {
        dropdown.classList.add("open");
    });

    // 입력창 blur 시 드롭다운 닫기 (약간의 딜레이)
    input.addEventListener("blur", () => {
        setTimeout(() => {
            dropdown.classList.remove("open");
        }, 150);
    });

    // 드롭다운 버튼 클릭 시
    dropdown.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => {
            const value = btn.dataset.value;
            input.value = value;
            settings[settingKey] = value;
            dropdown.classList.remove("open");
            updatePreview();
            saveToStorage();
        });
    });
}

setupDropdown("ai-model", "ai-model-dropdown", "aiModel");
setupDropdown("sub-model", "sub-model-dropdown", "subModel");

// 테마 프리셋 버튼
const themePresetBtns = document.querySelectorAll(".theme-preset");
themePresetBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        const themeName = btn.dataset.theme;
        const preset = themePresets[themeName];
        if (!preset) return;

        // 모든 버튼에서 active 제거 후 현재 버튼에 추가
        themePresetBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        // 프리셋 값 적용
        Object.entries(preset).forEach(([key, value]) => {
            settings[key] = value;
        });

        // UI 동기화
        syncUIFromSettings();
        updatePreview();
        saveToStorage();
    });
});

// UI 동기화 함수
function syncUIFromSettings() {
    // 색상 입력 동기화
    const colorMap = {
        "style-bg": "bgColor",
        "style-text": "textColor",
        "style-char": "charColor",
        "style-bold": "boldColor",
        "style-italic": "italicColor",
        "style-dialogue": "dialogueColor",
        "style-dialogue-bg": "dialogueBgColor",
        "style-ai-bubble": "aiBubbleColor",
        "style-user-bubble": "userBubbleColor",
        "style-badge-model": "badgeModelColor",
        "style-badge-prompt": "badgePromptColor",
        "style-badge-sub": "badgeSubColor",
        "style-border-color": "borderColor",
        "style-gradient-color": "bgGradientColor",
        "style-bubble-border-color": "bubbleBorderColor",
    };

    Object.entries(colorMap).forEach(([id, key]) => {
        const colorEl = document.getElementById(id);
        const textEl = document.getElementById(`${id}-text`);
        if (colorEl) colorEl.value = settings[key];
        if (textEl) textEl.value = settings[key];
    });
}

// 색상 입력 (color picker + text 동기화)
const colorInputs = [
    { colorId: "style-bg", textId: "style-bg-text", key: "bgColor" },
    { colorId: "style-text", textId: "style-text-text", key: "textColor" },
    { colorId: "style-char", textId: "style-char-text", key: "charColor" },
    { colorId: "style-bold", textId: "style-bold-text", key: "boldColor" },
    { colorId: "style-italic", textId: "style-italic-text", key: "italicColor" },
    { colorId: "style-dialogue", textId: "style-dialogue-text", key: "dialogueColor" },
    { colorId: "style-dialogue-bg", textId: "style-dialogue-bg-text", key: "dialogueBgColor" },
    { colorId: "style-ai-bubble", textId: "style-ai-bubble-text", key: "aiBubbleColor" },
    { colorId: "style-user-bubble", textId: "style-user-bubble-text", key: "userBubbleColor" },
    { colorId: "style-badge-model", textId: "style-badge-model-text", key: "badgeModelColor" },
    { colorId: "style-badge-prompt", textId: "style-badge-prompt-text", key: "badgePromptColor" },
    { colorId: "style-badge-sub", textId: "style-badge-sub-text", key: "badgeSubColor" },
    { colorId: "style-border-color", textId: "style-border-color-text", key: "borderColor" },
];

colorInputs.forEach(({ colorId, textId, key }) => {
    const colorEl = document.getElementById(colorId);
    const textEl = document.getElementById(textId);

    if (colorEl && textEl) {
        colorEl.addEventListener("input", (e) => {
            settings[key] = e.target.value;
            textEl.value = e.target.value;
            updatePreview();
            saveToStorage();
        });

        textEl.addEventListener("input", (e) => {
            const val = e.target.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                settings[key] = val;
                colorEl.value = val;
                updatePreview();
                saveToStorage();
            }
        });
    }
});

// 레인지 슬라이더
const rangeInputs = [
    { id: "style-font-size", key: "fontSize", valueId: "style-font-size-value", unit: "px" },
    { id: "style-font-weight", key: "fontWeight", valueId: "style-font-weight-value", unit: "" },
    { id: "style-width", key: "containerWidth", valueId: "style-width-value", unit: "px" },
    { id: "style-padding", key: "containerPadding", valueId: "style-padding-value", unit: "em" },
    { id: "style-radius", key: "borderRadius", valueId: "style-radius-value", unit: "px" },
    { id: "style-bubble-radius", key: "bubbleRadius", valueId: "style-bubble-radius-value", unit: "px" },
    { id: "style-bubble-padding", key: "bubblePadding", valueId: "style-bubble-padding-value", unit: "em" },
    { id: "style-bubble-max-width", key: "bubbleMaxWidth", valueId: "style-bubble-max-width-value", unit: "%" },
    { id: "style-bubble-gap", key: "bubbleGap", valueId: "style-bubble-gap-value", unit: "em" },
    { id: "style-block-gap", key: "blockGap", valueId: "style-block-gap-value", unit: "em" },
    { id: "style-line-height", key: "lineHeight", valueId: "style-line-height-value", unit: "" },
    { id: "style-letter-spacing", key: "letterSpacing", valueId: "style-letter-spacing-value", unit: "em" },
    { id: "style-paragraph-spacing", key: "paragraphSpacing", valueId: "style-paragraph-spacing-value", unit: "em" },
    { id: "style-border-width", key: "borderWidth", valueId: "style-border-width-value", unit: "px" },
    { id: "style-shadow-intensity", key: "shadowIntensity", valueId: "style-shadow-intensity-value", unit: "%" },
    { id: "style-badge-radius", key: "badgeRadius", valueId: "style-badge-radius-value", unit: "px" },
    { id: "style-nametag-size", key: "nametagFontSize", valueId: "style-nametag-size-value", unit: "em" },
    { id: "style-bubble-border-width", key: "bubbleBorderWidth", valueId: "style-bubble-border-width-value", unit: "px" },
    { id: "style-log-title-size", key: "logTitleSize", valueId: "style-log-title-size-value", unit: "em" },
    // 이미지 설정
    { id: "style-image-max-width", key: "imageMaxWidth", valueId: "style-image-max-width-value", unit: "px" },
    { id: "style-image-border-radius", key: "imageBorderRadius", valueId: "style-image-border-radius-value", unit: "px" },
    { id: "style-image-margin", key: "imageMargin", valueId: "style-image-margin-value", unit: "em" },
];

rangeInputs.forEach(({ id, key, valueId, unit }) => {
    const rangeEl = document.getElementById(id);
    const valueEl = document.getElementById(valueId);

    if (rangeEl && valueEl) {
        rangeEl.addEventListener("input", (e) => {
            const val = parseFloat(e.target.value);
            settings[key] = val;
            valueEl.textContent = `${val}${unit}`;
            updatePreview();
            saveToStorage();
        });
    }
});

// ===== 출력 탭 전환 =====
const outputTabBtns = document.querySelectorAll(".output-tab");
const outputContents = document.querySelectorAll(".output-content");
const copyBtnEl = document.getElementById("copy-btn");
const previewModeContainer = document.getElementById("preview-mode-container");

outputTabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
        const tabId = btn.dataset.outputTab;

        outputTabBtns.forEach((b) => b.classList.remove("active"));
        outputContents.forEach((c) => c.classList.remove("active"));

        btn.classList.add("active");
        const content = document.querySelector(`#output-${tabId}`);
        if (content) content.classList.add("active");

        // 탭에 따라 버튼 표시/숨김
        if (tabId === "code") {
            if (previewModeContainer) previewModeContainer.style.display = "none";
        } else {
            if (previewModeContainer) previewModeContainer.style.display = "flex";
        }
    });
});

// 박스 그림자 토글
const boxShadowToggle = document.getElementById("style-box-shadow");
const boxShadowLabel = document.getElementById("style-box-shadow-label");

if (boxShadowToggle && boxShadowLabel) {
    boxShadowToggle.addEventListener("change", (e) => {
        settings.boxShadow = e.target.checked;
        boxShadowLabel.textContent = e.target.checked ? "켜짐" : "꺼짐";
        updatePreview();
        saveToStorage();
    });
}

// 텍스트 정렬 셀렉트
const textAlignSelect = document.getElementById("style-text-align");
if (textAlignSelect) {
    textAlignSelect.addEventListener("change", (e) => {
        settings.textAlign = e.target.value;
        updatePreview();
        saveToStorage();
    });
}

// 테두리 스타일 셀렉트
const borderStyleSelect = document.getElementById("style-border-style");
if (borderStyleSelect) {
    borderStyleSelect.addEventListener("change", (e) => {
        settings.borderStyle = e.target.value;
        updatePreview();
        saveToStorage();
    });
}

// 헤더 정렬 셀렉트
const headerAlignSelect = document.getElementById("style-header-align");
if (headerAlignSelect) {
    headerAlignSelect.addEventListener("change", (e) => {
        settings.headerAlign = e.target.value;
        updatePreview();
        saveToStorage();
    });
}

// 뱃지 스타일 셀렉트
const badgeStyleSelect = document.getElementById("style-badge-style");
if (badgeStyleSelect) {
    badgeStyleSelect.addEventListener("change", (e) => {
        settings.badgeStyle = e.target.value;
        updatePreview();
        saveToStorage();
    });
}

// 이미지 테두리 두께
const imageBorderWidthSlider = document.getElementById("style-image-border-width");
const imageBorderWidthValue = document.getElementById("style-image-border-width-value");
if (imageBorderWidthSlider) {
    imageBorderWidthSlider.addEventListener("input", (e) => {
        settings.imageBorderWidth = parseFloat(e.target.value);
        if (imageBorderWidthValue) imageBorderWidthValue.textContent = `${e.target.value}px`;
        updatePreview();
        saveToStorage();
    });
}

// 이미지 테두리 색상
const imageBorderColorInput = document.getElementById("style-image-border-color");
if (imageBorderColorInput) {
    imageBorderColorInput.addEventListener("input", (e) => {
        settings.imageBorderColor = e.target.value;
        updatePreview();
        saveToStorage();
    });
}

// 이미지 그림자
const imageShadowSelect = document.getElementById("style-image-shadow");
if (imageShadowSelect) {
    imageShadowSelect.addEventListener("change", (e) => {
        settings.imageShadow = e.target.value;
        updatePreview();
        saveToStorage();
    });
}

// 이미지 정렬 셀렉트
const imageAlignSelect = document.getElementById("style-image-align");
if (imageAlignSelect) {
    imageAlignSelect.addEventListener("change", (e) => {
        settings.imageAlign = e.target.value;
        updatePreview();
        saveToStorage();
    });
}

// 그라데이션 방향 셀렉트
const gradientDirectionSelect = document.getElementById("style-gradient-direction");
if (gradientDirectionSelect) {
    gradientDirectionSelect.addEventListener("change", (e) => {
        settings.bgGradientDirection = e.target.value;
        updatePreview();
        saveToStorage();
    });
}

// 배경 그라데이션 토글
const bgGradientToggle = document.getElementById("style-bg-gradient");
const bgGradientLabel = document.getElementById("style-bg-gradient-label");
const gradientOptions = document.getElementById("gradient-options");

if (bgGradientToggle && bgGradientLabel) {
    bgGradientToggle.addEventListener("change", (e) => {
        settings.bgGradient = e.target.checked;
        bgGradientLabel.textContent = e.target.checked ? "켜짐" : "꺼짐";
        if (gradientOptions) {
            gradientOptions.style.display = e.target.checked ? "block" : "none";
        }
        updatePreview();
        saveToStorage();
    });
}

// 그라데이션 색상
const gradientColorEl = document.getElementById("style-gradient-color");
const gradientColorTextEl = document.getElementById("style-gradient-color-text");

if (gradientColorEl && gradientColorTextEl) {
    gradientColorEl.addEventListener("input", (e) => {
        settings.bgGradientColor = e.target.value;
        gradientColorTextEl.value = e.target.value;
        updatePreview();
        saveToStorage();
    });

    gradientColorTextEl.addEventListener("input", (e) => {
        const val = e.target.value;
        if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
            settings.bgGradientColor = val;
            gradientColorEl.value = val;
            updatePreview();
            saveToStorage();
        }
    });
}

// 말풍선 테두리 토글
const bubbleBorderToggle = document.getElementById("style-bubble-border");
const bubbleBorderLabel = document.getElementById("style-bubble-border-label");
const bubbleBorderOptions = document.getElementById("bubble-border-options");

if (bubbleBorderToggle && bubbleBorderLabel) {
    bubbleBorderToggle.addEventListener("change", (e) => {
        settings.bubbleBorder = e.target.checked;
        bubbleBorderLabel.textContent = e.target.checked ? "켜짐" : "꺼짐";
        if (bubbleBorderOptions) {
            bubbleBorderOptions.style.display = e.target.checked ? "block" : "none";
        }
        updatePreview();
        saveToStorage();
    });
}

// 말풍선 테두리 색상
const bubbleBorderColorEl = document.getElementById("style-bubble-border-color");
const bubbleBorderColorTextEl = document.getElementById("style-bubble-border-color-text");

if (bubbleBorderColorEl && bubbleBorderColorTextEl) {
    bubbleBorderColorEl.addEventListener("input", (e) => {
        settings.bubbleBorderColor = e.target.value;
        bubbleBorderColorTextEl.value = e.target.value;
        updatePreview();
        saveToStorage();
    });

    bubbleBorderColorTextEl.addEventListener("input", (e) => {
        const val = e.target.value;
        if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
            settings.bubbleBorderColor = val;
            bubbleBorderColorEl.value = val;
            updatePreview();
            saveToStorage();
        }
    });
}

// 말풍선 왼쪽 테두리만 토글
const bubbleBorderLeftOnlyToggle = document.getElementById("style-bubble-border-left-only");
const bubbleBorderLeftOnlyLabel = document.getElementById("style-bubble-border-left-only-label");

if (bubbleBorderLeftOnlyToggle && bubbleBorderLeftOnlyLabel) {
    bubbleBorderLeftOnlyToggle.addEventListener("change", (e) => {
        settings.bubbleBorderLeftOnly = e.target.checked;
        bubbleBorderLeftOnlyLabel.textContent = e.target.checked ? "켜짐" : "꺼짐";
        updatePreview();
        saveToStorage();
    });
}

// ===== 네임태그 토글 =====
const showNametagToggle = document.getElementById("show-nametag");
const showNametagLabel = document.getElementById("show-nametag-label");

if (showNametagToggle && showNametagLabel) {
    showNametagToggle.addEventListener("change", (e) => {
        settings.showNametag = e.target.checked;
        showNametagLabel.textContent = e.target.checked ? "켜짐" : "꺼짐";
        updatePreview();
        saveToStorage();
    });
}

// ===== 복사 버튼 =====
if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
        const html = generateHTML();
        if (!html) return;

        try {
            // Rich HTML용: 태그 사이 공백/개행 제거 (WYSIWYG 에디터에서 불필요한 공백 방지)
            const minifiedHtml = html
                .replace(/>\s+</g, '><')  // 태그 사이 공백 제거
                .replace(/^\s+/gm, '');    // 줄 시작 공백 제거

            // Rich HTML 클립보드로 복사 (WYSIWYG 에디터에 붙여넣기 시 서식 유지)
            const htmlBlob = new Blob([minifiedHtml], { type: 'text/html' });
            const textBlob = new Blob([html], { type: 'text/plain' });  // 텍스트는 원본 유지 (가독성)

            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': htmlBlob,
                    'text/plain': textBlob
                })
            ]);

            copyBtn.classList.add("copied");
            copyBtn.querySelector(".copy-text").textContent = "복사됨!";

            setTimeout(() => {
                copyBtn.classList.remove("copied");
                copyBtn.querySelector(".copy-text").textContent = "복사";
            }, 2000);
        } catch (err) {
            console.error("복사 실패:", err);
            // 폴백: 기존 텍스트 복사 방식
            try {
                await navigator.clipboard.writeText(html);
                copyBtn.classList.add("copied");
                copyBtn.querySelector(".copy-text").textContent = "복사됨!";
                setTimeout(() => {
                    copyBtn.classList.remove("copied");
                    copyBtn.querySelector(".copy-text").textContent = "복사";
                }, 2000);
            } catch (fallbackErr) {
                console.error("폴백 복사도 실패:", fallbackErr);
            }
        }
    });
}

// ===== 블록 추가 버튼 =====
if (addBlockBtn) {
    addBlockBtn.addEventListener("click", () => {
        createLogBlock();
    });
}

// ===== 초기화: LocalStorage에서 불러오기 =====
const hasStoredData = loadFromStorage();

// UI 동기화 (저장된 설정 반영)
syncUIFromSettings();
syncAllUIFromSettings();

if (hasStoredData && logBlocks.length > 0) {
    // 저장된 블록이 있으면 렌더링
    renderLogBlocks();
    updatePreview();
} else {
    // 저장된 블록이 없으면 기본 블록 생성
    createLogBlock("로그 1", "", false);
}

// 전체 UI 동기화 함수 (캐릭터 정보, 레인지 슬라이더 등)
function syncAllUIFromSettings() {
    // 캐릭터 정보 동기화
    const charInputMap = {
        "log-title": "logTitle",
        "char-name": "charName",
        "char-link": "charLink",
        "user-name": "userName",
        "ai-model": "aiModel",
        "prompt-name": "promptName",
        "sub-model": "subModel",
    };
    Object.entries(charInputMap).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el && settings[key]) el.value = settings[key];
    });

    // 레인지 슬라이더 동기화
    const rangeMap = [
        { id: "style-font-size", key: "fontSize", valueId: "style-font-size-value", unit: "px" },
        { id: "style-font-weight", key: "fontWeight", valueId: "style-font-weight-value", unit: "" },
        { id: "style-width", key: "containerWidth", valueId: "style-width-value", unit: "px" },
        { id: "style-padding", key: "containerPadding", valueId: "style-padding-value", unit: "em" },
        { id: "style-radius", key: "borderRadius", valueId: "style-radius-value", unit: "px" },
        { id: "style-bubble-radius", key: "bubbleRadius", valueId: "style-bubble-radius-value", unit: "px" },
        { id: "style-bubble-padding", key: "bubblePadding", valueId: "style-bubble-padding-value", unit: "em" },
        { id: "style-bubble-max-width", key: "bubbleMaxWidth", valueId: "style-bubble-max-width-value", unit: "%" },
        { id: "style-bubble-gap", key: "bubbleGap", valueId: "style-bubble-gap-value", unit: "em" },
        { id: "style-block-gap", key: "blockGap", valueId: "style-block-gap-value", unit: "em" },
        { id: "style-line-height", key: "lineHeight", valueId: "style-line-height-value", unit: "" },
        { id: "style-letter-spacing", key: "letterSpacing", valueId: "style-letter-spacing-value", unit: "em" },
        { id: "style-paragraph-spacing", key: "paragraphSpacing", valueId: "style-paragraph-spacing-value", unit: "em" },
        { id: "style-border-width", key: "borderWidth", valueId: "style-border-width-value", unit: "px" },
        { id: "style-shadow-intensity", key: "shadowIntensity", valueId: "style-shadow-intensity-value", unit: "%" },
        { id: "style-badge-radius", key: "badgeRadius", valueId: "style-badge-radius-value", unit: "px" },
        { id: "style-nametag-size", key: "nametagFontSize", valueId: "style-nametag-size-value", unit: "em" },
        { id: "style-bubble-border-width", key: "bubbleBorderWidth", valueId: "style-bubble-border-width-value", unit: "px" },
        { id: "style-log-title-size", key: "logTitleSize", valueId: "style-log-title-size-value", unit: "em" },
        // 이미지 설정
        { id: "style-image-max-width", key: "imageMaxWidth", valueId: "style-image-max-width-value", unit: "px" },
        { id: "style-image-border-radius", key: "imageBorderRadius", valueId: "style-image-border-radius-value", unit: "px" },
        { id: "style-image-margin", key: "imageMargin", valueId: "style-image-margin-value", unit: "em" },
    ];
    rangeMap.forEach(({ id, key, valueId, unit }) => {
        const rangeEl = document.getElementById(id);
        const valueEl = document.getElementById(valueId);
        if (rangeEl) rangeEl.value = settings[key];
        if (valueEl) valueEl.textContent = `${settings[key]}${unit}`;
    });

    // 박스 그림자 토글 동기화
    const boxShadowEl = document.getElementById("style-box-shadow");
    const boxShadowLabelEl = document.getElementById("style-box-shadow-label");
    if (boxShadowEl) boxShadowEl.checked = settings.boxShadow;
    if (boxShadowLabelEl) boxShadowLabelEl.textContent = settings.boxShadow ? "켜짐" : "꺼짐";

    // 텍스트 정렬 동기화
    const textAlignEl = document.getElementById("style-text-align");
    if (textAlignEl) textAlignEl.value = settings.textAlign;

    // 테두리 스타일 동기화
    const borderStyleEl = document.getElementById("style-border-style");
    if (borderStyleEl) borderStyleEl.value = settings.borderStyle;

    // 헤더 정렬 동기화
    const headerAlignEl = document.getElementById("style-header-align");
    if (headerAlignEl) headerAlignEl.value = settings.headerAlign;

    // 뱃지 스타일 동기화
    const badgeStyleEl = document.getElementById("style-badge-style");
    if (badgeStyleEl) badgeStyleEl.value = settings.badgeStyle;

    // 이미지 테두리/그림자 동기화
    const imageBorderWidthEl = document.getElementById("style-image-border-width");
    const imageBorderWidthValueEl = document.getElementById("style-image-border-width-value");
    if (imageBorderWidthEl) imageBorderWidthEl.value = settings.imageBorderWidth;
    if (imageBorderWidthValueEl) imageBorderWidthValueEl.textContent = `${settings.imageBorderWidth}px`;

    const imageBorderColorEl = document.getElementById("style-image-border-color");
    if (imageBorderColorEl) imageBorderColorEl.value = settings.imageBorderColor;

    const imageShadowEl = document.getElementById("style-image-shadow");
    if (imageShadowEl) imageShadowEl.value = settings.imageShadow;

    // 이미지 정렬 동기화
    const imageAlignEl = document.getElementById("style-image-align");
    if (imageAlignEl) imageAlignEl.value = settings.imageAlign;

    // 배경 그라데이션 동기화
    const bgGradientEl = document.getElementById("style-bg-gradient");
    const bgGradientLabelEl = document.getElementById("style-bg-gradient-label");
    const gradientOptionsEl = document.getElementById("gradient-options");
    if (bgGradientEl) bgGradientEl.checked = settings.bgGradient;
    if (bgGradientLabelEl) bgGradientLabelEl.textContent = settings.bgGradient ? "켜짐" : "꺼짐";
    if (gradientOptionsEl) gradientOptionsEl.style.display = settings.bgGradient ? "block" : "none";

    const gradientColorEl = document.getElementById("style-gradient-color");
    const gradientColorTextEl = document.getElementById("style-gradient-color-text");
    if (gradientColorEl) gradientColorEl.value = settings.bgGradientColor;
    if (gradientColorTextEl) gradientColorTextEl.value = settings.bgGradientColor;

    const gradientDirectionEl = document.getElementById("style-gradient-direction");
    if (gradientDirectionEl) gradientDirectionEl.value = settings.bgGradientDirection;

    // 말풍선 테두리 동기화
    const bubbleBorderEl = document.getElementById("style-bubble-border");
    const bubbleBorderLabelEl = document.getElementById("style-bubble-border-label");
    const bubbleBorderOptionsEl = document.getElementById("bubble-border-options");
    if (bubbleBorderEl) bubbleBorderEl.checked = settings.bubbleBorder;
    if (bubbleBorderLabelEl) bubbleBorderLabelEl.textContent = settings.bubbleBorder ? "켜짐" : "꺼짐";
    if (bubbleBorderOptionsEl) bubbleBorderOptionsEl.style.display = settings.bubbleBorder ? "block" : "none";

    const bubbleBorderColorEl = document.getElementById("style-bubble-border-color");
    const bubbleBorderColorTextEl = document.getElementById("style-bubble-border-color-text");
    if (bubbleBorderColorEl) bubbleBorderColorEl.value = settings.bubbleBorderColor;
    if (bubbleBorderColorTextEl) bubbleBorderColorTextEl.value = settings.bubbleBorderColor;

    const bubbleBorderLeftOnlyEl = document.getElementById("style-bubble-border-left-only");
    const bubbleBorderLeftOnlyLabelEl = document.getElementById("style-bubble-border-left-only-label");
    if (bubbleBorderLeftOnlyEl) bubbleBorderLeftOnlyEl.checked = settings.bubbleBorderLeftOnly;
    if (bubbleBorderLeftOnlyLabelEl) bubbleBorderLeftOnlyLabelEl.textContent = settings.bubbleBorderLeftOnly ? "켜짐" : "꺼짐";

    // 네임태그 토글 동기화
    const showNametagEl = document.getElementById("show-nametag");
    const showNametagLabelEl = document.getElementById("show-nametag-label");
    if (showNametagEl) showNametagEl.checked = settings.showNametag;
    if (showNametagLabelEl) showNametagLabelEl.textContent = settings.showNametag ? "켜짐" : "꺼짐";
}

console.log("main.js loaded successfully");

// ===== 사용자 프리셋 UI =====
const userPresetList = document.getElementById("user-preset-list");
const userPresetNameInput = document.getElementById("user-preset-name");
const savePresetBtn = document.getElementById("save-preset-btn");

function renderUserPresets() {
    if (!userPresetList) return;

    const presets = getUserPresets();

    if (presets.length === 0) {
        userPresetList.innerHTML = `<div class="user-preset-empty">저장된 프리셋이 없습니다</div>`;
        return;
    }

    userPresetList.innerHTML = presets.map(preset => `
        <div class="user-preset-item" data-preset-name="${escapeAttr(preset.name)}">
            <span class="user-preset-item-name" title="클릭하여 적용">${escapeHTML(preset.name)}</span>
            <button type="button" class="user-preset-item-delete" title="삭제">✕</button>
        </div>
    `).join('');

    // 이벤트 리스너 연결
    userPresetList.querySelectorAll('.user-preset-item').forEach(item => {
        const name = item.dataset.presetName;

        // 이름 클릭 시 적용
        item.querySelector('.user-preset-item-name').addEventListener('click', () => {
            loadUserPreset(name);
        });

        // 삭제 버튼
        item.querySelector('.user-preset-item-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`"${name}" 프리셋을 삭제하시겠습니까?`)) {
                deleteUserPreset(name);
                renderUserPresets();
            }
        });
    });
}

if (savePresetBtn && userPresetNameInput) {
    savePresetBtn.addEventListener('click', () => {
        const name = userPresetNameInput.value.trim();
        if (!name) {
            alert('프리셋 이름을 입력하세요.');
            userPresetNameInput.focus();
            return;
        }

        const presets = getUserPresets();
        const exists = presets.some(p => p.name === name);

        if (exists) {
            if (!confirm(`"${name}" 프리셋이 이미 존재합니다. 덮어쓰시겠습니까?`)) {
                return;
            }
        }

        if (saveUserPreset(name)) {
            userPresetNameInput.value = '';
            renderUserPresets();

            // 저장 완료 피드백
            savePresetBtn.textContent = '✓ 저장됨!';
            savePresetBtn.style.background = '#22c55e';
            savePresetBtn.style.borderColor = '#22c55e';
            savePresetBtn.style.color = '#fff';

            setTimeout(() => {
                savePresetBtn.innerHTML = '💾 저장';
                savePresetBtn.style.background = '';
                savePresetBtn.style.borderColor = '';
                savePresetBtn.style.color = '';
            }, 1500);
        }
    });

    // Enter 키로 저장
    userPresetNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            savePresetBtn.click();
        }
    });
}

// 초기 프리셋 목록 렌더링
renderUserPresets();

// ===== 테마 토글 =====
const themeToggleBtn = document.querySelector("#theme-toggle");

function setTheme(mode) {
    if (mode === "dark") {
        document.body.classList.add("theme-dark");
        localStorage.setItem("theme", "dark");
    } else {
        document.body.classList.remove("theme-dark");
        localStorage.setItem("theme", "light");
    }
}

if (themeToggleBtn) {
    const saved = localStorage.getItem("theme");
    // 라이트 모드가 기본값
    setTheme(saved === "dark" ? "dark" : "light");

    themeToggleBtn.addEventListener("click", () => {
        const isDark = document.body.classList.contains("theme-dark");
        setTheme(isDark ? "light" : "dark");
    });
}

// ===== 키보드 단축키 =====
document.addEventListener('keydown', (e) => {
    // 입력 필드에서는 단축키 무시
    const isInputFocused = document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA';

    // F1 키: 도움말 모달 토글
    if (e.key === 'F1') {
        e.preventDefault();
        toggleHelpModal();
        return;
    }

    // ESC: 모달 닫기
    if (e.key === 'Escape') {
        closeHelpModal();
        return;
    }

    // 입력 중이면 나머지 단축키 무시
    if (isInputFocused) return;

    // Ctrl+S: 현재 설정을 임시 저장 (LocalStorage)
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveToStorage();
        showToast('설정이 저장되었습니다');
        return;
    }

    // Ctrl+Shift+C: HTML 복사
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        if (copyBtn) copyBtn.click();
        return;
    }

    // Ctrl+N: 새 블록 추가
    if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        createLogBlock();
        return;
    }
});

// 토스트 메시지 표시
function showToast(message) {
    // 기존 토스트 제거
    const existingToast = document.querySelector('.toast-message');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    document.body.appendChild(toast);

    // 애니메이션
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ===== 도움말 모달 =====
function createHelpModal() {
    const modal = document.createElement('div');
    modal.id = 'help-modal';
    modal.className = 'help-modal';
    modal.innerHTML = `
        <div class="help-modal-backdrop"></div>
        <div class="help-modal-content">
            <div class="help-modal-header">
                <h2>⌨️ 키보드 단축키</h2>
                <button class="help-modal-close" type="button">✕</button>
            </div>
            <div class="help-modal-body">
                <div class="shortcut-group">
                    <h3>일반</h3>
                    <div class="shortcut-item">
                        <span class="shortcut-key">F1</span>
                        <span class="shortcut-desc">도움말 열기/닫기</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-key">Esc</span>
                        <span class="shortcut-desc">모달 닫기</span>
                    </div>
                </div>
                <div class="shortcut-group">
                    <h3>편집</h3>
                    <div class="shortcut-item">
                        <span class="shortcut-key">Ctrl + N</span>
                        <span class="shortcut-desc">새 블록 추가</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-key">Ctrl + S</span>
                        <span class="shortcut-desc">설정 저장</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-key">Ctrl + Shift + C</span>
                        <span class="shortcut-desc">HTML 코드 복사</span>
                    </div>
                </div>
                <div class="shortcut-group">
                    <h3>팁</h3>
                    <p class="shortcut-tip">☰ 아이콘을 드래그하여 블록 순서를 변경할 수 있습니다.</p>
                    <p class="shortcut-tip">설정은 자동으로 브라우저에 저장됩니다.</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 이벤트 리스너
    modal.querySelector('.help-modal-backdrop').addEventListener('click', closeHelpModal);
    modal.querySelector('.help-modal-close').addEventListener('click', closeHelpModal);
}

function toggleHelpModal() {
    let modal = document.getElementById('help-modal');
    if (!modal) {
        createHelpModal();
        modal = document.getElementById('help-modal');
    }
    modal.classList.toggle('open');
}

function closeHelpModal() {
    const modal = document.getElementById('help-modal');
    if (modal) modal.classList.remove('open');
}

// 도움말 버튼 이벤트
const helpBtn = document.getElementById('help-btn');
if (helpBtn) {
    helpBtn.addEventListener('click', toggleHelpModal);
}

// ===== 모바일 미리보기 토글 =====
const previewModeSwitch = document.getElementById('preview-mode-switch');
const previewCanvas = document.getElementById('preview-canvas');

if (previewModeSwitch && previewCanvas) {
    previewModeSwitch.addEventListener('click', () => {
        const isMobile = previewModeSwitch.classList.toggle('mobile');
        previewCanvas.classList.toggle('mobile-preview', isMobile);

        // 아이콘 활성화 상태 토글
        const icons = previewModeSwitch.parentElement.querySelectorAll('.mode-icon');
        icons[0].classList.toggle('active', !isMobile); // 데스크톱 아이콘
        icons[1].classList.toggle('active', isMobile);  // 모바일 아이콘
    });
}

// ===== JSON 가져오기 (RisuAI 형식) =====
const importJsonBtn = document.getElementById('import-json-btn');
const jsonFileInput = document.getElementById('json-file-input');

function importRisuChatJSON(jsonData) {
    try {
        // RisuAI 형식 확인
        if (jsonData.type !== 'risuChat' || !jsonData.data || !jsonData.data.message) {
            throw new Error('지원하지 않는 JSON 형식입니다. RisuAI 채팅 내보내기 파일을 사용해주세요.');
        }

        const messages = jsonData.data.message;
        const chatName = jsonData.data.name || 'Imported Chat';

        // 각 메시지마다 별도 블록 생성
        messages.forEach((msg, index) => {
            const role = msg.role === 'user' ? 'User' : 'Char';
            const blockTitle = `${chatName} - ${role} ${index + 1}`;
            const content = msg.data.trim();

            createLogBlock(blockTitle, content, false, true); // skipSave = true
        });

        // 마지막에 한 번만 저장
        saveToStorage();

        showToast(`"${chatName}" 채팅을 가져왔습니다 (${messages.length}개 블록 생성)`);
        return true;
    } catch (e) {
        console.error('JSON 파싱 오류:', e);
        showToast('JSON 파일을 불러오는데 실패했습니다: ' + e.message);
        return false;
    }
}

if (importJsonBtn && jsonFileInput) {
    // 버튼 클릭 시 파일 선택 다이얼로그 열기
    importJsonBtn.addEventListener('click', () => {
        jsonFileInput.click();
    });

    // 파일 선택 시 처리
    jsonFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const jsonData = JSON.parse(event.target.result);
                importRisuChatJSON(jsonData);
            } catch (err) {
                showToast('올바른 JSON 파일이 아닙니다.');
            }
        };
        reader.onerror = () => {
            showToast('파일을 읽는데 실패했습니다.');
        };
        reader.readAsText(file);

        // 같은 파일을 다시 선택할 수 있도록 초기화
        jsonFileInput.value = '';
    });
}

// ===== 대괄호 텍스트 제거 =====
const removeBracketsBtn = document.getElementById('remove-brackets-btn');

function removeBracketedText(text) {
    // [대괄호] 안의 텍스트를 모두 제거 (대괄호 포함)
    // 중첩되지 않은 대괄호만 처리
    return text
        .replace(/\[[^\[\]]*\]/g, '')  // [텍스트] 제거
        .replace(/[ \t]{2,}/g, ' ')     // 연속 공백(스페이스/탭)만 하나로 (줄바꿈 유지)
        .replace(/\n{3,}/g, '\n\n');    // 3개 이상 연속 줄바꿈을 2개로
}

function removeAllBracketedText() {
    if (logBlocks.length === 0) {
        showToast('제거할 블록이 없습니다.');
        return;
    }

    let totalRemoved = 0;

    logBlocks.forEach(block => {
        const original = block.content;
        const cleaned = removeBracketedText(original);

        // 변경된 내용이 있으면 카운트
        const removedCount = (original.match(/\[[^\[\]]*\]/g) || []).length;
        totalRemoved += removedCount;

        block.content = cleaned;
    });

    if (totalRemoved > 0) {
        renderLogBlocks();
        updatePreview();
        saveToStorage();
        showToast(`${totalRemoved}개의 [대괄호] 텍스트를 제거했습니다.`);
    } else {
        showToast('제거할 [대괄호] 텍스트가 없습니다.');
    }
}

if (removeBracketsBtn) {
    removeBracketsBtn.addEventListener('click', () => {
        if (confirm('모든 블록에서 [대괄호] 안의 텍스트를 제거합니다.\n계속하시겠습니까?')) {
            removeAllBracketedText();
        }
    });
}

