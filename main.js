// ===== DOM 요소 =====
const previewEl = document.querySelector("#log-preview");
const codeOutputEl = document.querySelector("#code-output");
const copyBtn = document.querySelector("#copy-btn");
const logBlocksContainer = document.querySelector("#log-blocks");
const addBlockBtn = document.querySelector("#add-block-btn");

// ===== 유틸리티 함수 =====
function escapeHTML(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== 로그 블록 관리 =====
let logBlocks = [];
let blockIdCounter = 0;

function createLogBlock(title = "", content = "", collapsible = false) {
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
    return block;
}

function removeLogBlock(id) {
    logBlocks = logBlocks.filter(b => b.id !== id);
    renderLogBlocks();
    updatePreview();
}

function updateLogBlock(id, updates) {
    const block = logBlocks.find(b => b.id === id);
    if (block) {
        Object.assign(block, updates);
        updatePreview();
    }
}

function renderLogBlocks() {
    if (!logBlocksContainer) return;

    logBlocksContainer.innerHTML = logBlocks.map(block => `
        <div class="log-block ${block.collapsed ? 'collapsed' : ''}" data-block-id="${block.id}">
            <div class="log-block-header">
                <button type="button" class="log-block-btn log-block-btn--collapse ${block.collapsed ? 'collapsed' : ''}" title="접기/펼치기">▼</button>
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
    aiModel: "",
    promptName: "",
    subModel: "",
    // 스타일
    bgColor: "#1e1e1e",
    textColor: "#e0e0e0",
    charColor: "#38bdf8",
    userColor: "#a78bfa",
    boldColor: "#fbbf24",
    italicColor: "#a5b4fc",
    dialogueColor: "#86efac",
    dialogueBgColor: "#1a2e1a",
    fontFamily: "Pretendard",
    fontSize: 16,
    containerWidth: 800,
    borderRadius: 8,
    lineHeight: 1.8,
    letterSpacing: 0,
    // 뱃지 색상
    badgeModelColor: "#10a37f",
    badgePromptColor: "#6b7280",
    badgeSubColor: "#4285f4",
};

// 테마 프리셋 정의
const themePresets = {
    "dark-default": {
        bgColor: "#1e1e1e", textColor: "#e0e0e0", charColor: "#38bdf8",
        boldColor: "#fbbf24", italicColor: "#a5b4fc", dialogueColor: "#86efac", dialogueBgColor: "#1a2e1a",
        badgeModelColor: "#10a37f", badgePromptColor: "#6b7280", badgeSubColor: "#4285f4"
    },
    "dark-purple": {
        bgColor: "#1a1625", textColor: "#e2e0ea", charColor: "#a78bfa",
        boldColor: "#f472b6", italicColor: "#c4b5fd", dialogueColor: "#67e8f9", dialogueBgColor: "#1e1a2e",
        badgeModelColor: "#8b5cf6", badgePromptColor: "#6366f1", badgeSubColor: "#ec4899"
    },
    "dark-green": {
        bgColor: "#0f1f1a", textColor: "#d1fae5", charColor: "#34d399",
        boldColor: "#fbbf24", italicColor: "#6ee7b7", dialogueColor: "#a7f3d0", dialogueBgColor: "#064e3b",
        badgeModelColor: "#059669", badgePromptColor: "#047857", badgeSubColor: "#10b981"
    },
    "dark-warm": {
        bgColor: "#1c1917", textColor: "#fef3c7", charColor: "#fb923c",
        boldColor: "#fbbf24", italicColor: "#fdba74", dialogueColor: "#fde68a", dialogueBgColor: "#451a03",
        badgeModelColor: "#ea580c", badgePromptColor: "#78350f", badgeSubColor: "#f59e0b"
    },
    "light-default": {
        bgColor: "#ffffff", textColor: "#1f2937", charColor: "#3b82f6",
        boldColor: "#dc2626", italicColor: "#6366f1", dialogueColor: "#059669", dialogueBgColor: "#ecfdf5",
        badgeModelColor: "#2563eb", badgePromptColor: "#6b7280", badgeSubColor: "#7c3aed"
    },
    "light-warm": {
        bgColor: "#fefce8", textColor: "#422006", charColor: "#ca8a04",
        boldColor: "#dc2626", italicColor: "#b45309", dialogueColor: "#15803d", dialogueBgColor: "#fef9c3",
        badgeModelColor: "#ca8a04", badgePromptColor: "#92400e", badgeSubColor: "#16a34a"
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
    return `margin: 0 0 1.2em 0; text-align: justify; word-break: keep-all;`;
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
            tags.push(`<span style="display: inline-flex; align-items: center; gap: 0.35em; padding: 0.35em 0.75em; background: ${settings.badgeModelColor}; border-radius: 20px; font-size: 0.7em; font-weight: 600; color: #fff; margin-right: 0.5em;">${settings.aiModel}</span>`);
        }
        if (settings.promptName) {
            tags.push(`<span style="display: inline-flex; align-items: center; gap: 0.35em; padding: 0.35em 0.75em; background: ${settings.badgePromptColor}; border-radius: 20px; font-size: 0.7em; font-weight: 600; color: #fff; margin-right: 0.5em;">${settings.promptName}</span>`);
        }
        if (settings.subModel) {
            tags.push(`<span style="display: inline-flex; align-items: center; gap: 0.35em; padding: 0.35em 0.75em; background: transparent; border: 1.5px solid ${settings.badgeSubColor}; border-radius: 20px; font-size: 0.7em; font-weight: 600; color: ${settings.badgeSubColor}; margin-right: 0.5em;">${settings.subModel}</span>`);
        }

        if (tags.length > 0) {
            const marginTop = settings.charName ? "margin-top: 1em;" : "";
            tagsHTML = `    <div style="${marginTop} display: flex; flex-wrap: wrap; gap: 0.35em;">${tags.join("")}</div>\n`;
        }

        headerHTML = `  <div style="${headerStyle}">\n${titleHTML}${tagsHTML}  </div>\n`;
    }

    // 블록별 HTML 생성
    const blocksHTML = blocksWithContent.map((block, index) => {
        const lines = block.content.split(/\r?\n/).filter((line) => line.trim() !== "");
        const linesHTML = lines.map((line) => {
            const pStyle = getParagraphStyle();
            const content = parseMarkdown(line);
            return `    <p style="${pStyle}">${content}</p>`;
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
    const containerStyle = [
        `max-width: ${settings.containerWidth}px`,
        `margin: 0 auto`,
        `padding: 2em`,
        `background: ${settings.bgColor}`,
        `color: ${settings.textColor}`,
        `font-family: "${settings.fontFamily}", sans-serif`,
        `font-size: ${settings.fontSize}px`,
        `line-height: ${settings.lineHeight}`,
        `letter-spacing: ${settings.letterSpacing}em`,
        `border-radius: ${settings.borderRadius}px`,
        `box-sizing: border-box`,
    ].join("; ");

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
    previewEl.style.padding = "2em";
    previewEl.style.background = settings.bgColor;
    previewEl.style.color = settings.textColor;
    previewEl.style.fontFamily = `"${settings.fontFamily}", sans-serif`;
    previewEl.style.fontSize = `${settings.fontSize}px`;
    previewEl.style.lineHeight = settings.lineHeight;
    previewEl.style.letterSpacing = `${settings.letterSpacing}em`;
    previewEl.style.borderRadius = `${settings.borderRadius}px`;
    previewEl.style.boxSizing = "border-box";

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
                tags.push(`<span style="display: inline-flex; align-items: center; gap: 0.35em; padding: 0.35em 0.75em; background: ${settings.badgeModelColor}; border-radius: 20px; font-size: 0.7em; font-weight: 600; color: #fff;">${settings.aiModel}</span>`);
            }
            if (settings.promptName) {
                tags.push(`<span style="display: inline-flex; align-items: center; gap: 0.35em; padding: 0.35em 0.75em; background: ${settings.badgePromptColor}; border-radius: 20px; font-size: 0.7em; font-weight: 600; color: #fff;">${settings.promptName}</span>`);
            }
            if (settings.subModel) {
                tags.push(`<span style="display: inline-flex; align-items: center; gap: 0.35em; padding: 0.35em 0.75em; background: transparent; border: 1.5px solid ${settings.badgeSubColor}; border-radius: 20px; font-size: 0.7em; font-weight: 600; color: ${settings.badgeSubColor};">${settings.subModel}</span>`);
            }

            if (tags.length > 0) {
                const marginTop = settings.charName ? "margin-top: 1em;" : "";
                tagsHTML = `<div style="${marginTop} display: flex; flex-wrap: wrap; gap: 0.35em;">${tags.join("")}</div>`;
            }

            headerHTML = `<div style="margin-bottom: 1.5em; padding: 1.5em; background: linear-gradient(135deg, ${headerBgLight} 0%, ${headerBgDark} 100%); border-radius: 16px; border: 1px solid ${borderColor}40;">${titleHTML}${tagsHTML}</div>`;
        }

        // 블록별 HTML 생성
        const blocksHTML = blocksWithContent.map((block, index) => {
            const lines = block.content.split(/\r?\n/).filter((line) => line.trim() !== "");
            const linesHTML = lines.map((line) => {
                const pStyle = getParagraphStyle();
                const content = parseMarkdown(line);
                return `<p style="${pStyle}">${content}</p>`;
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
        document.querySelector(`#tab-${tabId}`).classList.add("active");
    });
});

