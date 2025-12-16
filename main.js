// ===== DOM 요소 =====
const previewEl = document.querySelector("#log-preview");
const codeOutputEl = document.querySelector("#code-output");
const copyBtn = document.querySelector("#copy-btn");
const logBlocksContainer = document.querySelector("#log-blocks");
const addBlockBtn = document.querySelector("#add-block-btn");

// ===== 모바일 디버그 로그 (테스트용) =====
const MOBILE_DEBUG = false; // 테스트 후 false로 변경
function mobileLog(...args) {
    console.log(...args);
    if (MOBILE_DEBUG) {
        let debugEl = document.getElementById('mobile-debug-log');
        if (!debugEl) {
            debugEl = document.createElement('div');
            debugEl.id = 'mobile-debug-log';
            debugEl.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.9);color:#0f0;font-size:12px;font-family:monospace;padding:8px;z-index:99999;white-space:pre-wrap;word-break:break-all;';
            document.body.appendChild(debugEl);
        }
        debugEl.textContent += args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ') + '\n';
        debugEl.scrollTop = debugEl.scrollHeight;
    }
}

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

// risuai.xyz/sw/img/ URL을 실제 이미지 URL로 변환
function convertRisuaiUrl(url) {
    // risuai.xyz/sw/img/[hex] 패턴 감지
    const risuaiSwPattern = /^https?:\/\/risuai\.xyz\/sw\/img\/([a-f0-9]+)$/i;
    const match = url.match(risuaiSwPattern);

    if (match) {
        const hexString = match[1];
        try {
            // hex를 ASCII로 디코딩
            let decoded = '';
            for (let i = 0; i < hexString.length; i += 2) {
                decoded += String.fromCharCode(parseInt(hexString.substr(i, 2), 16));
            }
            // 디코딩된 경로로 실제 URL 생성
            const realUrl = `https://sv.risuai.xyz/rs/${decoded}`;
            console.log('[RisuAI URL 변환]', url, '→', realUrl);
            return realUrl;
        } catch (err) {
            console.warn('[RisuAI URL 변환 실패]', err);
            return url;
        }
    }

    return url;
}

// Canvas를 통한 이미지 로드 시도 (CORS 우회용)
async function tryLoadImageViaCanvas(imgSrc) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                console.log('Canvas 이미지 로드 성공');
                resolve(dataUrl);
            } catch (err) {
                console.warn('Canvas 변환 실패 (CORS):', err);
                resolve(null);
            }
        };

        img.onerror = () => {
            console.warn('Canvas 이미지 로드 실패:', imgSrc);
            resolve(null);
        };

        // 타임아웃 설정 (5초)
        setTimeout(() => {
            if (!img.complete) {
                console.warn('Canvas 이미지 로드 타임아웃:', imgSrc);
                resolve(null);
            }
        }, 5000);

        img.src = imgSrc;
    });
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
    mobileLog('[붙여넣기] HTML 길이:', html.length);

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 파싱된 HTML에서 img 태그 확인
    const allImages = doc.querySelectorAll('img');
    mobileLog('[붙여넣기] 감지된 img 태그 수:', allImages.length);
    allImages.forEach((img, i) => {
        mobileLog(`[img ${i}] src:`, img.src.substring(0, 80) + '...');
    });

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
        let imgSrc = imagesToProcess[i];
        let base64 = null;

        // 디버깅: 이미지 src 확인
        mobileLog(`[이미지 ${i}] 원본:`, imgSrc.substring(0, 60) + '...');

        // risuai.xyz/sw/img/ URL을 실제 이미지 URL로 변환
        imgSrc = convertRisuaiUrl(imgSrc);
        mobileLog(`[이미지 ${i}] 변환:`, imgSrc.substring(0, 60) + '...');

        try {
            if (!imgSrc || imgSrc.trim() === '') {
                console.warn('빈 이미지 src');
            } else if (imgSrc.startsWith('data:')) {
                base64 = imgSrc;
            } else if (imgSrc.startsWith('blob:')) {
                try {
                    const response = await fetch(imgSrc);
                    const blob = await response.blob();
                    base64 = await blobToBase64(blob);
                } catch (err) {
                    console.warn('Blob fetch 실패:', err);
                }
            } else if (imgSrc.startsWith('http://') || imgSrc.startsWith('https://')) {
                mobileLog(`[이미지 ${i}] fetch 시도...`);
                try {
                    const response = await fetch(imgSrc);
                    mobileLog(`[이미지 ${i}] 응답:`, response.status, response.ok);
                    const blob = await response.blob();
                    mobileLog(`[이미지 ${i}] blob:`, blob.type, blob.size);

                    // blob.type이 이미지가 아니면 Canvas 방식으로 시도
                    if (blob.type && blob.type.startsWith('image/')) {
                        base64 = await blobToBase64(blob);
                        mobileLog(`[이미지 ${i}] base64 성공, 길이:`, base64?.length);
                    } else {
                        mobileLog(`[이미지 ${i}] blob이 이미지 아님! (${blob.type})`);
                        base64 = await tryLoadImageViaCanvas(imgSrc);
                    }
                } catch (err) {
                    mobileLog(`[이미지 ${i}] fetch 실패:`, err.message);
                    base64 = await tryLoadImageViaCanvas(imgSrc);
                    mobileLog(`[이미지 ${i}] Canvas:`, base64 ? '성공' : '실패');
                }
            } else if (imgSrc.startsWith('//')) {
                // 프로토콜 없는 URL (//cdn.example.com/...)
                try {
                    const fullUrl = 'https:' + imgSrc;
                    const response = await fetch(fullUrl);
                    const blob = await response.blob();
                    base64 = await blobToBase64(blob);
                } catch (err) {
                    console.warn('프로토콜 없는 URL fetch 실패:', err);
                    base64 = await tryLoadImageViaCanvas('https:' + imgSrc);
                }
            } else {
                // 상대 경로 또는 알 수 없는 형식 - Canvas 방식 시도
                console.warn('알 수 없는 이미지 src 형식:', imgSrc);
                base64 = await tryLoadImageViaCanvas(imgSrc);
            }

            if (base64) {
                const compressed = await compressImage(base64);
                const imgHtml = `<img src="${compressed}" style="max-width:100%;border-radius:8px;margin:0.5em 0;">`;
                cleanHtml = cleanHtml.replace(`__IMG_PLACEHOLDER_${i}__`, '\n' + imgHtml + '\n');
            } else {
                console.warn('이미지 변환 실패, placeholder 제거');
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

        // Undo/Redo 히스토리에 상태 저장 (디바운스)
        if (!isUndoRedoAction) {
            debouncedPushHistory();
        }
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
            migrateSettingsFromLoadedObject(parsed);
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
        migrateSettingsFromLoadedObject(preset.settings || {});
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

// ===== Undo/Redo 히스토리 시스템 =====
const MAX_HISTORY_SIZE = 30;
let historyStack = [];
let redoStack = [];
let isUndoRedoAction = false;
let lastFocusedBlockId = null;
let saveDebounceTimer = null;

// 이미지 참조 저장소 (메모리 최적화)
const imageStore = new Map();
let imageIdCounter = 0;

// 이미지를 참조로 변환 (메모리 절약)
function extractImages(content) {
    const imgRegex = /<img\s+src="(data:[^"]+)"[^>]*>/gi;
    let match;
    const refs = [];
    let processedContent = content;

    while ((match = imgRegex.exec(content)) !== null) {
        const base64 = match[1];
        // 이미 저장된 이미지인지 확인
        let imageId = null;
        for (const [id, data] of imageStore.entries()) {
            if (data === base64) {
                imageId = id;
                break;
            }
        }

        if (imageId === null) {
            imageId = `img_${imageIdCounter++}`;
            imageStore.set(imageId, base64);
        }

        refs.push(imageId);
        processedContent = processedContent.replace(match[0], `<img src="__IMG_REF_${imageId}__">`);
    }

    return { content: processedContent, refs };
}

// 참조를 이미지로 복원
function restoreImages(content) {
    return content.replace(/<img\s+src="__IMG_REF_([^"]+)__">/gi, (match, imageId) => {
        const base64 = imageStore.get(imageId);
        if (base64) {
            return `<img src="${base64}">`;
        }
        return match;
    });
}

// 상태 스냅샷 생성 (이미지 참조화로 메모리 최적화)
function captureState() {
    const blocksSnapshot = logBlocks.map(block => {
        const { content: optimizedContent } = extractImages(block.content);
        return {
            id: block.id,
            title: block.title,
            content: optimizedContent,
            collapsible: block.collapsible,
            collapsed: block.collapsed
        };
    });

    return {
        blocks: blocksSnapshot,
        settings: JSON.parse(JSON.stringify(settings)),
        blockIdCounter: blockIdCounter,
        timestamp: Date.now()
    };
}

// 상태 복원
function restoreState(snapshot) {
    // 블록 복원 (이미지 참조 복원)
    logBlocks = snapshot.blocks.map(block => ({
        ...block,
        content: restoreImages(block.content)
    }));

    // 설정 복원
    Object.assign(settings, snapshot.settings);

    // 블록 카운터 복원
    blockIdCounter = snapshot.blockIdCounter;
}

// 히스토리에 현재 상태 저장
function pushHistory() {
    if (isUndoRedoAction) return;

    const snapshot = captureState();

    // 이전 상태와 비교하여 변경이 있을 때만 저장
    if (historyStack.length > 0) {
        const lastSnapshot = historyStack[historyStack.length - 1];
        if (JSON.stringify(lastSnapshot.blocks) === JSON.stringify(snapshot.blocks) &&
            JSON.stringify(lastSnapshot.settings) === JSON.stringify(snapshot.settings)) {
            return; // 변경 없음
        }
    }

    historyStack.push(snapshot);

    // 히스토리 크기 제한
    if (historyStack.length > MAX_HISTORY_SIZE) {
        historyStack.shift();
    }

    // Redo 스택 초기화 (새 작업 시)
    redoStack = [];
}

// 디바운스된 히스토리 저장
function debouncedPushHistory() {
    if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
    }
    saveDebounceTimer = setTimeout(() => {
        pushHistory();
    }, 500);
}

// Undo 실행
function undo() {
    if (historyStack.length <= 1) {
        showToast('더 이상 되돌릴 수 없습니다');
        return;
    }

    isUndoRedoAction = true;

    // 현재 상태를 redo 스택에 저장
    const currentState = historyStack.pop();
    redoStack.push(currentState);

    // 이전 상태 복원
    const prevState = historyStack[historyStack.length - 1];
    restoreState(prevState);

    // UI 동기화
    syncUIFromSettings();
    syncAllUIFromSettings();
    renderLogBlocks();
    updatePreview();
    saveToStorage();

    isUndoRedoAction = false;
    showToast('되돌리기 완료');
}

// Redo 실행
function redo() {
    if (redoStack.length === 0) {
        showToast('다시 실행할 작업이 없습니다');
        return;
    }

    isUndoRedoAction = true;

    // redo 스택에서 상태 가져오기
    const nextState = redoStack.pop();
    historyStack.push(nextState);

    // 상태 복원
    restoreState(nextState);

    // UI 동기화
    syncUIFromSettings();
    syncAllUIFromSettings();
    renderLogBlocks();
    updatePreview();
    saveToStorage();

    isUndoRedoAction = false;
    showToast('다시 실행 완료');
}

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

