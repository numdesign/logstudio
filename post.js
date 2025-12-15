// ===== Post Studio - 게시글 에디터 =====

// DOM 요소
const editor = document.getElementById('editor');
const editorCanvas = document.getElementById('editor-canvas');
const themeToggle = document.getElementById('theme-toggle');
const bgModeToggle = document.getElementById('bg-mode-toggle');

// ===== 배경 모드 토글 (체크무늬 ↔ 단색) =====
function initBgMode() {
    const savedMode = localStorage.getItem('postEditorBgMode') || 'checker';
    if (savedMode === 'solid') {
        editorCanvas?.classList.add('solid-bg');
        if (bgModeToggle) bgModeToggle.checked = true;
    }
}

bgModeToggle?.addEventListener('change', () => {
    const isSolid = bgModeToggle.checked;
    editorCanvas?.classList.toggle('solid-bg', isSolid);
    localStorage.setItem('postEditorBgMode', isSolid ? 'solid' : 'checker');
});

initBgMode();

// ===== 요소 편집 시스템 =====
let selectedElement = null;
let selectedInnerElement = null; // details 내부 div
let currentEditTarget = 'container'; // 'container' 또는 'inner'
const elementToolbar = document.getElementById('element-toolbar');
const bgImagePopover = document.getElementById('etb-bg-image-popover');
const gradientPopover = document.getElementById('etb-gradient-popover');
const textGradientPopover = document.getElementById('text-gradient-popover');
const etbTabs = document.getElementById('etb-tabs');

// 편집 가능한 요소 타입
const EDITABLE_ELEMENTS = ['DIV', 'DETAILS'];

// 요소가 편집 가능한지 확인 (editable-block 클래스가 있는지)
function isEditableElement(el) {
    if (!el || el === editor) return false;
    return el.classList.contains('editable-block') && editor.contains(el);
}

// 클릭된 요소에서 편집 가능한 부모 찾기 (editable-block 클래스 기준)
function findEditableParent(el) {
    while (el && el !== editor) {
        if (el.classList && el.classList.contains('editable-block')) {
            return el;
        }
        el = el.parentElement;
    }
    return null;
}

// 요소 선택
function selectElement(el, clickX, clickY) {
    // 이전 선택 해제
    deselectElement();

    selectedElement = el;
    selectedElement.classList.add('element-selected');

    // details 요소인 경우 내부 div도 찾기
    if (el.tagName === 'DETAILS') {
        selectedInnerElement = el.querySelector(':scope > div');
        etbTabs.style.display = 'flex';
        currentEditTarget = 'container';
        updateTabState();
    } else {
        selectedInnerElement = null;
        etbTabs.style.display = 'none';
    }

    // 툴바에 현재 스타일 값 로드
    loadElementStyles(getEditTarget());

    // 툴바 표시 및 위치 지정
    showElementToolbar(clickX, clickY);
}

// 현재 편집 대상 요소 반환
function getEditTarget() {
    if (currentEditTarget === 'inner' && selectedInnerElement) {
        return selectedInnerElement;
    }
    return selectedElement;
}

// 요소 선택 해제
function deselectElement() {
    if (selectedElement) {
        selectedElement.classList.remove('element-selected');
        selectedElement = null;
        selectedInnerElement = null;
        currentEditTarget = 'container';
    }
    hideElementToolbar();
    hideBgImagePopover();
    hideGradientPopover();
}