// ===== 설정 입력 동기화 =====
// 캐릭터 정보
const charInputs = {
    "char-name": "charName",
    "char-link": "charLink",
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
    });
});

// UI 동기화 함수
function syncUIFromSettings() {
    // 색상 입력 동기화
    const colorMap = {
        "style-bg": "bgColor",
        "style-text": "textColor",
        "style-char": "charColor",
        "style-user": "userColor",
        "style-bold": "boldColor",
        "style-italic": "italicColor",
        "style-dialogue": "dialogueColor",
        "style-dialogue-bg": "dialogueBgColor",
        "style-badge-model": "badgeModelColor",
        "style-badge-prompt": "badgePromptColor",
        "style-badge-sub": "badgeSubColor",
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
    { colorId: "style-user", textId: "style-user-text", key: "userColor" },
    { colorId: "style-bold", textId: "style-bold-text", key: "boldColor" },
    { colorId: "style-italic", textId: "style-italic-text", key: "italicColor" },
    { colorId: "style-dialogue", textId: "style-dialogue-text", key: "dialogueColor" },
    { colorId: "style-dialogue-bg", textId: "style-dialogue-bg-text", key: "dialogueBgColor" },
    { colorId: "style-badge-model", textId: "style-badge-model-text", key: "badgeModelColor" },
    { colorId: "style-badge-prompt", textId: "style-badge-prompt-text", key: "badgePromptColor" },
    { colorId: "style-badge-sub", textId: "style-badge-sub-text", key: "badgeSubColor" },
];

colorInputs.forEach(({ colorId, textId, key }) => {
    const colorEl = document.getElementById(colorId);
    const textEl = document.getElementById(textId);

    if (colorEl && textEl) {
        colorEl.addEventListener("input", (e) => {
            settings[key] = e.target.value;
            textEl.value = e.target.value;
            updatePreview();
        });

        textEl.addEventListener("input", (e) => {
            const val = e.target.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                settings[key] = val;
                colorEl.value = val;
                updatePreview();
            }
        });
    }
});