function duplicateLogBlock(id) {
    const block = logBlocks.find(b => b.id === id);
    if (!block) return;

    const blockIndex = logBlocks.findIndex(b => b.id === id);
    const newId = blockIdCounter++;
    const newBlock = {
        id: newId,
        title: block.title + " (복사본)",
        content: block.content,
        collapsible: block.collapsible,
        collapsed: false
    };

    // 원본 바로 뒤에 삽입
    logBlocks.splice(blockIndex + 1, 0, newBlock);
    renderLogBlocks();
    updatePreview();
    saveToStorage();
    showToast('블록이 복제되었습니다.');
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

    // 기본적으로 draggable 비활성화 (텍스트 선택 허용)
    blockEl.setAttribute('draggable', 'false');

    // 드래그 핸들에서만 드래그 시작 허용
    dragHandle.addEventListener('mousedown', (e) => {
        blockEl.setAttribute('draggable', 'true');
    });

    // 마우스 떼면 draggable 비활성화 (텍스트 선택 복원)
    document.addEventListener('mouseup', () => {
        blockEl.setAttribute('draggable', 'false');
    });

    blockEl.addEventListener('dragstart', (e) => {
        // 드래그 핸들에서 시작한 경우에만 허용
        if (!e.target.closest('.log-block-btn--drag') && e.target !== dragHandle) {
            // 텍스트 영역에서 드래그 시작한 경우 무시
            if (e.target.closest('.log-block-textarea') || e.target.closest('.log-block-title')) {
                e.preventDefault();
                return;
            }
        }

        draggedBlockId = blockId;
        blockEl.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', blockId.toString());
    });

    blockEl.addEventListener('dragend', () => {
        draggedBlockId = null;
        dragOverBlockId = null;
        blockEl.classList.remove('dragging');
        blockEl.setAttribute('draggable', 'false');
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
        <div class="log-block ${block.collapsed ? 'collapsed' : ''}" data-block-id="${block.id}" draggable="false">
            <div class="log-block-header">
                <button type="button" class="log-block-btn log-block-btn--drag" title="드래그하여 순서 변경">☰</button>
                <button type="button" class="log-block-btn log-block-btn--collapse ${block.collapsed ? 'collapsed' : ''}" title="접기/펼치기">
                    <svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
                </button>
                <input type="text" class="log-block-title" value="${escapeAttr(block.title)}" placeholder="블록 제목">
                <div class="log-block-actions">
                    <button type="button" class="log-block-btn log-block-btn--duplicate" title="블록 복제">⧉</button>
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

        // 포커스 추적 (블록 키보드 이동용)
        contentEl.addEventListener('focus', () => {
            lastFocusedBlockId = blockId;
        });

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

        // 이미지 드래그앤드롭 이벤트
        contentEl.addEventListener('dragover', (e) => {
            // 파일 드롭인지 확인 (블록 드래그와 구분)
            if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                e.stopPropagation();
                contentEl.classList.add('drag-over-image');
            }
        });

        contentEl.addEventListener('dragleave', (e) => {
            contentEl.classList.remove('drag-over-image');
        });

        contentEl.addEventListener('drop', async (e) => {
            // 파일 드롭인지 확인
            if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                e.stopPropagation();
                contentEl.classList.remove('drag-over-image');

                const files = e.dataTransfer.files;
                for (const file of files) {
                    if (file.type.startsWith('image/')) {
                        try {
                            const base64 = await blobToBase64(file);
                            const compressed = await compressImage(base64);
                            const imgHtml = `<img src="${compressed}" style="max-width: 100%; border-radius: 8px; margin: 0.5em 0;">`;

                            // 커서 위치에 이미지 삽입
                            contentEl.focus();
                            document.execCommand('insertHTML', false, imgHtml);

                            // 블록 내용 업데이트
                            setTimeout(() => {
                                updateLogBlock(blockId, { content: getContentEditableContent(contentEl) });
                            }, 100);

                            showToast('이미지가 추가되었습니다');
                        } catch (err) {
                            console.error('이미지 처리 실패:', err);
                            showToast('이미지 추가에 실패했습니다');
                        }
                    }
                }
            }
        });

        // 제목
        const titleInput = blockEl.querySelector('.log-block-title');
        titleInput.addEventListener('input', (e) => {
            updateLogBlock(blockId, { title: e.target.value });
        });

        // 제목 입력에서도 포커스 추적
        titleInput.addEventListener('focus', () => {
            lastFocusedBlockId = blockId;
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

        // 복제 버튼
        const duplicateBtn = blockEl.querySelector('.log-block-btn--duplicate');
        duplicateBtn.addEventListener('click', () => {
            duplicateLogBlock(blockId);
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
    // 인용구 색상
    quoteColor: "#6b7280",
    quoteBgColor: "#f3f4f6",
    // 마크다운 제목 색상
    headingColor: "#111827",
    // 구분선 색상
    dividerColor: "#d1d5db",
    // 말풍선 색상
    aiBubbleColor: "#f4f4f5",
    userBubbleColor: "#dbeafe",
    fontFamily: "Pretendard, sans-serif",
    fontSize: 16,
    fontWeight: 400,
    containerWidth: 800,
    containerPadding: 2,
    // 컨테이너 외부 여백(위/아래) - margin으로 적용
    containerOuterMarginY: 0,
    // (레거시 호환) 4방향 외부 여백
    containerMarginTop: 0,
    containerMarginRight: 0,
    containerMarginBottom: 0,
    containerMarginLeft: 0,
    borderRadius: 16,
    bubbleRadius: 16,
    bubblePadding: 1,
    bubbleMaxWidth: 85,
    bubbleGap: 1,
    blockGap: 1.5,
    // 접기/펼치기(<details>)
    detailsBorderRadius: 12,
    detailsBorderWidth: 1,
    detailsSummaryFontSize: 1,
    detailsSummaryListStyleNone: true,
    detailsSummaryBgColor: "#f3f4f6",
    // 로그 블록
    blockTitleFontSize: 0.75,
    blockTitleFontWeight: 600,
    blockTitleMarginBottom: 1,
    blockTitleColor: "#71717a",
    lineHeight: 1.8,
    // 로그 블록(섹션) 단위 줄 간격
    blockLineHeight: 1.8,
    letterSpacing: 0,
    // 헤더 정렬
    headerAlign: "left",
    logTitleSize: 1.8,
    headerRadius: 16,
    // 헤더 테두리 (0이면 적용 안 함; 색상은 dividerColor를 사용)
    headerBorderWidth: 0,
    // 테두리 & 그림자
    borderWidth: 0,
    borderColor: "#e4e4e7",
    borderStyle: "solid",
    shadowIntensity: 30,
    // 배경 그라데이션
    bgGradient: false,
    bgGradientColor: "#e0e7ff",
    bgGradientDirection: "to bottom right",
    bgGradientAngle: 135,
    bgGradientRadial: false,
    // 텍스트 정렬
    textAlign: "justify",
    // 뱃지 색상 & 스타일
    badgeModelColor: "#18181b",
    badgePromptColor: "#71717a",
    badgeSubColor: "#a1a1aa",
    badgeRadius: 20,
    badgeStyle: "filled",
    badgeScale: 1,
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

    // 헤더 배경
    headerBgColor: "#ffffff",
    headerBgOpacity: 100,
    headerBgGradient: false,
    headerBgGradientColor: "#f5f5f5",
    headerBgGradientAngle: 135,

    // 말풍선 배경(고급)
    aiBubbleOpacity: 100,
    aiBubbleGradient: false,
    aiBubbleGradientColor: "#e5e7eb",
    aiBubbleGradientAngle: 135,
    userBubbleOpacity: 100,
    userBubbleGradient: false,
    userBubbleGradientColor: "#e5e7eb",
    userBubbleGradientAngle: 135,
};

// 테마 프리셋 정의
const themePresets = {
    // Light Themes
    "light-pure": {
        bgColor: "#ffffff", textColor: "#171717", charColor: "#171717",
        boldColor: "#ef4444", italicColor: "#6366f1", dialogueColor: "#059669", dialogueBgColor: "#f0fdf4",
        quoteColor: "#6b7280", quoteBgColor: "#f3f4f6", headingColor: "#171717", dividerColor: "#e5e5e5",
        badgeModelColor: "#171717", badgePromptColor: "#737373", badgeSubColor: "#a3a3a3",
        borderColor: "#e5e5e5",
        aiBubbleColor: "#f5f5f5", userBubbleColor: "#e0f2fe",
        bubbleBorderColor: "#6366f1", bgGradientColor: "#f5f5f5",
        imageBorderColor: "#e5e5e5"
    },
    "light-peach": {
        bgColor: "#fff5f5", textColor: "#4c0519", charColor: "#be123c",
        boldColor: "#e11d48", italicColor: "#fb7185", dialogueColor: "#9f1239", dialogueBgColor: "#ffe4e6",
        quoteColor: "#881337", quoteBgColor: "#fecdd3", headingColor: "#4c0519", dividerColor: "#fecdd3",
        badgeModelColor: "#be123c", badgePromptColor: "#fb7185", badgeSubColor: "#fda4af",
        borderColor: "#fecdd3",
        aiBubbleColor: "#ffe4e6", userBubbleColor: "#fecdd3",
        bubbleBorderColor: "#fb7185", bgGradientColor: "#ffe4e6",
        imageBorderColor: "#fecdd3"
    },
    "light-mint": {
        bgColor: "#f0fdfa", textColor: "#134e4a", charColor: "#0d9488",
        boldColor: "#0f766e", italicColor: "#2dd4bf", dialogueColor: "#115e59", dialogueBgColor: "#ccfbf1",
        quoteColor: "#115e59", quoteBgColor: "#99f6e4", headingColor: "#134e4a", dividerColor: "#99f6e4",
        badgeModelColor: "#0d9488", badgePromptColor: "#5eead4", badgeSubColor: "#99f6e4",
        borderColor: "#99f6e4",
        aiBubbleColor: "#ccfbf1", userBubbleColor: "#99f6e4",
        bubbleBorderColor: "#2dd4bf", bgGradientColor: "#ccfbf1",
        imageBorderColor: "#99f6e4"
    },
    "light-sky": {
        bgColor: "#f0f9ff", textColor: "#0c4a6e", charColor: "#0284c7",
        boldColor: "#0369a1", italicColor: "#38bdf8", dialogueColor: "#075985", dialogueBgColor: "#e0f2fe",
        quoteColor: "#0369a1", quoteBgColor: "#bae6fd", headingColor: "#0c4a6e", dividerColor: "#bae6fd",
        badgeModelColor: "#0284c7", badgePromptColor: "#38bdf8", badgeSubColor: "#7dd3fc",
        borderColor: "#bae6fd",
        aiBubbleColor: "#e0f2fe", userBubbleColor: "#bae6fd",
        bubbleBorderColor: "#38bdf8", bgGradientColor: "#e0f2fe",
        imageBorderColor: "#bae6fd"
    },
    "light-lilac": {
        bgColor: "#faf5ff", textColor: "#4c1d95", charColor: "#7c3aed",
        boldColor: "#6d28d9", italicColor: "#a78bfa", dialogueColor: "#5b21b6", dialogueBgColor: "#ede9fe",
        quoteColor: "#6d28d9", quoteBgColor: "#ddd6fe", headingColor: "#4c1d95", dividerColor: "#ddd6fe",
        badgeModelColor: "#7c3aed", badgePromptColor: "#a78bfa", badgeSubColor: "#c4b5fd",
        borderColor: "#ddd6fe",
        aiBubbleColor: "#ede9fe", userBubbleColor: "#ddd6fe",
        bubbleBorderColor: "#a78bfa", bgGradientColor: "#ede9fe",
        imageBorderColor: "#ddd6fe"
    },

    // Light Themes (More)
    "light-cream": {
        bgColor: "#fff7ed", textColor: "#451a03", charColor: "#9a3412",
        boldColor: "#ea580c", italicColor: "#06b6d4", dialogueColor: "#0f766e", dialogueBgColor: "#ecfeff",
        quoteColor: "#92400e", quoteBgColor: "#ffedd5", headingColor: "#451a03", dividerColor: "#fed7aa",
        badgeModelColor: "#9a3412", badgePromptColor: "#c2410c", badgeSubColor: "#fb923c",
        borderColor: "#fed7aa",
        aiBubbleColor: "#ffedd5", userBubbleColor: "#ecfeff",
        bubbleBorderColor: "#fb923c", bgGradientColor: "#ffedd5",
        imageBorderColor: "#fed7aa"
    },
    "light-sakura": {
        bgColor: "#fff1f2", textColor: "#500724", charColor: "#be185d",
        boldColor: "#be123c", italicColor: "#db2777", dialogueColor: "#be185d", dialogueBgColor: "#fce7f3",
        quoteColor: "#831843", quoteBgColor: "#fbcfe8", headingColor: "#500724", dividerColor: "#fbcfe8",
        badgeModelColor: "#be185d", badgePromptColor: "#db2777", badgeSubColor: "#f472b6",
        borderColor: "#fbcfe8",
        aiBubbleColor: "#fce7f3", userBubbleColor: "#fbcfe8",
        bubbleBorderColor: "#db2777", bgGradientColor: "#fce7f3",
        imageBorderColor: "#fbcfe8"
    },
    "light-aqua": {
        bgColor: "#ecfeff", textColor: "#164e63", charColor: "#0891b2",
        boldColor: "#0e7490", italicColor: "#06b6d4", dialogueColor: "#0ea5e9", dialogueBgColor: "#cffafe",
        quoteColor: "#155e75", quoteBgColor: "#a5f3fc", headingColor: "#164e63", dividerColor: "#a5f3fc",
        badgeModelColor: "#0891b2", badgePromptColor: "#06b6d4", badgeSubColor: "#67e8f9",
        borderColor: "#a5f3fc",
        aiBubbleColor: "#cffafe", userBubbleColor: "#e0f2fe",
        bubbleBorderColor: "#06b6d4", bgGradientColor: "#cffafe",
        imageBorderColor: "#a5f3fc"
    },
    "light-latte": {
        bgColor: "#f6f0e8", textColor: "#3f2d20", charColor: "#7c5c42",
        boldColor: "#b45309", italicColor: "#0f766e", dialogueColor: "#0f766e", dialogueBgColor: "#e7f5ef",
        quoteColor: "#5c4033", quoteBgColor: "#efe4d6", headingColor: "#3f2d20", dividerColor: "#e7d6c1",
        badgeModelColor: "#7c5c42", badgePromptColor: "#b45309", badgeSubColor: "#d6a77a",
        borderColor: "#e7d6c1",
        aiBubbleColor: "#efe4d6", userBubbleColor: "#e7f5ef",
        bubbleBorderColor: "#b45309", bgGradientColor: "#efe4d6",
        imageBorderColor: "#e7d6c1"
    },
    "light-citrus": {
        bgColor: "#fefce8", textColor: "#422006", charColor: "#a16207",
        boldColor: "#ca8a04", italicColor: "#84cc16", dialogueColor: "#15803d", dialogueBgColor: "#dcfce7",
        quoteColor: "#713f12", quoteBgColor: "#fef08a", headingColor: "#422006", dividerColor: "#fde047",
        badgeModelColor: "#a16207", badgePromptColor: "#ca8a04", badgeSubColor: "#84cc16",
        borderColor: "#fde047",
        aiBubbleColor: "#fef08a", userBubbleColor: "#dcfce7",
        bubbleBorderColor: "#84cc16", bgGradientColor: "#fef08a",
        imageBorderColor: "#fde047"
    },
    // Dark Themes
    "dark-space": {
        bgColor: "#0f172a", textColor: "#f8fafc", charColor: "#94a3b8",
        boldColor: "#38bdf8", italicColor: "#818cf8", dialogueColor: "#22d3ee", dialogueBgColor: "#1e293b",
        quoteColor: "#94a3b8", quoteBgColor: "#334155", headingColor: "#f8fafc", dividerColor: "#334155",
        badgeModelColor: "#334155", badgePromptColor: "#475569", badgeSubColor: "#64748b",
        borderColor: "#1e293b",
        aiBubbleColor: "#1e293b", userBubbleColor: "#334155",
        bubbleBorderColor: "#818cf8", bgGradientColor: "#1e293b",
        imageBorderColor: "#334155"
    },
    "dark-charcoal": {
        bgColor: "#18181b", textColor: "#fafafa", charColor: "#fbbf24",
        boldColor: "#f59e0b", italicColor: "#fbbf24", dialogueColor: "#fb923c", dialogueBgColor: "#27272a",
        quoteColor: "#a1a1aa", quoteBgColor: "#3f3f46", headingColor: "#fafafa", dividerColor: "#3f3f46",
        badgeModelColor: "#d97706", badgePromptColor: "#f59e0b", badgeSubColor: "#fbbf24",
        borderColor: "#27272a",
        aiBubbleColor: "#27272a", userBubbleColor: "#3f3f46",
        bubbleBorderColor: "#fbbf24", bgGradientColor: "#27272a",
        imageBorderColor: "#3f3f46"
    },
    "dark-forest": {
        bgColor: "#052e16", textColor: "#f0fdf4", charColor: "#4ade80",
        boldColor: "#22c55e", italicColor: "#86efac", dialogueColor: "#4ade80", dialogueBgColor: "#14532d",
        quoteColor: "#86efac", quoteBgColor: "#166534", headingColor: "#f0fdf4", dividerColor: "#166534",
        badgeModelColor: "#15803d", badgePromptColor: "#22c55e", badgeSubColor: "#4ade80",
        borderColor: "#14532d",
        aiBubbleColor: "#14532d", userBubbleColor: "#166534",
        bubbleBorderColor: "#4ade80", bgGradientColor: "#14532d",
        imageBorderColor: "#166534"
    },
    "dark-navy": {
        bgColor: "#172554", textColor: "#eff6ff", charColor: "#60a5fa",
        boldColor: "#3b82f6", italicColor: "#93c5fd", dialogueColor: "#60a5fa", dialogueBgColor: "#1e3a8a",
        quoteColor: "#93c5fd", quoteBgColor: "#1e40af", headingColor: "#eff6ff", dividerColor: "#1e40af",
        badgeModelColor: "#2563eb", badgePromptColor: "#3b82f6", badgeSubColor: "#60a5fa",
        borderColor: "#1e3a8a",
        aiBubbleColor: "#1e3a8a", userBubbleColor: "#1e40af",
        bubbleBorderColor: "#60a5fa", bgGradientColor: "#1e3a8a",
        imageBorderColor: "#1e40af"
    },
    "dark-cyber": {
        bgColor: "#09090b", textColor: "#fdf4ff", charColor: "#d946ef",
        boldColor: "#e879f9", italicColor: "#f0abfc", dialogueColor: "#c026d3", dialogueBgColor: "#2a0a2e",
        quoteColor: "#f0abfc", quoteBgColor: "#3b0764", headingColor: "#fdf4ff", dividerColor: "#581c87",
        badgeModelColor: "#a21caf", badgePromptColor: "#c026d3", badgeSubColor: "#e879f9",
        borderColor: "#27272a",
        aiBubbleColor: "#18181b", userBubbleColor: "#2a0a2e",
        bubbleBorderColor: "#d946ef", bgGradientColor: "#2a0a2e",
        imageBorderColor: "#d946ef"
    },

    // Dark Themes (More)
    "dark-ember": {
        bgColor: "#1f0a0a", textColor: "#fff7ed", charColor: "#fb7185",
        boldColor: "#f97316", italicColor: "#f43f5e", dialogueColor: "#fb7185", dialogueBgColor: "#3f1b1b",
        quoteColor: "#fecaca", quoteBgColor: "#4c1d1d", headingColor: "#fff7ed", dividerColor: "#4c1d1d",
        badgeModelColor: "#f97316", badgePromptColor: "#f43f5e", badgeSubColor: "#fb7185",
        borderColor: "#3f1b1b",
        aiBubbleColor: "#2a0f0f", userBubbleColor: "#3f1b1b",
        bubbleBorderColor: "#f97316", bgGradientColor: "#2a0f0f",
        imageBorderColor: "#4c1d1d"
    },
    "dark-emerald": {
        bgColor: "#021c1a", textColor: "#ecfdf5", charColor: "#34d399",
        boldColor: "#10b981", italicColor: "#14b8a6", dialogueColor: "#34d399", dialogueBgColor: "#064e3b",
        quoteColor: "#a7f3d0", quoteBgColor: "#065f46", headingColor: "#ecfdf5", dividerColor: "#065f46",
        badgeModelColor: "#10b981", badgePromptColor: "#34d399", badgeSubColor: "#14b8a6",
        borderColor: "#064e3b",
        aiBubbleColor: "#064e3b", userBubbleColor: "#065f46",
        bubbleBorderColor: "#14b8a6", bgGradientColor: "#043b34",
        imageBorderColor: "#065f46"
    },
    "dark-plum": {
        bgColor: "#1b1027", textColor: "#faf5ff", charColor: "#c4b5fd",
        boldColor: "#a855f7", italicColor: "#f472b6", dialogueColor: "#c084fc", dialogueBgColor: "#2e1a47",
        quoteColor: "#e9d5ff", quoteBgColor: "#3b1a5a", headingColor: "#faf5ff", dividerColor: "#3b1a5a",
        badgeModelColor: "#a855f7", badgePromptColor: "#c084fc", badgeSubColor: "#f472b6",
        borderColor: "#2e1a47",
        aiBubbleColor: "#2e1a47", userBubbleColor: "#3b1a5a",
        bubbleBorderColor: "#c084fc", bgGradientColor: "#1b1027",
        imageBorderColor: "#3b1a5a"
    },
    "dark-slate": {
        bgColor: "#0b1220", textColor: "#e2e8f0", charColor: "#94a3b8",
        boldColor: "#22d3ee", italicColor: "#60a5fa", dialogueColor: "#38bdf8", dialogueBgColor: "#111c33",
        quoteColor: "#cbd5e1", quoteBgColor: "#1f2a44", headingColor: "#e2e8f0", dividerColor: "#1f2a44",
        badgeModelColor: "#94a3b8", badgePromptColor: "#60a5fa", badgeSubColor: "#22d3ee",
        borderColor: "#111c33",
        aiBubbleColor: "#111c33", userBubbleColor: "#1f2a44",
        bubbleBorderColor: "#22d3ee", bgGradientColor: "#0b1220",
        imageBorderColor: "#1f2a44"
    },
    "dark-rosewood": {
        bgColor: "#140a0f", textColor: "#fff1f2", charColor: "#fda4af",
        boldColor: "#fb7185", italicColor: "#f43f5e", dialogueColor: "#fda4af", dialogueBgColor: "#2a0f1b",
        quoteColor: "#fecdd3", quoteBgColor: "#3f0d1d", headingColor: "#fff1f2", dividerColor: "#3f0d1d",
        badgeModelColor: "#fb7185", badgePromptColor: "#f43f5e", badgeSubColor: "#fda4af",
        borderColor: "#2a0f1b",
        aiBubbleColor: "#2a0f1b", userBubbleColor: "#3f0d1d",
        bubbleBorderColor: "#fb7185", bgGradientColor: "#140a0f",
        imageBorderColor: "#3f0d1d"
    },
    // Special Themes
    "special-sepia": {
        bgColor: "#f5f0e6", textColor: "#3d3020", charColor: "#6b5a3e",
        boldColor: "#8b6914", italicColor: "#a67c52", dialogueColor: "#5c4d3c", dialogueBgColor: "#ebe3d3",
        quoteColor: "#8b7355", quoteBgColor: "#e0d5c1", headingColor: "#3d3020", dividerColor: "#d4c9b5",
        badgeModelColor: "#6b5a3e", badgePromptColor: "#8b7355", badgeSubColor: "#a69076",
        borderColor: "#d4c9b5",
        aiBubbleColor: "#ebe3d3", userBubbleColor: "#e0d5c1",
        bubbleBorderColor: "#a67c52", bgGradientColor: "#ebe3d3",
        imageBorderColor: "#d4c9b5"
    },
    "special-noir": {
        bgColor: "#1a1a1a", textColor: "#c0c0c0", charColor: "#e0e0e0",
        boldColor: "#ffffff", italicColor: "#909090", dialogueColor: "#d0d0d0", dialogueBgColor: "#2a2a2a",
        quoteColor: "#909090", quoteBgColor: "#333333", headingColor: "#e0e0e0", dividerColor: "#404040",
        badgeModelColor: "#505050", badgePromptColor: "#707070", badgeSubColor: "#808080",
        borderColor: "#333333",
        aiBubbleColor: "#252525", userBubbleColor: "#303030",
        bubbleBorderColor: "#606060", bgGradientColor: "#0d0d0d",
        imageBorderColor: "#404040"
    },
    "special-neon": {
        bgColor: "#0a0a12", textColor: "#e0e0ff", charColor: "#00ffff",
        boldColor: "#ff00ff", italicColor: "#00ff88", dialogueColor: "#ffff00", dialogueBgColor: "#1a1a2e",
        quoteColor: "#00ffff", quoteBgColor: "#1a1a2e", headingColor: "#ff00ff", dividerColor: "#2a2a4e",
        badgeModelColor: "#ff0080", badgePromptColor: "#00ffff", badgeSubColor: "#80ff00",
        borderColor: "#2a2a4e",
        aiBubbleColor: "#12121f", userBubbleColor: "#1a1a2e",
        bubbleBorderColor: "#ff00ff", bgGradientColor: "#0f0f1a",
        imageBorderColor: "#00ffff"
    },

    // Reference Themes
    "ref-instagram": {
        bgColor: "#ffffff", textColor: "#111827", charColor: "#e1306c",
        boldColor: "#fd1d1d", italicColor: "#833ab4", dialogueColor: "#5851db", dialogueBgColor: "#eef2ff",
        quoteColor: "#833ab4", quoteBgColor: "#fdf2f8", headingColor: "#111827", dividerColor: "#e5e7eb",
        badgeModelColor: "#833ab4", badgePromptColor: "#e1306c", badgeSubColor: "#f77737",
        borderColor: "#e5e7eb",
        aiBubbleColor: "#f9fafb", userBubbleColor: "#eef2ff",
        bubbleBorderColor: "#e1306c", bgGradientColor: "#fdf2f8",
        imageBorderColor: "#e5e7eb"
    },
    "ref-discord": {
        bgColor: "#313338", textColor: "#f2f3f5", charColor: "#5865f2",
        boldColor: "#57f287", italicColor: "#fee75c", dialogueColor: "#5865f2", dialogueBgColor: "#2b2d31",
        quoteColor: "#b5bac1", quoteBgColor: "#1e1f22", headingColor: "#f2f3f5", dividerColor: "#1e1f22",
        badgeModelColor: "#5865f2", badgePromptColor: "#b5bac1", badgeSubColor: "#57f287",
        borderColor: "#1e1f22",
        aiBubbleColor: "#2b2d31", userBubbleColor: "#313338",
        bubbleBorderColor: "#5865f2", bgGradientColor: "#313338",
        imageBorderColor: "#1e1f22"
    },
    "ref-imessage": {
        bgColor: "#f5f5f7", textColor: "#111827", charColor: "#007aff",
        boldColor: "#007aff", italicColor: "#34c759", dialogueColor: "#0f172a", dialogueBgColor: "#ffffff",
        quoteColor: "#6b7280", quoteBgColor: "#f3f4f6", headingColor: "#111827", dividerColor: "#e5e7eb",
        badgeModelColor: "#007aff", badgePromptColor: "#34c759", badgeSubColor: "#6b7280",
        borderColor: "#e5e7eb",
        aiBubbleColor: "#eef2ff", userBubbleColor: "#ecfccb",
        bubbleBorderColor: "#007aff", bgGradientColor: "#f5f5f7",
        imageBorderColor: "#d1d5db"
    },
    "ref-notion": {
        bgColor: "#fbfbfa", textColor: "#111111", charColor: "#2f3437",
        boldColor: "#111111", italicColor: "#6b7280", dialogueColor: "#111111", dialogueBgColor: "#f3f4f6",
        quoteColor: "#6b7280", quoteBgColor: "#f3f4f6", headingColor: "#111111", dividerColor: "#e5e5e5",
        badgeModelColor: "#111111", badgePromptColor: "#2f3437", badgeSubColor: "#6b7280",
        borderColor: "#e5e5e5",
        aiBubbleColor: "#ffffff", userBubbleColor: "#f3f4f6",
        bubbleBorderColor: "#2f3437", bgGradientColor: "#fbfbfa",
        imageBorderColor: "#e5e5e5"
    },
    "ref-terminal": {
        bgColor: "#030712", textColor: "#bbf7d0", charColor: "#22c55e",
        boldColor: "#86efac", italicColor: "#10b981", dialogueColor: "#22c55e", dialogueBgColor: "#052e16",
        quoteColor: "#bbf7d0", quoteBgColor: "#064e3b", headingColor: "#ecfdf5", dividerColor: "#064e3b",
        badgeModelColor: "#22c55e", badgePromptColor: "#86efac", badgeSubColor: "#bbf7d0",
        borderColor: "#052e16",
        aiBubbleColor: "#052e16", userBubbleColor: "#064e3b",
        bubbleBorderColor: "#22c55e", bgGradientColor: "#030712",
        imageBorderColor: "#064e3b"
    }
};

// 테마 프리셋: 헤더 배경색을 프리셋별로 더 정확하게 세팅
// - 기본: 말풍선 색을 기준으로 헤더 배경을 맞춤
// - 레퍼런스 프리셋: 실제 UI 느낌에 맞게 고정값 오버라이드
Object.entries(themePresets).forEach(([_, preset]) => {
    if (!Object.prototype.hasOwnProperty.call(preset, "headerBgColor")) {
        preset.headerBgColor = preset.aiBubbleColor ?? preset.bgGradientColor ?? preset.bgColor;
    }
    if (!Object.prototype.hasOwnProperty.call(preset, "headerBgGradientColor")) {
        preset.headerBgGradientColor = preset.userBubbleColor ?? preset.bgGradientColor ?? preset.bgColor;
    }
    if (!Object.prototype.hasOwnProperty.call(preset, "detailsSummaryBgColor")) {
        preset.detailsSummaryBgColor = preset.quoteBgColor ?? preset.aiBubbleColor ?? preset.bgGradientColor ?? preset.bgColor;
    }

    // 고급 탭: 말풍선 배경(그라데이션) 보조색도 프리셋에 포함
    // - 프리셋에 값이 없으면, 기본 말풍선 색에서 테마 톤에 맞춰 자동 파생
    //   (밝은 배경은 조금 어둡게, 어두운 배경은 조금 밝게)
    if (!Object.prototype.hasOwnProperty.call(preset, "aiBubbleGradientColor")) {
        const base = preset.aiBubbleColor ?? "#e5e7eb";
        const amount = getContrastTextColor(base) === "#fff" ? 18 : -12;
        preset.aiBubbleGradientColor = adjustColor(base, amount);
    }
    if (!Object.prototype.hasOwnProperty.call(preset, "userBubbleGradientColor")) {
        const base = preset.userBubbleColor ?? "#e5e7eb";
        const amount = getContrastTextColor(base) === "#fff" ? 18 : -12;
        preset.userBubbleGradientColor = adjustColor(base, amount);
    }
});

if (themePresets["ref-instagram"]) {
    themePresets["ref-instagram"].headerBgColor = "#ffffff";
    themePresets["ref-instagram"].headerBgGradientColor = "#fdf2f8";
}
if (themePresets["ref-discord"]) {
    themePresets["ref-discord"].headerBgColor = "#2b2d31";
    themePresets["ref-discord"].headerBgGradientColor = "#1e1f22";
}
if (themePresets["ref-imessage"]) {
    themePresets["ref-imessage"].headerBgColor = "#ffffff";
    themePresets["ref-imessage"].headerBgGradientColor = "#f5f5f7";
}
if (themePresets["ref-notion"]) {
    themePresets["ref-notion"].headerBgColor = "#ffffff";
    themePresets["ref-notion"].headerBgGradientColor = "#fbfbfa";
}
if (themePresets["ref-terminal"]) {
    themePresets["ref-terminal"].headerBgColor = "#052e16";
    themePresets["ref-terminal"].headerBgGradientColor = "#064e3b";
}

// 색상 밝기 조절 헬퍼 (상단 이동)
function adjustColor(hex, amount) {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
    const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function clampNumber(val, min, max) {
    const num = Number(val);
    if (Number.isNaN(num)) return min;
    return Math.min(max, Math.max(min, num));
}

function normalizeAngleDegrees(val, fallback = 135) {
    const num = Number(val);
    if (Number.isNaN(num)) return fallback;
    let a = num % 360;
    if (a < 0) a += 360;
    return a;
}

function legacyGradientDirectionToAngle(direction) {
    switch (direction) {
        case "to bottom":
            return 180;
        case "to right":
            return 90;
        case "to bottom left":
            return 225;
        case "to bottom right":
        default:
            return 135;
    }
}

function hexToRgba(hex, alpha) {
    const a = clampNumber(alpha, 0, 1);
    if (typeof hex !== "string") return `rgba(0,0,0,${a})`;
    if (!hex.startsWith("#") || (hex.length !== 7)) return hex;
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some(n => Number.isNaN(n))) return hex;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function applyOpacityToColor(color, opacity01) {
    const a = clampNumber(opacity01, 0, 1);
    if (a >= 1) return color;
    return hexToRgba(color, a);
}

function buildLinearGradient(angleDeg, color1, color2) {
    const angle = normalizeAngleDegrees(angleDeg, 135);
    return `linear-gradient(${angle}deg, ${color1} 0%, ${color2} 100%)`;
}

function buildRadialGradient(color1, color2) {
    return `radial-gradient(circle, ${color1} 0%, ${color2} 100%)`;
}

function buildContainerBackgroundCSS() {
    if (!settings.bgGradient) return settings.bgColor;
    if (settings.bgGradientRadial) {
        return buildRadialGradient(settings.bgColor, settings.bgGradientColor);
    }
    return buildLinearGradient(settings.bgGradientAngle, settings.bgColor, settings.bgGradientColor);
}

function buildHeaderBackgroundCSS() {
    const opacity = clampNumber((settings.headerBgOpacity ?? 100) / 100, 0, 1);
    const base = applyOpacityToColor(settings.headerBgColor, opacity);
    if (settings.headerBgGradient) {
        const secondary = applyOpacityToColor(settings.headerBgGradientColor, opacity);
        return buildLinearGradient(settings.headerBgGradientAngle, base, secondary);
    }
    return base;
}

function buildBubbleBackgroundCSS(isAi) {
    const opacityKey = isAi ? "aiBubbleOpacity" : "userBubbleOpacity";
    const gradientKey = isAi ? "aiBubbleGradient" : "userBubbleGradient";
    const secondaryKey = isAi ? "aiBubbleGradientColor" : "userBubbleGradientColor";
    const angleKey = isAi ? "aiBubbleGradientAngle" : "userBubbleGradientAngle";
    const baseColor = isAi ? settings.aiBubbleColor : settings.userBubbleColor;

    const opacity = clampNumber((settings[opacityKey] ?? 100) / 100, 0, 1);
    const base = applyOpacityToColor(baseColor, opacity);
    if (settings[gradientKey]) {
        const secondary = applyOpacityToColor(settings[secondaryKey], opacity);
        return buildLinearGradient(settings[angleKey], base, secondary);
    }
    return base;
}

function migrateSettingsFromLoadedObject(loaded) {
    const has = (k) => Object.prototype.hasOwnProperty.call(loaded || {}, k);

    // 배경 그라데이션 (방향 문자열 -> 각도/원형)
    if (!has("bgGradientAngle") && has("bgGradientDirection")) {
        if (loaded.bgGradientDirection === "radial") {
            settings.bgGradientRadial = true;
            settings.bgGradientAngle = 135;
        } else {
            settings.bgGradientRadial = false;
            settings.bgGradientAngle = legacyGradientDirectionToAngle(loaded.bgGradientDirection);
        }
    }
    if (!has("bgGradientRadial")) {
        settings.bgGradientRadial = Boolean(settings.bgGradientRadial);
    }
    settings.bgGradientAngle = normalizeAngleDegrees(settings.bgGradientAngle, 135);

    // 컨테이너 외부 여백
    // - 현재: 위/아래 한 값(containerOuterMarginY)
    // - 레거시: containerOuterMargin(단일 값) 또는 4방향(containerMarginTop/Bottom 등)
    if (!has("containerOuterMarginY")) {
        if (has("containerOuterMargin")) {
            const m = Number(loaded.containerOuterMargin);
            settings.containerOuterMarginY = Number.isNaN(m) ? 0 : m;
        } else if (has("containerMarginTop") || has("containerMarginBottom")) {
            const rawTop = Number(loaded.containerMarginTop ?? 0);
            const rawBottom = Number(loaded.containerMarginBottom ?? rawTop ?? 0);
            const top = Number.isNaN(rawTop) ? 0 : rawTop;
            const bottom = Number.isNaN(rawBottom) ? top : rawBottom;
            settings.containerOuterMarginY = (top + bottom) / 2;
        }
    }
    settings.containerOuterMarginY = clampNumber(settings.containerOuterMarginY ?? 0, 0, 100);

    // (레거시 값 보정; 더 이상 렌더링에는 사용하지 않음)
    settings.containerMarginTop = clampNumber(settings.containerMarginTop ?? 0, 0, 100);
    settings.containerMarginRight = clampNumber(settings.containerMarginRight ?? 0, 0, 100);
    settings.containerMarginBottom = clampNumber(settings.containerMarginBottom ?? 0, 0, 100);
    settings.containerMarginLeft = clampNumber(settings.containerMarginLeft ?? 0, 0, 100);

    // 컨테이너 박스 그림자
    // - 현재: shadowIntensity(0이면 box-shadow 미출력)
    // - 레거시: boxShadow 토글(false면 shadowIntensity=0으로 변환)
    if (!has("shadowIntensity")) settings.shadowIntensity = settings.shadowIntensity ?? 30;
    settings.shadowIntensity = clampNumber(settings.shadowIntensity ?? 30, 0, 100);
    if (has("boxShadow")) {
        if (loaded.boxShadow === false) {
            settings.shadowIntensity = 0;
        }
        delete settings.boxShadow;
    }

    // 뱃지 크기
    if (!has("badgeScale")) {
        settings.badgeScale = clampNumber(settings.badgeScale ?? 1, 0.5, 3);
    }
    settings.badgeScale = clampNumber(settings.badgeScale ?? 1, 0.5, 3);

    // 접기/펼치기(<details>)
    if (!has("detailsBorderRadius")) settings.detailsBorderRadius = 12;
    if (!has("detailsBorderWidth")) settings.detailsBorderWidth = 1;
    if (!has("detailsSummaryFontSize")) settings.detailsSummaryFontSize = 1;
    if (!has("detailsSummaryListStyleNone")) settings.detailsSummaryListStyleNone = true;
    if (!has("detailsSummaryBgColor")) settings.detailsSummaryBgColor = settings.quoteBgColor ?? adjustColor(settings.bgColor, 10);
    settings.detailsBorderRadius = clampNumber(settings.detailsBorderRadius ?? 12, 0, 80);
    settings.detailsBorderWidth = clampNumber(settings.detailsBorderWidth ?? 1, 0, 12);
    settings.detailsSummaryFontSize = clampNumber(settings.detailsSummaryFontSize ?? 1, 0.6, 2);
    settings.detailsSummaryListStyleNone = Boolean(settings.detailsSummaryListStyleNone);
    if (!/^#[0-9A-Fa-f]{6}$/.test(String(settings.detailsSummaryBgColor))) {
        settings.detailsSummaryBgColor = settings.quoteBgColor ?? adjustColor(settings.bgColor, 10);
    }

    // 로그 블록 (제목)
    if (!has("blockTitleFontSize")) settings.blockTitleFontSize = 0.75;
    if (!has("blockTitleFontWeight")) settings.blockTitleFontWeight = 600;
    if (!has("blockTitleMarginBottom")) settings.blockTitleMarginBottom = 1;
    if (!has("blockTitleColor")) settings.blockTitleColor = adjustColor(settings.textColor, -60);
    settings.blockTitleFontSize = clampNumber(settings.blockTitleFontSize ?? 0.75, 0.4, 3);
    settings.blockTitleFontWeight = clampNumber(settings.blockTitleFontWeight ?? 600, 100, 900);
    settings.blockTitleMarginBottom = clampNumber(settings.blockTitleMarginBottom ?? 1, 0, 10);
    if (!/^#[0-9A-Fa-f]{6}$/.test(String(settings.blockTitleColor))) {
        settings.blockTitleColor = adjustColor(settings.textColor, -60);
    }

    // 레거시: 로그 블록 배경 (더 이상 사용하지 않음)
    if (has("blockWrapperBgColor")) delete settings.blockWrapperBgColor;
    if (has("blockWrapperBgOpacity")) delete settings.blockWrapperBgOpacity;

    // 로그 블록 줄 간격
    if (!has("blockLineHeight")) settings.blockLineHeight = settings.lineHeight ?? 1.8;
    settings.blockLineHeight = clampNumber(settings.blockLineHeight ?? 1.8, 0.8, 3);

    // 레거시: paragraphSpacing (더 이상 사용하지 않음)
    if (has("paragraphSpacing")) {
        delete settings.paragraphSpacing;
    }

    // 헤더 배경 (기존: bgColor 기반 자동 그라데이션)
    if (!has("headerBgColor")) {
        settings.headerBgColor = adjustColor(settings.bgColor, 12);
        settings.headerBgGradientColor = adjustColor(settings.bgColor, 6);
        settings.headerBgGradient = true;
        settings.headerBgOpacity = 100;
        settings.headerBgGradientAngle = 135;
    }
    if (!has("headerRadius")) settings.headerRadius = 16;
    // 헤더 테두리: 토글 제거, 두께만 사용 (0이면 테두리 없음)
    if (!has("headerBorderWidth")) {
        if (has("headerBorder")) {
            settings.headerBorderWidth = loaded.headerBorder ? (settings.headerBorderWidth ?? 1) : 0;
        } else {
            settings.headerBorderWidth = settings.headerBorderWidth ?? 0;
        }
    }
    if (!has("headerBgOpacity")) settings.headerBgOpacity = 100;
    if (!has("headerBgGradient")) settings.headerBgGradient = Boolean(settings.headerBgGradient);
    if (!has("headerBgGradientColor")) settings.headerBgGradientColor = adjustColor(settings.bgColor, 6);
    if (!has("headerBgGradientAngle")) settings.headerBgGradientAngle = 135;
    settings.headerRadius = clampNumber(settings.headerRadius ?? 16, 0, 80);
    settings.headerBorderWidth = clampNumber(settings.headerBorderWidth ?? 0, 0, 12);

    // 레거시: 헤더 테두리 토글/색상 (더 이상 사용하지 않음)
    if (has("headerBorder")) delete settings.headerBorder;
    if (has("headerBorderColor")) delete settings.headerBorderColor;
    settings.headerBgOpacity = clampNumber(settings.headerBgOpacity ?? 100, 0, 100);
    settings.headerBgGradientAngle = normalizeAngleDegrees(settings.headerBgGradientAngle, 135);

    // 말풍선 그라데이션/투명도
    if (!has("aiBubbleOpacity")) settings.aiBubbleOpacity = 100;
    if (!has("aiBubbleGradient")) settings.aiBubbleGradient = false;
    if (!has("aiBubbleGradientColor")) settings.aiBubbleGradientColor = "#e5e7eb";
    if (!has("aiBubbleGradientAngle")) settings.aiBubbleGradientAngle = 135;
    settings.aiBubbleOpacity = clampNumber(settings.aiBubbleOpacity ?? 100, 0, 100);
    settings.aiBubbleGradientAngle = normalizeAngleDegrees(settings.aiBubbleGradientAngle, 135);

    if (!has("userBubbleOpacity")) settings.userBubbleOpacity = 100;
    if (!has("userBubbleGradient")) settings.userBubbleGradient = false;
    if (!has("userBubbleGradientColor")) settings.userBubbleGradientColor = "#e5e7eb";
    if (!has("userBubbleGradientAngle")) settings.userBubbleGradientAngle = 135;
    settings.userBubbleOpacity = clampNumber(settings.userBubbleOpacity ?? 100, 0, 100);
    settings.userBubbleGradientAngle = normalizeAngleDegrees(settings.userBubbleGradientAngle, 135);
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
            html: `<span style="color: ${settings.italicColor};"><em>${content}</em></span>`
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

    // 인용구 ('text') - 영문 작은따옴표
    result = result.replace(/'([^']+)'/g, (match, content) => {
        const placeholder = `__QUOTE_${placeholderIndex++}__`;
        let processedContent = content;
        placeholders.forEach(p => {
            processedContent = processedContent.replace(p.placeholder, p.html);
        });
        placeholders.push({
            placeholder,
            html: `<span style="color: ${settings.quoteColor}; background: ${settings.quoteBgColor}; padding: 0.1em 0.4em; border-radius: 4px; font-style: italic;">'${processedContent}'</span>`
        });
        return placeholder;
    });

    // 인용구 ('text') - 한글 작은따옴표
    result = result.replace(/\u2018([^\u2019]+)\u2019/g, (match, content) => {
        const placeholder = `__QUOTE_KR_${placeholderIndex++}__`;
        let processedContent = content;
        placeholders.forEach(p => {
            processedContent = processedContent.replace(p.placeholder, p.html);
        });
        placeholders.push({
            placeholder,
            html: `<span style="color: ${settings.quoteColor}; background: ${settings.quoteBgColor}; padding: 0.1em 0.4em; border-radius: 4px; font-style: italic;">\u2018${processedContent}\u2019</span>`
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
    // NOTE: margin은 출력 HTML에 포함하지 않음 (line-height 기반으로 간격 제어)
    return `text-align: ${settings.textAlign}; word-break: keep-all;`;
}

// HTML 블록 콘텐츠 파싱 (이미지 + 텍스트 혼합 처리)
function parseBlockContent(htmlContent) {
    // HTML이 아니면 (순수 텍스트) 기존 방식으로 처리
    if (!htmlContent.includes('<')) {
        const lines = htmlContent.split(/\r?\n/).filter(line => line.trim() !== '');
        let prevType = null;
        return lines.map(line => {
            const parsed = parseLine(line);
            const html = generateBubbleHTML(parsed, true, { prevType });
            prevType = parsed.type;
            return html;
        }).join('\n');
    }

    // HTML 파싱
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
    const container = doc.body.firstChild;

    const outputParts = [];
    let prevType = null;

    // 재귀적으로 노드 처리
    function processNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            // 텍스트 노드: 라인별로 파싱
            const text = node.textContent;
            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
            lines.forEach(line => {
                const parsed = parseLine(line);
                outputParts.push(generateBubbleHTML(parsed, true, { prevType }));
                prevType = parsed.type;
            });
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();

            if (tag === 'img') {
                // 이미지: background-image div로 출력 (아카라이브 호환)
                outputParts.push(`    ${getImageDivHTML(node.src)}`);
                prevType = 'image';
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
                    outputParts.push(generateBubbleHTML(parsed, true, { prevType }));
                    prevType = parsed.type;
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

    // 구분선 (---, ===, ***) - 3개 이상의 같은 문자
    if (/^(-{3,}|={3,}|\*{3,})$/.test(trimmed)) {
        return {
            type: 'divider',
            content: ''
        };
    }

    // 마크다운 제목 (# ~ ###)
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
        const level = headingMatch[1].length; // 1, 2, 3
        return {
            type: 'heading',
            level: level,
            content: headingMatch[2]
        };
    }

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

    // max-width: min(설정값, 100%)로 컨테이너를 넘지 않도록
    return `max-width: min(${settings.imageMaxWidth}px, 100%); height: auto; border-radius: ${settings.imageBorderRadius}px; ${borderStyle} ${shadowStyle}`;
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
            html: `<em>${content}</em>`
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
function generateBubbleHTML(parsed, isForCode = false, context = null) {
    const indent = isForCode ? '    ' : '';
    const bubblePadding = `${settings.bubblePadding}em ${settings.bubblePadding * 1.25}em`;
    const bubbleRadius = `${settings.bubbleRadius}px`;
    const bubbleMaxWidth = `${settings.bubbleMaxWidth}%`;
    const prevType = context?.prevType;
    const bubbleTopGap = (prevType === 'narration' || prevType === 'heading' || prevType === 'image') ? settings.bubbleGap : 0;
    const bubbleMargin = `${bubbleTopGap}em 0 ${settings.bubbleGap}em 0`;

    // 말풍선 테두리 스타일
    let bubbleBorderStyle = "";
    if (settings.bubbleBorder) {
        if (settings.bubbleBorderLeftOnly) {
            bubbleBorderStyle = `border-left: ${settings.bubbleBorderWidth}px solid ${settings.bubbleBorderColor};`;
        } else {
            bubbleBorderStyle = `border: ${settings.bubbleBorderWidth}px solid ${settings.bubbleBorderColor};`;
        }
    }

    // 구분선
    if (parsed.type === 'divider') {
        const dividerStyle = `margin: 1.5em 0; border: none; border-top: 1px solid ${settings.dividerColor}; height: 0;`;
        return `${indent}<hr style="${dividerStyle}">`;
    }

    // 마크다운 제목
    if (parsed.type === 'heading') {
        const content = parseMarkdown(parsed.content);
        let fontSize, fontWeight, marginBottom;

        switch (parsed.level) {
            case 1:
                fontSize = '1.5em';
                fontWeight = '800';
                marginBottom = '0.75em';
                break;
            case 2:
                fontSize = '1.25em';
                fontWeight = '700';
                marginBottom = '0.6em';
                break;
            case 3:
            default:
                fontSize = '1.1em';
                fontWeight = '600';
                marginBottom = '0.5em';
                break;
        }

        const headingTopGap = (prevType === 'narration') ? settings.bubbleGap : 0;
        const headingStyle = `margin: ${headingTopGap}em 0 ${marginBottom} 0; font-size: ${fontSize}; font-weight: ${fontWeight}; color: ${settings.headingColor}; line-height: 1.4;`;
        return `${indent}<p style="${headingStyle}">${content}</p>`;
    }

    if (parsed.type === 'ai') {
        const textColor = getContrastTextColor(settings.aiBubbleColor);
        const content = parseMarkdownForBubble(parsed.content);
        const wrapperStyle = `display: block; text-align: left; margin: ${bubbleMargin};`;
        const bubbleBg = buildBubbleBackgroundCSS(true);
        const bubbleStyle = `display: inline-block; padding: ${bubblePadding}; background: ${bubbleBg}; color: ${textColor}; border-radius: ${bubbleRadius} ${bubbleRadius} ${bubbleRadius} 0.25em; max-width: ${bubbleMaxWidth}; text-align: left; word-break: keep-all; ${bubbleBorderStyle}`;
        const nametagStyle = `display: block; margin-bottom: 0.375em; font-size: ${settings.nametagFontSize}em; font-weight: 600; opacity: 0.7;`;
        const charName = settings.charName || 'AI';

        if (settings.showNametag) {
            return `${indent}<div style="${wrapperStyle}"><div style="${bubbleStyle}"><span style="${nametagStyle}">${escapeHTMLContent(charName)}</span>${content}</div></div>`;
        } else {
            return `${indent}<div style="${wrapperStyle}"><div style="${bubbleStyle}">${content}</div></div>`;
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
        const bubbleBg = buildBubbleBackgroundCSS(false);
        const bubbleStyle = `display: inline-block; padding: ${bubblePadding}; background: ${bubbleBg}; color: ${textColor}; border-radius: ${bubbleRadius} ${bubbleRadius} 0.25em ${bubbleRadius}; max-width: ${bubbleMaxWidth}; text-align: left; word-break: keep-all; ${userBubbleBorderStyle}`;
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
        const scale = clampNumber(settings.badgeScale ?? 1, 0.5, 3);
        const paddingY = (6 * scale).toFixed(2);
        const paddingX = (12 * scale).toFixed(2);
        const fontSize = (0.75 * scale).toFixed(3);
        const baseStyle = `display: inline-block; margin: 0 8px 8px 0; padding: ${paddingY}px ${paddingX}px; border-radius: ${settings.badgeRadius}px; font-size: ${fontSize}em; font-weight: 600; line-height: 1.2; text-align: center; box-sizing: border-box;`;

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
        const headerBg = buildHeaderBackgroundCSS();
        const headerBorderStyle = (settings.headerBorderWidth ?? 0) > 0
            ? ` border: ${settings.headerBorderWidth}px solid ${settings.dividerColor};`
            : "";
        const headerStyle = `margin-bottom: 1.5em; padding: 1.5em; background: ${headerBg}; border-radius: ${settings.headerRadius}px;${headerBorderStyle}`;
        const headerTextAlign = settings.headerAlign;
        const justifyContent = headerTextAlign === 'center' ? 'center' : headerTextAlign === 'right' ? 'flex-end' : 'flex-start';

        // 캐릭터 이름 처리 (로그 제목 유무에 따라 다르게 표시)
        let charBadgeHTML = "";
        let logTitleHTML = "";

        if (settings.logTitle) {
            // 로그 제목이 있으면: 캐릭터 이름은 뱃지, 로그 제목은 크게
            if (settings.charName) {
                const charBadgeStyle = `display: inline-block; padding: 6px 14px; background: ${settings.charColor}; color: ${getContrastTextColor(settings.charColor)}; border-radius: ${settings.badgeRadius}px; font-size: 0.8em; font-weight: 700; letter-spacing: 0.02em;`;
                if (settings.charLink) {
                    charBadgeHTML = `    <div style="text-align: ${headerTextAlign}; margin-bottom: 0.75em;"><a href="${settings.charLink}" target="_blank" style="text-decoration: none;"><span style="${charBadgeStyle}">${settings.charName}</span></a></div>\n`;
                } else {
                    charBadgeHTML = `    <div style="text-align: ${headerTextAlign}; margin-bottom: 0.75em;"><span style="${charBadgeStyle}">${settings.charName}</span></div>\n`;
                }
            }
            const logTitleStyle = `margin: 0; font-size: ${settings.logTitleSize}em; font-weight: 800; color: ${settings.textColor}; letter-spacing: -0.02em; text-align: ${headerTextAlign};`;
            logTitleHTML = `    <p style="${logTitleStyle}">${settings.logTitle}</p>\n`;
        } else if (settings.charName) {
            // 로그 제목이 없으면: 캐릭터 이름을 제목처럼 크게 표시
            const charTitleStyle = `margin: 0; font-size: ${settings.logTitleSize}em; font-weight: 800; color: ${settings.charColor}; letter-spacing: -0.02em; text-align: ${headerTextAlign};`;
            if (settings.charLink) {
                logTitleHTML = `    <a href="${settings.charLink}" target="_blank" style="text-decoration: none;"><p style="${charTitleStyle}">${settings.charName}</p></a>\n`;
            } else {
                logTitleHTML = `    <p style="${charTitleStyle}">${settings.charName}</p>\n`;
            }
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
            const scale = clampNumber(settings.badgeScale ?? 1, 0.5, 3);
            const paddingY = (5 * scale).toFixed(2);
            const paddingX = (11 * scale).toFixed(2);
            const fontSize = (0.75 * scale).toFixed(3);
            const subBadgeStyle = `display: inline-block; margin: 0 8px 8px 0; padding: ${paddingY}px ${paddingX}px; background: transparent; border: 1px solid ${settings.badgeSubColor}; border-radius: ${settings.badgeRadius}px; font-size: ${fontSize}em; font-weight: 600; color: ${settings.badgeSubColor}; line-height: 1.2; text-align: center; box-sizing: border-box;`;
            tags.push(`<span style="${subBadgeStyle}">${settings.subModel}</span>`);
        }

        if (tags.length > 0) {
            const marginTop = (settings.logTitle || settings.charName) ? "margin-top: 1em;" : "";
            // 배지만 있을 때 아래 여백 제거
            const badgeMargin = (settings.logTitle || settings.charName) ? "margin: 0 8px 8px 0;" : "margin: 0 8px 0 0;";
            const tagsWithFixedMargin = tags.map(tag => tag.replace(/margin: 0 8px 8px 0;/g, badgeMargin));
            // text-align 사용 (아카라이브가 flex 속성 삭제함)
            tagsHTML = `    <div style="${marginTop} text-align: ${settings.headerAlign};">${tagsWithFixedMargin.join("")}</div>\n`;
        }

        headerHTML = `  <div style="${headerStyle}">\n${charBadgeHTML}${logTitleHTML}${tagsHTML}  </div>\n`;
    }

    // 블록별 HTML 생성
    const blocksHTML = blocksWithContent.map((block, index) => {
        // HTML 콘텐츠에서 라인별로 처리 (이미지 포함)
        const linesHTML = parseBlockContent(block.content);

        // 접기/펼치기 사용 여부
        if (block.collapsible) {
            const detailsRadius = clampNumber(settings.detailsBorderRadius ?? 12, 0, 80);
            const detailsBorderWidth = clampNumber(settings.detailsBorderWidth ?? 1, 0, 12);
            const summaryFontSize = clampNumber(settings.detailsSummaryFontSize ?? 1, 0.6, 2);
            const summaryListStyle = settings.detailsSummaryListStyleNone ? " list-style: none;" : "";
            const sectionStyleParts = [
                `margin: ${index > 0 ? settings.blockGap + 'em' : '0'} 0`,
                `border-radius: ${detailsRadius}px`,
            ];
            if (detailsBorderWidth > 0) {
                sectionStyleParts.push(`border: ${detailsBorderWidth}px solid ${settings.dividerColor}`);
            }
            const sectionStyle = sectionStyleParts.join("; ");
            const summaryStyle = `padding: 1em 1.25em; background: ${settings.detailsSummaryBgColor}; border-radius: ${detailsRadius}px; cursor: pointer; font-weight: 500; font-size: ${summaryFontSize}em; color: ${settings.charColor};${summaryListStyle} display: list-item;`;
            const contentStyle = `padding: 1.25em; line-height: ${settings.blockLineHeight};`;

            return `  <details open style="${sectionStyle}">
    <summary style="${summaryStyle}">${escapeHTMLContent(block.title)}</summary>
    <div style="${contentStyle}">
${linesHTML}
    </div>
  </details>`;
        } else {
            // 블록이 여러 개일 때만 섹션 구분 추가
            if (blocksWithContent.length > 1) {
                const sectionStyle = `margin: ${index > 0 ? settings.blockGap + 'em' : '0'} 0 0 0; line-height: ${settings.blockLineHeight}; ${index > 0 ? `padding-top: ${settings.blockGap}em; border-top: 1px solid ${settings.dividerColor};` : ''}`.trim();
                const labelStyle = `margin: 0 0 ${settings.blockTitleMarginBottom}em 0; font-size: ${settings.blockTitleFontSize}em; font-weight: ${settings.blockTitleFontWeight}; text-transform: uppercase; letter-spacing: 0.1em; color: ${settings.blockTitleColor};`;

                return `  <div style="${sectionStyle}">
    <p style="${labelStyle}">${escapeHTMLContent(block.title)}</p>
${linesHTML}
  </div>`;
            } else {
                const wrapperStyle = `line-height: ${settings.blockLineHeight};`;
                return `  <div style="${wrapperStyle}">
${linesHTML}
    </div>`;
            }
        }
    }).join("\n");

    // 컨테이너 스타일
    const containerStyleParts = [
        `max-width: ${settings.containerWidth}px`,
        `margin: ${settings.containerOuterMarginY}em auto`,
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
    containerStyleParts.push(`background: ${buildContainerBackgroundCSS()}`);

    // 테두리 추가
    if (settings.borderWidth > 0) {
        containerStyleParts.push(`border: ${settings.borderWidth}px ${settings.borderStyle} ${settings.borderColor}`);
    }

    // 그림자 추가 (0%면 속성 자체 미출력)
    if (clampNumber(settings.shadowIntensity ?? 0, 0, 100) > 0) {
        const shadowOpacity = (clampNumber(settings.shadowIntensity ?? 0, 0, 100) / 100).toFixed(2);
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
    previewEl.style.margin = `${settings.containerOuterMarginY}em auto`;
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
    previewEl.style.background = buildContainerBackgroundCSS();

    // 컨테이너 외부 여백은 컨테이너 margin으로만 적용 (캔버스 padding은 CSS 기본값 유지)

    // 테두리 적용
    if (settings.borderWidth > 0) {
        previewEl.style.border = `${settings.borderWidth}px ${settings.borderStyle} ${settings.borderColor}`;
    } else {
        previewEl.style.border = "none";
    }

    // 그림자 적용 (0%면 속성 제거)
    if (clampNumber(settings.shadowIntensity ?? 0, 0, 100) > 0) {
        const shadowOpacity = (clampNumber(settings.shadowIntensity ?? 0, 0, 100) / 100).toFixed(2);
        previewEl.style.boxShadow = `0 4px 24px rgba(0, 0, 0, ${shadowOpacity})`;
    } else {
        previewEl.style.boxShadow = "";
    }

    // 뱃지 스타일 생성 함수
    function getBadgeStyle(color) {
        const scale = clampNumber(settings.badgeScale ?? 1, 0.5, 3);
        const paddingY = (6 * scale).toFixed(2);
        const paddingX = (12 * scale).toFixed(2);
        const fontSize = (0.75 * scale).toFixed(3);
        const baseStyle = `display: inline-block; margin: 0 8px 8px 0; padding: ${paddingY}px ${paddingX}px; border-radius: ${settings.badgeRadius}px; font-size: ${fontSize}em; font-weight: 600; line-height: 1.2; text-align: center; box-sizing: border-box;`;

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
            const headerBg = buildHeaderBackgroundCSS();
            const borderColor = adjustColor(settings.bgColor, 25);
            const headerTextAlign = settings.headerAlign;
            const justifyContent = headerTextAlign === 'center' ? 'center' : headerTextAlign === 'right' ? 'flex-end' : 'flex-start';

            // 캐릭터 이름 처리 (로그 제목 유무에 따라 다르게 표시)
            let charBadgeHTML = "";
            let logTitleHTML = "";

            if (settings.logTitle) {
                // 로그 제목이 있으면: 캐릭터 이름은 뱃지, 로그 제목은 크게
                if (settings.charName) {
                    const charBadgeStyle = `display: inline-block; padding: 6px 14px; background: ${settings.charColor}; color: ${getContrastTextColor(settings.charColor)}; border-radius: ${settings.badgeRadius}px; font-size: 0.8em; font-weight: 700; letter-spacing: 0.02em;`;
                    if (settings.charLink) {
                        charBadgeHTML = `<div style="text-align: ${headerTextAlign}; margin-bottom: 0.75em;"><a href="${settings.charLink}" target="_blank" style="text-decoration: none;"><span style="${charBadgeStyle}">${settings.charName}</span></a></div>`;
                    } else {
                        charBadgeHTML = `<div style="text-align: ${headerTextAlign}; margin-bottom: 0.75em;"><span style="${charBadgeStyle}">${settings.charName}</span></div>`;
                    }
                }
                logTitleHTML = `<p style="margin: 0; font-size: ${settings.logTitleSize}em; font-weight: 800; color: ${settings.textColor}; letter-spacing: -0.02em; text-align: ${headerTextAlign};">${settings.logTitle}</p>`;
            } else if (settings.charName) {
                // 로그 제목이 없으면: 캐릭터 이름을 제목처럼 크게 표시
                const charTitleStyle = `margin: 0; font-size: ${settings.logTitleSize}em; font-weight: 800; color: ${settings.charColor}; letter-spacing: -0.02em; text-align: ${headerTextAlign};`;
                if (settings.charLink) {
                    logTitleHTML = `<a href="${settings.charLink}" target="_blank" style="text-decoration: none;"><p style="${charTitleStyle}">${settings.charName}</p></a>`;
                } else {
                    logTitleHTML = `<p style="${charTitleStyle}">${settings.charName}</p>`;
                }
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
                const scale = clampNumber(settings.badgeScale ?? 1, 0.5, 3);
                const paddingY = (5 * scale).toFixed(2);
                const paddingX = (11 * scale).toFixed(2);
                const fontSize = (0.75 * scale).toFixed(3);
                const subBadgeStyle = `display: inline-block; margin: 0 8px 8px 0; padding: ${paddingY}px ${paddingX}px; background: transparent; border: 1px solid ${settings.badgeSubColor}; border-radius: ${settings.badgeRadius}px; font-size: ${fontSize}em; font-weight: 600; color: ${settings.badgeSubColor}; line-height: 1.2; text-align: center; box-sizing: border-box;`;
                tags.push(`<span style="${subBadgeStyle}">${settings.subModel}</span>`);
            }

            if (tags.length > 0) {
                const marginTop = (settings.logTitle || settings.charName) ? "margin-top: 1em;" : "";
                // 배지만 있을 때 아래 여백 제거
                const badgeMargin = (settings.logTitle || settings.charName) ? "margin: 0 8px 8px 0;" : "margin: 0 8px 0 0;";
                const tagsWithFixedMargin = tags.map(tag => tag.replace(/margin: 0 8px 8px 0;/g, badgeMargin));
                // text-align 사용 (아카라이브가 flex 속성 삭제함)
                tagsHTML = `<div style="${marginTop} text-align: ${settings.headerAlign};">${tagsWithFixedMargin.join("")}</div>`;
            }

            const headerBorderStyle = (settings.headerBorderWidth ?? 0) > 0
                ? ` border: ${settings.headerBorderWidth}px solid ${settings.dividerColor};`
                : "";
            headerHTML = `<div style="margin-bottom: 1.5em; padding: 1.5em; background: ${headerBg}; border-radius: ${settings.headerRadius}px;${headerBorderStyle}">${charBadgeHTML}${logTitleHTML}${tagsHTML}</div>`;
        }

        // 블록별 HTML 생성
        const blocksHTML = blocksWithContent.map((block, index) => {
            const lines = block.content.split(/\r?\n/).filter((line) => line.trim() !== "");
            let prevType = null;
            const linesHTML = lines.map((line) => {
                const parsed = parseLine(line);
                const html = generateBubbleHTML(parsed, false, { prevType });
                prevType = parsed.type;
                return html;
            }).join("");

            // 접기/펼치기 사용 여부
            if (block.collapsible) {
                const detailsRadius = clampNumber(settings.detailsBorderRadius ?? 12, 0, 80);
                const detailsBorderWidth = clampNumber(settings.detailsBorderWidth ?? 1, 0, 12);
                const summaryFontSize = clampNumber(settings.detailsSummaryFontSize ?? 1, 0.6, 2);
                const summaryListStyle = settings.detailsSummaryListStyleNone ? " list-style: none;" : "";
                const sectionStyleParts = [
                    `margin: ${index > 0 ? settings.blockGap + 'em' : '0'} 0`,
                    `border-radius: ${detailsRadius}px`,
                ];
                if (detailsBorderWidth > 0) {
                    sectionStyleParts.push(`border: ${detailsBorderWidth}px solid ${settings.dividerColor}`);
                }
                const sectionStyle = sectionStyleParts.join("; ");
                const summaryStyle = `padding: 1em 1.25em; background: ${settings.detailsSummaryBgColor}; border-radius: ${detailsRadius}px; cursor: pointer; font-weight: 500; font-size: ${summaryFontSize}em; color: ${settings.charColor};${summaryListStyle} display: list-item;`;
                const contentStyle = `padding: 1.25em; line-height: ${settings.blockLineHeight};`;

                return `<details open style="${sectionStyle}">
                    <summary style="${summaryStyle}">${escapeHTMLContent(block.title)}</summary>
                    <div style="${contentStyle}">${linesHTML}</div>
                </details>`;
            } else {
                // 블록이 여러 개일 때만 섹션 구분 추가
                if (blocksWithContent.length > 1) {
                    const sectionStyle = `margin: ${index > 0 ? settings.blockGap + 'em' : '0'} 0 0 0; line-height: ${settings.blockLineHeight}; ${index > 0 ? `padding-top: ${settings.blockGap}em; border-top: 1px solid ${settings.dividerColor};` : ''}`.trim();
                    const labelStyle = `margin: 0 0 ${settings.blockTitleMarginBottom}em 0; font-size: ${settings.blockTitleFontSize}em; font-weight: ${settings.blockTitleFontWeight}; text-transform: uppercase; letter-spacing: 0.1em; color: ${settings.blockTitleColor};`;

                    return `<div style="${sectionStyle}">
                        <p style="${labelStyle}">${escapeHTMLContent(block.title)}</p>
                        ${linesHTML}
                    </div>`;
                } else {
                    const wrapperStyle = `line-height: ${settings.blockLineHeight};`;
                    return `<div style="${wrapperStyle}">${linesHTML}</div>`;
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

        // 헤더 배경색도 테마 프리셋에 포함 (프리셋에 없으면 bgColor 기반으로 자동 설정)
        if (!Object.prototype.hasOwnProperty.call(preset, "headerBgColor")) {
            settings.headerBgColor = settings.aiBubbleColor ?? settings.bgGradientColor ?? adjustColor(settings.bgColor, 12);
        }
        if (!Object.prototype.hasOwnProperty.call(preset, "headerBgGradientColor")) {
            settings.headerBgGradientColor = settings.userBubbleColor ?? settings.bgGradientColor ?? adjustColor(settings.bgColor, 6);
        }
        if (!Object.prototype.hasOwnProperty.call(preset, "detailsSummaryBgColor")) {
            settings.detailsSummaryBgColor = settings.quoteBgColor ?? settings.aiBubbleColor ?? settings.bgGradientColor ?? adjustColor(settings.bgColor, 10);
        }

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
        "style-quote": "quoteColor",
        "style-quote-bg": "quoteBgColor",
        "style-heading": "headingColor",
        "style-divider": "dividerColor",
        "style-ai-bubble": "aiBubbleColor",
        "style-user-bubble": "userBubbleColor",
        "style-badge-model": "badgeModelColor",
        "style-badge-prompt": "badgePromptColor",
        "style-badge-sub": "badgeSubColor",
        "style-border-color": "borderColor",
        "style-gradient-color": "bgGradientColor",
        "style-header-bg": "headerBgColor",
        "style-header-gradient-color": "headerBgGradientColor",
        "style-details-summary-bg": "detailsSummaryBgColor",
        "style-block-title-color": "blockTitleColor",
        "style-ai-bubble-gradient-color": "aiBubbleGradientColor",
        "style-user-bubble-gradient-color": "userBubbleGradientColor",
        "style-bubble-border-color": "bubbleBorderColor",
        "style-image-border-color": "imageBorderColor",
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
    { colorId: "style-quote", textId: "style-quote-text", key: "quoteColor" },
    { colorId: "style-quote-bg", textId: "style-quote-bg-text", key: "quoteBgColor" },
    { colorId: "style-heading", textId: "style-heading-text", key: "headingColor" },
    { colorId: "style-divider", textId: "style-divider-text", key: "dividerColor" },
    { colorId: "style-ai-bubble", textId: "style-ai-bubble-text", key: "aiBubbleColor" },
    { colorId: "style-user-bubble", textId: "style-user-bubble-text", key: "userBubbleColor" },
    { colorId: "style-badge-model", textId: "style-badge-model-text", key: "badgeModelColor" },
    { colorId: "style-badge-prompt", textId: "style-badge-prompt-text", key: "badgePromptColor" },
    { colorId: "style-badge-sub", textId: "style-badge-sub-text", key: "badgeSubColor" },
    { colorId: "style-border-color", textId: "style-border-color-text", key: "borderColor" },
    { colorId: "style-header-bg", textId: "style-header-bg-text", key: "headerBgColor" },
    { colorId: "style-details-summary-bg", textId: "style-details-summary-bg-text", key: "detailsSummaryBgColor" },
    { colorId: "style-block-title-color", textId: "style-block-title-color-text", key: "blockTitleColor" },
    { colorId: "style-header-gradient-color", textId: "style-header-gradient-color-text", key: "headerBgGradientColor" },
    { colorId: "style-ai-bubble-gradient-color", textId: "style-ai-bubble-gradient-color-text", key: "aiBubbleGradientColor" },
    { colorId: "style-user-bubble-gradient-color", textId: "style-user-bubble-gradient-color-text", key: "userBubbleGradientColor" },
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
    { id: "style-container-margin-y", key: "containerOuterMarginY", valueId: "style-container-margin-y-value", unit: "em" },
    { id: "style-radius", key: "borderRadius", valueId: "style-radius-value", unit: "px" },
    { id: "style-bubble-radius", key: "bubbleRadius", valueId: "style-bubble-radius-value", unit: "px" },
    { id: "style-bubble-padding", key: "bubblePadding", valueId: "style-bubble-padding-value", unit: "em" },
    { id: "style-bubble-max-width", key: "bubbleMaxWidth", valueId: "style-bubble-max-width-value", unit: "%" },
    { id: "style-bubble-gap", key: "bubbleGap", valueId: "style-bubble-gap-value", unit: "em" },
    { id: "style-block-gap", key: "blockGap", valueId: "style-block-gap-value", unit: "em" },
    { id: "style-details-radius", key: "detailsBorderRadius", valueId: "style-details-radius-value", unit: "px" },
    { id: "style-details-border-width", key: "detailsBorderWidth", valueId: "style-details-border-width-value", unit: "px" },
    { id: "style-details-summary-font-size", key: "detailsSummaryFontSize", valueId: "style-details-summary-font-size-value", unit: "em" },
    { id: "style-block-title-size", key: "blockTitleFontSize", valueId: "style-block-title-size-value", unit: "em" },
    { id: "style-block-title-weight", key: "blockTitleFontWeight", valueId: "style-block-title-weight-value", unit: "" },
    { id: "style-block-title-margin-bottom", key: "blockTitleMarginBottom", valueId: "style-block-title-margin-bottom-value", unit: "em" },
    { id: "style-line-height", key: "lineHeight", valueId: "style-line-height-value", unit: "" },
    { id: "style-block-line-height", key: "blockLineHeight", valueId: "style-block-line-height-value", unit: "" },
    { id: "style-letter-spacing", key: "letterSpacing", valueId: "style-letter-spacing-value", unit: "em" },
    { id: "style-border-width", key: "borderWidth", valueId: "style-border-width-value", unit: "px" },
    { id: "style-shadow-intensity", key: "shadowIntensity", valueId: "style-shadow-intensity-value", unit: "%" },
    { id: "style-badge-radius", key: "badgeRadius", valueId: "style-badge-radius-value", unit: "px" },
    { id: "style-nametag-size", key: "nametagFontSize", valueId: "style-nametag-size-value", unit: "em" },
    { id: "style-bubble-border-width", key: "bubbleBorderWidth", valueId: "style-bubble-border-width-value", unit: "px" },
    { id: "style-log-title-size", key: "logTitleSize", valueId: "style-log-title-size-value", unit: "em" },
    { id: "style-badge-scale", key: "badgeScale", valueId: "style-badge-scale-value", unit: "x" },
    { id: "style-header-radius", key: "headerRadius", valueId: "style-header-radius-value", unit: "px" },
    { id: "style-header-border-width", key: "headerBorderWidth", valueId: "style-header-border-width-value", unit: "px" },
    { id: "style-header-bg-opacity", key: "headerBgOpacity", valueId: "style-header-bg-opacity-value", unit: "%" },
    { id: "style-header-gradient-angle", key: "headerBgGradientAngle", valueId: "style-header-gradient-angle-value", unit: "°" },
    { id: "style-gradient-angle", key: "bgGradientAngle", valueId: "style-gradient-angle-value", unit: "°" },
    { id: "style-ai-bubble-opacity", key: "aiBubbleOpacity", valueId: "style-ai-bubble-opacity-value", unit: "%" },
    { id: "style-ai-bubble-gradient-angle", key: "aiBubbleGradientAngle", valueId: "style-ai-bubble-gradient-angle-value", unit: "°" },
    { id: "style-user-bubble-opacity", key: "userBubbleOpacity", valueId: "style-user-bubble-opacity-value", unit: "%" },
    { id: "style-user-bubble-gradient-angle", key: "userBubbleGradientAngle", valueId: "style-user-bubble-gradient-angle-value", unit: "°" },
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
            if (key === "badgeScale") {
                valueEl.textContent = `${val.toFixed(2)}${unit}`;
            } else if (unit === "°") {
                valueEl.textContent = `${Math.round(val)}${unit}`;
            } else if (unit === "%") {
                valueEl.textContent = `${Math.round(val)}${unit}`;
            } else {
                valueEl.textContent = `${val}${unit}`;
            }
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

        // 탭에 따라 버튼 표시/숨김 (모바일에서는 항상 숨김)
        if (tabId === "code") {
            if (previewModeContainer) previewModeContainer.style.display = "none";
        } else {
            // 모바일(600px 이하)에서는 토글 숨김 유지
            if (previewModeContainer) {
                if (window.innerWidth <= 600) {
                    previewModeContainer.style.display = "none";
                } else {
                    previewModeContainer.style.display = "flex";
                }
            }
        }
    });
});

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

// 배경 그라데이션 원형 토글
const gradientRadialToggle = document.getElementById("style-gradient-radial");
const gradientRadialLabel = document.getElementById("style-gradient-radial-label");
if (gradientRadialToggle && gradientRadialLabel) {
    gradientRadialToggle.addEventListener("change", (e) => {
        settings.bgGradientRadial = e.target.checked;
        gradientRadialLabel.textContent = e.target.checked ? "켜짐" : "꺼짐";
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

// 헤더 배경 그라데이션 토글
const headerBgGradientToggle = document.getElementById("style-header-bg-gradient");
const headerBgGradientLabel = document.getElementById("style-header-bg-gradient-label");
const headerGradientOptions = document.getElementById("header-gradient-options");
if (headerBgGradientToggle && headerBgGradientLabel) {
    headerBgGradientToggle.addEventListener("change", (e) => {
        settings.headerBgGradient = e.target.checked;
        headerBgGradientLabel.textContent = e.target.checked ? "켜짐" : "꺼짐";
        if (headerGradientOptions) headerGradientOptions.style.display = e.target.checked ? "block" : "none";
        updatePreview();
        saveToStorage();
    });
}

// AI 말풍선 그라데이션 토글
const aiBubbleGradientToggle = document.getElementById("style-ai-bubble-gradient");
const aiBubbleGradientLabel = document.getElementById("style-ai-bubble-gradient-label");
const aiBubbleGradientOptions = document.getElementById("ai-bubble-gradient-options");
if (aiBubbleGradientToggle && aiBubbleGradientLabel) {
    aiBubbleGradientToggle.addEventListener("change", (e) => {
        settings.aiBubbleGradient = e.target.checked;
        aiBubbleGradientLabel.textContent = e.target.checked ? "켜짐" : "꺼짐";
        if (aiBubbleGradientOptions) aiBubbleGradientOptions.style.display = e.target.checked ? "block" : "none";
        updatePreview();
        saveToStorage();
    });
}

// User 말풍선 그라데이션 토글
const userBubbleGradientToggle = document.getElementById("style-user-bubble-gradient");
const userBubbleGradientLabel = document.getElementById("style-user-bubble-gradient-label");
const userBubbleGradientOptions = document.getElementById("user-bubble-gradient-options");
if (userBubbleGradientToggle && userBubbleGradientLabel) {
    userBubbleGradientToggle.addEventListener("change", (e) => {
        settings.userBubbleGradient = e.target.checked;
        userBubbleGradientLabel.textContent = e.target.checked ? "켜짐" : "꺼짐";
        if (userBubbleGradientOptions) userBubbleGradientOptions.style.display = e.target.checked ? "block" : "none";
        updatePreview();
        saveToStorage();
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

// <details> summary list-style:none 토글
const detailsSummaryListStyleNoneToggle = document.getElementById("style-details-summary-list-style-none");
const detailsSummaryListStyleNoneLabel = document.getElementById("style-details-summary-list-style-none-label");

if (detailsSummaryListStyleNoneToggle && detailsSummaryListStyleNoneLabel) {
    detailsSummaryListStyleNoneToggle.addEventListener("change", (e) => {
        settings.detailsSummaryListStyleNone = e.target.checked;
        detailsSummaryListStyleNoneLabel.textContent = e.target.checked ? "켜짐" : "꺼짐";
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

// 초기 히스토리 상태 저장
pushHistory();

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
        { id: "style-container-margin-y", key: "containerOuterMarginY", valueId: "style-container-margin-y-value", unit: "em" },
        { id: "style-radius", key: "borderRadius", valueId: "style-radius-value", unit: "px" },
        { id: "style-bubble-radius", key: "bubbleRadius", valueId: "style-bubble-radius-value", unit: "px" },
        { id: "style-bubble-padding", key: "bubblePadding", valueId: "style-bubble-padding-value", unit: "em" },
        { id: "style-bubble-max-width", key: "bubbleMaxWidth", valueId: "style-bubble-max-width-value", unit: "%" },
        { id: "style-bubble-gap", key: "bubbleGap", valueId: "style-bubble-gap-value", unit: "em" },
        { id: "style-block-gap", key: "blockGap", valueId: "style-block-gap-value", unit: "em" },
        { id: "style-details-radius", key: "detailsBorderRadius", valueId: "style-details-radius-value", unit: "px" },
        { id: "style-details-border-width", key: "detailsBorderWidth", valueId: "style-details-border-width-value", unit: "px" },
        { id: "style-details-summary-font-size", key: "detailsSummaryFontSize", valueId: "style-details-summary-font-size-value", unit: "em" },
        { id: "style-block-title-size", key: "blockTitleFontSize", valueId: "style-block-title-size-value", unit: "em" },
        { id: "style-block-title-weight", key: "blockTitleFontWeight", valueId: "style-block-title-weight-value", unit: "" },
        { id: "style-block-title-margin-bottom", key: "blockTitleMarginBottom", valueId: "style-block-title-margin-bottom-value", unit: "em" },
        { id: "style-line-height", key: "lineHeight", valueId: "style-line-height-value", unit: "" },
        { id: "style-block-line-height", key: "blockLineHeight", valueId: "style-block-line-height-value", unit: "" },
        { id: "style-letter-spacing", key: "letterSpacing", valueId: "style-letter-spacing-value", unit: "em" },
        { id: "style-border-width", key: "borderWidth", valueId: "style-border-width-value", unit: "px" },
        { id: "style-shadow-intensity", key: "shadowIntensity", valueId: "style-shadow-intensity-value", unit: "%" },
        { id: "style-badge-radius", key: "badgeRadius", valueId: "style-badge-radius-value", unit: "px" },
        { id: "style-nametag-size", key: "nametagFontSize", valueId: "style-nametag-size-value", unit: "em" },
        { id: "style-bubble-border-width", key: "bubbleBorderWidth", valueId: "style-bubble-border-width-value", unit: "px" },
        { id: "style-log-title-size", key: "logTitleSize", valueId: "style-log-title-size-value", unit: "em" },
        { id: "style-badge-scale", key: "badgeScale", valueId: "style-badge-scale-value", unit: "x" },
        { id: "style-header-radius", key: "headerRadius", valueId: "style-header-radius-value", unit: "px" },
        { id: "style-header-border-width", key: "headerBorderWidth", valueId: "style-header-border-width-value", unit: "px" },
        { id: "style-header-bg-opacity", key: "headerBgOpacity", valueId: "style-header-bg-opacity-value", unit: "%" },
        { id: "style-header-gradient-angle", key: "headerBgGradientAngle", valueId: "style-header-gradient-angle-value", unit: "°" },
        { id: "style-gradient-angle", key: "bgGradientAngle", valueId: "style-gradient-angle-value", unit: "°" },
        { id: "style-ai-bubble-opacity", key: "aiBubbleOpacity", valueId: "style-ai-bubble-opacity-value", unit: "%" },
        { id: "style-ai-bubble-gradient-angle", key: "aiBubbleGradientAngle", valueId: "style-ai-bubble-gradient-angle-value", unit: "°" },
        { id: "style-user-bubble-opacity", key: "userBubbleOpacity", valueId: "style-user-bubble-opacity-value", unit: "%" },
        { id: "style-user-bubble-gradient-angle", key: "userBubbleGradientAngle", valueId: "style-user-bubble-gradient-angle-value", unit: "°" },
        // 이미지 설정
        { id: "style-image-max-width", key: "imageMaxWidth", valueId: "style-image-max-width-value", unit: "px" },
        { id: "style-image-border-radius", key: "imageBorderRadius", valueId: "style-image-border-radius-value", unit: "px" },
        { id: "style-image-margin", key: "imageMargin", valueId: "style-image-margin-value", unit: "em" },
    ];
    rangeMap.forEach(({ id, key, valueId, unit }) => {
        const rangeEl = document.getElementById(id);
        const valueEl = document.getElementById(valueId);
        if (rangeEl) rangeEl.value = settings[key];
        if (valueEl) {
            if (key === "badgeScale") {
                valueEl.textContent = `${Number(settings[key]).toFixed(2)}${unit}`;
            } else if (unit === "°") {
                valueEl.textContent = `${Math.round(Number(settings[key]))}${unit}`;
            } else if (unit === "%") {
                valueEl.textContent = `${Math.round(Number(settings[key]))}${unit}`;
            } else {
                valueEl.textContent = `${settings[key]}${unit}`;
            }
        }
    });

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

    const gradientRadialEl = document.getElementById("style-gradient-radial");
    const gradientRadialLabelEl = document.getElementById("style-gradient-radial-label");
    if (gradientRadialEl) gradientRadialEl.checked = Boolean(settings.bgGradientRadial);
    if (gradientRadialLabelEl) gradientRadialLabelEl.textContent = settings.bgGradientRadial ? "켜짐" : "꺼짐";

    // 헤더 배경 그라데이션 동기화
    const headerBgGradientEl = document.getElementById("style-header-bg-gradient");
    const headerBgGradientLabelEl = document.getElementById("style-header-bg-gradient-label");
    const headerGradientOptionsEl = document.getElementById("header-gradient-options");
    if (headerBgGradientEl) headerBgGradientEl.checked = Boolean(settings.headerBgGradient);
    if (headerBgGradientLabelEl) headerBgGradientLabelEl.textContent = settings.headerBgGradient ? "켜짐" : "꺼짐";
    if (headerGradientOptionsEl) headerGradientOptionsEl.style.display = settings.headerBgGradient ? "block" : "none";

    // 말풍선 배경 (그라데이션) 동기화
    const aiBubbleGradientEl = document.getElementById("style-ai-bubble-gradient");
    const aiBubbleGradientLabelEl = document.getElementById("style-ai-bubble-gradient-label");
    const aiBubbleGradientOptionsEl = document.getElementById("ai-bubble-gradient-options");
    if (aiBubbleGradientEl) aiBubbleGradientEl.checked = Boolean(settings.aiBubbleGradient);
    if (aiBubbleGradientLabelEl) aiBubbleGradientLabelEl.textContent = settings.aiBubbleGradient ? "켜짐" : "꺼짐";
    if (aiBubbleGradientOptionsEl) aiBubbleGradientOptionsEl.style.display = settings.aiBubbleGradient ? "block" : "none";

    const userBubbleGradientEl = document.getElementById("style-user-bubble-gradient");
    const userBubbleGradientLabelEl = document.getElementById("style-user-bubble-gradient-label");
    const userBubbleGradientOptionsEl = document.getElementById("user-bubble-gradient-options");
    if (userBubbleGradientEl) userBubbleGradientEl.checked = Boolean(settings.userBubbleGradient);
    if (userBubbleGradientLabelEl) userBubbleGradientLabelEl.textContent = settings.userBubbleGradient ? "켜짐" : "꺼짐";
    if (userBubbleGradientOptionsEl) userBubbleGradientOptionsEl.style.display = settings.userBubbleGradient ? "block" : "none";

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

    // <details> summary list-style:none 동기화
    const detailsSummaryListStyleNoneEl = document.getElementById("style-details-summary-list-style-none");
    const detailsSummaryListStyleNoneLabelEl = document.getElementById("style-details-summary-list-style-none-label");
    if (detailsSummaryListStyleNoneEl) detailsSummaryListStyleNoneEl.checked = Boolean(settings.detailsSummaryListStyleNone);
    if (detailsSummaryListStyleNoneLabelEl) detailsSummaryListStyleNoneLabelEl.textContent = settings.detailsSummaryListStyleNone ? "켜짐" : "꺼짐";

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
    // contenteditable에서 Alt+A/S 단축키 처리
    const isContentEditable = document.activeElement.getAttribute('contenteditable') === 'true';

    if (isContentEditable && e.altKey && (e.key === 'a' || e.key === 'A' || e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        const marker = (e.key === 'a' || e.key === 'A') ? '>> ' : '<< ';
        insertMarkerAtCurrentLine(marker);
        return;
    }

    // Alt+↑/↓: 블록 순서 이동
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && lastFocusedBlockId !== null) {
        e.preventDefault();
        moveBlockByKeyboard(e.key === 'ArrowUp' ? -1 : 1);
        return;
    }

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

    // Ctrl+Z: Undo (입력 필드가 아닐 때)
    if (e.ctrlKey && !e.shiftKey && e.key === 'z' && !isInputFocused && !isContentEditable) {
        e.preventDefault();
        undo();
        return;
    }

    // Ctrl+Y 또는 Ctrl+Shift+Z: Redo (입력 필드가 아닐 때)
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z' || e.key === 'z')) {
        if (!isInputFocused && !isContentEditable) {
            if (e.key === 'y' || (e.shiftKey && (e.key === 'Z' || e.key === 'z'))) {
                e.preventDefault();
                redo();
                return;
            }
        }
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

// ===== 블록 키보드 이동 =====
function moveBlockByKeyboard(direction) {
    if (lastFocusedBlockId === null) return;

    const currentIndex = logBlocks.findIndex(b => b.id === lastFocusedBlockId);
    if (currentIndex === -1) return;

    const newIndex = currentIndex + direction;

    // 범위 체크
    if (newIndex < 0 || newIndex >= logBlocks.length) {
        showToast(direction < 0 ? '첫 번째 블록입니다' : '마지막 블록입니다');
        return;
    }

    // 블록 순서 변경
    const [movedBlock] = logBlocks.splice(currentIndex, 1);
    logBlocks.splice(newIndex, 0, movedBlock);

    // 렌더링 및 저장
    renderLogBlocks();
    updatePreview();
    saveToStorage();

    // 이동된 블록에 포커스 유지 및 애니메이션
    setTimeout(() => {
        const movedBlockEl = document.querySelector(`.log-block[data-block-id="${lastFocusedBlockId}"]`);
        if (movedBlockEl) {
            movedBlockEl.classList.add('block-moved');
            movedBlockEl.querySelector('.log-block-textarea')?.focus();
            setTimeout(() => {
                movedBlockEl.classList.remove('block-moved');
            }, 300);
        }
    }, 10);
}

// ===== 마커 삽입 함수 =====
function insertMarkerAtCurrentLine(marker) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const container = range.startContainer;

    // 현재 줄의 시작 위치 찾기
    let textNode = container;
    let offset = range.startOffset;

    // 텍스트 노드가 아니면 텍스트 노드 찾기
    if (textNode.nodeType !== Node.TEXT_NODE) {
        // 자식 노드 중에서 텍스트 노드 찾기
        const childNodes = textNode.childNodes;
        if (childNodes.length > 0 && offset < childNodes.length) {
            textNode = childNodes[offset];
            offset = 0;
        } else if (childNodes.length > 0) {
            textNode = childNodes[childNodes.length - 1];
            offset = textNode.textContent ? textNode.textContent.length : 0;
        }
    }

    // 텍스트 노드가 아직도 아니면 리턴
    if (textNode.nodeType !== Node.TEXT_NODE) {
        // 빈 contenteditable인 경우 직접 마커 삽입
        const editableEl = document.activeElement;
        if (editableEl.getAttribute('contenteditable') === 'true') {
            const currentText = editableEl.textContent || '';
            if (currentText.trim() === '') {
                editableEl.textContent = marker;
                // 커서를 마커 뒤로 이동
                const newRange = document.createRange();
                const newTextNode = editableEl.firstChild;
                if (newTextNode) {
                    newRange.setStart(newTextNode, marker.length);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                }
            }
        }
        return;
    }

    const text = textNode.textContent;

    // 현재 커서 위치에서 줄의 시작 찾기
    let lineStart = offset;
    while (lineStart > 0 && text[lineStart - 1] !== '\n') {
        lineStart--;
    }

    // 현재 줄의 시작 부분 가져오기
    const lineEnd = text.indexOf('\n', offset);
    const currentLine = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);

    // 이미 마커가 있는지 확인
    const aiMarker = '>> ';
    const userMarker = '<< ';

    let newText;
    let cursorAdjust = 0;

    if (currentLine.startsWith(aiMarker)) {
        // AI 마커가 있으면 제거하고 새 마커 삽입 (토글)
        if (marker === aiMarker) {
            // 같은 마커면 제거만
            newText = text.substring(0, lineStart) + text.substring(lineStart + aiMarker.length);
            cursorAdjust = -aiMarker.length;
        } else {
            // 다른 마커면 교체
            newText = text.substring(0, lineStart) + marker + text.substring(lineStart + aiMarker.length);
            cursorAdjust = 0;
        }
    } else if (currentLine.startsWith(userMarker)) {
        // User 마커가 있으면 제거하고 새 마커 삽입 (토글)
        if (marker === userMarker) {
            // 같은 마커면 제거만
            newText = text.substring(0, lineStart) + text.substring(lineStart + userMarker.length);
            cursorAdjust = -userMarker.length;
        } else {
            // 다른 마커면 교체
            newText = text.substring(0, lineStart) + marker + text.substring(lineStart + userMarker.length);
            cursorAdjust = 0;
        }
    } else {
        // 마커 없으면 추가
        newText = text.substring(0, lineStart) + marker + text.substring(lineStart);
        cursorAdjust = marker.length;
    }

    // 텍스트 업데이트
    textNode.textContent = newText;

    // 커서 위치 복원
    const newOffset = Math.max(0, Math.min(offset + cursorAdjust, newText.length));
    const newRange = document.createRange();
    newRange.setStart(textNode, newOffset);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);

    // 변경 이벤트 트리거
    const editableEl = document.activeElement;
    if (editableEl) {
        editableEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

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
                        <span class="shortcut-key">Ctrl + Z</span>
                        <span class="shortcut-desc">되돌리기 (Undo)</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-key">Ctrl + Y</span>
                        <span class="shortcut-desc">다시 실행 (Redo)</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-key">Alt + A</span>
                        <span class="shortcut-desc">AI 마커 (>>) 삽입/제거</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-key">Alt + S</span>
                        <span class="shortcut-desc">User 마커 (<<) 삽입/제거</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-key">Alt + ↑</span>
                        <span class="shortcut-desc">블록 위로 이동</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-key">Alt + ↓</span>
                        <span class="shortcut-desc">블록 아래로 이동</span>
                    </div>
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
                    <p class="shortcut-tip">📷 이미지를 블록에 드래그앤드롭으로 추가할 수 있습니다.</p>
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

// ===== 찾기 및 바꾸기 =====
const findReplaceBtn = document.getElementById('find-replace-btn');

function createFindReplaceModal() {
    const modal = document.createElement('div');
    modal.id = 'find-replace-modal';
    modal.className = 'find-replace-modal';
    modal.innerHTML = `
        <div class="find-replace-backdrop"></div>
        <div class="find-replace-content">
            <div class="find-replace-header">
                <h2>🔍 찾기 및 바꾸기</h2>
                <button class="find-replace-close" type="button">✕</button>
            </div>
            <div class="find-replace-body">
                <div class="find-replace-row">
                    <label class="find-replace-label">찾을 텍스트</label>
                    <input type="text" class="find-replace-input" id="find-input" placeholder="예: {{user}}" autocomplete="off">
                </div>
                <div class="find-replace-row">
                    <label class="find-replace-label">바꿀 텍스트</label>
                    <input type="text" class="find-replace-input" id="replace-input" placeholder="예: 유저" autocomplete="off">
                </div>
                <div class="find-replace-options">
                    <label class="find-replace-option">
                        <input type="checkbox" id="find-regex">
                        <span>정규식 사용</span>
                    </label>
                    <label class="find-replace-option">
                        <input type="checkbox" id="find-case-sensitive">
                        <span>대소문자 구분</span>
                    </label>
                </div>
                <div class="find-replace-presets">
                    <span class="presets-label">자주 쓰는 패턴:</span>
                    <button type="button" class="preset-btn" data-find="{{user}}" data-replace="">{{user}}</button>
                    <button type="button" class="preset-btn" data-find="{{char}}" data-replace="">{{char}}</button>
                    <button type="button" class="preset-btn" data-preset="quote-newline">"" 개행</button>
                    <button type="button" class="preset-btn" data-preset="quote-fix">"" → ""</button>
                    <button type="button" class="preset-btn" data-find="\\*\\*(.+?)\\*\\*" data-replace="$1" data-regex="true">**볼드** 제거</button>
                    <button type="button" class="preset-btn" data-find="\\*([^*]+?)\\*" data-replace="$1" data-regex="true">*이탤릭* 제거</button>
                </div>
                <div class="find-replace-actions">
                    <span class="find-replace-result" id="find-replace-result"></span>
                    <button type="button" class="find-replace-btn find-replace-btn--secondary" id="find-count-btn">개수 확인</button>
                    <button type="button" class="find-replace-btn find-replace-btn--primary" id="replace-all-btn">모두 바꾸기</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 이벤트 리스너
    modal.querySelector('.find-replace-backdrop').addEventListener('click', closeFindReplaceModal);
    modal.querySelector('.find-replace-close').addEventListener('click', closeFindReplaceModal);

    // 특수 프리셋 정의
    // 프리셋 1: 일반 따옴표 "대사" 앞뒤로 개행 추가
    // 프리셋 2: 둥근따옴표 ""를 일반따옴표 ""로 변환
    const specialPresets = {
        'quote-newline': {
            find: '"(.+?)"',
            replace: '\\n"$1"\\n',
            regex: true
        },
        'quote-fix': {
            find: '\u201C(.+?)\u201D',
            replace: '"$1"',
            regex: true
        }
    };

    // 프리셋 버튼
    modal.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const presetName = btn.dataset.preset;

            if (presetName && specialPresets[presetName]) {
                // 특수 프리셋 처리
                const preset = specialPresets[presetName];
                document.getElementById('find-input').value = preset.find;
                document.getElementById('replace-input').value = preset.replace;
                document.getElementById('find-regex').checked = preset.regex;
            } else {
                // 일반 프리셋 처리
                document.getElementById('find-input').value = btn.dataset.find || '';
                document.getElementById('replace-input').value = btn.dataset.replace || '';
                document.getElementById('find-regex').checked = btn.dataset.regex === 'true';
            }

            document.getElementById('find-replace-result').textContent = '';
        });
    });

    // 개수 확인 버튼
    modal.querySelector('#find-count-btn').addEventListener('click', () => {
        const count = countMatches();
        const resultEl = document.getElementById('find-replace-result');
        if (count === 0) {
            resultEl.textContent = '일치하는 항목이 없습니다.';
            resultEl.style.color = '#ef4444';
        } else {
            resultEl.textContent = `${count}개 발견`;
            resultEl.style.color = '#22c55e';
        }
    });

    // 모두 바꾸기 버튼
    modal.querySelector('#replace-all-btn').addEventListener('click', () => {
        const count = replaceAll();
        const resultEl = document.getElementById('find-replace-result');
        if (count === 0) {
            resultEl.textContent = '일치하는 항목이 없습니다.';
            resultEl.style.color = '#ef4444';
        } else {
            resultEl.textContent = `${count}개 변경 완료!`;
            resultEl.style.color = '#22c55e';
            // 잠시 후 모달 닫기
            setTimeout(() => {
                closeFindReplaceModal();
            }, 1000);
        }
    });

    // Enter 키로 바꾸기 실행
    modal.querySelectorAll('.find-replace-input').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                modal.querySelector('#replace-all-btn').click();
            }
        });
    });
}

function countMatches() {
    const findText = document.getElementById('find-input').value;
    if (!findText) return 0;

    const useRegex = document.getElementById('find-regex').checked;
    const caseSensitive = document.getElementById('find-case-sensitive').checked;

    let count = 0;

    try {
        const flags = caseSensitive ? 'g' : 'gi';
        const regex = useRegex ? new RegExp(findText, flags) : new RegExp(escapeRegExp(findText), flags);

        logBlocks.forEach(block => {
            const matches = block.content.match(regex);
            if (matches) {
                count += matches.length;
            }
        });
    } catch (e) {
        showToast('잘못된 정규식입니다: ' + e.message);
        return 0;
    }

    return count;
}

function replaceAll() {
    const findText = document.getElementById('find-input').value;
    let replaceText = document.getElementById('replace-input').value;
    if (!findText) return 0;

    const useRegex = document.getElementById('find-regex').checked;
    const caseSensitive = document.getElementById('find-case-sensitive').checked;

    // 이스케이프 시퀀스 처리 (\n → 실제 개행, \t → 탭)
    replaceText = replaceText.replace(/\\n/g, '\n').replace(/\\t/g, '\t');

    let totalCount = 0;

    try {
        const flags = caseSensitive ? 'g' : 'gi';
        const regex = useRegex ? new RegExp(findText, flags) : new RegExp(escapeRegExp(findText), flags);

        logBlocks.forEach(block => {
            const matches = block.content.match(regex);
            if (matches) {
                totalCount += matches.length;
                block.content = block.content.replace(regex, replaceText);
            }
        });

        if (totalCount > 0) {
            renderLogBlocks();
            updatePreview();
            saveToStorage();
        }
    } catch (e) {
        showToast('잘못된 정규식입니다: ' + e.message);
        return 0;
    }

    return totalCount;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function openFindReplaceModal() {
    let modal = document.getElementById('find-replace-modal');
    if (!modal) {
        createFindReplaceModal();
        modal = document.getElementById('find-replace-modal');
    }
    modal.classList.add('open');
    // 포커스를 찾기 입력창으로
    setTimeout(() => {
        document.getElementById('find-input').focus();
    }, 100);
}

function closeFindReplaceModal() {
    const modal = document.getElementById('find-replace-modal');
    if (modal) {
        modal.classList.remove('open');
        document.getElementById('find-replace-result').textContent = '';
    }
}

if (findReplaceBtn) {
    findReplaceBtn.addEventListener('click', openFindReplaceModal);
}

// ===== 전체 초기화 =====
const resetAllBtn = document.getElementById('reset-all-btn');

// 기본 설정값 (초기화용)
const defaultSettings = {
    logTitle: "",
    charName: "",
    charLink: "",
    userName: "",
    aiModel: "",
    promptName: "",
    subModel: "",
    bgColor: "#ffffff",
    textColor: "#18181b",
    charColor: "#18181b",
    userColor: "#71717a",
    boldColor: "#dc2626",
    italicColor: "#6366f1",
    dialogueColor: "#059669",
    dialogueBgColor: "#ecfdf5",
    quoteColor: "#6b7280",
    quoteBgColor: "#f3f4f6",
    headingColor: "#111827",
    dividerColor: "#d1d5db",
    aiBubbleColor: "#f4f4f5",
    userBubbleColor: "#dbeafe",
    fontFamily: "Pretendard, sans-serif",
    fontSize: 16,
    fontWeight: 400,
    containerWidth: 800,
    containerPadding: 2,
    containerOuterMarginY: 0,
    containerMarginTop: 0,
    containerMarginRight: 0,
    containerMarginBottom: 0,
    containerMarginLeft: 0,
    borderRadius: 16,
    bubbleRadius: 16,
    bubblePadding: 1,
    bubbleMaxWidth: 85,
    bubbleGap: 1,
    blockGap: 1.5,
    lineHeight: 1.8,
    blockLineHeight: 1.8,
    letterSpacing: 0,
    headerAlign: "left",
    logTitleSize: 1.8,
    borderWidth: 0,
    borderColor: "#e4e4e7",
    borderStyle: "solid",
    shadowIntensity: 30,
    bgGradient: false,
    bgGradientColor: "#e0e7ff",
    bgGradientDirection: "to bottom right",
    bgGradientAngle: 135,
    bgGradientRadial: false,
    textAlign: "justify",
    badgeModelColor: "#18181b",
    badgePromptColor: "#71717a",
    badgeSubColor: "#a1a1aa",
    badgeRadius: 20,
    badgeStyle: "filled",
    badgeScale: 1,
    nametagFontSize: 0.75,
    bubbleBorder: false,
    bubbleBorderWidth: 2,
    bubbleBorderColor: "#6366f1",
    bubbleBorderLeftOnly: false,
    imageMaxWidth: 500,
    imageMargin: 0.5,
    imageBorderRadius: 8,
    imageAlign: "center",
    imageBorderWidth: 0,
    imageBorderColor: "#e5e5e5",
    imageShadow: "none",
    showNametag: true,

    // 헤더 배경
    headerBgColor: "#ffffff",
    headerBgOpacity: 100,
    headerBgGradient: false,
    headerBgGradientColor: "#f5f5f5",
    headerBgGradientAngle: 135,

    // 말풍선 배경(고급)
    aiBubbleOpacity: 100,
    aiBubbleGradient: false,
    aiBubbleGradientColor: "#e5e7eb",
    aiBubbleGradientAngle: 135,
    userBubbleOpacity: 100,
    userBubbleGradient: false,
    userBubbleGradientColor: "#e5e7eb",
    userBubbleGradientAngle: 135,
};

function resetAll() {
    // 설정 초기화
    Object.assign(settings, defaultSettings);

    // 블록 초기화
    logBlocks = [];
    blockIdCounter = 0;

    // 새 블록 생성
    createLogBlock("로그 1", "", false, true);

    // UI 동기화
    syncUIFromSettings();
    syncAllUIFromSettings();
    renderLogBlocks();
    updatePreview();
    saveToStorage();

    showToast('모든 블록과 설정이 초기화되었습니다.');
}

if (resetAllBtn) {
    resetAllBtn.addEventListener('click', () => {
        if (confirm('⚠️ 모든 블록과 설정을 초기화합니다.\n\n저장된 내용이 모두 삭제됩니다.\n계속하시겠습니까?')) {
            resetAll();
        }
    });
}

// ===== 설정 내보내기/가져오기 =====
const exportSettingsBtn = document.getElementById('export-settings-btn');
const importSettingsBtn = document.getElementById('import-settings-btn');
const settingsFileInput = document.getElementById('settings-file-input');

function exportSettings() {
    const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: { ...settings },
        blocks: logBlocks.map(b => ({
            title: b.title,
            content: b.content,
            collapsible: b.collapsible
        }))
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `log-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('설정이 내보내졌습니다.');
}

function importSettings(jsonData) {
    try {
        // 버전 체크
        if (!jsonData.version || !jsonData.settings) {
            throw new Error('올바른 Log Studio 백업 파일이 아닙니다.');
        }

        // 설정 적용
        Object.assign(settings, jsonData.settings);
        migrateSettingsFromLoadedObject(jsonData.settings || {});

        // 블록 적용 (있는 경우)
        if (jsonData.blocks && Array.isArray(jsonData.blocks)) {
            logBlocks = [];
            blockIdCounter = 0;

            jsonData.blocks.forEach(b => {
                createLogBlock(b.title, b.content, b.collapsible, true);
            });
        }

        // UI 동기화
        syncUIFromSettings();
        syncAllUIFromSettings();
        renderLogBlocks();
        updatePreview();
        saveToStorage();

        showToast('설정을 불러왔습니다.');
        return true;
    } catch (e) {
        console.error('설정 가져오기 오류:', e);
        showToast('설정 파일을 불러오는데 실패했습니다: ' + e.message);
        return false;
    }
}

if (exportSettingsBtn) {
    exportSettingsBtn.addEventListener('click', exportSettings);
}

if (importSettingsBtn && settingsFileInput) {
    importSettingsBtn.addEventListener('click', () => {
        settingsFileInput.click();
    });

    settingsFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const jsonData = JSON.parse(event.target.result);
                importSettings(jsonData);
            } catch (err) {
                showToast('올바른 JSON 파일이 아닙니다.');
            }
        };
        reader.onerror = () => {
            showToast('파일을 읽는데 실패했습니다.');
        };
        reader.readAsText(file);

        // 같은 파일 다시 선택 가능하도록
        settingsFileInput.value = '';
    });
}

