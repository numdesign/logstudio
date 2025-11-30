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
    const block = {
        id,
        title: title || `블록 ${id + 1}`,
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

    logBlocksContainer.innerHTML = logBlocks.map(block => `
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
            <textarea class="log-block-textarea" placeholder="채팅 로그를 붙여넣으세요...">${escapeHTML(block.content)}</textarea>
            <div class="log-block-options">
                <label class="log-block-option">
                    <input type="checkbox" ${block.collapsible ? 'checked' : ''} data-option="collapsible">
                    <span>접기/펼치기 사용</span>
                </label>
            </div>
        </div>
    `).join('');

    // 이벤트 리스너 연결
    logBlocksContainer.querySelectorAll('.log-block').forEach(blockEl => {
        const blockId = parseInt(blockEl.dataset.blockId);

        // 드래그 앤 드롭 이벤트
        setupBlockDragEvents(blockEl, blockId);

        // 텍스트 영역
        const textarea = blockEl.querySelector('.log-block-textarea');
        textarea.addEventListener('input', (e) => {
            updateLogBlock(blockId, { content: e.target.value });
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
    containerWidth: 800,
    containerPadding: 2,
    borderRadius: 16,
    bubbleRadius: 16,
    bubblePadding: 1,
    lineHeight: 1.8,
    letterSpacing: 0,
    // 테두리 & 그림자
    borderWidth: 0,
    borderColor: "#e4e4e7",
    boxShadow: true,
    shadowIntensity: 30,
    // 텍스트 정렬
    textAlign: "justify",
    // 뱃지 색상
    badgeModelColor: "#18181b",
    badgePromptColor: "#71717a",
    badgeSubColor: "#a1a1aa",
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
        aiBubbleColor: "#f5f5f5", userBubbleColor: "#e0f2fe"
    },
    "light-peach": {
        bgColor: "#fff5f5", textColor: "#4c0519", charColor: "#be123c",
        boldColor: "#e11d48", italicColor: "#fb7185", dialogueColor: "#9f1239", dialogueBgColor: "#ffe4e6",
        badgeModelColor: "#be123c", badgePromptColor: "#fb7185", badgeSubColor: "#fda4af",
        borderColor: "#fecdd3",
        aiBubbleColor: "#ffe4e6", userBubbleColor: "#fecdd3"
    },
    "light-mint": {
        bgColor: "#f0fdfa", textColor: "#134e4a", charColor: "#0d9488",
        boldColor: "#0f766e", italicColor: "#2dd4bf", dialogueColor: "#115e59", dialogueBgColor: "#ccfbf1",
        badgeModelColor: "#0d9488", badgePromptColor: "#5eead4", badgeSubColor: "#99f6e4",
        borderColor: "#99f6e4",
        aiBubbleColor: "#ccfbf1", userBubbleColor: "#99f6e4"
    },
    "light-sky": {
        bgColor: "#f0f9ff", textColor: "#0c4a6e", charColor: "#0284c7",
        boldColor: "#0369a1", italicColor: "#38bdf8", dialogueColor: "#075985", dialogueBgColor: "#e0f2fe",
        badgeModelColor: "#0284c7", badgePromptColor: "#38bdf8", badgeSubColor: "#7dd3fc",
        borderColor: "#bae6fd",
        aiBubbleColor: "#e0f2fe", userBubbleColor: "#bae6fd"
    },
    "light-lilac": {
        bgColor: "#faf5ff", textColor: "#4c1d95", charColor: "#7c3aed",
        boldColor: "#6d28d9", italicColor: "#a78bfa", dialogueColor: "#5b21b6", dialogueBgColor: "#ede9fe",
        badgeModelColor: "#7c3aed", badgePromptColor: "#a78bfa", badgeSubColor: "#c4b5fd",
        borderColor: "#ddd6fe",
        aiBubbleColor: "#ede9fe", userBubbleColor: "#ddd6fe"
    },
    // Dark Themes
    "dark-space": {
        bgColor: "#0f172a", textColor: "#f8fafc", charColor: "#94a3b8",
        boldColor: "#38bdf8", italicColor: "#818cf8", dialogueColor: "#22d3ee", dialogueBgColor: "#1e293b",
        badgeModelColor: "#334155", badgePromptColor: "#475569", badgeSubColor: "#64748b",
        borderColor: "#1e293b",
        aiBubbleColor: "#1e293b", userBubbleColor: "#334155"
    },
    "dark-charcoal": {
        bgColor: "#18181b", textColor: "#fafafa", charColor: "#fbbf24",
        boldColor: "#f59e0b", italicColor: "#fbbf24", dialogueColor: "#fb923c", dialogueBgColor: "#27272a",
        badgeModelColor: "#d97706", badgePromptColor: "#f59e0b", badgeSubColor: "#fbbf24",
        borderColor: "#27272a",
        aiBubbleColor: "#27272a", userBubbleColor: "#3f3f46"
    },
    "dark-forest": {
        bgColor: "#052e16", textColor: "#f0fdf4", charColor: "#4ade80",
        boldColor: "#22c55e", italicColor: "#86efac", dialogueColor: "#4ade80", dialogueBgColor: "#14532d",
        badgeModelColor: "#15803d", badgePromptColor: "#22c55e", badgeSubColor: "#4ade80",
        borderColor: "#14532d",
        aiBubbleColor: "#14532d", userBubbleColor: "#166534"
    },
    "dark-navy": {
        bgColor: "#172554", textColor: "#eff6ff", charColor: "#60a5fa",
        boldColor: "#3b82f6", italicColor: "#93c5fd", dialogueColor: "#60a5fa", dialogueBgColor: "#1e3a8a",
        badgeModelColor: "#2563eb", badgePromptColor: "#3b82f6", badgeSubColor: "#60a5fa",
        borderColor: "#1e3a8a",
        aiBubbleColor: "#1e3a8a", userBubbleColor: "#1e40af"
    },
    "dark-cyber": {
        bgColor: "#09090b", textColor: "#fdf4ff", charColor: "#d946ef",
        boldColor: "#e879f9", italicColor: "#f0abfc", dialogueColor: "#c026d3", dialogueBgColor: "#2a0a2e",
        badgeModelColor: "#a21caf", badgePromptColor: "#c026d3", badgeSubColor: "#e879f9",
        borderColor: "#27272a",
        aiBubbleColor: "#18181b", userBubbleColor: "#2a0a2e"
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
    // HTML 이스케이프
    let result = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // 플레이스홀더로 치환하여 충돌 방지
    const placeholders = [];
    let placeholderIndex = 0;

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
    return `margin: 0 0 1.2em 0; text-align: ${settings.textAlign}; word-break: keep-all;`;
}

// 라인 파싱 (마커 감지)
function parseLine(line) {
    const trimmed = line.trim();

    // < 마커: User 대사 (왼쪽 방향 화살표 = 오른쪽 정렬)
    if (trimmed.startsWith('<')) {
        return {
            type: 'user',
            content: trimmed.substring(1).trim()
        };
    }

    // > 마커: AI 대사 (오른쪽 방향 화살표 = 왼쪽 정렬)
    if (trimmed.startsWith('>')) {
        return {
            type: 'ai',
            content: trimmed.substring(1).trim()
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

// 말풍선용 마크다운 파싱 (대사 스타일 제외)
function parseMarkdownForBubble(text) {
    // HTML 이스케이프
    let result = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const placeholders = [];
    let placeholderIndex = 0;

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

    if (parsed.type === 'ai') {
        const textColor = getContrastTextColor(settings.aiBubbleColor);
        const content = parseMarkdownForBubble(parsed.content);
        const bubbleStyle = `display: block; margin: 0 0 1em 0; padding: ${bubblePadding}; background: ${settings.aiBubbleColor}; color: ${textColor}; border-radius: ${bubbleRadius} ${bubbleRadius} ${bubbleRadius} 0.25em; max-width: 85%; text-align: left; word-break: keep-all;`;
        const nametagStyle = `display: block; margin-bottom: 0.375em; font-size: 0.75em; font-weight: 600; opacity: 0.7;`;
        const charName = settings.charName || 'AI';

        if (settings.showNametag) {
            return `${indent}<div style="${bubbleStyle}"><span style="${nametagStyle}">${escapeHTMLContent(charName)}</span>${content}</div>`;
        } else {
            return `${indent}<div style="${bubbleStyle}">${content}</div>`;
        }
    } else if (parsed.type === 'user') {
        const textColor = getContrastTextColor(settings.userBubbleColor);
        const content = parseMarkdownForBubble(parsed.content);
        const wrapperStyle = `display: flex; justify-content: flex-end; margin: 0 0 1em 0;`;
        const bubbleStyle = `display: block; padding: ${bubblePadding}; background: ${settings.userBubbleColor}; color: ${textColor}; border-radius: ${bubbleRadius} ${bubbleRadius} 0.25em ${bubbleRadius}; max-width: 85%; text-align: left; word-break: keep-all;`;
        const nametagStyle = `display: block; margin-bottom: 0.375em; font-size: 0.75em; font-weight: 600; opacity: 0.7; text-align: right;`;
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
    // 모든 블록의 내용 수집
    const blocksWithContent = logBlocks.filter(b => b.content.trim() !== "");

    if (blocksWithContent.length === 0) {
        return "";
    }

    // 헤더 HTML 생성
    let headerHTML = "";
    const hasHeader = settings.charName || settings.aiModel || settings.promptName || settings.subModel;

    if (hasHeader) {
        const headerBgLight = adjustColor(settings.bgColor, 12);
        const headerBgDark = adjustColor(settings.bgColor, 6);
        const headerStyle = `margin-bottom: 1.5em; padding: 1.5em; background: linear-gradient(135deg, ${headerBgLight} 0%, ${headerBgDark} 100%); border-radius: 16px; border: 1px solid ${adjustColor(settings.bgColor, 25)}40;`;

        // 캐릭터 이름
        let titleHTML = "";
        if (settings.charName) {
            const titleStyle = `margin: 0; font-size: 1.5em; font-weight: 800; color: ${settings.charColor}; letter-spacing: -0.02em;`;
            if (settings.charLink) {
                titleHTML = `    <p style="${titleStyle}"><a href="${settings.charLink}" target="_blank" style="color: inherit; text-decoration: none; transition: opacity 0.2s;">${settings.charName}</a></p>\n`;
            } else {
                titleHTML = `    <p style="${titleStyle}">${settings.charName}</p>\n`;
            }
        }

        // 태그들 (모델, 프롬프트, 보조)
        let tagsHTML = "";
        const tags = [];

        if (settings.aiModel) {
            tags.push(`<span style="display: inline-block; margin: 0 8px 8px 0; padding: 6px 12px; background: ${settings.badgeModelColor}; border-radius: 20px; font-size: 0.75em; font-weight: 600; color: #fff; line-height: 1.2; text-align: center; box-sizing: border-box;">${settings.aiModel}</span>`);
        }
        if (settings.promptName) {
            tags.push(`<span style="display: inline-block; margin: 0 8px 8px 0; padding: 6px 12px; background: ${settings.badgePromptColor}; border-radius: 20px; font-size: 0.75em; font-weight: 600; color: #fff; line-height: 1.2; text-align: center; box-sizing: border-box;">${settings.promptName}</span>`);
        }
        if (settings.subModel) {
            tags.push(`<span style="display: inline-block; margin: 0 8px 8px 0; padding: 5px 11px; background: transparent; border: 1px solid ${settings.badgeSubColor}; border-radius: 20px; font-size: 0.75em; font-weight: 600; color: ${settings.badgeSubColor}; line-height: 1.2; text-align: center; box-sizing: border-box;">${settings.subModel}</span>`);
        }

        if (tags.length > 0) {
            const marginTop = settings.charName ? "margin-top: 1em;" : "";
            tagsHTML = `    <div style="${marginTop}">${tags.join("")}</div>\n`;
        }

        headerHTML = `  <div style="${headerStyle}">\n${titleHTML}${tagsHTML}  </div>\n`;
    }

    // 블록별 HTML 생성
    const blocksHTML = blocksWithContent.map((block, index) => {
        const lines = block.content.split(/\r?\n/).filter((line) => line.trim() !== "");
        const linesHTML = lines.map((line) => {
            const parsed = parseLine(line);
            return generateBubbleHTML(parsed, true);
        }).join("\n");

        // 접기/펼치기 사용 여부
        if (block.collapsible) {
            const sectionStyle = `margin: ${index > 0 ? '1.5em' : '0'} 0; border: 1px solid ${adjustColor(settings.bgColor, 30)}; border-radius: 12px; overflow: hidden;`;
            const summaryStyle = `padding: 1em 1.25em; background: ${adjustColor(settings.bgColor, 10)}; cursor: pointer; font-weight: 600; font-size: 1.1em; color: ${settings.charColor}; list-style: none; display: flex; align-items: center; gap: 0.5em;`;
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
                const sectionStyle = `margin: ${index > 0 ? '2em' : '0'} 0 0 0; ${index > 0 ? `padding-top: 1.5em; border-top: 1px solid ${adjustColor(settings.bgColor, 25)};` : ''}`;
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
        `background: ${settings.bgColor}`,
        `color: ${settings.textColor}`,
        `font-family: ${settings.fontFamily}`,
        `font-size: ${settings.fontSize}px`,
        `line-height: ${settings.lineHeight}`,
        `letter-spacing: ${settings.letterSpacing}em`,
        `border-radius: ${settings.borderRadius}px`,
        `box-sizing: border-box`,
    ];

    // 테두리 추가
    if (settings.borderWidth > 0) {
        containerStyleParts.push(`border: ${settings.borderWidth}px solid ${settings.borderColor}`);
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

    // 모든 블록의 내용 수집
    const blocksWithContent = logBlocks.filter(b => b.content.trim() !== "");

    // 미리보기 스타일 적용 (컨테이너)
    previewEl.style.maxWidth = `${settings.containerWidth}px`;
    previewEl.style.margin = "0 auto";
    previewEl.style.padding = `${settings.containerPadding}em`;
    previewEl.style.background = settings.bgColor;
    previewEl.style.color = settings.textColor;
    previewEl.style.fontFamily = settings.fontFamily.split(',')[0].replace(/['"]/g, ''); // 간단한 미리보기용
    previewEl.style.fontSize = `${settings.fontSize}px`;
    previewEl.style.lineHeight = settings.lineHeight;
    previewEl.style.letterSpacing = `${settings.letterSpacing}em`;
    previewEl.style.borderRadius = `${settings.borderRadius}px`;
    previewEl.style.boxSizing = "border-box";

    // 테두리 적용
    if (settings.borderWidth > 0) {
        previewEl.style.border = `${settings.borderWidth}px solid ${settings.borderColor}`;
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

    if (blocksWithContent.length === 0) {
        previewEl.innerHTML = `<p class="placeholder-text">변환된 결과가 여기에 표시됩니다</p>`;
    } else {
        // 헤더 생성
        let headerHTML = "";
        const hasHeader = settings.charName || settings.aiModel || settings.promptName || settings.subModel;

        if (hasHeader) {
            const headerBgLight = adjustColor(settings.bgColor, 12);
            const headerBgDark = adjustColor(settings.bgColor, 6);
            const borderColor = adjustColor(settings.bgColor, 25);

            // 캐릭터 이름
            let titleHTML = "";
            if (settings.charName) {
                if (settings.charLink) {
                    titleHTML = `<p style="margin: 0; font-size: 1.5em; font-weight: 800; color: ${settings.charColor}; letter-spacing: -0.02em;"><a href="${settings.charLink}" target="_blank" style="color: inherit; text-decoration: none;">${settings.charName}</a></p>`;
                } else {
                    titleHTML = `<p style="margin: 0; font-size: 1.5em; font-weight: 800; color: ${settings.charColor}; letter-spacing: -0.02em;">${settings.charName}</p>`;
                }
            }

            // 태그들
            let tagsHTML = "";
            const tags = [];

            if (settings.aiModel) {
                tags.push(`<span style="display: inline-block; margin: 0 8px 8px 0; padding: 6px 12px; background: ${settings.badgeModelColor}; border-radius: 20px; font-size: 0.75em; font-weight: 600; color: #fff; line-height: 1.2; text-align: center; box-sizing: border-box;">${settings.aiModel}</span>`);
            }
            if (settings.promptName) {
                tags.push(`<span style="display: inline-block; margin: 0 8px 8px 0; padding: 6px 12px; background: ${settings.badgePromptColor}; border-radius: 20px; font-size: 0.75em; font-weight: 600; color: #fff; line-height: 1.2; text-align: center; box-sizing: border-box;">${settings.promptName}</span>`);
            }
            if (settings.subModel) {
                tags.push(`<span style="display: inline-block; margin: 0 8px 8px 0; padding: 5px 11px; background: transparent; border: 1px solid ${settings.badgeSubColor}; border-radius: 20px; font-size: 0.75em; font-weight: 600; color: ${settings.badgeSubColor}; line-height: 1.2; text-align: center; box-sizing: border-box;">${settings.subModel}</span>`);
            }

            if (tags.length > 0) {
                const marginTop = settings.charName ? "margin-top: 1em;" : "";
                tagsHTML = `<div style="${marginTop}">${tags.join("")}</div>`;
            }

            headerHTML = `<div style="margin-bottom: 1.5em; padding: 1.5em; background: linear-gradient(135deg, ${headerBgLight} 0%, ${headerBgDark} 100%); border-radius: 16px; border: 1px solid ${borderColor}40;">${titleHTML}${tagsHTML}</div>`;
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
                const sectionStyle = `margin: ${index > 0 ? '1.5em' : '0'} 0; border: 1px solid ${adjustColor(settings.bgColor, 30)}; border-radius: 12px; overflow: hidden;`;
                const summaryStyle = `padding: 1em 1.25em; background: ${adjustColor(settings.bgColor, 10)}; cursor: pointer; font-weight: 600; font-size: 1.1em; color: ${settings.charColor}; list-style: none; display: flex; align-items: center; gap: 0.5em;`;
                const contentStyle = `padding: 1.25em;`;

                return `<details open style="${sectionStyle}">
                    <summary style="${summaryStyle}">▼ ${escapeHTMLContent(block.title)}</summary>
                    <div style="${contentStyle}">${linesHTML}</div>
                </details>`;
            } else {
                // 블록이 여러 개일 때만 섹션 구분 추가
                if (blocksWithContent.length > 1) {
                    const sectionStyle = `margin: ${index > 0 ? '2em' : '0'} 0 0 0; ${index > 0 ? `padding-top: 1.5em; border-top: 1px solid ${adjustColor(settings.bgColor, 25)};` : ''}`;
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
    { id: "style-width", key: "containerWidth", valueId: "style-width-value", unit: "px" },
    { id: "style-padding", key: "containerPadding", valueId: "style-padding-value", unit: "em" },
    { id: "style-radius", key: "borderRadius", valueId: "style-radius-value", unit: "px" },
    { id: "style-bubble-radius", key: "bubbleRadius", valueId: "style-bubble-radius-value", unit: "px" },
    { id: "style-bubble-padding", key: "bubblePadding", valueId: "style-bubble-padding-value", unit: "em" },
    { id: "style-line-height", key: "lineHeight", valueId: "style-line-height-value", unit: "" },
    { id: "style-letter-spacing", key: "letterSpacing", valueId: "style-letter-spacing-value", unit: "em" },
    { id: "style-border-width", key: "borderWidth", valueId: "style-border-width-value", unit: "px" },
    { id: "style-shadow-intensity", key: "shadowIntensity", valueId: "style-shadow-intensity-value", unit: "%" },
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
            if (copyBtnEl) copyBtnEl.style.display = "flex";
            if (previewModeContainer) previewModeContainer.style.display = "none";
        } else {
            if (copyBtnEl) copyBtnEl.style.display = "none";
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
            await navigator.clipboard.writeText(html);
            copyBtn.classList.add("copied");
            copyBtn.querySelector(".copy-text").textContent = "복사됨!";

            setTimeout(() => {
                copyBtn.classList.remove("copied");
                copyBtn.querySelector(".copy-text").textContent = "복사";
            }, 2000);
        } catch (err) {
            console.error("복사 실패:", err);
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
        { id: "style-width", key: "containerWidth", valueId: "style-width-value", unit: "px" },
        { id: "style-padding", key: "containerPadding", valueId: "style-padding-value", unit: "em" },
        { id: "style-radius", key: "borderRadius", valueId: "style-radius-value", unit: "px" },
        { id: "style-bubble-radius", key: "bubbleRadius", valueId: "style-bubble-radius-value", unit: "px" },
        { id: "style-bubble-padding", key: "bubblePadding", valueId: "style-bubble-padding-value", unit: "em" },
        { id: "style-line-height", key: "lineHeight", valueId: "style-line-height-value", unit: "" },
        { id: "style-letter-spacing", key: "letterSpacing", valueId: "style-letter-spacing-value", unit: "em" },
        { id: "style-border-width", key: "borderWidth", valueId: "style-border-width-value", unit: "px" },
        { id: "style-shadow-intensity", key: "shadowIntensity", valueId: "style-shadow-intensity-value", unit: "%" },
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