// 셀렉트
const fontSelect = document.getElementById("style-font");
if (fontSelect) {
    fontSelect.addEventListener("change", (e) => {
        settings.fontFamily = e.target.value;
        updatePreview();
    });
}

// 레인지 슬라이더
const rangeInputs = [
    { id: "style-font-size", key: "fontSize", valueId: "style-font-size-value", unit: "px" },
    { id: "style-width", key: "containerWidth", valueId: "style-width-value", unit: "px" },
    { id: "style-radius", key: "borderRadius", valueId: "style-radius-value", unit: "px" },
    { id: "style-line-height", key: "lineHeight", valueId: "style-line-height-value", unit: "" },
    { id: "style-letter-spacing", key: "letterSpacing", valueId: "style-letter-spacing-value", unit: "em" },
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
        });
    }
});

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

// ===== 초기 블록 생성 =====
createLogBlock("로그 1", "", false);

console.log("main.js loaded successfully");

// ===== 테마 토글 =====
const themeToggleBtn = document.querySelector("#theme-toggle");

function setTheme(mode) {
    if (mode === "light") {
        document.body.classList.add("theme-light");
        localStorage.setItem("theme", "light");
    } else {
        document.body.classList.remove("theme-light");
        localStorage.setItem("theme", "dark");
    }
}

if (themeToggleBtn) {
    const saved = localStorage.getItem("theme");
    setTheme(saved === "light" ? "light" : "dark");

    themeToggleBtn.addEventListener("click", () => {
        const isLight = document.body.classList.contains("theme-light");
        setTheme(isLight ? "dark" : "light");
    });
}