// 요소의 현재 스타일 로드
function loadElementStyles(el) {
    const style = el.style;
    const computed = window.getComputedStyle(el);

    // 배경색
    const bgColor = style.backgroundColor || computed.backgroundColor;
    document.getElementById('etb-bg-color').value = rgbToHex(bgColor) || '#ffffff';

    // 외곽선
    const borderWidth = parseInt(style.borderWidth || computed.borderWidth) || 0;
    const borderStyle = style.borderStyle || computed.borderStyle || 'solid';
    const borderColor = style.borderColor || computed.borderColor;
    document.getElementById('etb-border-width').value = borderWidth;
    document.getElementById('etb-border-style').value = borderStyle === 'none' ? 'solid' : borderStyle;
    document.getElementById('etb-border-color').value = rgbToHex(borderColor) || '#cccccc';

    // 패딩 (rem 또는 px 값 추출 후 px로 변환)
    // computed는 "12px 12px 12px 12px" 형태일 수 있으므로 paddingTop 사용
    const paddingStr = style.padding || computed.paddingTop || '12px';
    let paddingPx = 12;
    if (paddingStr.includes('rem')) {
        paddingPx = Math.round(parseFloat(paddingStr) * 16);
    } else {
        paddingPx = parseInt(paddingStr) || 12;
    }
    document.getElementById('etb-padding').value = paddingPx;
    document.getElementById('etb-padding-value').textContent = (paddingPx / 16).toFixed(2);

    // 둥글기 (rem 또는 px 값 추출 후 px로 변환)
    // computed는 "8px 8px 8px 8px / ..." 형태일 수 있으므로 첫 값만 추출
    const radiusStr = style.borderRadius || computed.borderTopLeftRadius || '8px';
    let radiusPx = 8;
    if (radiusStr.includes('rem')) {
        radiusPx = Math.round(parseFloat(radiusStr) * 16);
    } else {
        radiusPx = parseInt(radiusStr) || 8;
    }
    document.getElementById('etb-radius').value = radiusPx;
    document.getElementById('etb-radius-value').textContent = (radiusPx / 16).toFixed(2);

    // 배경 이미지
    const bgImage = style.backgroundImage || '';
    const bgSize = style.backgroundSize || 'cover';
    document.getElementById('etb-bg-image-url').value = bgImage.replace(/url\(["']?|["']?\)/g, '');
    document.getElementById('etb-bg-size').value = bgSize;
}

// RGB를 HEX로 변환
function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return null;
    if (rgb.startsWith('#')) return rgb;

    const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return null;

    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
}

// 플로팅 툴바 표시
function showElementToolbar(x, y) {
    elementToolbar.classList.add('visible');

    // 툴바 크기 측정
    const toolbarRect = elementToolbar.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // X 위치: 클릭 위치 중앙, 화면 벗어나지 않게
    let left = x;
    const halfWidth = toolbarRect.width / 2;
    if (left - halfWidth < 10) left = halfWidth + 10;
    if (left + halfWidth > viewportWidth - 10) left = viewportWidth - halfWidth - 10;

    // Y 위치: 클릭 위치 위에, 공간 없으면 아래에
    let top = y - toolbarRect.height - 10;
    if (top < 10) {
        top = y + 10;
    }

    elementToolbar.style.left = `${left}px`;
    elementToolbar.style.top = `${top}px`;
}

// 플로팅 툴바 숨기기
function hideElementToolbar() {
    elementToolbar.classList.remove('visible');
}

// 배경 이미지 팝오버 표시
function showBgImagePopover() {
    const btn = document.getElementById('etb-bg-image-btn');
    const rect = btn.getBoundingClientRect();

    bgImagePopover.classList.add('visible');
    bgImagePopover.style.left = `${rect.left}px`;
    bgImagePopover.style.top = `${rect.bottom + 8}px`;
}

// 배경 이미지 팝오버 숨기기
function hideBgImagePopover() {
    bgImagePopover.classList.remove('visible');
}

// 그라데이션 팝오버 표시
function showGradientPopover() {
    const btn = document.getElementById('etb-gradient-btn');
    const rect = btn.getBoundingClientRect();

    gradientPopover.classList.add('visible');
    gradientPopover.style.left = `${Math.min(rect.left, window.innerWidth - 340)}px`;
    gradientPopover.style.top = `${rect.bottom + 8}px`;

    updateGradientPreview('etb');
}

// 그라데이션 팝오버 숨기기
function hideGradientPopover() {
    gradientPopover.classList.remove('visible');
}

// 텍스트 그라데이션 팝오버 표시
function showTextGradientPopover() {
    const btn = document.getElementById('text-gradient-btn');
    const rect = btn.getBoundingClientRect();

    textGradientPopover.classList.add('visible');
    textGradientPopover.style.left = `${Math.min(rect.right + 8, window.innerWidth - 340)}px`;
    textGradientPopover.style.top = `${rect.top}px`;

    updateGradientPreview('text');
}

// 텍스트 그라데이션 팝오버 숨기기
function hideTextGradientPopover() {
    textGradientPopover.classList.remove('visible');
}

// 그라데이션 문자열 생성
function buildGradientString(prefix) {
    const direction = document.getElementById(`${prefix}-gradient-direction`).value;
    const container = document.getElementById(`${prefix}-gradient-colors`);
    const stops = container.querySelectorAll('.etb-gradient-stop');

    const colorStops = [];
    stops.forEach(stop => {
        const color = stop.querySelector('.etb-gradient-color').value;
        const pos = stop.querySelector('.etb-gradient-pos').value;
        colorStops.push(`${color} ${pos}%`);
    });

    // 위치순 정렬
    colorStops.sort((a, b) => {
        const posA = parseInt(a.split(' ')[1]);
        const posB = parseInt(b.split(' ')[1]);
        return posA - posB;
    });

    return `linear-gradient(${direction}, ${colorStops.join(', ')})`;
}

// 그라데이션 미리보기 업데이트
function updateGradientPreview(prefix) {
    const preview = document.getElementById(`${prefix}-gradient-preview`);
    if (preview) {
        preview.style.background = buildGradientString(prefix);
    }
}

// 그라데이션 색상 추가
function addGradientStop(prefix) {
    const container = document.getElementById(`${prefix}-gradient-colors`);
    const stops = container.querySelectorAll('.etb-gradient-stop');

    if (stops.length >= 5) {
        showToast('최대 5개까지 추가할 수 있습니다');
        return;
    }

    // 랜덤 색상 생성
    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const newPos = Math.round(100 / (stops.length + 1) * stops.length);

    const stopHtml = `
        <div class="etb-gradient-stop">
            <input type="color" class="etb-gradient-color" value="${randomColor}">
            <input type="number" class="etb-gradient-pos" value="${newPos}" min="0" max="100" title="위치 (%)">
            <button type="button" class="etb-gradient-remove" title="삭제">✕</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', stopHtml);

    // 새로 추가된 요소에 이벤트 연결
    bindGradientStopEvents(container.lastElementChild, prefix);
    updateGradientPreview(prefix);
}

// 그라데이션 스탑 이벤트 바인딩
function bindGradientStopEvents(stopEl, prefix) {
    stopEl.querySelector('.etb-gradient-color').addEventListener('input', () => updateGradientPreview(prefix));
    stopEl.querySelector('.etb-gradient-pos').addEventListener('input', () => updateGradientPreview(prefix));
    stopEl.querySelector('.etb-gradient-remove').addEventListener('click', () => {
        const container = document.getElementById(`${prefix}-gradient-colors`);
        if (container.querySelectorAll('.etb-gradient-stop').length > 2) {
            stopEl.remove();
            updateGradientPreview(prefix);
        } else {
            showToast('최소 2개의 색상이 필요합니다');
        }
    });
}

// 초기 그라데이션 스탑 이벤트 바인딩
function initGradientEvents(prefix) {
    const container = document.getElementById(`${prefix}-gradient-colors`);
    const direction = document.getElementById(`${prefix}-gradient-direction`);

    container?.querySelectorAll('.etb-gradient-stop').forEach(stop => {
        bindGradientStopEvents(stop, prefix);
    });

    direction?.addEventListener('change', () => updateGradientPreview(prefix));
}

// 선택된 요소에 스타일 적용
function applyStyleToElement(property, value) {
    const target = getEditTarget();
    if (!target) return;
    target.style[property] = value;
    triggerSave();
}

// 탭 상태 업데이트
function updateTabState() {
    document.querySelectorAll('.etb-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === currentEditTarget);
    });
}

// 탭 클릭 이벤트
document.querySelectorAll('.etb-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        currentEditTarget = tab.dataset.tab;
        updateTabState();
        loadElementStyles(getEditTarget());
    });
});

// 저장 트리거
function triggerSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveContent, 500);
}

// 에디터 더블클릭 이벤트 - 블록 선택 및 툴바 표시
editor?.addEventListener('dblclick', (e) => {
    const target = e.target;
    const editableEl = findEditableParent(target);

    if (editableEl) {
        e.preventDefault();
        e.stopPropagation();
        selectElement(editableEl, e.clientX, e.clientY);
    }
});

// 에디터 싱글클릭 - 선택 해제 (툴바 외부 클릭 시)
editor?.addEventListener('click', (e) => {
    // 툴바가 열려있고, 선택된 요소 외부를 클릭한 경우에만 해제
    if (selectedElement && !selectedElement.contains(e.target)) {
        deselectElement();
    }
});

// 문서 클릭 시 선택 해제 (툴바/팝오버 외부)
document.addEventListener('click', (e) => {
    // 요소 선택 해제
    if (!elementToolbar.contains(e.target) &&
        !bgImagePopover.contains(e.target) &&
        !gradientPopover.contains(e.target) &&
        !editor.contains(e.target)) {
        deselectElement();
    }

    // 그라데이션 팝오버 닫기
    if (gradientPopover &&
        !gradientPopover.contains(e.target) &&
        e.target.id !== 'etb-gradient-btn' &&
        !e.target.closest('#etb-gradient-btn')) {
        hideGradientPopover();
    }
});

// ===== 드래그 앤 드롭 블록 이동 =====
let draggedBlock = null;
let dragStartTimer = null;
let isDragging = false;

// 마우스 다운 - 꾹 누르기 감지
editor?.addEventListener('mousedown', (e) => {
    const block = findEditableParent(e.target);
    if (!block) return;

    // 드래그 핸들(::before 영역) 클릭 감지 - 왼쪽 20px 영역
    const rect = block.getBoundingClientRect();
    const isHandleArea = e.clientX < rect.left;

    if (isHandleArea || e.target === block) {
        // 500ms 꾹 누르면 드래그 시작
        dragStartTimer = setTimeout(() => {
            startDrag(block, e);
        }, 500);
    }
});

// 마우스 업 - 드래그 취소 또는 드롭
editor?.addEventListener('mouseup', () => {
    clearTimeout(dragStartTimer);
    if (isDragging) {
        endDrag();
    }
});

// 마우스 이동 - 드래그 중 위치 업데이트
editor?.addEventListener('mousemove', (e) => {
    if (!isDragging || !draggedBlock) return;

    // 드래그 오버 대상 찾기
    const blocks = editor.querySelectorAll('.editable-block:not(.dragging)');
    blocks.forEach(block => block.classList.remove('drag-over'));

    const targetBlock = findBlockAtPosition(e.clientY);
    if (targetBlock && targetBlock !== draggedBlock) {
        targetBlock.classList.add('drag-over');
    }
});

// 마우스가 에디터를 벗어나면 드래그 취소
editor?.addEventListener('mouseleave', () => {
    clearTimeout(dragStartTimer);
    if (isDragging) {
        cancelDrag();
    }
});

function startDrag(block, e) {
    isDragging = true;
    draggedBlock = block;
    block.classList.add('dragging');
    document.body.style.cursor = 'grabbing';

    // 선택 해제
    deselectElement();

    showToast('블록을 원하는 위치로 이동하세요');
}

function endDrag() {
    if (!draggedBlock) return;

    // 드롭 대상 찾기
    const targetBlock = editor.querySelector('.editable-block.drag-over');

    if (targetBlock && targetBlock !== draggedBlock) {
        // 타겟 블록 앞에 삽입
        targetBlock.parentNode.insertBefore(draggedBlock, targetBlock);
        showToast('블록이 이동되었습니다');
        triggerSave();
    }

    cancelDrag();
}

function cancelDrag() {
    if (draggedBlock) {
        draggedBlock.classList.remove('dragging');
    }

    editor.querySelectorAll('.editable-block').forEach(block => {
        block.classList.remove('drag-over');
    });

    draggedBlock = null;
    isDragging = false;
    document.body.style.cursor = '';
}

function findBlockAtPosition(y) {
    const blocks = editor.querySelectorAll('.editable-block:not(.dragging)');

    for (const block of blocks) {
        const rect = block.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
            return block;
        }
    }

    return null;
}

// ===== 플로팅 툴바 이벤트 =====

// 배경색 변경
document.getElementById('etb-bg-color')?.addEventListener('input', (e) => {
    applyStyleToElement('backgroundColor', e.target.value);
    // 그라데이션이 적용되어 있으면 제거
    const target = getEditTarget();
    if (target) {
        target.style.backgroundImage = '';
    }
});

// 외곽선 변경
function applyBorderStyle() {
    const target = getEditTarget();
    if (!target) return;

    const width = document.getElementById('etb-border-width').value;
    const style = document.getElementById('etb-border-style').value;
    const color = document.getElementById('etb-border-color').value;

    if (parseInt(width) === 0) {
        target.style.border = 'none';
    } else {
        target.style.border = `${width}px ${style} ${color}`;
    }
    triggerSave();
}

document.getElementById('etb-border-width')?.addEventListener('input', applyBorderStyle);
document.getElementById('etb-border-style')?.addEventListener('change', applyBorderStyle);
document.getElementById('etb-border-color')?.addEventListener('input', applyBorderStyle);

// 패딩 슬라이더 (rem 단위)
document.getElementById('etb-padding')?.addEventListener('input', (e) => {
    const value = e.target.value;
    const remValue = (value / 16).toFixed(2);
    document.getElementById('etb-padding-value').textContent = `${remValue}`;
    applyStyleToElement('padding', `${remValue}rem`);
});

// 둥글기 슬라이더 (rem 단위)
document.getElementById('etb-radius')?.addEventListener('input', (e) => {
    const value = e.target.value;
    const remValue = (value / 16).toFixed(2);
    document.getElementById('etb-radius-value').textContent = `${remValue}`;
    applyStyleToElement('borderRadius', `${remValue}rem`);
});

// 배경 이미지 버튼
document.getElementById('etb-bg-image-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideGradientPopover();
    if (bgImagePopover.classList.contains('visible')) {
        hideBgImagePopover();
    } else {
        showBgImagePopover();
    }
});

// 그라데이션 버튼
document.getElementById('etb-gradient-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideBgImagePopover();
    if (gradientPopover.classList.contains('visible')) {
        hideGradientPopover();
    } else {
        showGradientPopover();
    }
});

// 그라데이션 색상 추가 버튼
document.getElementById('etb-gradient-add')?.addEventListener('click', () => addGradientStop('etb'));

// 그라데이션 적용
document.getElementById('etb-gradient-apply')?.addEventListener('click', () => {
    const target = getEditTarget();
    if (!target) return;

    const gradient = buildGradientString('etb');
    target.style.backgroundImage = gradient;
    target.style.backgroundColor = '';

    hideGradientPopover();
    triggerSave();
    showToast('그라데이션이 적용되었습니다');
});

// 그라데이션 제거
document.getElementById('etb-gradient-clear')?.addEventListener('click', () => {
    const target = getEditTarget();
    if (!target) return;

    target.style.backgroundImage = '';
    target.style.backgroundColor = '#f5f5f5';
    document.getElementById('etb-bg-color').value = '#f5f5f5';

    hideGradientPopover();
    triggerSave();
    showToast('그라데이션이 제거되었습니다');
});

// 그라데이션 이벤트 초기화
initGradientEvents('etb');
initGradientEvents('text');

// 배경 이미지 적용
document.getElementById('etb-bg-image-apply')?.addEventListener('click', () => {
    const target = getEditTarget();
    if (!target) return;

    const url = document.getElementById('etb-bg-image-url').value.trim();
    const size = document.getElementById('etb-bg-size').value;

    if (url) {
        target.style.backgroundImage = `url('${url}')`;
        target.style.backgroundSize = size;
        target.style.backgroundPosition = 'center';
        target.style.backgroundRepeat = 'no-repeat';
    }

    hideBgImagePopover();
    triggerSave();
    showToast('배경 이미지가 적용되었습니다');
});

// 배경 이미지 제거
document.getElementById('etb-bg-image-clear')?.addEventListener('click', () => {
    const target = getEditTarget();
    if (!target) return;

    target.style.backgroundImage = '';
    target.style.backgroundSize = '';
    target.style.backgroundPosition = '';
    target.style.backgroundRepeat = '';
    document.getElementById('etb-bg-image-url').value = '';

    hideBgImagePopover();
    triggerSave();
    showToast('배경 이미지가 제거되었습니다');
});

// 요소 삭제
document.getElementById('etb-delete-btn')?.addEventListener('click', () => {
    if (!selectedElement) return;

    if (confirm('이 요소를 삭제하시겠습니까?')) {
        selectedElement.remove();
        deselectElement();
        triggerSave();
        showToast('요소가 삭제되었습니다');
    }
});

// 블록 삽입 (중첩 가능)
document.getElementById('insert-block-btn')?.addEventListener('click', () => {
    const blockHtml = `<div class="editable-block" style="margin: 1rem 0; padding: 0.75rem; background-color: #f5f5f5; border-radius: 0.5rem; color: #1a1a1a;"><p>여기에 내용을 입력하세요</p></div><p><br></p>`;

    editor.focus();
    document.execCommand('insertHTML', false, blockHtml);
    triggerSave();
    showToast('블록이 삽입되었습니다. 더블클릭하여 스타일을 편집하세요!');
});

// ===== 테마 관리 (Log Studio와 공유) =====
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.classList.toggle('theme-dark', savedTheme === 'dark');
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('theme-dark');
        const isDark = document.body.classList.contains('theme-dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
}

initTheme();

// ===== 토스트 메시지 =====
function showToast(message, duration = 2000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

// ===== 툴바 명령어 처리 =====
document.querySelectorAll('.toolbar-btn[data-command]').forEach(btn => {
    btn.addEventListener('click', () => {
        const command = btn.dataset.command;

        // 특수 명령어 처리
        if (command === 'heading1') {
            document.execCommand('formatBlock', false, 'h1');
        } else if (command === 'heading2') {
            document.execCommand('formatBlock', false, 'h2');
        } else if (command === 'heading3') {
            document.execCommand('formatBlock', false, 'h3');
        } else if (command === 'formatBlock-p') {
            document.execCommand('formatBlock', false, 'p');
        } else if (command === 'blockquote') {
            document.execCommand('formatBlock', false, 'blockquote');
        } else {
            document.execCommand(command, false, null);
        }

        editor.focus();
    });
});

// ===== 글자 크기 선택 =====
const fontSizeSelect = document.getElementById('font-size-select');
if (fontSizeSelect) {
    fontSizeSelect.addEventListener('change', (e) => {
        if (e.target.value) {
            document.execCommand('fontSize', false, e.target.value);
            editor.focus();
        }
        e.target.value = ''; // 선택 초기화
    });
}

// ===== 색상 선택 =====
const textColorPicker = document.getElementById('text-color-picker');
const bgColorPicker = document.getElementById('bg-color-picker');
const textColorBar = document.getElementById('text-color-bar');
const bgColorBar = document.getElementById('bg-color-bar');

if (textColorPicker) {
    textColorPicker.addEventListener('input', (e) => {
        document.execCommand('foreColor', false, e.target.value);
        if (textColorBar) textColorBar.style.background = e.target.value;
        editor.focus();
    });
}

if (bgColorPicker) {
    bgColorPicker.addEventListener('input', (e) => {
        document.execCommand('hiliteColor', false, e.target.value);
        if (bgColorBar) bgColorBar.style.background = e.target.value;
        editor.focus();
    });
}

// ===== 텍스트 그라데이션 (왼쪽 툴바) =====
document.getElementById('text-gradient-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (textGradientPopover.classList.contains('visible')) {
        hideTextGradientPopover();
    } else {
        showTextGradientPopover();
    }
});

document.getElementById('text-gradient-add')?.addEventListener('click', () => addGradientStop('text'));

document.getElementById('text-gradient-apply')?.addEventListener('click', () => {
    const selection = window.getSelection();
    if (!selection.toString()) {
        showToast('텍스트를 선택해주세요');
        return;
    }

    const gradient = buildGradientString('text');
    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    span.style.background = gradient;
    span.style.webkitBackgroundClip = 'text';
    span.style.webkitTextFillColor = 'transparent';
    span.style.backgroundClip = 'text';

    range.surroundContents(span);
    selection.removeAllRanges();

    hideTextGradientPopover();
    triggerSave();
    showToast('텍스트 그라데이션이 적용되었습니다');
});

// 팝오버 외부 클릭 시 닫기
document.addEventListener('click', (e) => {
    if (textGradientPopover &&
        !textGradientPopover.contains(e.target) &&
        e.target.id !== 'text-gradient-btn') {
        hideTextGradientPopover();
    }
});

// ===== 구분선 삽입 =====
document.getElementById('insert-hr-btn')?.addEventListener('click', () => {
    document.execCommand('insertHTML', false, '<hr>');
    editor.focus();
});

// ===== 표 삽입 =====
document.getElementById('insert-table-btn')?.addEventListener('click', () => {
    const rows = prompt('행 수를 입력하세요 (기본: 3)', '3');
    const cols = prompt('열 수를 입력하세요 (기본: 3)', '3');

    if (rows && cols) {
        const r = parseInt(rows) || 3;
        const c = parseInt(cols) || 3;

        let tableHtml = '<table style="border-collapse: collapse; width: 100%; margin: 1rem 0;">';
        for (let i = 0; i < r; i++) {
            tableHtml += '<tr>';
            for (let j = 0; j < c; j++) {
                const cellStyle = 'border: 1px solid #ddd; padding: 8px; min-width: 50px;';
                if (i === 0) {
                    tableHtml += `<th style="${cellStyle} background: #f5f5f5; font-weight: bold;">제목</th>`;
                } else {
                    tableHtml += `<td style="${cellStyle}">내용</td>`;
                }
            }
            tableHtml += '</tr>';
        }
        tableHtml += '</table><p><br></p>';

        document.execCommand('insertHTML', false, tableHtml);
        editor.focus();
        showToast('표가 삽입되었습니다');
    }
});

// ===== 접기/펼치기 삽입 =====
document.getElementById('insert-details-btn')?.addEventListener('click', () => {
    const summaryText = prompt('접힌 상태에서 보여줄 제목을 입력하세요', '더 보기');

    if (summaryText) {
        // details 요소를 직접 생성 (insertHTML 버그 회피)
        const details = document.createElement('details');
        details.className = 'editable-block';
        details.style.cssText = 'margin: 1rem 0; padding: 0.75rem; background-color: #fafafa; border: 1px solid #ddd; border-radius: 0.5rem; color: #1a1a1a;';

        const summary = document.createElement('summary');
        summary.style.cssText = 'cursor: pointer; font-weight: 600; padding: 0.25rem 0;';
        summary.textContent = summaryText;

        const innerDiv = document.createElement('div');
        innerDiv.style.cssText = 'padding: 0.75rem 0 0;';
        innerDiv.innerHTML = '<p>여기에 숨겨진 내용을 입력하세요</p>';

        details.appendChild(summary);
        details.appendChild(innerDiv);

        // 현재 커서 위치에 삽입
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(details);

            // 커서를 details 뒤로 이동
            range.setStartAfter(details);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            editor.appendChild(details);
        }

        // 뒤에 빈 줄 추가
        const br = document.createElement('p');
        br.innerHTML = '<br>';
        details.parentNode.insertBefore(br, details.nextSibling);

        editor.focus();
        triggerSave();
        showToast('접기/펼치기가 삽입되었습니다. 더블클릭하여 스타일을 편집하세요!');
    }
});

// ===== 전체 삭제 =====
document.getElementById('clear-btn')?.addEventListener('click', () => {
    if (confirm('모든 내용을 삭제하시겠습니까?')) {
        editor.innerHTML = '';
        localStorage.removeItem(STORAGE_KEY); // 즉시 저장소에서도 삭제
        editor.focus();
        showToast('내용이 삭제되었습니다');
    }
});

// ===== HTML 코드 보기 =====
const codeViewContainer = document.getElementById('code-view-container');
const codeViewContent = document.getElementById('code-view-content');
const viewCodeBtn = document.getElementById('view-code-btn');
const codeViewClose = document.getElementById('code-view-close');

function formatHTML(html) {
    // 간단한 HTML 포맷팅
    let formatted = html;
    let indent = 0;
    const tab = '  ';

    formatted = formatted.replace(/></g, '>\n<');

    const lines = formatted.split('\n');
    formatted = lines.map(line => {
        line = line.trim();
        if (line.match(/^<\/(.*?)>$/)) {
            indent--;
        }
        const result = tab.repeat(Math.max(0, indent)) + line;
        if (line.match(/^<[^/].*[^/]>$/) && !line.match(/^<(br|hr|img|input)/i)) {
            indent++;
        }
        return result;
    }).join('\n');

    return formatted;
}

viewCodeBtn?.addEventListener('click', () => {
    const html = editor.innerHTML;
    codeViewContent.textContent = formatHTML(html);
    codeViewContainer.style.display = 'flex';
});

codeViewClose?.addEventListener('click', () => {
    codeViewContainer.style.display = 'none';
});

// ===== HTML 복사 =====
document.getElementById('copy-html-btn')?.addEventListener('click', async () => {
    const html = editor.innerHTML;

    try {
        await navigator.clipboard.writeText(html);
        showToast('HTML이 클립보드에 복사되었습니다!');
    } catch (err) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = html;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('HTML이 클립보드에 복사되었습니다!');
    }
});

// ===== 이미지 모달 =====
const imageModal = document.getElementById('image-modal');
const imageUploadArea = document.getElementById('image-upload-area');
const imageFileInput = document.getElementById('image-file-input');
const imageUrlInput = document.getElementById('image-url-input');
const imageWidthInput = document.getElementById('image-width');
const imageAlignSelect = document.getElementById('image-align');

let pendingImageData = null;

function openImageModal() {
    imageModal.classList.add('open');
    pendingImageData = null;
    imageUrlInput.value = '';
    imageWidthInput.value = '';
    imageAlignSelect.value = 'none';
}

function closeImageModal() {
    imageModal.classList.remove('open');
}

document.getElementById('insert-image-btn')?.addEventListener('click', openImageModal);
document.getElementById('image-cancel-btn')?.addEventListener('click', closeImageModal);
imageModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeImageModal);
imageModal?.querySelector('.modal-close')?.addEventListener('click', closeImageModal);

// 이미지 업로드 영역
imageUploadArea?.addEventListener('click', () => imageFileInput.click());

imageUploadArea?.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageUploadArea.classList.add('drag-over');
});

imageUploadArea?.addEventListener('dragleave', () => {
    imageUploadArea.classList.remove('drag-over');
});

imageUploadArea?.addEventListener('drop', (e) => {
    e.preventDefault();
    imageUploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        processImageFile(file);
    }
});

imageFileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        processImageFile(file);
    }
});

async function processImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        pendingImageData = e.target.result;
        imageUploadArea.innerHTML = `
            <img src="${pendingImageData}" style="max-width: 200px; max-height: 150px; border-radius: 8px;">
            <p style="margin-top: 0.5rem; color: var(--text-muted);">이미지 준비됨</p>
        `;
    };
    reader.readAsDataURL(file);
}

// 이미지 삽입
document.getElementById('image-insert-btn')?.addEventListener('click', () => {
    const src = pendingImageData || imageUrlInput.value.trim();
    if (!src) {
        showToast('이미지를 선택하거나 URL을 입력해주세요');
        return;
    }

    const width = imageWidthInput.value;
    const align = imageAlignSelect.value;

    let style = 'max-width: 100%;';
    if (width) style += ` width: ${width}px;`;

    let imgHtml = `<img src="${src}" style="${style}">`;

    if (align === 'center') {
        imgHtml = `<div style="text-align: center;">${imgHtml}</div>`;
    } else if (align === 'left') {
        imgHtml = `<div style="text-align: left;">${imgHtml}</div>`;
    } else if (align === 'right') {
        imgHtml = `<div style="text-align: right;">${imgHtml}</div>`;
    }

    editor.focus();
    document.execCommand('insertHTML', false, imgHtml);

    closeImageModal();

    // 업로드 영역 리셋
    imageUploadArea.innerHTML = `
        <div class="upload-icon">🖼️</div>
        <p>이미지를 드래그하거나 클릭하여 업로드</p>
    `;

    showToast('이미지가 삽입되었습니다');
});

// ===== 링크 모달 =====
const linkModal = document.getElementById('link-modal');
const linkTextInput = document.getElementById('link-text-input');
const linkUrlInput = document.getElementById('link-url-input');

function openLinkModal() {
    linkModal.classList.add('open');

    // 선택된 텍스트가 있으면 링크 텍스트로 사용
    const selection = window.getSelection();
    if (selection.toString()) {
        linkTextInput.value = selection.toString();
    } else {
        linkTextInput.value = '';
    }
    linkUrlInput.value = '';
    linkTextInput.focus();
}

function closeLinkModal() {
    linkModal.classList.remove('open');
}

document.getElementById('insert-link-btn')?.addEventListener('click', openLinkModal);
document.getElementById('link-cancel-btn')?.addEventListener('click', closeLinkModal);
linkModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeLinkModal);
linkModal?.querySelector('.modal-close')?.addEventListener('click', closeLinkModal);

// 링크 삽입
document.getElementById('link-insert-btn')?.addEventListener('click', () => {
    const text = linkTextInput.value.trim();
    const url = linkUrlInput.value.trim();

    if (!url) {
        showToast('URL을 입력해주세요');
        return;
    }

    const displayText = text || url;
    const linkHtml = `<a href="${url}" target="_blank">${displayText}</a>`;

    editor.focus();
    document.execCommand('insertHTML', false, linkHtml);

    closeLinkModal();
    showToast('링크가 삽입되었습니다');
});

// ===== 에디터 직접 이미지 붙여넣기 =====
editor?.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const imgHtml = `<img src="${event.target.result}" style="max-width: 100%;">`;
                    document.execCommand('insertHTML', false, imgHtml);
                };
                reader.readAsDataURL(file);
            }
            return;
        }
    }
});

// ===== 에디터 드래그 앤 드롭 이미지 =====
editor?.addEventListener('dragover', (e) => {
    e.preventDefault();
});

editor?.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.type.startsWith('image/')) {
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = (event) => {
            const imgHtml = `<img src="${event.target.result}" style="max-width: 100%;">`;
            document.execCommand('insertHTML', false, imgHtml);
        };
        reader.readAsDataURL(file);
    }
});

// ===== 키보드 단축키 =====
document.addEventListener('keydown', (e) => {
    // Escape로 모달 닫기
    if (e.key === 'Escape') {
        if (selectedElement) {
            deselectElement();
            return;
        }
        if (document.getElementById('help-modal')?.classList.contains('open')) {
            closeHelpModal();
            return;
        }
        if (imageModal.classList.contains('open')) {
            closeImageModal();
        }
        if (linkModal.classList.contains('open')) {
            closeLinkModal();
        }
        if (codeViewContainer.style.display !== 'none') {
            codeViewContainer.style.display = 'none';
        }
    }
});

// ===== 로컬 스토리지 자동 저장 =====
const STORAGE_KEY = 'post_studio_content';

function saveContent() {
    localStorage.setItem(STORAGE_KEY, editor.innerHTML);
}

function loadContent() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        editor.innerHTML = saved;
    }
}

// 입력 시 자동 저장 (디바운스)
let saveTimeout;
editor?.addEventListener('input', () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveContent, 1000);
});

// 삭제 키 입력 시 즉시 저장
editor?.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveContent, 100);
    }
});

// 페이지 로드 시 복원
loadContent();

// ===== 도움말 모달 =====
const helpModal = document.getElementById('help-modal');

function openHelpModal() {
    helpModal?.classList.add('open');
}

function closeHelpModal() {
    helpModal?.classList.remove('open');
}

document.getElementById('help-btn')?.addEventListener('click', openHelpModal);
document.getElementById('help-modal-close')?.addEventListener('click', closeHelpModal);
helpModal?.querySelector('.help-modal-backdrop')?.addEventListener('click', closeHelpModal);

// F1 키로 도움말 열기
document.addEventListener('keydown', (e) => {
    if (e.key === 'F1') {
        e.preventDefault();
        openHelpModal();
    }
});

console.log('Post Studio 로드 완료');
