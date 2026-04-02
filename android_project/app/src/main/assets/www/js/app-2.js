// [v4.5.4] Updated renderTaskCards (修复达标文本, 修复计时器UI, 增加高亮 class)

const clampChannel = (v) => Math.min(255, Math.max(0, v));
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const hexToRgb = (hex) => {
    if (!hex) return null;
    let h = hex.trim();
    if (h.startsWith('#')) h = h.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length !== 6) return null;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some(n => Number.isNaN(n))) return null;
    return { r, g, b };
};
const channelToHex = (v) => clampChannel(Math.round(v)).toString(16).padStart(2, '0');
const adjustColor = (hex, percent) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const factor = percent / 100;
    const r = factor >= 0 ? rgb.r + (255 - rgb.r) * factor : rgb.r * (1 + factor);
    const g = factor >= 0 ? rgb.g + (255 - rgb.g) * factor : rgb.g * (1 + factor);
    const b = factor >= 0 ? rgb.b + (255 - rgb.b) * factor : rgb.b * (1 + factor);
    return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
};
const hexToHsl = (hex) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    const r = rgb.r / 255; const g = rgb.g / 255; const b = rgb.b / 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    let h; let s; const l = (max + min) / 2;
    if (max === min) { h = 0; s = 0; }
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            default: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h, s, l };
};
const hslToHex = (h, s, l) => {
    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    };
    let r; let g; let b;
    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return `#${channelToHex(r * 255)}${channelToHex(g * 255)}${channelToHex(b * 255)}`;
};
// [v7.20.1] 获取当前渐变风格设置
const getGradientStyle = () => localStorage.getItem('gradientStyle') || 'gradient';

// [v7.20.1] 徽章/标签渐变色生成（徽章左浅右深）
const getBadgeGradient = (baseColor) => {
    const color = baseColor || '#7c4dff';
    // [v7.20.1] 纯色系模式直接返回纯色
    if (getGradientStyle() === 'flat') return color;
    const hsl = hexToHsl(color);
    if (!hsl) return 'var(--accent-gradient)';
    const s = clamp01(Math.max(0.45, Math.min(0.9, hsl.s + 0.05)));
    let startL; let endL;
    if (hsl.l >= 0.7) {
        // 亮色（如黄）：徽章左浅右深
        startL = clamp01(hsl.l - 0.02);
        endL = clamp01(hsl.l - 0.14);
    } else {
        // 深色：徽章左浅右深
        startL = clamp01(hsl.l + 0.14);
        endL = clamp01(hsl.l - 0.02);
    }
    const left = hslToHex(hsl.h, s, startL);
    const right = hslToHex(hsl.h, s, endL);
    return `linear-gradient(135deg, ${left}, ${right})`;
};

// [v7.20.1] 分类标签渐变（左深右浅）
const getCategoryGradient = (baseColor) => {
    const color = baseColor || '#7c4dff';
    // [v7.20.1] 纯色系模式直接返回纯色
    if (getGradientStyle() === 'flat') return color;
    const hsl = hexToHsl(color);
    if (!hsl) return 'var(--accent-gradient)';
    const s = clamp01(Math.max(0.45, Math.min(0.9, hsl.s + 0.05)));
    let startL; let endL;
    if (hsl.l >= 0.7) {
        // 亮色：左深右浅
        startL = clamp01(hsl.l - 0.16);
        endL = clamp01(hsl.l - 0.04);
    } else {
        // 深色：左深右浅
        startL = clamp01(hsl.l - 0.06);
        endL = clamp01(hsl.l + 0.10);
    }
    const left = hslToHex(hsl.h, s, startL);
    const right = hslToHex(hsl.h, s, endL);
    return `linear-gradient(135deg, ${left}, ${right})`;
};

// [v7.20.1] 暂停徽章背景获取（支持纯色/渐变切换）
const getPausedBadgeBg = () => {
    if (getGradientStyle() === 'flat') return '#9e9e9e';
    return 'linear-gradient(135deg, #b5b5b5, #8a8a8a)';
};

// [v5.1.x] 基于分类色生成任务切片梯度色组
const generateCategoryTaskColors = (baseColor, count) => {
    const fallback = ['#7c4dff', '#6a48d7', '#8c6ae3', '#a88eeb', '#c8b8f4'];
    const hsl = hexToHsl(baseColor || '#7c4dff');
    if (!hsl) return fallback.slice(0, count);
    const s = clamp01(Math.max(0.35, Math.min(0.9, hsl.s + 0.02)));
    const colors = [];
    const baseL = clamp01(hsl.l); // 以第二名为基准色
    const darkL = clamp01(baseL - 0.07); // 第一名略深
    const lightStep = 0.08;

    if (count === 1) {
        colors.push(hslToHex(hsl.h, s, baseL));
        return colors;
    }

    // 第一名：最深；第二名：基准色；第3-4名逐步变浅；第5名及以后不再变浅
    colors.push(hslToHex(hsl.h, s, darkL));
    colors.push(hslToHex(hsl.h, s, baseL));
    const maxLightIdx = 4; // 第5名(idx=4)及以后固定亮度
    for (let i = 2; i < count; i++) {
        const stepIdx = Math.min(i - 1, maxLightIdx - 1);
        const l = clamp01(baseL + lightStep * stepIdx);
        colors.push(hslToHex(hsl.h, s, l));
    }
    return colors;
};

// [v6.0.0] 为任务视图生成基于分类的颜色映射
// 按任务所属分类分组，同分类下多任务使用递减色阶
// [v7.2.2] 支持系统任务（屏幕时间管理）的自定义分类颜色
function buildTaskViewColorMap(taskItems, typeKey = 'earn') {
    const colorMap = new Map();
    // 1. 按分类分组任务
    const categoryGroups = new Map();
    taskItems.forEach(item => {
        if (item.name === '其他') return;
        
        let category;
        // [v7.2.2] 系统任务特殊处理
        if (item.name === '屏幕时间管理') {
            // 根据传入的 typeKey 决定使用哪个分类
            category = typeKey === 'earn' 
                ? (screenTimeSettings.earnCategory || SCREEN_TIME_CATEGORY)
                : (screenTimeSettings.spendCategory || SCREEN_TIME_CATEGORY);
        // [v7.20.3-fix] 睡眠系统任务在任务视图中与分类视图保持一致：
        // 优先使用用户在睡眠设置中选择的分类（如“健康/娱乐”），回退到“睡眠”默认分类
        } else if (item.name === '睡眠时间管理' || item.name === '小睡') {
            category = typeKey === 'earn'
                ? (sleepSettings.earnCategory || SLEEP_CATEGORY)
                : (sleepSettings.spendCategory || SLEEP_CATEGORY);
        } else {
            // 查找任务获取分类
            const task = tasks.find(t => t.name === item.name);
            // [v7.20.3-fix] item.category 来自聚合阶段（含系统任务），优先使用以避免误落到“未分类”
            category = item.category || task?.category || '未分类';
        }
        
        if (!categoryGroups.has(category)) {
            categoryGroups.set(category, []);
        }
        categoryGroups.get(category).push(item.name);
    });
    // 2. 为每个分类组生成颜色
    categoryGroups.forEach((taskNames, category) => {
        const baseColor = getCategoryColorSafe(category);
        const colors = generateCategoryTaskColors(baseColor, taskNames.length);
        taskNames.forEach((name, idx) => {
            colorMap.set(name, colors[idx]);
        });
    });
    // 注意："其他"颜色由调用方根据 earn/spend 类型决定
    return colorMap;
}

// [v5.1.0] 饼图长按弹窗（防误触：移动阈值+触控专用）
// ====== ⭐ CRITICAL: 防误触机制 - 修改前请仔细检查 ======
// 1. PIE_SWIPE_THRESHOLD: 滑动阈值，超过则取消长按
// 2. pieTooltipTouchMoveBlocker: 长按激活后阻断页面滚动
// 3. setPointerCapture: 接管指针事件防止滚动
// 4. evt.preventDefault/stopPropagation: 长按状态下阻止默认行为
// ========================================================
let pieTooltipLongPressTimer = null;
let pieTooltipPointerId = null;
let pieTooltipLongPressActive = false;
let pieTooltipLongPressCooldown = false;
let pieTooltipStartX = 0;
let pieTooltipStartY = 0;
let pieTooltipMoveHandler = null;
let pieTooltipEndHandler = null;
let pieTooltipGlobalListenersBound = false;
let pieTooltipRAFId = null;
let pieDetailLongPressTimer = null;
let pieDetailProgressPlanned = false;
let pieTooltipCurrentSliceName = null; // 跟踪当前显示的slice名称
let pieTooltipCurrentMeta = null; // 跟踪当前显示slice对应的meta
let pieTooltipTouchMoveBlocker = null; // 长按激活后阻断touchmove滚动
let pieActiveSliceName = null; // 当前高亮的扇形名称
const PIE_SWIPE_THRESHOLD = 20; // 滑动取消阈值（像素），适当放宽以支持饼图上的弧形滑动

function startPieDetailProgress() {
    const tooltipEl = document.getElementById('pieTooltip');
    if (!tooltipEl) return;
    const bar = tooltipEl.querySelector('.pie-tooltip-progress');
    if (!bar) return;
    bar.classList.remove('animating');
    void bar.offsetWidth; // 强制重绘
    bar.classList.add('animating');
}

function stopPieDetailProgress() {
    const tooltipEl = document.getElementById('pieTooltip');
    if (!tooltipEl) return;
    const bar = tooltipEl.querySelector('.pie-tooltip-progress');
    if (bar) {
        bar.classList.remove('animating');
    }
}

function hidePieTooltip() {
    const tooltipEl = document.getElementById('pieTooltip');
    if (!tooltipEl) return;
    tooltipEl.classList.remove('show', 'moving');
    tooltipEl.style.transition = '';
    stopPieDetailProgress();
    if (pieTooltipRAFId) cancelAnimationFrame(pieTooltipRAFId);
    pieTooltipRAFId = null;
    pieTooltipCurrentSliceName = null;
    pieTooltipCurrentMeta = null;
    clearPieActiveHighlight();
    // 清理长按状态，防止进入详情后再次触发
    clearTimeout(pieTooltipLongPressTimer);
    clearTimeout(pieDetailLongPressTimer);
    pieTooltipLongPressActive = false;
    // 注意：不在这里设置 pieTooltipLongPressCooldown，由 endHandler 控制
    pieDetailProgressPlanned = false;
    pieTooltipPointerId = null;
    // 移除touchmove阻断器
    if (pieTooltipTouchMoveBlocker) {
        window.removeEventListener('touchmove', pieTooltipTouchMoveBlocker, { passive: false, capture: true });
        pieTooltipTouchMoveBlocker = null;
    }
    // 移除pointer事件监听
    if (pieTooltipMoveHandler) {
        window.removeEventListener('pointermove', pieTooltipMoveHandler, { passive: false, capture: true });
        pieTooltipMoveHandler = null;
    }
    if (pieTooltipEndHandler) {
        window.removeEventListener('pointerup', pieTooltipEndHandler, true);
        window.removeEventListener('pointercancel', pieTooltipEndHandler, true);
        pieTooltipEndHandler = null;
    }
}

function bindPieTooltipGlobalListeners() {
    if (pieTooltipGlobalListenersBound) return;
    window.addEventListener('scroll', hidePieTooltip, true);
    window.addEventListener('resize', hidePieTooltip);
    pieTooltipGlobalListenersBound = true;
}

// ===== 饼图扇形外扩动画（CSS d 属性过渡） =====
// 预先计算 base 和 expanded 两套路径，长按时切换 d 属性

function setPieActiveHighlight(container, meta, slice) {
    if (!container || !slice) return;
    // 清除所有其他高亮（还原到 base）
    document.querySelectorAll('.pie-highlight-slice.active').forEach(el => {
        el.classList.remove('active');
        const baseD = el.getAttribute('data-d-base');
        if (baseD) el.setAttribute('d', baseD);
    });
    // 找到对应的扇形并激活
    const highlightPath = container.querySelector(`.pie-highlight-slice[data-slice-name="${CSS.escape(slice.name)}"]`);
    if (highlightPath) {
        highlightPath.classList.add('active');
        const expandedD = highlightPath.getAttribute('data-d-expanded');
        if (expandedD) highlightPath.setAttribute('d', expandedD);
    }
    pieActiveSliceName = slice.name;
}

function clearPieActiveHighlight() {
    document.querySelectorAll('.pie-highlight-slice.active').forEach(el => {
        el.classList.remove('active');
        const baseD = el.getAttribute('data-d-base');
        if (baseD) el.setAttribute('d', baseD);
    });
    pieActiveSliceName = null;
}

function getPieSliceAtPoint(container, meta, clientX, clientY) {
    if (!container || !meta || !meta.slices || meta.slices.length === 0) return null;
    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const radius = Math.sqrt(dx * dx + dy * dy);
    const maxR = rect.width / 2;
    // 忽略中心空白与外圈外（增加内圈容差避免快速移动时丢失）
    if (radius > maxR * 1.05 || radius < maxR * 0.20) return null;
    let angle = Math.atan2(dy, dx); // [-pi, pi]
    angle = angle < -Math.PI / 2 ? angle + 2 * Math.PI : angle; // 从 12 点方向开始
    const deg = ((angle + Math.PI / 2) * 180) / Math.PI; // 0deg 在顶部，顺时针
    let percent = (deg / 360) * 100;
    // 规范化百分比到 [0, 100) 范围
    if (percent < 0) percent += 100;
    if (percent >= 100) percent -= 100;
    
    // 优先精确匹配
    let matchedSlice = meta.slices.find(slice => percent >= slice.start && percent < slice.end);
    if (matchedSlice) return matchedSlice;
    
    // 12点边界特殊处理：处理跨越0点的扇形
    const firstSlice = meta.slices[0];
    const lastSlice = meta.slices[meta.slices.length - 1];
    // 如果第一个扇形从0开始，percent接近100时应该匹配最后一个扇形
    if (firstSlice && firstSlice.start === 0 && percent > 99) {
        if (lastSlice && percent < lastSlice.end + 1) return lastSlice;
    }
    // 如果percent接近0，应该匹配第一个扇形
    if (percent < 1 && firstSlice && firstSlice.start === 0) {
        return firstSlice;
    }
    
    // 容差匹配（处理边界间隙）
    const tolerance = 1.0; // 1% 容差（约3.6度）
    matchedSlice = meta.slices.find(slice => {
        // 检查是否在扇形范围的容差内
        if (percent >= slice.start - tolerance && percent < slice.end + tolerance) return true;
        // 处理跨越0点的情况
        if (slice.end >= 99 && percent < tolerance) return true;
        if (slice.start <= 1 && percent > 100 - tolerance) return true;
        return false;
    });
    
    return matchedSlice || null;
}

function showPieTooltip(meta, slice, clientX, clientY, isMoving = false) {
    const tooltipEl = document.getElementById('pieTooltip');
    if (!tooltipEl || !slice) return;
    const percentText = `${slice.percent.toFixed(0)}%`;
    let detailHtml = '';
    
    // 辅助函数：截断名称（限制4个字符）
    const truncateName = (name, maxLen = 4) => name.length > maxLen ? name.slice(0, maxLen) + '...' : name;
    const maxDetailRows = 4; // 统一显示数量上限
    
    // 分类视图"其他"：显示被合并的分类列表
    if (meta.view === 'category' && slice.name === '其他' && slice.otherCategories && slice.otherCategories.length > 0) {
        const otherRows = slice.otherCategories.slice(0, maxDetailRows).map(cat => `<div class="trend-tooltip-row" style="padding-left: 8px; opacity: 0.85;"><span style="font-size: 0.75rem;" title="${escapeHtml(cat.name)}">${escapeHtml(truncateName(cat.name))}</span><span style="font-size: 0.75rem;">${formatTime(cat.value)}</span></div>`).join('');
        detailHtml = `<div style="border-top: 1px solid rgba(255,255,255,0.15); padding-top: 2px;"><div class="trend-tooltip-row" style="opacity: 0.7; font-size: 0.7rem;"><span>包含分类</span><span></span></div>${otherRows}</div>`;
    }
    // 分类视图：显示任务明细
    else if (meta.view === 'category' && slice.tasks && slice.tasks.length > 0) {
        const taskRows = slice.tasks.slice(0, maxDetailRows).map(task => `<div class="trend-tooltip-row" style="padding-left: 8px; opacity: 0.85;"><span style="font-size: 0.75rem;" title="${escapeHtml(task.name)}">${escapeHtml(truncateName(task.name))}</span><span style="font-size: 0.75rem;">${formatTime(task.value)}</span></div>`).join('');
        detailHtml = `<div style="border-top: 1px solid rgba(255,255,255,0.15); padding-top: 2px;"><div class="trend-tooltip-row" style="opacity: 0.7; font-size: 0.7rem;"><span>任务明细</span><span></span></div>${taskRows}</div>`;
    }
    // 任务视图"其他"：显示第6-15名任务
    else if (meta.view === 'task' && slice.name === '其他' && slice.otherTasks && slice.otherTasks.length > 0) {
        const otherRows = slice.otherTasks.slice(0, maxDetailRows).map(task => `<div class="trend-tooltip-row" style="padding-left: 8px; opacity: 0.85;"><span style="font-size: 0.75rem;" title="${escapeHtml(task.name)}">${escapeHtml(truncateName(task.name))}</span><span style="font-size: 0.75rem;">${formatTime(task.value)}</span></div>`).join('');
        detailHtml = `<div style="border-top: 1px solid rgba(255,255,255,0.15); padding-top: 2px;"><div class="trend-tooltip-row" style="opacity: 0.7; font-size: 0.7rem;"><span>包含任务</span><span></span></div>${otherRows}</div>`;
    }
    // 任务视图：显示最近记录（包括系统任务如屏幕时间管理）
    else if (meta.view === 'task') {
        let taskTransactions = [];
        const filterType = meta.typeKey;
        const matchesType = (t) => {
            if (!filterType) return true;
            if (t.type) return t.type === filterType;
            return filterType === 'earn' ? t.amount > 0 : t.amount < 0;
        };
        if (slice.taskId) {
            // 普通任务：按taskId查询
            taskTransactions = (cachedAnalysisFilteredTransactions || [])
                .filter(t => t.taskId === slice.taskId && matchesType(t))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, maxDetailRows);
        } else if (slice.isSystem || slice.name === '屏幕时间管理' || slice.name === '睡眠时间管理' || slice.name === '小睡') {
            // [v7.9.7] 系统任务：按isSystem和taskName查询
            const systemNameVariants = {
                '屏幕时间管理': ['屏幕时间管理'],
                '睡眠时间管理': ['睡眠时间管理'],
                '小睡': ['小睡']
            };
            const matchNames = systemNameVariants[slice.name] || [slice.name];
            taskTransactions = (cachedAnalysisFilteredTransactions || [])
                .filter(t => t.isSystem && matchNames.some(n => t.taskName === n || t.taskName?.includes(n)) && matchesType(t))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, maxDetailRows);
        }
        if (taskTransactions.length > 0) {
            const recordRows = taskTransactions.map(t => {
                const dateStr = new Date(t.timestamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
                return `<div class="trend-tooltip-row" style="padding-left: 8px; opacity: 0.85;"><span style="font-size: 0.75rem;">· ${dateStr}</span><span style="font-size: 0.75rem;">${formatTime(Math.abs(t.amount))}</span></div>`;
            }).join('');
            detailHtml = `<div style="border-top: 1px solid rgba(255,255,255,0.15); padding-top: 2px;"><div class="trend-tooltip-row" style="opacity: 0.7; font-size: 0.7rem;"><span>最近记录</span><span></span></div>${recordRows}</div>`;
        }
    }
    
    // 提示文字：分类视图、任务视图（含"其他"和系统任务）都支持长按3秒
    const isCategoryOther = meta.view === 'category' && slice.name === '其他' && slice.otherCategories && slice.otherCategories.length > 0;
    const isSystemTask = slice.isSystem || slice.name === '屏幕时间管理' || slice.name === '睡眠时间管理' || slice.name === '小睡';
    const canShowDetail = isCategoryOther || (meta.view === 'category') || (meta.view === 'task' && (slice.taskId || isSystemTask || (slice.name === '其他' && slice.otherTasks && slice.otherTasks.length > 0)));
    const hintText = meta.view === 'category' ? (isCategoryOther ? '其他分类' : '分类') : (slice.name === '其他' ? '更多任务' : '任务');
    const hintHtml = canShowDetail ? `<div class="heatmap-tooltip-hint">长按 3 秒查看${hintText}详情</div>` : '';
    
    let displaySliceName = slice.name;
    
    const html = `<span class="trend-tooltip-title">${escapeHtml(displaySliceName)}</span>
        <div class="trend-tooltip-list">
            <div class="trend-tooltip-row"><span>占比</span><span>${percentText}</span></div>
            <div class="trend-tooltip-row"><span>${meta.typeLabel}</span><span>${formatTime(slice.value)}</span></div>
            ${detailHtml}
        </div>
        ${hintHtml}`;
    
    // 移动时如果slice变化则更新内容，否则只更新位置
    const sliceChanged = pieTooltipCurrentSliceName !== slice.name;
    if (!isMoving || sliceChanged) {
        tooltipEl.innerHTML = `<div class="trend-tooltip-content">${html}</div><div class="pie-tooltip-progress"></div>`;
        pieTooltipCurrentSliceName = slice.name;
        // slice变化后恢复进度条动画状态
        if (isMoving && pieDetailProgressPlanned) {
            const progressBar = tooltipEl.querySelector('.pie-tooltip-progress');
            if (progressBar) {
                progressBar.classList.remove('animating');
                void progressBar.offsetWidth; // 强制重绘
                progressBar.classList.add('animating');
            }
        }
    }
    tooltipEl.classList.add('show');
    tooltipEl.classList.toggle('moving', !!isMoving);

    const applyPosition = () => {
        const margin = 8;
        const rect = tooltipEl.getBoundingClientRect();
        let left = clientX - rect.width / 2;
        let top = clientY - rect.height - 12;
        if (left + rect.width + margin > window.innerWidth) left = window.innerWidth - rect.width - margin;
        if (left < margin) left = margin;
        if (top < margin) top = clientY + 12;
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
    };

    if (isMoving) {
        if (pieTooltipRAFId) cancelAnimationFrame(pieTooltipRAFId);
        pieTooltipRAFId = requestAnimationFrame(() => {
            applyPosition();
            pieTooltipRAFId = null;
        });
    } else {
        applyPosition();
    }

    // 只在首次显示时启动进度条，移动时不重启（分类视图和任务视图都支持）
    if (!isMoving && pieDetailProgressPlanned) {
        startPieDetailProgress();
    }
}

function initPieTooltips() {
    const tooltipEl = document.getElementById('pieTooltip');
    if (!tooltipEl) return;
    hidePieTooltip();
    bindPieTooltipGlobalListeners();

    const containers = document.querySelectorAll('.pie-chart-container[data-pie-meta]');
    containers.forEach(container => {
        const metaStr = container.getAttribute('data-pie-meta');
        if (!metaStr) return;
        let meta;
        try { meta = JSON.parse(decodeURIComponent(metaStr)); } catch(e) { return; }

        // [v7.2.4] 桌面端鼠标悬停：显示tooltip和扇形外扩效果
        container.addEventListener('mousemove', (e) => {
            if (pieTooltipLongPressActive) return;
            const slice = getPieSliceAtPoint(container, meta, e.clientX, e.clientY);
            if (slice) {
                // 只有当slice变化时才更新
                if (slice.name !== pieActiveSliceName) {
                    setPieActiveHighlight(container, meta, slice);
                    showPieTooltip(meta, slice, e.clientX, e.clientY, false);
                }
            } else {
                // 移出扇形区域（中心或外部）
                if (pieActiveSliceName) {
                    clearPieActiveHighlight();
                    hidePieTooltip();
                }
            }
        });
        
        container.addEventListener('mouseleave', () => {
            if (pieTooltipLongPressActive) return;
            clearPieActiveHighlight();
            hidePieTooltip();
        });
        
        // [v7.2.4] 点击扇形：进入详情（桌面端和触摸端统一处理）
        container.addEventListener('click', (e) => {
            // [v7.9.8] 如果长按激活或处于冷却期（触摸端长按取消后），不处理点击
            if (pieTooltipLongPressActive || pieTooltipLongPressCooldown) return;
            const slice = getPieSliceAtPoint(container, meta, e.clientX, e.clientY);
            if (!slice) return;
            
            // 分类视图"其他"：进入其他分类详情
            if (meta.view === 'category' && slice.name === '其他' && slice.otherCategories && slice.otherCategories.length > 0) {
                hidePieTooltip();
                clearPieActiveHighlight();
                showOtherCategoriesDetail(slice.otherCategories, meta.typeKey || 'earn', true);
            }
            // 分类视图：进入分类详情
            else if (meta.view === 'category' && slice.name !== '其他') {
                hidePieTooltip();
                clearPieActiveHighlight();
                showCategoryDetail(slice.name, meta.typeKey || 'earn', true);
            }
            // 任务视图：进入任务历史（非"其他"且有taskId）
            else if (meta.view === 'task' && slice.taskId && slice.name !== '其他') {
                hidePieTooltip();
                clearPieActiveHighlight();
                showTaskHistory(slice.taskId);
            }
            // [v7.9.6] 任务视图：系统任务进入专用详情页
            else if (meta.view === 'task' && (slice.isSystem || slice.name === '屏幕时间管理' || slice.name === '睡眠时间管理' || slice.name === '小睡')) {
                hidePieTooltip();
                clearPieActiveHighlight();
                showSystemTaskHistory(slice.name, meta.typeKey || 'earn', true);
            }
            // 任务视图"其他"：进入其他任务详情
            else if (meta.view === 'task' && slice.name === '其他' && slice.otherTasks && slice.otherTasks.length > 0) {
                hidePieTooltip();
                clearPieActiveHighlight();
                showOtherTasksDetail(slice.otherTasks, meta.typeKey || 'earn', true);
            }
        });

        const pointerDownHandler = (e) => {
            if (e.pointerType === 'mouse') return; // 仅触控/触笔
            clearTimeout(pieTooltipLongPressTimer);
            clearTimeout(pieDetailLongPressTimer);
            clearPieActiveHighlight();
            pieTooltipPointerId = e.pointerId;
            pieTooltipLongPressActive = false;
            pieTooltipLongPressCooldown = false;
            // 分类视图和任务视图都支持进度条（任务视图需要有taskId且非"其他"）
            pieDetailProgressPlanned = true;
            pieTooltipStartX = e.clientX;
            pieTooltipStartY = e.clientY;
            // [v5.1.1] 立即添加touchmove阻断器，防止等待期间触发页面滚动
            if (pieTooltipTouchMoveBlocker) {
                window.removeEventListener('touchmove', pieTooltipTouchMoveBlocker, { passive: false, capture: true });
            }
            pieTooltipTouchMoveBlocker = (ev) => { ev.preventDefault(); };
            window.addEventListener('touchmove', pieTooltipTouchMoveBlocker, { passive: false, capture: true });

            const moveHandler = (evt) => {
                if (evt.pointerId !== pieTooltipPointerId) return;
                if (pieTooltipLongPressActive) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    // 尝试在所有饼图容器中查找当前位置对应的扇形
                    let foundSlice = null;
                    let foundMeta = null;
                    let foundContainer = null;
                    const allContainers = document.querySelectorAll('.pie-chart-container[data-pie-meta]');
                    for (const c of allContainers) {
                        const mStr = c.getAttribute('data-pie-meta');
                        if (!mStr) continue;
                        try {
                            const m = JSON.parse(decodeURIComponent(mStr));
                            const s = getPieSliceAtPoint(c, m, evt.clientX, evt.clientY);
                            if (s) { foundSlice = s; foundMeta = m; foundContainer = c; break; }
                        } catch(e) {}
                    }
                    if (foundSlice && foundMeta) {
                        // 如果slice变化（包括从null变为有效slice），重置3秒详情定时器
                        if (foundSlice.name !== pieTooltipCurrentSliceName || pieTooltipCurrentSliceName === null) {
                            // [v5.8.0] 切换扇形时震动反馈
                            if (typeof Android !== 'undefined' && Android.vibrate) {
                                Android.vibrate(10);
                            } else if (navigator.vibrate) {
                                navigator.vibrate(10);
                            }
                            clearTimeout(pieDetailLongPressTimer);
                            pieTooltipCurrentMeta = foundMeta;
                            // 分类视图"其他"：进入其他分类详情
                            if (foundMeta.view === 'category' && foundSlice.name === '其他' && foundSlice.otherCategories && foundSlice.otherCategories.length > 0) {
                                pieDetailLongPressTimer = setTimeout(() => {
                                    // [v5.8.0] 进入详情页震动反馈
                                    if (typeof Android !== 'undefined' && Android.vibrate) {
                                        Android.vibrate(20);
                                    } else if (navigator.vibrate) {
                                        navigator.vibrate(20);
                                    }
                                    hidePieTooltip();
                                    showOtherCategoriesDetail(foundSlice.otherCategories, foundMeta.typeKey || 'earn', true);
                                }, 3250);
                            }
                            // 分类视图：进入分类详情
                            else if (foundMeta.view === 'category') {
                                pieDetailLongPressTimer = setTimeout(() => {
                                    // [v5.8.0] 进入详情页震动反馈
                                    if (typeof Android !== 'undefined' && Android.vibrate) {
                                        Android.vibrate(20);
                                    } else if (navigator.vibrate) {
                                        navigator.vibrate(20);
                                    }
                                    hidePieTooltip();
                                    showCategoryDetail(foundSlice.name, foundMeta.typeKey || 'earn', true);
                                }, 3250);
                            }
                            // 任务视图：进入任务历史（非"其他"且有taskId）
                            else if (foundMeta.view === 'task' && foundSlice.taskId && foundSlice.name !== '其他') {
                                pieDetailLongPressTimer = setTimeout(() => {
                                    // [v5.8.0] 进入详情页震动反馈
                                    if (typeof Android !== 'undefined' && Android.vibrate) {
                                        Android.vibrate(20);
                                    } else if (navigator.vibrate) {
                                        navigator.vibrate(20);
                                    }
                                    hidePieTooltip();
                                    showTaskHistory(foundSlice.taskId);
                                }, 3250);
                            }
                            // [v7.9.6] 任务视图：系统任务进入专用详情页
                            else if (foundMeta.view === 'task' && (foundSlice.isSystem || foundSlice.name === '屏幕时间管理' || foundSlice.name === '睡眠时间管理' || foundSlice.name === '小睡')) {
                                pieDetailLongPressTimer = setTimeout(() => {
                                    if (typeof Android !== 'undefined' && Android.vibrate) {
                                        Android.vibrate(20);
                                    } else if (navigator.vibrate) {
                                        navigator.vibrate(20);
                                    }
                                    hidePieTooltip();
                                    showSystemTaskHistory(foundSlice.name, foundMeta.typeKey || 'earn', true);
                                }, 3250);
                            }
                            // 任务视图"其他"：进入其他任务详情
                            else if (foundMeta.view === 'task' && foundSlice.name === '其他' && foundSlice.otherTasks && foundSlice.otherTasks.length > 0) {
                                pieDetailLongPressTimer = setTimeout(() => {
                                    // [v5.8.0] 进入详情页震动反馈
                                    if (typeof Android !== 'undefined' && Android.vibrate) {
                                        Android.vibrate(20);
                                    } else if (navigator.vibrate) {
                                        navigator.vibrate(20);
                                    }
                                    hidePieTooltip();
                                    showOtherTasksDetail(foundSlice.otherTasks, foundMeta.typeKey || 'earn', true);
                                }, 3250);
                            }
                        }
                        setPieActiveHighlight(foundContainer, foundMeta, foundSlice);
                        showPieTooltip(foundMeta, foundSlice, evt.clientX, evt.clientY, true);
                        setPieActiveHighlight(foundContainer, foundMeta, foundSlice);
                        showPieTooltip(foundMeta, foundSlice, evt.clientX, evt.clientY, true);
                        pieTooltipCurrentSliceName = foundSlice.name;
                    } else {
                        // 进入中心空白或饼图外部区域
                        clearPieActiveHighlight();
                        pieTooltipCurrentSliceName = null; // 重置当前slice名称
                        // [v5.1.1] 即使在中心白色区域也更新tooltip位置（保持之前的内容，逐渐淡出）
                        const tooltipEl = document.getElementById('pieTooltip');
                        if (tooltipEl && tooltipEl.classList.contains('show')) {
                            tooltipEl.classList.add('moving');
                            if (pieTooltipRAFId) cancelAnimationFrame(pieTooltipRAFId);
                            pieTooltipRAFId = requestAnimationFrame(() => {
                                const margin = 8;
                                const rect = tooltipEl.getBoundingClientRect();
                                let left = evt.clientX - rect.width / 2;
                                let top = evt.clientY - rect.height - 12;
                                if (left + rect.width + margin > window.innerWidth) left = window.innerWidth - rect.width - margin;
                                if (left < margin) left = margin;
                                if (top < margin) top = evt.clientY + 12;
                                tooltipEl.style.left = `${left}px`;
                                tooltipEl.style.top = `${top}px`;
                                pieTooltipRAFId = null;
                            });
                        }
                    }
                } else {
                    const dx = Math.abs(evt.clientX - pieTooltipStartX);
                    const dy = Math.abs(evt.clientY - pieTooltipStartY);
                    if (dx > PIE_SWIPE_THRESHOLD || dy > PIE_SWIPE_THRESHOLD) {
                        clearTimeout(pieTooltipLongPressTimer);
                        clearTimeout(pieDetailLongPressTimer);
                        pieTooltipPointerId = null;
                        pieDetailProgressPlanned = false;
                        stopPieDetailProgress();
                        clearPieActiveHighlight();
                        if (pieTooltipRAFId) cancelAnimationFrame(pieTooltipRAFId);
                        pieTooltipRAFId = null;
                        // [v5.1.1] 滑动取消时移除touchmove阻断器，恢复正常滚动
                        if (pieTooltipTouchMoveBlocker) {
                            window.removeEventListener('touchmove', pieTooltipTouchMoveBlocker, { passive: false, capture: true });
                            pieTooltipTouchMoveBlocker = null;
                        }
                        window.removeEventListener('pointermove', pieTooltipMoveHandler, true);
                        window.removeEventListener('pointerup', pieTooltipEndHandler, true);
                        window.removeEventListener('pointercancel', pieTooltipEndHandler, true);
                        pieTooltipMoveHandler = null;
                        pieTooltipEndHandler = null;
                    }
                }
            };

            const endHandler = (evt) => {
                if (pieTooltipPointerId !== null && evt.pointerId !== pieTooltipPointerId) return;
                const wasLongPress = pieTooltipLongPressActive || pieTooltipLongPressCooldown;
                clearTimeout(pieTooltipLongPressTimer);
                clearTimeout(pieDetailLongPressTimer);
                pieTooltipPointerId = null;
                pieTooltipLongPressActive = false;
                pieDetailProgressPlanned = false;
                clearPieActiveHighlight();
                // 移除touchmove阻断器
                if (pieTooltipTouchMoveBlocker) {
                    window.removeEventListener('touchmove', pieTooltipTouchMoveBlocker, { passive: false, capture: true });
                    pieTooltipTouchMoveBlocker = null;
                }
                if (pieTooltipRAFId) cancelAnimationFrame(pieTooltipRAFId);
                pieTooltipRAFId = null;
                hidePieTooltip();
                window.removeEventListener('pointermove', pieTooltipMoveHandler, true);
                window.removeEventListener('pointerup', pieTooltipEndHandler, true);
                window.removeEventListener('pointercancel', pieTooltipEndHandler, true);
                pieTooltipMoveHandler = null;
                pieTooltipEndHandler = null;
                // [v7.9.8] 触摸设备：只有当长按tooltip激活过时才设置冷却期
                // 短按（未显示tooltip）时不设置冷却期，让click事件正常进入详情
                // 长按取消时设置冷却期，阻止click进入详情
                if (wasLongPress) {
                    pieTooltipLongPressCooldown = true;
                    setTimeout(() => { pieTooltipLongPressCooldown = false; }, 100);
                }
                stopPieDetailProgress();
            };

            pieTooltipMoveHandler = moveHandler;
            pieTooltipEndHandler = endHandler;
            window.addEventListener('pointermove', pieTooltipMoveHandler, { passive: false, capture: true });
            window.addEventListener('pointerup', pieTooltipEndHandler, true);
            window.addEventListener('pointercancel', pieTooltipEndHandler, true);

            pieTooltipLongPressTimer = setTimeout(() => {
                pieTooltipLongPressActive = true;
                pieTooltipLongPressCooldown = true;
                // [v5.8.0] 长按激活震动反馈
                if (typeof Android !== 'undefined' && Android.vibrate) {
                    Android.vibrate(15);
                } else if (navigator.vibrate) {
                    navigator.vibrate(15);
                }
                // touchmove阻断器已在pointerdown时添加，此处无需重复添加
                try { container.setPointerCapture(pieTooltipPointerId); } catch(e) {}
                const slice = getPieSliceAtPoint(container, meta, pieTooltipStartX, pieTooltipStartY);
                if (slice) {
                    pieTooltipCurrentSliceName = slice.name; // [v5.7.0] 初始化当前slice名称
                    setPieActiveHighlight(container, meta, slice);
                    showPieTooltip(meta, slice, pieTooltipStartX, pieTooltipStartY, false);
                    // [v7.9.6] 分类视图、任务视图（有taskId、系统任务或"其他"有otherTasks）都启动进度条
                    const isSystemTask = slice.isSystem || slice.name === '屏幕时间管理' || slice.name === '睡眠时间管理' || slice.name === '小睡';
                    const canShowDetail = (meta.view === 'category' && (slice.name !== '其他' || (slice.otherCategories && slice.otherCategories.length > 0))) || 
                        (meta.view === 'task' && slice.taskId) || 
                        (meta.view === 'task' && isSystemTask) ||
                        (meta.view === 'task' && slice.name === '其他' && slice.otherTasks && slice.otherTasks.length > 0);
                    if (canShowDetail && pieDetailProgressPlanned) {
                        startPieDetailProgress();
                    }
                }
            }, 250);

            // 3.5秒长按进入详情（分类、任务历史或"其他"详情）
            const initialSlice = getPieSliceAtPoint(container, meta, e.clientX, e.clientY);
            if (initialSlice) {
                if (meta.view === 'category' && initialSlice.name === '其他' && initialSlice.otherCategories && initialSlice.otherCategories.length > 0) {
                    pieDetailLongPressTimer = setTimeout(() => {
                        // [v5.8.0] 进入详情页震动反馈
                        if (typeof Android !== 'undefined' && Android.vibrate) {
                            Android.vibrate(20);
                        } else if (navigator.vibrate) {
                            navigator.vibrate(20);
                        }
                        hidePieTooltip();
                        showOtherCategoriesDetail(initialSlice.otherCategories, meta.typeKey || 'earn', true);
                    }, 3500);
                } else if (meta.view === 'category') {
                    pieDetailLongPressTimer = setTimeout(() => {
                        // [v5.8.0] 进入详情页震动反馈
                        if (typeof Android !== 'undefined' && Android.vibrate) {
                            Android.vibrate(20);
                        } else if (navigator.vibrate) {
                            navigator.vibrate(20);
                        }
                        hidePieTooltip();
                        showCategoryDetail(initialSlice.name, meta.typeKey || 'earn', true);
                    }, 3500);
                } else if (meta.view === 'task' && initialSlice.taskId && initialSlice.name !== '其他') {
                    pieDetailLongPressTimer = setTimeout(() => {
                        // [v5.8.0] 进入详情页震动反馈
                        if (typeof Android !== 'undefined' && Android.vibrate) {
                            Android.vibrate(20);
                        } else if (navigator.vibrate) {
                            navigator.vibrate(20);
                        }
                        hidePieTooltip();
                        showTaskHistory(initialSlice.taskId);
                    }, 3500);
                // [v7.9.6] 任务视图：系统任务进入专用详情页
                } else if (meta.view === 'task' && (initialSlice.isSystem || initialSlice.name === '屏幕时间管理' || initialSlice.name === '睡眠时间管理' || initialSlice.name === '小睡')) {
                    pieDetailLongPressTimer = setTimeout(() => {
                        if (typeof Android !== 'undefined' && Android.vibrate) {
                            Android.vibrate(20);
                        } else if (navigator.vibrate) {
                            navigator.vibrate(20);
                        }
                        hidePieTooltip();
                        showSystemTaskHistory(initialSlice.name, meta.typeKey || 'earn', true);
                    }, 3500);
                } else if (meta.view === 'task' && initialSlice.name === '其他' && initialSlice.otherTasks && initialSlice.otherTasks.length > 0) {
                    pieDetailLongPressTimer = setTimeout(() => {
                        // [v5.8.0] 进入详情页震动反馈
                        if (typeof Android !== 'undefined' && Android.vibrate) {
                            Android.vibrate(20);
                        } else if (navigator.vibrate) {
                            navigator.vibrate(20);
                        }
                        hidePieTooltip();
                        showOtherTasksDetail(initialSlice.otherTasks, meta.typeKey || 'earn', true);
                    }, 3500);
                }
            }
        };

        container.addEventListener('pointerdown', pointerDownHandler);
    });
}

// [v7.9.6] 系统任务历史详情弹窗（屏幕时间、睡眠、小睡）
// 重新设计：使用与普通任务相同的 historyModal，保持一致性
let currentSystemTaskName = null; // 当前查看的系统任务名称
let currentSystemTaskCalendarDate = new Date(); // 系统任务日历当前月份

function showSystemTaskHistory(taskName, typeKey = 'earn', fromPie = false) {
    // 设置当前系统任务
    currentSystemTaskName = taskName;
    currentHistoryTask = null; // 清除普通任务引用
    currentHistoryView = 'list';
    currentHistoryCalendarDate = new Date();
    currentSystemTaskCalendarDate = new Date();
    currentHistorySelectedDate = null;
    
    // [v7.9.7] 系统任务名称映射（历史数据兼容）
    const nameVariants = {
        '屏幕时间管理': ['屏幕时间管理'],
        '睡眠时间管理': ['睡眠时间管理', '😴 睡眠时间管理'],
        '小睡': ['小睡', '💤 小睡']
    };
    const matchNames = nameVariants[taskName] || [taskName];
    
    // 设置弹窗标题
    document.getElementById('historyModalTitle').textContent = `${taskName} - 历史记录`;
    
    // 保存用于日期筛选的原始任务名
    currentSystemTaskName = taskName;
    
    // 获取所有该系统任务的交易（不限制类型，用于日历）
    const allSystemTransactions = transactions.filter(t => {
        if (!t.isSystem || t.undone) return false;
        return matchNames.some(n => t.taskName === n || t.taskName?.includes(n));
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // 渲染列表
    const listContainer = document.getElementById('historyContentList');
    
    // [v7.9.7] 睡眠时间管理添加手动录入按钮
    let headerHtml = '';
    if (taskName === '睡眠时间管理') {
        headerHtml = `<div class="system-task-header" style="padding: 12px 0; border-bottom: 1px solid var(--border-color); margin-bottom: 8px;">
            <button class="btn btn-primary btn-sm" onclick="showManualSleepModal()" style="width: 100%;">
                <span style="margin-right: 6px;">📝</span>手动添加睡眠记录
            </button>
        </div>`;
    }
    
    if (allSystemTransactions.length === 0) {
        listContainer.innerHTML = headerHtml + '<div class="empty-message">暂无历史记录</div>';
    } else {
        listContainer.innerHTML = headerHtml + allSystemTransactions.map(transaction => {
            const isPositive = transaction.type === 'earn' || (!transaction.type && transaction.amount > 0);
            const amount = Math.abs(transaction.amount);
            
            // 解析描述
            let title = '';
            let detail = '';
            
            // [v7.16.0] 睡眠记录特殊处理（统一处理夜间睡眠和小睡）
            if (transaction.sleepData) {
                const sd = transaction.sleepData;
                if (sd.sleepType === 'nap') {
                    const durationMins = sd.durationMinutes || sd.duration;
                    const bedtimeMs = sd.startTime || sd.bedtime;
                    const wakeTimeMs = sd.wakeTime;
                    if (bedtimeMs && wakeTimeMs) {
                        const bedDate = new Date(bedtimeMs);
                        const wakeDate = new Date(wakeTimeMs);
                        title = `💤 ${bedDate.toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})} ~ ${wakeDate.toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})}`;
                    } else {
                        title = durationMins ? `💤 小睡 ${durationMins}分钟` : '💤 小睡';
                    }
                    if (durationMins) detail = `小睡 ${durationMins}分钟`;
                } else {
                    const bedtimeMs = sd.startTime || sd.bedtime;
                    const wakeTimeMs = sd.wakeTime;
                    if (bedtimeMs && wakeTimeMs) {
                        const bedDate = new Date(bedtimeMs);
                        const wakeDate = new Date(wakeTimeMs);
                        title = `${bedDate.toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})} ~ ${wakeDate.toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})}`;
                    } else {
                        title = '睡眠结算';
                    }
                    const durationMins = sd.durationMinutes || sd.duration;
                    if (durationMins) {
                        const hours = Math.floor(durationMins / 60);
                        const mins = durationMins % 60;
                        detail = `睡眠 ${hours}小时${mins > 0 ? mins + '分' : ''}`;
                    }
                }
            }
            // 屏幕时间特殊处理：解析 description 获取使用时间/限制时间
            else if (taskName === '屏幕时间管理' || transaction.taskName === '屏幕时间管理') {
                const desc = transaction.description || '';
                const match = desc.match(/📱\s*屏幕时间:\s*(.+?)\/(.+?)\s*\((奖励|超出)/);
                if (match) {
                    title = isPositive ? '节省奖励' : '超出惩罚';
                    detail = `${match[1].trim()} / ${match[2].trim()}`;
                } else {
                    title = isPositive ? '屏幕时间节省奖励' : '屏幕时间超出惩罚';
                }
            }
            // 默认
            else {
                title = transaction.note || transaction.description || taskName;
            }
            
            const dateTimeStr = formatDateTime(transaction.timestamp);
            
            return `<div class="history-item" id="history-item-${transaction.id}">
                        <div class="history-info" title="${escapeHtml(transaction.description || '')}">
                            <div class="history-description">
                                <div class="desc-line-1">${escapeHtml(title)}</div>
                                ${detail ? `<div class="desc-line-2">${escapeHtml(detail)}</div>` : ''}
                            </div>
                            <div class="history-time">${dateTimeStr}</div>
                        </div>
                        <div class="history-amount-wrapper">
                            <div class="history-amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : '-'}${formatTime(amount)}</div>
                        </div>
                        <button class="undo-btn" onclick="undoSystemTransaction('${transaction.id}')" title="撤回此条记录">撤回</button>
                    </div>`;
        }).join('');
    }
    
    // 渲染日历
    renderSystemTaskCalendar(taskName, matchNames, allSystemTransactions);
    
    document.getElementById('historyModal').classList.add('show');
}

// [v7.9.6] 渲染系统任务日历
function renderSystemTaskCalendar(taskName, matchNames, taskTransactions) {
    const container = document.getElementById('historyContentCalendar');
    if (!container) return;
    
    // 聚合每日数据
    const dailyData = new Map();
    taskTransactions.forEach(t => {
        const localDateStr = getLocalDateString(t.timestamp);
        if (!dailyData.has(localDateStr)) {
            dailyData.set(localDateStr, { earnCount: 0, spendCount: 0, earnAmount: 0, spendAmount: 0 });
        }
        const dayData = dailyData.get(localDateStr);
        const isEarn = t.type === 'earn' || (!t.type && t.amount > 0);
        if (isEarn) {
            dayData.earnCount++;
            dayData.earnAmount += Math.abs(t.amount);
        } else {
            dayData.spendCount++;
            dayData.spendAmount += Math.abs(t.amount);
        }
    });
    
    // 准备日历
    const year = currentSystemTaskCalendarDate.getFullYear();
    const month = currentSystemTaskCalendarDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // 渲染导航
    let navHTML = `<div class="report-header" style="margin-bottom: var(--space-lg);">
        <h2 class="report-title" style="font-size: 1rem;">${year}年 ${month + 1}月</h2>
        <div class="heatmap-nav">
            <button onclick="navigateSystemTaskCalendar(-1)">&lt;</button>
            <button onclick="navigateSystemTaskCalendar(1)">&gt;</button>
        </div>
    </div>`;
    
    // 渲染网格
    let gridHTML = `<div class="heatmap-grid-wrapper">
        <div class="heatmap-weekdays">
            <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
        </div>
        <div class="heatmap-grid">`;
    
    for (let i = 0; i < firstDayOfMonth; i++) {
        gridHTML += `<div class="heatmap-spacer"></div>`;
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month, day);
        const localDateStr = getLocalDateString(currentDate);
        const data = dailyData.get(localDateStr);
        
        let colorClass = '';
        let title = `${localDateStr}`;
        
        if (data) {
            const netAmount = data.earnAmount - data.spendAmount;
            if (netAmount > 0) {
                // 净获得：绿色
                if (netAmount < 3600) colorClass = 'task-cal-green-1';
                else if (netAmount <= 10800) colorClass = 'task-cal-green-2';
                else colorClass = 'task-cal-green-3';
            } else if (netAmount < 0) {
                // 净消费：红色
                const absNet = Math.abs(netAmount);
                if (absNet < 3600) colorClass = 'task-cal-red-1';
                else if (absNet <= 10800) colorClass = 'task-cal-red-2';
                else colorClass = 'task-cal-red-3';
            }
            title += `: 获得 ${formatTime(data.earnAmount)}, 消费 ${formatTime(data.spendAmount)}`;
        }
        
        gridHTML += `<div class="heatmap-day" title="${title}" onclick="filterSystemHistoryByDate('${localDateStr}')" style="cursor: pointer;">
                        <div class="heatmap-day-content ${colorClass}">${day}</div>
                     </div>`;
    }
    gridHTML += `</div></div>`;
    
    // 渲染图例
    let legendHTML = `<div class="heatmap-legend">
        <span>净消费</span>
        <div class="heatmap-legend-scale">
            <div class="task-cal-red-3"></div>
            <div class="task-cal-red-2"></div>
            <div class="task-cal-red-1"></div>
            <div style="background: var(--card-bg); border: 1px solid var(--border-color);"></div>
            <div class="task-cal-green-1"></div>
            <div class="task-cal-green-2"></div>
            <div class="task-cal-green-3"></div>
        </div>
        <span>净获得</span>
    </div>`;
    
    container.innerHTML = navHTML + gridHTML + legendHTML;
}

// [v7.9.6] 导航系统任务日历
function navigateSystemTaskCalendar(delta) {
    currentSystemTaskCalendarDate.setMonth(currentSystemTaskCalendarDate.getMonth() + delta);
    if (currentSystemTaskName) {
        // [v7.9.7] 系统任务名称映射（历史数据兼容）
        const nameVariants = {
            '屏幕时间管理': ['屏幕时间管理'],
            '睡眠时间管理': ['睡眠时间管理', '😴 睡眠时间管理'],
            '小睡': ['小睡', '💤 小睡']
        };
        const matchNames = nameVariants[currentSystemTaskName] || [currentSystemTaskName];
        const allSystemTransactions = transactions.filter(t => {
            if (!t.isSystem || t.undone) return false;
            return matchNames.some(n => t.taskName === n || t.taskName?.includes(n));
        });
        renderSystemTaskCalendar(currentSystemTaskName, matchNames, allSystemTransactions);
    }
}

// [v7.9.6] 按日期筛选系统任务历史
function filterSystemHistoryByDate(dateStr) {
    if (!currentSystemTaskName) return;
    
    // [v7.9.7] 系统任务名称映射（历史数据兼容）
    const nameVariants = {
        '屏幕时间管理': ['屏幕时间管理'],
        '睡眠时间管理': ['睡眠时间管理', '😴 睡眠时间管理'],
        '小睡': ['小睡', '💤 小睡']
    };
    const matchNames = nameVariants[currentSystemTaskName] || [currentSystemTaskName];
    
    // 获取该日期的交易
    const dayTransactions = transactions.filter(t => {
        if (!t.isSystem || t.undone) return false;
        if (!matchNames.some(n => t.taskName === n || t.taskName?.includes(n))) return false;
        return getLocalDateString(t.timestamp) === dateStr;
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const listContainer = document.getElementById('historyContentList');
    
    // 更新标题显示筛选状态
    document.getElementById('historyModalTitle').textContent = `${currentSystemTaskName} - ${dateStr}`;
    
    if (dayTransactions.length === 0) {
        listContainer.innerHTML = `<div class="empty-message">${dateStr} 暂无记录<br><button class="btn btn-secondary" style="margin-top: 8px;" onclick="showSystemTaskHistory('${currentSystemTaskName}')">查看全部</button></div>`;
    } else {
        const headerHtml = `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color);">
            <span style="color: var(--text-color-light); font-size: 0.85rem;">${dateStr} 共 ${dayTransactions.length} 条记录</span>
            <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" onclick="showSystemTaskHistory('${currentSystemTaskName}')">查看全部</button>
        </div>`;
        
        listContainer.innerHTML = headerHtml + dayTransactions.map(transaction => {
            const isPositive = transaction.type === 'earn' || (!transaction.type && transaction.amount > 0);
            const amount = Math.abs(transaction.amount);
            
            let title = '';
            let detail = '';
            
            // [v7.16.0] 睡眠记录特殊处理（统一处理夜间睡眠和小睡）
            if (transaction.sleepData) {
                const sd = transaction.sleepData;
                if (sd.sleepType === 'nap') {
                    const durationMins = sd.durationMinutes || sd.duration;
                    const bedtimeMs = sd.startTime || sd.bedtime;
                    const wakeTimeMs = sd.wakeTime;
                    if (bedtimeMs && wakeTimeMs) {
                        const bedDate = new Date(bedtimeMs);
                        const wakeDate = new Date(wakeTimeMs);
                        title = `💤 ${bedDate.toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})} ~ ${wakeDate.toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})}`;
                    } else {
                        title = durationMins ? `💤 小睡 ${durationMins}分钟` : '💤 小睡';
                    }
                    if (durationMins) detail = `小睡 ${durationMins}分钟`;
                } else {
                    const bedtimeMs = sd.startTime || sd.bedtime;
                    const wakeTimeMs = sd.wakeTime;
                    if (bedtimeMs && wakeTimeMs) {
                        const bedDate = new Date(bedtimeMs);
                        const wakeDate = new Date(wakeTimeMs);
                        title = `${bedDate.toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})} ~ ${wakeDate.toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})}`;
                    } else {
                        title = '睡眠结算';
                    }
                    const durationMins = sd.durationMinutes || sd.duration;
                    if (durationMins) {
                        const hours = Math.floor(durationMins / 60);
                        const mins = durationMins % 60;
                        detail = `睡眠 ${hours}小时${mins > 0 ? mins + '分' : ''}`;
                    }
                }
            }
            // 屏幕时间特殊处理：解析 description 获取使用时间/限制时间
            else if (displayName === '屏幕时间管理' || transaction.taskName === '屏幕时间管理') {
                const desc = transaction.description || '';
                const match = desc.match(/📱\s*屏幕时间:\s*(.+?)\/(.+?)\s*\((奖励|超出)/);
                if (match) {
                    title = isPositive ? '节省奖励' : '超出惩罚';
                    detail = `${match[1].trim()} / ${match[2].trim()}`;
                } else {
                    title = isPositive ? '屏幕时间节省奖励' : '屏幕时间超出惩罚';
                }
            }
            // 默认
            else {
                title = transaction.note || transaction.description || displayName;
            }
            
            const timeStr = new Date(transaction.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            
            return `<div class="history-item">
                        <div class="history-info">
                            <div class="history-description">
                                <div class="desc-line-1">${escapeHtml(title)}</div>
                                ${detail ? `<div class="desc-line-2">${escapeHtml(detail)}</div>` : ''}
                            </div>
                            <div class="history-time">${timeStr}</div>
                        </div>
                        <div class="history-amount-wrapper">
                            <div class="history-amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : '-'}${formatTime(amount)}</div>
                        </div>
                    </div>`;
        }).join('');
    }
}

// [v5.1.1] 时间流图长按弹窗交互（仅7天周期内生效）
let flowTooltipPointerId = null;
let flowTooltipLongPressTimer = null;
let flowTooltipLongPressActive = false;
let flowTooltipLongPressCooldown = false;
let flowTooltipTouchMoveBlocker = null;
let flowTooltipMoveHandler = null;
let flowTooltipEndHandler = null;
let flowTooltipRAFId = null;
let flowTooltipCurrentCategory = null;
const FLOW_SWIPE_THRESHOLD = 12;

function hideFlowTooltip() {
    const tooltipEl = document.getElementById('flowTooltip');
    if (!tooltipEl) return;
    tooltipEl.classList.remove('show', 'moving');
    if (flowTooltipRAFId) cancelAnimationFrame(flowTooltipRAFId);
    flowTooltipRAFId = null;
    flowTooltipCurrentCategory = null;
}

function showFlowTooltip(meta, clientX, clientY, isMoving) {
    const tooltipEl = document.getElementById('flowTooltip');
    if (!tooltipEl) return;

    // [v5.8.0] 显示任务明细和日期
    const taskDetailsHtml = meta.taskDetails && meta.taskDetails.length > 0 
        ? meta.taskDetails.map(td => 
            `<div class="trend-tooltip-row" style="font-size:0.8rem;">
                <span style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(td.name)}${td.count > 1 ? ` ×${td.count}` : ''}</span>
                <span>${formatTime(td.duration)}</span>
            </div>`
        ).join('') 
        : '';
    
    const datesHtml = meta.dates && meta.dates.length > 0
        ? `<div style="font-size:0.75rem;opacity:0.7;margin-top:6px;padding-top:6px;border-top:1px solid rgba(128,128,128,0.2);">
            📅 ${meta.dates.map(d => {
                const [y, m, day] = d.split('-');
                return `${parseInt(m)}/${parseInt(day)}`;
            }).join('、')}
        </div>`
        : '';

    const html = `<span class="trend-tooltip-title" style="display:flex;align-items:center;gap:6px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${meta.color};"></span>
            ${escapeHtml(meta.category)}
        </span>
        <div class="trend-tooltip-list">
            <div class="trend-tooltip-row"><span>占比</span><span>${meta.percent}%</span></div>
            <div class="trend-tooltip-row"><span>${meta.typeLabel}</span><span>${formatTime(meta.duration)}</span></div>
        </div>
        ${taskDetailsHtml ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(128,128,128,0.2);">${taskDetailsHtml}</div>` : ''}
        ${datesHtml}`;

    const categoryChanged = flowTooltipCurrentCategory !== meta.category;
    if (!isMoving || categoryChanged) {
        tooltipEl.innerHTML = `<div class="trend-tooltip-content">${html}</div>`;
        flowTooltipCurrentCategory = meta.category;
    }
    tooltipEl.classList.add('show');
    tooltipEl.classList.toggle('moving', !!isMoving);

    const applyPosition = () => {
        const margin = 8;
        const rect = tooltipEl.getBoundingClientRect();
        let left = clientX - rect.width / 2;
        let top = clientY - rect.height - 12;
        if (left + rect.width + margin > window.innerWidth) left = window.innerWidth - rect.width - margin;
        if (left < margin) left = margin;
        if (top < margin) top = clientY + 12;
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
    };

    if (isMoving) {
        if (flowTooltipRAFId) cancelAnimationFrame(flowTooltipRAFId);
        flowTooltipRAFId = requestAnimationFrame(() => {
            applyPosition();
            flowTooltipRAFId = null;
        });
    } else {
        applyPosition();
    }
}

function getFlowSegmentAtPoint(clientX, clientY) {
    const segments = document.querySelectorAll('.flow-bar-segment[data-flow-meta]');
    for (const seg of segments) {
        const rect = seg.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
            try {
                return JSON.parse(decodeURIComponent(seg.getAttribute('data-flow-meta')));
            } catch(e) {}
        }
    }
    return null;
}

function initFlowTooltips() {
    const tooltipEl = document.getElementById('flowTooltip');
    if (!tooltipEl) return;
    hideFlowTooltip();

    const segments = document.querySelectorAll('.flow-bar-segment[data-flow-meta]');
    segments.forEach(segment => {
        const pointerDownHandler = (e) => {
            if (e.pointerType === 'mouse') return;
            clearTimeout(flowTooltipLongPressTimer);
            flowTooltipPointerId = e.pointerId;
            flowTooltipLongPressActive = false;
            flowTooltipLongPressCooldown = false;
            const startX = e.clientX;
            const startY = e.clientY;

            // 立即添加touchmove阻断器
            if (flowTooltipTouchMoveBlocker) {
                window.removeEventListener('touchmove', flowTooltipTouchMoveBlocker, { passive: false, capture: true });
            }
            flowTooltipTouchMoveBlocker = (ev) => { ev.preventDefault(); };
            window.addEventListener('touchmove', flowTooltipTouchMoveBlocker, { passive: false, capture: true });

            const moveHandler = (evt) => {
                if (evt.pointerId !== flowTooltipPointerId) return;
                if (flowTooltipLongPressActive) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    const foundMeta = getFlowSegmentAtPoint(evt.clientX, evt.clientY);
                    if (foundMeta) {
                        showFlowTooltip(foundMeta, evt.clientX, evt.clientY, true);
                    } else {
                        // 在空白区域也更新位置
                        if (tooltipEl.classList.contains('show')) {
                            tooltipEl.classList.add('moving');
                            if (flowTooltipRAFId) cancelAnimationFrame(flowTooltipRAFId);
                            flowTooltipRAFId = requestAnimationFrame(() => {
                                const margin = 8;
                                const rect = tooltipEl.getBoundingClientRect();
                                let left = evt.clientX - rect.width / 2;
                                let top = evt.clientY - rect.height - 12;
                                if (left + rect.width + margin > window.innerWidth) left = window.innerWidth - rect.width - margin;
                                if (left < margin) left = margin;
                                if (top < margin) top = evt.clientY + 12;
                                tooltipEl.style.left = `${left}px`;
                                tooltipEl.style.top = `${top}px`;
                                flowTooltipRAFId = null;
                            });
                        }
                    }
                } else {
                    const dx = Math.abs(evt.clientX - startX);
                    const dy = Math.abs(evt.clientY - startY);
                    if (dx > FLOW_SWIPE_THRESHOLD || dy > FLOW_SWIPE_THRESHOLD) {
                        clearTimeout(flowTooltipLongPressTimer);
                        flowTooltipPointerId = null;
                        if (flowTooltipRAFId) cancelAnimationFrame(flowTooltipRAFId);
                        flowTooltipRAFId = null;
                        if (flowTooltipTouchMoveBlocker) {
                            window.removeEventListener('touchmove', flowTooltipTouchMoveBlocker, { passive: false, capture: true });
                            flowTooltipTouchMoveBlocker = null;
                        }
                        window.removeEventListener('pointermove', flowTooltipMoveHandler, true);
                        window.removeEventListener('pointerup', flowTooltipEndHandler, true);
                        window.removeEventListener('pointercancel', flowTooltipEndHandler, true);
                        flowTooltipMoveHandler = null;
                        flowTooltipEndHandler = null;
                    }
                }
            };

            const endHandler = (evt) => {
                if (flowTooltipPointerId !== null && evt.pointerId !== flowTooltipPointerId) return;
                const wasLongPress = flowTooltipLongPressActive || flowTooltipLongPressCooldown;
                clearTimeout(flowTooltipLongPressTimer);
                flowTooltipPointerId = null;
                flowTooltipLongPressActive = false;
                if (flowTooltipTouchMoveBlocker) {
                    window.removeEventListener('touchmove', flowTooltipTouchMoveBlocker, { passive: false, capture: true });
                    flowTooltipTouchMoveBlocker = null;
                }
                if (flowTooltipRAFId) cancelAnimationFrame(flowTooltipRAFId);
                flowTooltipRAFId = null;
                hideFlowTooltip();
                window.removeEventListener('pointermove', flowTooltipMoveHandler, true);
                window.removeEventListener('pointerup', flowTooltipEndHandler, true);
                window.removeEventListener('pointercancel', flowTooltipEndHandler, true);
                flowTooltipMoveHandler = null;
                flowTooltipEndHandler = null;
                if (wasLongPress) {
                    setTimeout(() => { flowTooltipLongPressCooldown = false; }, 80);
                } else {
                    flowTooltipLongPressCooldown = false;
                }
            };

            flowTooltipMoveHandler = moveHandler;
            flowTooltipEndHandler = endHandler;
            window.addEventListener('pointermove', flowTooltipMoveHandler, { passive: false, capture: true });
            window.addEventListener('pointerup', flowTooltipEndHandler, true);
            window.addEventListener('pointercancel', flowTooltipEndHandler, true);

            flowTooltipLongPressTimer = setTimeout(() => {
                flowTooltipLongPressActive = true;
                flowTooltipLongPressCooldown = true;
                try { segment.setPointerCapture(flowTooltipPointerId); } catch(e) {}
                const meta = getFlowSegmentAtPoint(startX, startY);
                if (meta) {
                    showFlowTooltip(meta, startX, startY, false);
                }
            }, 250);
        };

        segment.addEventListener('pointerdown', pointerDownHandler);
    });
}

// [v7.17.0] 支持展开/收起标签的任务卡片渲染
// options: { isLastVisible: boolean, hiddenCount: number, isExpanded: boolean, category: string }
function renderTaskCards(taskList, options = {}) {
    const todayStr = getLocalDateString(new Date()); 
    const { isLastVisible, hiddenCount, isExpanded, category } = options;
    
    return taskList.map((task, index) => {
        const isLastCard = index === taskList.length - 1;
        const safeTaskName = escapeHtml(task.name);
        const safeCategory = escapeHtml(task.category);
        const runningTask = runningTasks.get(task.id);
        const isRunning = !!runningTask;
        const color = categoryColors.get(task.category) || '#666';
        const badgeGradient = getBadgeGradient(color);
        const habitClass = task.isHabit ? 'is-habit' : '';
        const habitStyle = task.isHabit ? `style="--habit-color: ${color}"` : '';
        
        // [v5.6.0] 开启自动补录的任务禁用手动补录
        const canBackdate = ['continuous', 'continuous_target', 'continuous_redeem', 'reward', 'instant_redeem'].includes(task.type);
        // [v5.6.0] 根据是否开启自动补录显示不同菜单项
        const hasAutoDetect = task.appPackage && task.autoDetect;
        let backdateMenuItem = '';
        if (canBackdate) {
            if (hasAutoDetect) {
                // 开启自动补录：显示手动触发按钮
                backdateMenuItem = `<div class="task-card-menu-item" onclick="event.stopPropagation(); runAutoDetectForTask('${task.id}')">🤖 补录</div>`;
            } else {
                // 未开启自动补录：显示手动补录按钮
                backdateMenuItem = `<div class="task-card-menu-item" onclick="event.stopPropagation(); showBackdateModal('${task.id}')">📆 补录</div>`;
            }
        }

        const isMenuOpen = task.id === activeMenuTaskId;
        const menuClass = isMenuOpen ? 'task-card-menu show' : 'task-card-menu';
        const menuDiv = `<div class="${menuClass}"> 
                            <div class="task-card-menu-item" onclick="editTask(tasks.find(t => t.id === '${task.id}'))">✏️ 编辑</div>
                            <div class="task-card-menu-item" onclick="showTaskHistory('${task.id}')">📋 历史</div>
                            ${backdateMenuItem}
                        </div>`;
        // [v7.25.6] 备注图标：有备注时显示，点击 toast 展示内容
        const noteIcon = (task.note && task.note.trim())
            ? `<span class="task-note-icon" onclick="event.stopPropagation(); showTaskNote('${task.id}')" title="${escapeHtml(task.note.trim())}">📝</span>`
            : '';
        const titleRow = `<div class="task-row title-row">
                            <div class="task-name-wrap">
                                <div class="task-name" title="${safeTaskName}">${safeTaskName}</div>
                                ${noteIcon}
                            </div>
                            <!-- [v6.2.4-Fix] 改用 div 替代 button 以彻底根除原生样式干扰 -->
                            <div class="more-btn" role="button" tabindex="0" onclick="toggleTaskMenu(event)">...</div>
                            ${menuDiv}
                        </div>`;
                        
        // [v5.1.0] 分类标签渐变（左深右浅）
        const categoryGradient = getCategoryGradient(color); // 标签：左深右浅
        let statusDetails = `<span class="task-category" style="--category-gradient: ${categoryGradient}; background: ${categoryGradient};">${safeCategory}</span>`; 
        
        if (task.isHabit) {
            const periodInfoToday = getHabitPeriodInfo(task, transactions, new Date());
            const targetCount = periodInfoToday.targetCount || 1; 
            const dailyLimit = task.habitDetails.dailyLimit || Infinity;
            // [v4.8.5] 修复：达标任务仅统计真正达标的记录
            const completionsToday = transactions.filter(t => {
                const isSameTask = t.taskId === task.id;
                const isToday = getLocalDateString(t.timestamp) === todayStr;
                const isEarn = t.type === 'earn';
                if (!isSameTask || !isToday || !isEarn) return false;
                // 如果是达标任务，必须满足时长要求或有达标标记
                if (task.type === 'continuous_target') {
                    return t.amount >= task.targetTime || t.isStreakAdvancement;
                }
                return true;
            }).length;
            
            const isTargetAchieved = periodInfoToday.currentCount >= targetCount;
            const isDailyLimitReached = completionsToday >= dailyLimit;
            const hasValidTodayCompletion = hasHabitValidCompletionOnDate(task, transactions, todayStr);
            
            const unitMap = { daily: '天', weekly: '周', monthly: '月', yearly: '年' };
            const periodText = unitMap[task.habitDetails.period] || '次';
            const isDailyPeriod = task.habitDetails.period === 'daily';
            const periodPrefixMap = { daily: '今日', weekly: '本周', monthly: '本月', yearly: '本年度' };
            const periodPrefix = periodPrefixMap[task.habitDetails.period] || '本期';
            
            // [v7.24.0] 戒除模式卡片状态显示
            const isAbstinence = task.habitDetails.type === 'abstinence';
            const quotaMode = task.habitDetails.quotaMode || 'none';
            
            if (isAbstinence && quotaMode !== 'none') {
                // 戒除/动态倍率模式：显示额度使用量
                const usedRaw = getQuotaPeriodUsage(task);
                const quota = targetCount; // targetCountInPeriod = 额度
                let usedDisplay, quotaDisplay, unit;
                if (task.type === 'continuous_redeem') {
                    usedDisplay = Math.round(usedRaw / 60);
                    quotaDisplay = quota;
                    unit = '分';
                } else {
                    usedDisplay = usedRaw;
                    quotaDisplay = quota;
                    unit = '次';
                }
                const ratio = quotaDisplay > 0 ? usedDisplay / quotaDisplay : 0;
                if (ratio > 1) {
                    statusDetails += ` <span class="task-completion-count status-red">超额 ${usedDisplay}/${quotaDisplay}${unit}</span>`;
                } else if (ratio >= 0.8) {
                    statusDetails += ` <span class="task-completion-count status-orange">额度 ${usedDisplay}/${quotaDisplay}${unit}</span>`;
                } else {
                    statusDetails += ` <span class="task-completion-count status-blue">额度 ${usedDisplay}/${quotaDisplay}${unit}</span>`;
                }
            } else if (isAbstinence) {
                const used = periodInfoToday.currentCount;
                const limit = targetCount;

                if (isDailyPeriod && (task.habitDetails.isBroken || used > limit)) {
                    statusDetails += ` <span class="task-completion-count status-red">习惯已中断</span>`;
                } else if (isDailyPeriod && used === limit) {
                    statusDetails += ` <span class="task-completion-count status-orange">今日待坚持</span>`;
                } else {
                    statusDetails += ` <span class="task-completion-count status-blue">${periodPrefix}${used}/${limit}</span>`;
                }
            } else {
                // [v7.25.1] 精细化习惯任务状态显示
                const isCycleBroken = isDailyPeriod && hasMissedHabitDayInCurrentPeriod(task, transactions, new Date());
                const streak = task.habitDetails.streak || 0;
                const currentPeriodCount = periodInfoToday.currentCount;

                if (isCycleBroken) {
                    statusDetails += ` <span class="task-completion-count status-red">习惯已中断</span>`;
                } else if (isTargetAchieved) {
                    // 本期已达标：优先显示连续周期数
                    if (streak > 0) {
                        statusDetails += ` <span class="task-completion-count status-green">已连续${streak}${periodText}</span>`;
                    } else if (isDailyPeriod) {
                        statusDetails += ` <span class="task-completion-count status-green">今日已完成</span>`;
                    } else {
                        statusDetails += ` <span class="task-completion-count status-green">${periodPrefix}已达标</span>`;
                    }
                } else if (isDailyPeriod) {
                    // daily 周期：多目标显示进度，单目标或尚未开始显示待完成
                    if (targetCount > 1 && currentPeriodCount > 0) {
                        statusDetails += ` <span class="task-completion-count status-orange">今日${currentPeriodCount}/${targetCount}次</span>`;
                    } else {
                        statusDetails += ` <span class="task-completion-count status-orange">今日待完成</span>`;
                    }
                } else {
                    // 非 daily 周期：今日有贡献显蓝，否则显橙
                    const hasProgressToday = hasValidTodayCompletion || isDailyLimitReached;
                    const progressColor = hasProgressToday ? 'status-blue' : 'status-orange';
                    statusDetails += ` <span class="task-completion-count ${progressColor}">${periodPrefix}${currentPeriodCount}/${targetCount}次</span>`;
                }
            }

        } else {
            const txCount = transactions.filter(t => t.taskId === task.id).length;
            if (txCount > 0) {
                statusDetails += ` <span class="task-completion-count status-blue">累计${txCount}次</span>`;
            } else if ((task.completionCount || 0) > 0) {
                statusDetails += ` <span class="task-completion-count status-blue">累计${task.completionCount}次</span>`;
            }
        }
        

        const statusRow = `<div class="task-row"><div class="task-details">${statusDetails}</div></div>`;
        let paramsText = '';
        switch (task.type) {
            case 'reward': paramsText = `奖励: ${formatTime(task.fixedTime, false)}`; break;
            case 'continuous': paramsText = `${task.multiplier}倍率`; break;
            case 'continuous_target': paramsText = `目标${formatTime(task.targetTime, false).replace(/0秒$/, '').trim()}`; break;
            case 'instant_redeem': paramsText = `消费: ${formatTime(task.consumeTime, false)}`; break;
            case 'continuous_redeem': paramsText = `${task.multiplier}倍率`; break;
        }
        let paramsRow = `<div class="task-row task-parameters">${paramsText}</div>`;
        let actionRow = '';
        let timerBadge = '';
        if (isRunning) {
            const isPaused = runningTask.isPaused;
            const totalSeconds = Math.floor((runningTask.elapsedTime + (isPaused ? 0 : Date.now() - runningTask.startTime)) / 1000);
            const pauseResumeBtn = isPaused
                ? `<button class="task-btn primary" onclick="resumeTask('${task.id}')">继续</button>`
                : `<button class="task-btn warning" onclick="pauseTask('${task.id}')">暂停</button>`;
            actionRow = `<div class="task-row task-actions">${pauseResumeBtn}<button class="task-btn secondary" onclick="cancelTask('${task.id}')">取消</button><button class="task-btn danger" onclick="stopTask('${task.id}')">结束</button></div>`;

                // [v5.1.0] 运行中徽章放置在参数行，移除进度百分比
                let timerText = `${formatTime(totalSeconds)}`; 
                let timerClass = 'task-timer-badge';
                if (task.type === 'continuous_target') { 
                    if (runningTask.achieved) {
                        timerText += `·✅`; 
                    }
                } 
                const pausedBadgeBg = getPausedBadgeBg(); // [v7.20.1] 使用统一函数获取暂停徽章背景
                const badgeBg = isPaused ? pausedBadgeBg : badgeGradient;
                timerBadge = `<span class="${timerClass}" style="background:${badgeBg};">${timerText}</span>`; 
            paramsRow = `<div class="task-row task-parameters has-timer-badge"><span>${paramsText}</span><span>${timerBadge}</span></div>`;
        
            } else { let actionButton = ''; switch (task.type) { case 'reward': actionButton = `<button class="task-btn success wide" onclick="completeTask('${task.id}')">完成</button>`; break; case 'instant_redeem': actionButton = `<button class="task-btn danger wide" onclick="redeemTask('${task.id}')">兑换</button>`; break; default: actionButton = `<button class="task-btn primary wide" onclick="startTask(event, '${task.id}')">开始</button>`; break; } actionRow = `<div class="task-row task-actions">${actionButton}</div>`; } 
    
            // [v5.1.0] 运行中徽章嵌入参数行; [v6.0.0] 添加卡片样式类
            const cardStyleClass = screenTimeSettings.cardStyle || 'classic';
            
            // [v7.17.0] 展开/收起标签
            let expandTag = '';
            if (isLastCard && isLastVisible && hiddenCount > 0 && !isExpanded) {
                // 收起状态：显示 +x 标签
                expandTag = `<div class="task-expand-tag" onclick="event.stopPropagation(); toggleCategoryTaskExpand('${escapeHtml(category)}', event)">+${hiddenCount}</div>`;
            } else if (isLastCard && isExpanded) {
                // 展开状态：显示收起标签
                expandTag = `<div class="task-expand-tag expanded" onclick="event.stopPropagation(); toggleCategoryTaskExpand('${escapeHtml(category)}', event)">收起</div>`;
            }
            
            return `<div class="task-card ${cardStyleClass} ${habitClass}" ${habitStyle} data-task-id="${task.id}">${titleRow}${statusRow}${paramsRow}${actionRow}${expandTag}</div>`; 
    
    }).join(''); 
}

// [v6.4.6] 全局菜单相关
const globalTaskMenu = document.getElementById('globalTaskMenu');

// [v7.25.6] 显示任务备注
function showTaskNote(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task && task.note && task.note.trim()) {
        showToast('📝 ' + task.note.trim(), 3000);
    }
}

function toggleTaskMenu(event) {
    event.stopPropagation(); 
    const card = event.target.closest('.task-card');
    if (!card) return;
    const taskId = card.dataset.taskId;
    if (!taskId) return;

    // 切换状态变量
    if (activeMenuTaskId === taskId) {
        closeGlobalTaskMenu();
        return;
    }
    
    activeMenuTaskId = taskId;
    
    // [v6.4.6] 填充并定位全局菜单
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    // 构建菜单内容 - 与旧菜单保持一致，点击后关闭菜单
    const menuItems = [
        `<div class="global-task-menu-item" onclick="closeGlobalTaskMenu(); editTask(tasks.find(t => t.id === '${taskId}'))">✏️ 编辑</div>`,
        `<div class="global-task-menu-item" onclick="closeGlobalTaskMenu(); showTaskHistory('${taskId}')">📋 历史</div>`
    ];
    
    // 补录按钮 - 与旧版一致，支持按次任务/按次消费
    const canBackdate = ['continuous', 'continuous_target', 'continuous_redeem', 'reward', 'instant_redeem'].includes(task.type);
    if (canBackdate) {
        // [v7.3.4] 修复：task.autoDetect 是布尔值，不是对象
        if (task.appPackage && task.autoDetect) {
            menuItems.push(`<div class="global-task-menu-item" onclick="closeGlobalTaskMenu(); runAutoDetectForTask('${taskId}')">🤖 补录</div>`);
        } else {
            menuItems.push(`<div class="global-task-menu-item" onclick="closeGlobalTaskMenu(); showBackdateModal('${taskId}')">📆 补录</div>`);
        }
    }
    
    globalTaskMenu.innerHTML = menuItems.join('');
    
    // 定位菜单
    const moreBtn = card.querySelector('.more-btn');
    const btnRect = moreBtn.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    
    // 菜单位置：按钮下方，右对齐
    let menuTop = btnRect.bottom + 4;
    let menuRight = window.innerWidth - btnRect.right;
    
    // 计算可用高度：卡片底部 - 按钮底部 - 边距
    const maxHeight = cardRect.bottom - btnRect.bottom - 8;
    
    globalTaskMenu.style.top = menuTop + 'px';
    globalTaskMenu.style.right = menuRight + 'px';
    globalTaskMenu.style.left = 'auto';
    globalTaskMenu.style.maxHeight = Math.max(maxHeight, 100) + 'px';
    globalTaskMenu.classList.add('show');
}

function closeGlobalTaskMenu() {
    globalTaskMenu.classList.remove('show');
    activeMenuTaskId = null;
}

document.addEventListener('click', (event) => { 
    // [v6.4.6] 处理全局菜单关闭
    // [v7.10.1] 引导期间不自动关闭菜单
    if (typeof onboardingMenuLocked !== 'undefined' && onboardingMenuLocked) {
        return;
    }
    if (!event.target.closest('.more-btn') && !event.target.closest('.global-task-menu')) {
        closeGlobalTaskMenu();
    }
});

// [v6.4.6] 滚动时关闭全局菜单 - 监听主滚动容器
const appScrollContainer = document.querySelector('.app-scroll-container');
if (appScrollContainer) {
    appScrollContainer.addEventListener('scroll', () => {
        // [v7.10.1] 引导期间不自动关闭菜单
        if (typeof onboardingMenuLocked !== 'undefined' && onboardingMenuLocked) {
            return;
        }
        if (activeMenuTaskId) {
            closeGlobalTaskMenu();
        }
    }, { passive: true });
}

// [v4.3.8] 修复: Habit Nudge 逻辑移至此
function updateRunningTimers() { 
    runningTasks.forEach((runningTask, taskId) => { 
        if (runningTask.isPaused) return; 
        const task = tasks.find(t => t.id === taskId); 
        if (task) { 
            const totalSeconds = Math.floor((runningTask.elapsedTime + Date.now() - runningTask.startTime)) / 1000; 
            
            // [v4.7.0] 重构达标提醒逻辑：首次达标检测
            if (task.type === 'continuous_target' && !runningTask.achieved && totalSeconds >= task.targetTime) { 
                runningTask.achieved = true; 
                runningTask.achievedTime = Date.now(); 
                saveData(); 
                showNotification('🎯 达标提醒', `任务"${task.name}"已达到目标时间！`, 'achievement'); 
            }
            
            // [v4.7.0] 10分钟超时提醒
            
            const timerElements = document.querySelectorAll(`.task-card[data-task-id="${taskId}"] .task-timer-badge`);
            if (timerElements.length > 0) {
                let timerText = `${formatTime(totalSeconds)}`;
                let timerClass = 'task-timer-badge';
                const colorHex = categoryColors.get(task.category) || '#666';
                const badgeGradient = getBadgeGradient(colorHex);
                if (task.type === 'continuous_target') {
                    if (runningTask.achieved) {
                        timerText += `✅`; 
                    }
                }
                timerElements.forEach(timerElement => {
                    timerElement.textContent = timerText;
                    timerElement.className = timerClass;
                    timerElement.style.background = badgeGradient;
                });
            }
        } 
    });
    
    // [v3.15.0] Daily Habit Nudge Check
    if (!notificationSettings.habitNudgeEnabled) return;
    const now = new Date();
    const todayStr = getLocalDateString(now);
    if (notificationSettings.lastNudgeDate === todayStr) return; // 已检查过
    
    const [nudgeHours, nudgeMinutes] = notificationSettings.habitNudgeTime.split(':').map(Number);
    if (now.getHours() < nudgeHours || (now.getHours() === nudgeHours && now.getMinutes() < nudgeMinutes)) {
        return; // 没到时间
    }

    // [v4.3.8] 关键修复：使用锁防止异步 saveData 循环
    if (isProcessingNudge) return; // 正在处理，跳过

    isProcessingNudge = true; // 设置锁
    notificationSettings.lastNudgeDate = todayStr; // 立即更新内存

    // 保存更改，并在保存完成后（无论成功/失败）释放锁
    saveData().finally(() => {
        isProcessingNudge = false;
    });

    // [v7.20.3-fix] 未完成习惯提醒统一为“今日至少一次”口径
    const uncompletedHabits = tasks.filter(t =>
        t.isHabit &&
        t.habitDetails &&
        t.habitDetails.type !== 'abstinence' &&
        ['reward', 'continuous', 'continuous_target'].includes(t.type) &&
        !hasHabitValidCompletionOnDate(t, transactions, todayStr)
    );

    if (uncompletedHabits.length > 0) {
        const title = '🌙 每日习惯提醒';
        const body = `今天还有 ${uncompletedHabits.length} 个习惯未完成（若今天不完成，本周期将无法达成），例如：${uncompletedHabits[0].name}...`;
        showNotification(title, body, 'habitNudge'); 
    }
    
    // [v4.3.8] 已移除末尾多余的 saveData()
} 

// 分类展开/收起（无动画，直接切换）
function toggleCategory(category) {
    const isCollapsing = !collapsedCategories.has(category);
    const categoryEl = document.querySelector(`.category-tasks[data-category="${CSS.escape(category)}"]`);
    const listEl = categoryEl?.querySelector('.category-tasks-list');
    const headerEl = categoryEl?.querySelector('.category-header');
    if (!listEl) return;
    
    if (isCollapsing) {
        collapsedCategories.add(category);
        headerEl?.classList.add('collapsed');
        listEl.classList.add('collapsed');
    } else {
        collapsedCategories.delete(category);
        headerEl?.classList.remove('collapsed');
        listEl.classList.remove('collapsed');
    }
    saveData();
}

// [v5.0.0] 切换分类内任务的展开/收起状态
function toggleCategoryTaskExpand(category, event) {
    event.stopPropagation();
    if (expandedTaskCategories.has(category)) {
        expandedTaskCategories.delete(category);
    } else {
        expandedTaskCategories.add(category);
    }
    updateCategoryTasks();
}
// [v7.16.2] 任务显示数量设置（合并控制最近任务+分类任务）
function setTaskDisplayLimit(val) {
    val = parseInt(val) || 4;
    RECENT_TASK_LIMIT = val;
    CATEGORY_TASK_LIMIT = val;
    localStorage.setItem('recentTaskLimit', val);
    localStorage.setItem('categoryTaskLimit', val);
    // 更新按钮状态
    document.querySelectorAll('#taskLimitSwitcher .style-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.limit) === val);
    });
    expandedTaskCategories.clear();
    updateRecentTasks();
    updateCategoryTasks();
}
function initTaskDisplaySettings() {
    const limit = RECENT_TASK_LIMIT;
    document.querySelectorAll('#taskLimitSwitcher .style-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.limit) === limit);
    });
}
// [v7.15.0] 旧版余额卡片更新
function updateClassicBalanceCard() {
    const balanceCard = document.getElementById('balanceCard'); 
    const balanceAmount = document.getElementById('balanceAmount'); 
    balanceAmount.textContent = formatTime(currentBalance); 
    balanceCard.classList.toggle('negative', currentBalance < 0); 
    balanceAmount.style.color = currentBalance < 0 ? 'var(--color-negative)' : 'var(--color-primary)'; 
}

// [v7.15.0] 金融系统余额卡片更新
// [v7.18.0] 新增：经典模式使用动态渐变颜色
function updateFinanceBalanceCard() {
    const card = document.getElementById('balanceCardFinance');
    const amount = document.getElementById('balanceFinanceAmount');
    const expectedInterest = document.getElementById('financeExpectedInterest');
    
    // 更新余额
    amount.textContent = formatTime(currentBalance);
    card.classList.toggle('negative', currentBalance < 0);
    
    // 更新预计利息
    const interest = getExpectedTodayInterest();
    expectedInterest.textContent = (interest >= 0 ? '+' : '') + formatTime(interest);
    expectedInterest.className = 'interest-value ' + (interest > 0 ? 'positive' : interest < 0 ? 'negative' : '');
    
    // [v7.18.0] 经典模式：使用CSS变量设置动态渐变颜色
    if (!document.body.classList.contains('glass-mode')) {
        const balanceHours = currentBalance / 3600;
        const colors = getBalanceGradientColors(balanceHours);
        card.style.setProperty('--card-gradient-start', colors.start);
        card.style.setProperty('--card-gradient-end', colors.end);
        // 添加方向类（由updateCardGradientDirections统一控制）
        updateCardGradientDirections();
    }
}

// [v7.15.1] 金融系统卡片展开/收起 - 参考屏幕时间卡片交互
let isBalanceCardFinanceExpanded = false;

function toggleBalanceCardFinance(event) {
    // 如果没有事件对象（直接调用），简单切换展开状态
    if (!event) {
        const card = document.getElementById('balanceCardFinance');
        isBalanceCardFinanceExpanded = !isBalanceCardFinanceExpanded;
        card.classList.toggle('expanded', isBalanceCardFinanceExpanded);
        localStorage.setItem('balanceCardFinanceExpanded', isBalanceCardFinanceExpanded);
        return;
    }
    
    event.stopPropagation();
    const card = document.getElementById('balanceCardFinance');
    if (!card) return;
    
    const isExpanded = card.classList.contains('expanded');
    const header = document.getElementById('balanceFinanceHeader');
    const clickedHeader = header && header.contains(event.target);
    
    if (!isExpanded) {
        // 收起状态，点击任何位置都展开
        card.classList.add('expanded');
        isBalanceCardFinanceExpanded = true;
        localStorage.setItem('balanceCardFinanceExpanded', true);
    } else if (clickedHeader) {
        // 展开状态，点击header收起
        card.classList.remove('expanded');
        isBalanceCardFinanceExpanded = false;
        localStorage.setItem('balanceCardFinanceExpanded', false);
    }
    // [v7.16.2] body 区域的点击由子元素各自处理（stats→每日详情, interest→余额详情）
}

// [v7.15.0] 初始化金融系统卡片展开状态
function initBalanceCardFinanceState() {
    const saved = localStorage.getItem('balanceCardFinanceExpanded');
    isBalanceCardFinanceExpanded = saved === 'true';
    
    const card = document.getElementById('balanceCardFinance');
    if (card && isBalanceCardFinanceExpanded) {
        card.classList.add('expanded');
    }
}

// [v7.15.1] 重新设计的余额详情弹窗 - 参考屏幕/睡眠时间卡片风格
function showFinanceDetailCombinedModal() {
    // 获取数据
    const balanceData = getLast7DaysBalanceData();
    const totalDeposit = financeStats.totalDepositInterest;
    const totalLoan = financeStats.totalLoanInterest;
    const netInterest = totalDeposit - totalLoan;
    const todayInterest = getExpectedTodayInterest();
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayLedger = interestLedger[getLocalDateString(yesterday)];
    
    // [v7.15.1] 自适应纵轴折线图 - 方案2：带数值标签（灰色线条，混合标签）
    const balances = balanceData.map(d => d.balance);
    const minBalance = Math.min(...balances);
    const maxBalance = Math.max(...balances);
    const range = maxBalance - minBalance || 1;
    
    // 生成混合标签：7天前-3天前用日期(M/D)，前天/昨天用文字
    const dayLabels = [];
    const textLabels = ['昨天', '前天', '3天前', '4天前', '5天前', '6天前', '7天前'];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        // i >= 3 表示3天前及以上用日期，i < 3 用昨天/前天
        if (i >= 3) {
            dayLabels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        } else {
            dayLabels.push(textLabels[6 - i]);
        }
    }
    
    // 图表尺寸和边距
    const chartWidth = 300;
    const chartHeight = 140;
    const padding = { top: 28, right: 8, bottom: 18, left: 8 };
    
    // 添加15%边距
    const paddingY = range * 0.15;
    const yMin = minBalance - paddingY;
    const yMax = maxBalance + paddingY;
    const yRange = yMax - yMin;
    
    // 计算坐标点
    const points = balanceData.map((d, i) => {
        const x = padding.left + (i / (balanceData.length - 1)) * (chartWidth - padding.left - padding.right);
        const y = padding.top + (1 - (d.balance - yMin) / yRange) * (chartHeight - padding.top - padding.bottom);
        return { 
            x, y, 
            value: d.balance, 
            day: dayLabels[i],
            isPositive: d.balance >= 0 
        };
    });
    
    // 构建平滑曲线路径（使用贝塞尔曲线）
    let pathD = '';
    if (points.length > 0) {
        pathD = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            // 控制点，实现平滑曲线
            const cpx1 = prev.x + (curr.x - prev.x) * 0.3;
            const cpy1 = prev.y;
            const cpx2 = prev.x + (curr.x - prev.x) * 0.7;
            const cpy2 = curr.y;
            pathD += ` C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${curr.x} ${curr.y}`;
        }
    }
    
    // 构建SVG
    let svgHtml = `<svg class="finance-line-svg" viewBox="0 0 ${chartWidth} ${chartHeight}" preserveAspectRatio="none">`;
    
    // 主线条 - 灰色虚线
    svgHtml += `<path d="${pathD}" fill="none" stroke="#888888" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5,3" />`;
    
    // 数据点和标签
    points.forEach((p, i) => {
        const valueColor = p.isPositive ? '#4CAF50' : '#f44336';
        // 数值标签交替上下显示避免重叠
        const labelY = i % 2 === 0 ? p.y - 10 : p.y + 16;
        
        // 数据点 - 无边框
        svgHtml += `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${valueColor}"/>`;
        // 数值标签
        svgHtml += `<text x="${p.x}" y="${labelY}" font-size="9" fill="${valueColor}" text-anchor="middle" font-weight="600">${formatHoursShort(p.value)}</text>`;
        // 日期标签
        svgHtml += `<text x="${p.x}" y="${chartHeight - 4}" font-size="9" fill="var(--text-color-light)" text-anchor="middle">${p.day}</text>`;
    });
    
    svgHtml += '</svg>';
    
    let chartHtml = '<div class="finance-detail-section">';
    chartHtml += '<div class="finance-detail-title">📊 近7天余额</div>';
    chartHtml += `<div class="finance-adaptive-line-chart">${svgHtml}</div>`;
    chartHtml += '</div>';
    
    // 利息统计区域 - 2×2布局，预计今日利息和累计净收益放在上方
    const interestHtml = `
        <div class="finance-detail-section">
            <div class="finance-detail-title">💰 利息统计</div>
            <div class="finance-stats-grid-2x2">
                <div class="finance-stat-card ${todayInterest >= 0 ? 'positive' : 'negative'}">
                    <div class="finance-stat-label">预计今日利息</div>
                    <div class="finance-stat-value">${todayInterest >= 0 ? '+' : ''}${formatTime(todayInterest)}</div>
                </div>
                <div class="finance-stat-card ${netInterest >= 0 ? 'positive' : 'negative'}">
                    <div class="finance-stat-label">累计净收益</div>
                    <div class="finance-stat-value">${netInterest >= 0 ? '+' : ''}${formatTime(netInterest)}</div>
                </div>
                <div class="finance-stat-card positive">
                    <div class="finance-stat-label">累计利息收入</div>
                    <div class="finance-stat-value">+${formatTime(totalDeposit)}</div>
                </div>
                <div class="finance-stat-card negative">
                    <div class="finance-stat-label">累计利息支出</div>
                    <div class="finance-stat-value">-${formatTime(totalLoan)}</div>
                </div>
            </div>
        </div>
    `;
    
    // 利率设置 - 完全复用设置页面的并排紧凑布局（带±按钮）
    const rateHtml = `
        <div class="finance-detail-section">
            <div class="finance-detail-title">⚙️ 利率设置</div>
            <div class="finance-rate-compact">
                <div class="finance-rate-box positive">
                    <div class="finance-rate-box-label">💰 存款利率</div>
                    <div class="finance-rate-controls">
                        <button class="rate-btn" onclick="event.stopPropagation();adjustDepositRate(-0.1);showFinanceDetailCombinedModal();" style="padding: 2px 8px; border: 1px solid var(--border-color); background: var(--btn-secondary-bg); border-radius: 4px; cursor: pointer; font-size: 0.85rem;">−</button>
                        <span class="finance-rate-box-value" style="color: var(--color-positive);">${financeSettings.depositRate.toFixed(1)}%</span>
                        <button class="rate-btn" onclick="event.stopPropagation();adjustDepositRate(0.1);showFinanceDetailCombinedModal();" style="padding: 2px 8px; border: 1px solid var(--border-color); background: var(--btn-secondary-bg); border-radius: 4px; cursor: pointer; font-size: 0.85rem;">+</button>
                    </div>
                </div>
                <div class="finance-rate-box negative">
                    <div class="finance-rate-box-label">💸 贷款利率</div>
                    <div class="finance-rate-controls">
                        <button class="rate-btn" onclick="event.stopPropagation();adjustLoanRate(-0.1);showFinanceDetailCombinedModal();" style="padding: 2px 8px; border: 1px solid var(--border-color); background: var(--btn-secondary-bg); border-radius: 4px; cursor: pointer; font-size: 0.85rem;">−</button>
                        <span class="finance-rate-box-value" style="color: var(--color-negative);">${financeSettings.loanRate.toFixed(1)}%</span>
                        <button class="rate-btn" onclick="event.stopPropagation();adjustLoanRate(0.1);showFinanceDetailCombinedModal();" style="padding: 2px 8px; border: 1px solid var(--border-color); background: var(--btn-secondary-bg); border-radius: 4px; cursor: pointer; font-size: 0.85rem;">+</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // 组合内容（删除今日利息和本周汇总）
    const content = `
        ${chartHtml}
        ${interestHtml}
        ${rateHtml}
    `;
    
    showInfoModal('余额和利息详情', content);
    // [v7.16.0] 替换标题为带切换按钮的版本
    const titleEl = document.getElementById('generalInfoModalTitle');
    if (titleEl) {
        const todayStr = getLocalDateString(new Date());
        titleEl.innerHTML = `<div style="display:flex;align-items:center;gap:6px;"><button class="view-switch-btn" onclick="event.stopPropagation();hideInfoModal();showDayDetails('${todayStr}')" title="切换到每日详情">⇄</button><span>余额和利息详情</span></div>`;
    }
}

// [v7.15.0] 隐藏余额详情弹窗
function hideBalanceDetailModal() {
    document.getElementById('balanceDetailModal').classList.remove('show');
}

// [v7.15.0] 获取最近7天的余额数据
function getLast7DaysBalanceData() {
    const data = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = getLocalDateString(date);
        
        // 获取该日期的交易
        const dayTransactions = transactions.filter(t => 
            !t.undone && getLocalDateString(new Date(t.timestamp)) === dateStr
        );
        
        const earned = dayTransactions.reduce((sum, t) => 
            sum + (t.type === 'earn' ? t.amount : 0), 0);
        const spent = dayTransactions.reduce((sum, t) => 
            sum + (t.type === 'spend' ? t.amount : 0), 0);
        
        // 计算该日结束时的余额
        let balanceAtEnd = currentBalance;
        for (let j = 0; j < i; j++) {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() - j);
            const futureDateStr = getLocalDateString(futureDate);
            const futureTransactions = transactions.filter(t => 
                !t.undone && getLocalDateString(new Date(t.timestamp)) === futureDateStr
            );
            const futureEarned = futureTransactions.reduce((sum, t) => 
                sum + (t.type === 'earn' ? t.amount : 0), 0);
            const futureSpent = futureTransactions.reduce((sum, t) => 
                sum + (t.type === 'spend' ? t.amount : 0), 0);
            balanceAtEnd -= (futureEarned - futureSpent);
        }
        
        data.push({
            date: dateStr,
            balance: balanceAtEnd,
            earned: earned,
            spent: spent,
            net: earned - spent
        });
    }
    return data;
}

// [v7.15.1] 添加趋势图样式 - 方案一：双向垂直条形图（零轴在中间）
const balanceTrendStyles = document.createElement('style');
balanceTrendStyles.textContent = `
    /* === 方案一：双向垂直条形图（当前使用）=== */
    .balance-trend-chart {
        display: flex;
        justify-content: space-between;
        align-items: center;
        height: 130px;
        padding: 5px 0;
        position: relative;
    }
    /* 零轴线 */
    .balance-trend-chart::before {
        content: '';
        position: absolute;
        left: 4px;
        right: 4px;
        top: 50%;
        height: 1px;
        background: rgba(128, 128, 128, 0.3);
        z-index: 0;
    }
    .trend-bar-wrapper {
        flex: 1;
        min-width: 0; /* 防止flex item溢出 */
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        position: relative;
        z-index: 1;
        margin: 0 2px;
    }
    .trend-bar-area {
        width: 100%;
        height: 50%;
        display: flex;
        align-items: flex-end;
        justify-content: center;
    }
    .trend-bar-area.negative {
        align-items: flex-start;
    }
    .trend-bar {
        width: 85%;
        max-width: 24px;
        min-height: 3px;
        border-radius: 3px;
        transition: all 0.3s ease;
    }
    .trend-bar.positive {
        background: linear-gradient(to top, #4CAF50, #81C784);
        border-radius: 3px 3px 0 0;
    }
    .trend-bar.negative {
        background: linear-gradient(to bottom, #f44336, #e57373);
        border-radius: 0 0 3px 3px;
    }
    .trend-value {
        font-size: 0.65rem;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
    }
    .trend-value.positive {
        color: #4CAF50;
        margin-bottom: 2px;
    }
    .trend-value.negative {
        color: #f44336;
        margin-top: 2px;
    }
    .trend-label {
        font-size: 0.7rem;
        color: var(--text-color-light);
        margin-top: 3px;
    }
    
    /* === 方案二：水平条形图（备用）=== */
    .balance-trend-horizontal {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .trend-h-item {
        display: flex;
        align-items: center;
        height: 24px;
    }
    .trend-h-label {
        width: 30px;
        font-size: 0.75rem;
        color: var(--text-color-light);
        text-align: center;
    }
    .trend-h-bar-area {
        flex: 1;
        height: 100%;
        display: flex;
        align-items: center;
        position: relative;
    }
    /* 零轴竖线 */
    .trend-h-bar-area::before {
        content: '';
        position: absolute;
        left: 50%;
        top: 0;
        bottom: 0;
        width: 1px;
        background: rgba(128, 128, 128, 0.3);
    }
    .trend-h-bar {
        height: 16px;
        border-radius: 3px;
        transition: all 0.3s ease;
    }
    .trend-h-bar.positive {
        background: linear-gradient(to right, #4CAF50, #81C784);
        margin-left: 50%;
    }
    .trend-h-bar.negative {
        background: linear-gradient(to left, #f44336, #e57373);
        margin-right: 50%;
    }
    .trend-h-value {
        width: 40px;
        font-size: 0.7rem;
        font-weight: 600;
        text-align: right;
        padding-left: 6px;
    }
    
    /* === 方案三：简化垂直图（所有柱子向上，颜色区分）=== */
    .balance-trend-simple {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        height: 100px;
        padding: 10px 4px 0;
    }
    .trend-s-item {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        min-width: 0;
        margin: 0 2px;
    }
    .trend-s-value {
        font-size: 0.65rem;
        font-weight: 600;
        margin-bottom: 3px;
        white-space: nowrap;
    }
    .trend-s-bar {
        width: 85%;
        max-width: 20px;
        min-height: 4px;
        border-radius: 3px 3px 0 0;
        transition: all 0.3s ease;
    }
    .trend-s-bar.positive {
        background: linear-gradient(to top, #4CAF50, #81C784);
    }
    .trend-s-bar.negative {
        background: linear-gradient(to top, #f44336, #e57373);
    }
    .trend-s-label {
        font-size: 0.7rem;
        color: var(--text-color-light);
        margin-top: 4px;
    }
`;
document.head.appendChild(balanceTrendStyles);

// [v7.15.1] 余额详情弹窗样式 - 参考屏幕/睡眠时间卡片风格
const financeDetailStyles = document.createElement('style');
financeDetailStyles.textContent = `
    /* 弹窗区块 */
    .finance-detail-section {
        margin-bottom: 16px;
    }
    .finance-detail-section:last-child {
        margin-bottom: 0;
    }
    .finance-detail-title {
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--text-color);
        margin-bottom: 10px;
    }
    
    /* 水平条形图 */
    .finance-bar-chart {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .finance-bar-row {
        display: flex;
        align-items: center;
        height: 28px;
    }
    .finance-bar-label {
        width: 44px;
        font-size: 0.75rem;
        color: var(--text-color-light);
        flex-shrink: 0;
    }
    .finance-bar-container {
        flex: 1;
        height: 100%;
        display: flex;
        align-items: center;
    }
    .finance-bar {
        height: 20px;
        min-width: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding-right: 8px;
        transition: all 0.3s ease;
    }
    .finance-bar.positive {
        background: linear-gradient(to right, #4CAF50, #81C784);
    }
    .finance-bar.negative {
        background: linear-gradient(to right, #f44336, #e57373);
    }
    .finance-bar-text {
        font-size: 0.7rem;
        font-weight: 600;
        color: white;
        white-space: nowrap;
    }
    
    /* 利息统计卡片 - 2×2布局 */
    .finance-stats-grid-2x2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
    }
    .finance-stat-card {
        background: var(--btn-secondary-bg);
        border-radius: 10px;
        padding: 12px 8px;
        text-align: center;
    }
    .finance-stat-card.positive {
        background: rgba(76, 175, 80, 0.1);
    }
    .finance-stat-card.negative {
        background: rgba(244, 67, 54, 0.1);
    }
    .finance-stat-label {
        font-size: 0.7rem;
        color: var(--text-color-light);
        margin-bottom: 4px;
    }
    .finance-stat-value {
        font-size: 0.9rem;
        font-weight: 600;
    }
    .finance-stat-card.positive .finance-stat-value {
        color: var(--color-positive);
    }
    .finance-stat-card.negative .finance-stat-value {
        color: var(--color-negative);
    }
    
    /* 利率设置 - 紧凑并排布局（复用设置页风格） */
    .finance-rate-compact {
        display: flex;
        gap: 12px;
    }
    .finance-rate-box {
        flex: 1;
        padding: 12px;
        border-radius: 10px;
        text-align: left;
    }
    .finance-rate-box.positive {
        background: rgba(76, 175, 80, 0.1);
    }
    .finance-rate-box.negative {
        background: rgba(244, 67, 54, 0.1);
    }
    .finance-rate-box-label {
        font-size: 0.75rem;
        color: var(--text-color-light);
        margin-bottom: 6px;
    }
    .finance-rate-box-value {
        font-size: 1.1rem;
        font-weight: 600;
    }
    .finance-rate-box.positive .finance-rate-box-value {
        color: var(--color-positive);
    }
    .finance-rate-box.negative .finance-rate-box-value {
        color: var(--color-negative);
    }
    /* 利率控制按钮区域 */
    .finance-rate-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        margin-top: 6px;
    }
    .finance-rate-controls .rate-btn {
        flex: 0 0 auto;
        min-width: 24px;
    }
    .finance-rate-controls .finance-rate-box-value {
        flex: 1;
        text-align: center;
        font-size: 1rem;
        font-weight: 600;
    }
`;
document.head.appendChild(financeDetailStyles);

// [v7.15.1] 自适应折线图样式 - 方案2：带数值标签
const adaptiveLineStyles = document.createElement('style');
adaptiveLineStyles.textContent = `
    .finance-adaptive-line-chart {
        height: 140px;
        padding: 5px 0;
    }
    .finance-adaptive-line-chart .finance-line-svg {
        width: 100%;
        height: 100%;
        overflow: visible;
    }
`;
document.head.appendChild(adaptiveLineStyles);

function updateBalance() { 
    // [v7.15.0] 根据金融系统开关和卡片设置选择卡片方案
    const useFinanceCard = financeSettings && financeSettings.enabled && financeSettings.showCard !== false;
    const oldCard = document.getElementById('balanceCard');
    const financeCard = document.getElementById('balanceCardFinance');
    
    if (useFinanceCard) {
        // 使用金融系统卡片
        oldCard.classList.add('hidden');
        financeCard.classList.remove('hidden');
        updateFinanceBalanceCard();
    } else {
        // 使用旧版卡片（金融系统关闭或卡片关闭时）
        oldCard.classList.remove('hidden');
        financeCard.classList.add('hidden');
        updateClassicBalanceCard();
    }
    
    // [v7.4.0] 使用与今日详情相同的实时计算方法
    const todayStr = getLocalDateString(new Date());
    const todayTransactions = transactions.filter(t => !t.undone && getLocalDateString(t.timestamp) === todayStr);
    const todayEarned = todayTransactions.reduce((sum, t) => sum + (t.type === 'earn' ? t.amount : (!t.type && t.amount > 0 ? t.amount : 0)), 0);
    const todaySpent = todayTransactions.reduce((sum, t) => sum + (t.type === 'spend' ? t.amount : (!t.type && t.amount < 0 ? Math.abs(t.amount) : 0)), 0);
    
    // 更新两个卡片的今日统计（无论显示哪个）
    document.getElementById('dailyEarned').textContent = formatTime(todayEarned); 
    document.getElementById('dailySpent').textContent = formatTime(todaySpent);
    document.getElementById('financeDailyEarned').textContent = formatTime(todayEarned);
    document.getElementById('financeDailySpent').textContent = formatTime(todaySpent); 
    
    if (notificationSettings.lowBalance && currentBalance >= 0 && currentBalance < notificationSettings.lowBalanceThreshold) { 
        const todayKey = getLocalDateString(new Date()); 
        if (notificationSettings.lastLowBalanceAlertDate !== todayKey) { 
 
            notificationSettings.lastLowBalanceAlertDate = todayKey; 
            saveData(); 
        } 
    } 
}
// --- Task Creation/Editing Modals ---
function shouldStartTaskOnboarding() {
    return localStorage.getItem('tb_task_onboarding_pending') === 'true'
        && localStorage.getItem('tb_task_onboarding_done') !== 'true';
}
function handleFabClick() {
    if (shouldStartTaskOnboarding() && !isTaskOnboardingActive) {
        startTaskOnboarding();
        return;
    }
    showTaskModal();
}
function showTaskModal() { 
    currentEditingTask = null; 
    currentSelectedColor = null; 
    document.getElementById('modalTitle').textContent = '创建新任务'; 
    document.getElementById('submitBtn').textContent = '创建'; 
    document.getElementById('deleteBtn').classList.add('hidden'); 
    document.getElementById('taskForm').reset(); 
    // [v6.4.0] 重置任务类型选择器
    document.getElementById('taskType').value = '';
    document.getElementById('taskTypeTrigger').textContent = '选择类型';
    document.getElementById('taskNote').value = '';
    // [v7.22.1] 重置备注 textarea 高度
    const noteEl = document.getElementById('taskNote');
    if (noteEl) { noteEl.style.height = 'auto'; }
    // [v7.24.0] 重置备注开关为关闭状态
    const noteToggle = document.getElementById('isTaskNoteToggle');
    if (noteToggle) { noteToggle.checked = false; toggleTaskNoteInput(false); }
    
    populateAppSuggestions();
    const appInput = document.getElementById('taskAppPackage');
    if (appInput) {
        appInput.value = '';
        delete appInput.dataset.selectedPackage; // [v5.2.0] 清除选中包名
    }
    const appToggle = document.getElementById('isAppLauncherToggle');
    if (appToggle) { appToggle.checked = false; toggleAppLauncherSettings(false); }
    // [v5.3.0] 重置自动检测补录开关
    const autoDetectToggle = document.getElementById('isAutoDetectToggle');
    if (autoDetectToggle) { autoDetectToggle.checked = false; }
    const floatingTimerToggle = document.getElementById('isFloatingTimerToggle');
    if (floatingTimerToggle) floatingTimerToggle.checked = false;
    // [v3.18.0] Reset target count
    document.getElementById('targetCountInPeriod').value = 1; 
    document.getElementById('habitDailyLimit').value = '';
    document.getElementById('habitPlanDuration').value = ''; 
    // [v6.4.0] 重置自定义下拉菜单
    selectHabitPeriod('daily');
    // [v7.24.0] 重置戒除模式
    selectQuotaMode('quota');
    updateFormForTaskType(); 
    toggleHabitSettings(false); 
    toggleReminderSettings(false); 
    toggleRecurringReminderVisibility(); 
    document.getElementById('habitRewardsContainer').innerHTML = ''; 
    document.getElementById('taskModal').classList.add('show'); 
}
function hideTaskModal() { document.getElementById('taskModal').classList.remove('show'); clearFormErrors(); }
function editTask(task) { 
    if (!task) return;
    currentEditingTask = task; 
    currentSelectedColor = categoryColors.get(task.category); 
    document.getElementById('modalTitle').textContent = '编辑任务'; 
    document.getElementById('submitBtn').textContent = '保存'; 
    document.getElementById('deleteBtn').classList.remove('hidden'); 
    const form = document.getElementById('taskForm'); 
    form.taskName.value = task.name; 
    form.taskCategory.value = task.category; 
    // [v6.4.0] 任务类型回填 - 更新触发器显示和隐藏字段
    document.getElementById('taskType').value = task.type;
    const taskTypeLabels = {
        reward: '按次任务', continuous: '计时任务', continuous_target: '达标任务',
        instant_redeem: '按次消费', continuous_redeem: '计时消费'
    };
    document.getElementById('taskTypeTrigger').textContent = taskTypeLabels[task.type] || '选择类型';
    
    populateAppSuggestions();
    const appToggle = document.getElementById('isAppLauncherToggle');
    const appInput = document.getElementById('taskAppPackage');
    const hasApp = !!task.appPackage;
    if (appToggle) appToggle.checked = hasApp;
    if (appInput) {
        appInput.value = resolveAppInputValue(task.appPackage);
        // [v5.2.0] 保存原始包名用于提交
        if (task.appPackage) {
            appInput.dataset.selectedPackage = task.appPackage;
        } else {
            delete appInput.dataset.selectedPackage;
        }
    }
    toggleAppLauncherSettings(hasApp);
    // [v5.3.0] 加载自动检测补录状态
    const autoDetectToggle = document.getElementById('isAutoDetectToggle');
    if (autoDetectToggle) {
        autoDetectToggle.checked = task.autoDetect || false;
    }

    // [v4.11.0] 悬浮窗计时器兼容逻辑
    const floatingTimerToggle = document.getElementById('isFloatingTimerToggle');
    if (floatingTimerToggle) {
        let floatEnabled = false;
        if (task.enableFloatingTimer !== undefined) {
            floatEnabled = task.enableFloatingTimer;
        } else {
            floatEnabled = (task.type === 'continuous_target');
        }
        floatingTimerToggle.checked = floatEnabled;
    }
    // [v4.8.2] 读取时将秒转换为分钟
    if (task.fixedTime) form.fixedTime.value = parseFloat((task.fixedTime / 60).toFixed(2)); 
    if (task.consumeTime) form.consumeTime.value = parseFloat((task.consumeTime / 60).toFixed(2)); 
    if (task.multiplier) form.multiplier.value = task.multiplier; 
    if (task.targetTime) form.targetTime.value = parseFloat((task.targetTime / 60).toFixed(2)); 
    if (task.bonusReward) form.bonusReward.value = parseFloat((task.bonusReward / 60).toFixed(2)); 
    // [v7.24.0] 编辑时根据是否有备注设置开关状态
    const hasNote = !!(task.note && task.note.trim());
    const noteToggle = document.getElementById('isTaskNoteToggle');
    if (noteToggle) { noteToggle.checked = hasNote; toggleTaskNoteInput(hasNote); }
    document.getElementById('taskNote').value = task.note || '';
    // [v7.22.1] 编辑时自适应备注高度
    const noteEl = document.getElementById('taskNote');
    if (noteEl && hasNote) { setTimeout(() => autoResizeTextarea(noteEl), 0); }
    document.getElementById('isHabitToggle').checked = task.isHabit || false; 
    if (task.isHabit && task.habitDetails) { 
        const periodValue = task.habitDetails.period || 'daily';
        selectHabitPeriod(periodValue);
        
        // [v7.24.0] 恢复戒除模式
        if (task.habitDetails.quotaMode && task.habitDetails.quotaMode !== 'none') {
            selectQuotaMode(task.habitDetails.quotaMode);
        } else {
            selectQuotaMode('quota');
        }
        
        // [v3.18.0] Load new target count
        document.getElementById('targetCountInPeriod').value = task.habitDetails.targetCountInPeriod || 1; 
        document.getElementById('habitDailyLimit').value = task.habitDetails.dailyLimit || '';
        document.getElementById('habitPlanDuration').value = task.habitDetails.planDuration || ''; 
        const rewardsContainer = document.getElementById('habitRewardsContainer'); 
        rewardsContainer.innerHTML = ''; 
        (task.habitDetails.rewards || []).forEach(rule => addHabitRewardRule(rule)); 
    } else { 
        document.getElementById('habitRewardsContainer').innerHTML = ''; 
        // [v3.18.0] Reset to default values
        document.getElementById('targetCountInPeriod').value = 1; 
        document.getElementById('habitDailyLimit').value = '';
        document.getElementById('habitPlanDuration').value = '';
    }
    
    const hasReminder = task.reminderDetails && task.reminderDetails.status === 'pending';
    document.getElementById('isReminderToggle').checked = hasReminder;
    if (hasReminder) {
        const { mode, time, isRecurring } = task.reminderDetails;
        switchReminderMode(mode);
        if (mode === 'absolute') {
            document.getElementById('reminderDateTime').value = time;
            document.getElementById('isRecurringReminderToggle').checked = isRecurring || false; 
        } else { // relative
            document.getElementById('reminderHours').value = Math.floor(time / 3600);
            document.getElementById('reminderMinutes').value = Math.floor((time % 3600) / 60);
        }
    } else {
        switchReminderMode('absolute'); 
    }

    updateFormForTaskType(); 
    toggleHabitSettings(task.isHabit);
    toggleReminderSettings(hasReminder);
    toggleRecurringReminderVisibility(); 
    
    document.getElementById('taskModal').classList.add('show'); 
}

/**
 * 删除任务
 * [v5.9.0] 支持事件驱动写入模式
 */
async function deleteTask() {
    if (!currentEditingTask) return;
    const confirmed = await showConfirm(`确定要删除任务"${currentEditingTask.name}"吗？`, '删除任务');
    if (!confirmed) return;

    const deleteMode = await showTaskDeleteModeModal(currentEditingTask.name);
    if (!deleteMode) return;
    const shouldDeleteTransactions = deleteMode === 'task-and-transactions';
    
    const taskId = currentEditingTask.id;
    const taskName = currentEditingTask.name;
    const relatedTransactions = transactions.filter(t => t.taskId === taskId);

    if (shouldDeleteTransactions) {
        showTaskDeleteProgressModal(taskName, relatedTransactions.length);
    }

    try {
        rememberDeletedTaskCategory(currentEditingTask);

        if (shouldDeleteTransactions) {
            const relatedTxIds = relatedTransactions.map(t => t.id).filter(Boolean);
            transactions = transactions.filter(t => t.taskId !== taskId);
            recomputeBalanceAndDailyChanges();
            delete deletedTaskCategoryMap[String(taskId)];

            if (isLoggedIn() && relatedTxIds.length > 0) {
                const BATCH_SIZE = 20;
                for (let i = 0; i < relatedTxIds.length; i += BATCH_SIZE) {
                    const batch = relatedTxIds.slice(i, i + BATCH_SIZE);
                    await Promise.allSettled(batch.map(txId => DAL.deleteTransaction(txId)));
                }
            }
        } else if (currentEditingTask.category) {
            transactions.forEach(tx => {
                if (tx.taskId === taskId && !tx.category) {
                    tx.category = currentEditingTask.category;
                }
            });
        }

        // [v7.1.1] 同步删除到云端
        if (isLoggedIn()) {
            try {
                await DAL.deleteTask(taskId);
            } catch (err) {
                console.error('[deleteTask] DAL.deleteTask failed:', err.message);
            }
        }

        // [v7.1.4] 传统模式
        runningTasks.delete(taskId);
        tasks = tasks.filter(t => t.id !== taskId);
        
        // [v5.8.1] 旁听记录事件
        logEvent(EVENT_TYPES.TASK_DELETED, { taskId, taskName, deleteMode, removedTransactions: shouldDeleteTransactions ? relatedTransactions.length : 0 });
        
        saveData();
        updateAllUI();

        if (shouldDeleteTransactions) {
            showNotification('🗑️ 删除完成', `已删除任务及 ${relatedTransactions.length} 条历史记录`, 'achievement');
        } else {
            showNotification('🗑️ 删除完成', '已删除任务，历史记录将按原分类保留', 'info');
        }
        
        hideTaskModal();
    } catch (err) {
        console.error('[deleteTask] 删除任务失败:', err);
        showAlert(`删除失败：${err?.message || '未知错误'}`, '删除失败');
    } finally {
        if (shouldDeleteTransactions) {
            hideTaskDeleteProgressModal();
        }
    }
}
function updateFormForTaskType() { 
    const taskType = document.getElementById('taskType').value; 
    const earnTypes = ['reward', 'continuous', 'continuous_target']; 
    const isContinuous = ['continuous', 'continuous_target', 'continuous_redeem'].includes(taskType);
    const colorSelectorContainer = document.getElementById('colorSelectorContainer'); 
    const earnColorSelector = document.getElementById('earnColorSelector'); 
    const spendColorSelector = document.getElementById('spendColorSelector'); 
    const floatingTimerToggle = document.getElementById('floatingTimerToggleContainer');
    
    // 1. 隐藏所有特定类型设置组
    document.querySelectorAll('#taskForm .form-group[id$="Group"]').forEach(el => el.classList.add('hidden')); 
    if (floatingTimerToggle) floatingTimerToggle.classList.toggle('hidden', !isContinuous);
    
    // 2. 颜色选择器逻辑
    if (taskType) { 
        colorSelectorContainer.classList.remove('hidden'); 
        const isEarn = earnTypes.includes(taskType); 
        earnColorSelector.classList.toggle('hidden', !isEarn); 
        spendColorSelector.classList.toggle('hidden', isEarn); 
        renderColorSelectors(currentEditingTask ? categoryColors.get(currentEditingTask.category) : null); 
    } else { 
        colorSelectorContainer.classList.add('hidden'); 
    } 
    
    // 3. 习惯/戒除 开关逻辑
    const habitToggle = document.getElementById('habitToggleContainer'); 
    const canBeHabit = ['reward', 'continuous', 'continuous_target', 'instant_redeem', 'continuous_redeem'].includes(taskType);
    
    if (canBeHabit) { 
        habitToggle.classList.remove('hidden'); 
        
        // === [v4.8.6] 文案与布局动态切换的核心逻辑 ===
        const isSpendType = ['instant_redeem', 'continuous_redeem'].includes(taskType);
        
        // 获取 DOM 元素 (使用 ID，绝对安全)
        const toggleTitleText = document.getElementById('habitToggleTitleText');
        const toggleDesc = document.getElementById('habitToggleDesc');
        const settingsTitle = document.getElementById('habitSettingsTitle');
        const targetLabel = document.getElementById('targetCountLabel');
        const rewardsLabel = document.getElementById('habitRewardsLabel');
        
        // 获取需要隐藏/显示的容器
        const dailyLimitGroup = document.getElementById('habitDailyLimit')?.closest('.form-group');
        const planDurationGroup = document.getElementById('planDurationGroup');
        const planDurationLabel = document.getElementById('planDurationLabel');
        const planDurationInput = document.getElementById('habitPlanDuration');
        const targetCountInput = document.getElementById('targetCountInPeriod');
        
        // 获取当前周期
        const currentPeriod = document.getElementById('habitPeriod')?.value || 'daily';
        const periodUnitMap = { daily: '天数', weekly: '周数', monthly: '月数', yearly: '年数' };
        
        // [v7.24.0] 戒除模式选择器：仅消费任务显示
        const quotaModeGroup = document.getElementById('quotaModeGroup');
        if (quotaModeGroup) {
            quotaModeGroup.classList.toggle('hidden', !isSpendType);
            if (isSpendType) {
                // 如果当前未选择戒除模式，默认选"配额"
                const currentQM = document.getElementById('quotaMode')?.value;
                if (!currentQM || currentQM === '') selectQuotaMode('quota');
                // 动态倍率仅计时消费可用
                const dynBtn = quotaModeGroup.querySelector('[data-quota-mode="dynamic"]');
                if (dynBtn) {
                    dynBtn.disabled = taskType !== 'continuous_redeem';
                    dynBtn.style.opacity = taskType !== 'continuous_redeem' ? '0.4' : '1';
                }
            }
        }
        
        // [v7.24.0] 控制习惯说明按钮显示
        const quotaInfoBtn = document.getElementById('quotaModeInfoButton');
        const habitInfoBtn = document.getElementById('habitModeInfoButton');
        
        if (isSpendType) {
            // === 习惯戒除模式 ===
            if (toggleTitleText) toggleTitleText.textContent = '开启习惯戒除';
            if (settingsTitle) settingsTitle.textContent = '习惯戒除设置';
            if (targetLabel) {
                targetLabel.textContent = taskType === 'continuous_redeem' 
                    ? '周期时长额度*' 
                    : '周期次数额度*';
            }
            // 计时类用 placeholder 提示分钟单位
            if (targetCountInput) {
                targetCountInput.placeholder = taskType === 'continuous_redeem' ? '额度，分' : '额度，次';
            }
            // [v7.24.0] 习惯戒除不显示奖励和计划持续周期
            if (dailyLimitGroup) dailyLimitGroup.classList.add('hidden');
            if (planDurationGroup) planDurationGroup.classList.add('hidden');
            const rewardsGroup = document.getElementById('habitRewardsGroup');
            if (rewardsGroup) rewardsGroup.classList.add('hidden');
            // [v7.24.0] 显示习惯戒除说明按钮，隐藏习惯养成说明按钮
            if (quotaInfoBtn) quotaInfoBtn.classList.remove('hidden');
            if (habitInfoBtn) habitInfoBtn.classList.add('hidden');
        } else {
            // === 养成模式 ===
            if (toggleTitleText) toggleTitleText.textContent = '设置为习惯';
            if (settingsTitle) settingsTitle.textContent = '习惯设置';
            if (targetLabel) targetLabel.textContent = '周期目标次数 *';
            if (rewardsLabel) rewardsLabel.textContent = '习惯奖励 (可添加多个)';
            if (targetCountInput) targetCountInput.placeholder = '';
            // 恢复显示每日上限和奖励，隐藏计划持续周期
            if (dailyLimitGroup) dailyLimitGroup.classList.remove('hidden');
            if (planDurationGroup) planDurationGroup.classList.add('hidden');
            const rewardsGroupRestore = document.getElementById('habitRewardsGroup');
            if (rewardsGroupRestore) rewardsGroupRestore.classList.remove('hidden');
            // [v7.24.0] 隐藏习惯戒除说明按钮，显示习惯养成说明按钮
            if (quotaInfoBtn) quotaInfoBtn.classList.add('hidden');
            if (habitInfoBtn) habitInfoBtn.classList.remove('hidden');
        }
    } else { 
        habitToggle.classList.add('hidden'); 
        document.getElementById('isHabitToggle').checked = false; 
        toggleHabitSettings(false); 
    } 
    
    // 4. 显示特定类型的时间输入框
    switch (taskType) { 
        case 'reward': 
            document.getElementById('fixedTimeGroup').classList.remove('hidden'); 
            break; 
        case 'continuous': 
            document.getElementById('multiplierGroup').classList.remove('hidden'); 
            break; 
        case 'continuous_target': 
            ['multiplierGroup', 'targetTimeGroup', 'bonusRewardGroup'].forEach(id => document.getElementById(id).classList.remove('hidden')); 
            break; 
        case 'instant_redeem': 
            document.getElementById('consumeTimeGroup').classList.remove('hidden'); 
            break; 
        case 'continuous_redeem': 
            document.getElementById('multiplierGroup').classList.remove('hidden'); 
            break; 
    } 
    
    // 5. 动态修改时间倍率标签
    const multiplierLabel = document.querySelector('#multiplierGroup .form-label');
    if (multiplierLabel) {
        if (taskType === 'continuous_redeem') {
            multiplierLabel.textContent = '消耗倍率 *';
        } else {
            multiplierLabel.textContent = '获得倍率 *';
        }
    }
    
    updateCategoryRecommendations(taskType);
    // [v7.25.6] 恢复备注输入框状态（上面的 *Group 全隐藏会误伤它）
    const noteToggleState = document.getElementById('isTaskNoteToggle');
    if (noteToggleState && noteToggleState.checked) {
        document.getElementById('taskNoteInputGroup').classList.remove('hidden');
    }
}
// [v7.24.0] 任务备注开关切换
function toggleTaskNoteInput(forceState) {
    const isEnabled = typeof forceState === 'boolean' ? forceState : document.getElementById('isTaskNoteToggle').checked;
    document.getElementById('taskNoteInputGroup').classList.toggle('hidden', !isEnabled);
    if (!isEnabled) {
        document.getElementById('taskNote').value = '';
        const noteEl = document.getElementById('taskNote');
        if (noteEl) { noteEl.style.height = 'auto'; }
    }
}

function toggleHabitSettings(forceState) { 
    const isHabit = typeof forceState === 'boolean' ? forceState : document.getElementById('isHabitToggle').checked; 
    document.getElementById('habitSettingsGroup').classList.toggle('hidden', !isHabit); 
    document.getElementById('habitSettingsGroup').style.marginBottom = isHabit ? '24px' : '0';
    const fixedTimeLabel = document.getElementById('fixedTimeLabel'); 
    if(fixedTimeLabel) fixedTimeLabel.textContent = isHabit ? '基础奖励 (分) *' : '奖励时间 (分) *'; 
    toggleRecurringReminderVisibility(); 
}
function toggleReminderSettings(forceState) { 
    const isReminder = typeof forceState === 'boolean' ? forceState : document.getElementById('isReminderToggle').checked; 
    document.getElementById('reminderSettingsGroup').classList.toggle('hidden', !isReminder); 
    toggleRecurringReminderVisibility(); 
}
function toggleRecurringReminderVisibility() {
    const container = document.getElementById('recurringReminderToggleContainer');
    const isHabit = document.getElementById('isHabitToggle').checked;
    const isReminder = document.getElementById('isReminderToggle').checked;
    const isAbsoluteMode = document.querySelector('#reminderModeSwitch .active').dataset.mode === 'absolute';
    
    const show = isHabit && isReminder && isAbsoluteMode;
    container.classList.toggle('hidden', !show);
    if (!show) {
        document.getElementById('isRecurringReminderToggle').checked = false;
    }
}

// [v6.4.0] 任务类型弹窗控制函数
function showTaskTypeModal() {
    const currentValue = document.getElementById('taskType').value;
    // 更新选中状态
    document.querySelectorAll('#taskTypeModal .task-type-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === currentValue);
    });
    document.getElementById('taskTypeModal').classList.add('show');
}

// [v6.5.0] 习惯周期滑块切换（替代下拉框）
function selectHabitPeriod(periodValue) {
    const periodInput = document.getElementById('habitPeriod');
    if (periodInput) periodInput.value = periodValue;
    document.querySelectorAll('.habit-period-switch button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === periodValue);
    });
    

}

// [v7.24.0] 戒除模式选择
function selectQuotaMode(mode) {
    const input = document.getElementById('quotaMode');
    if (input) input.value = mode;
    document.querySelectorAll('#quotaModeGroup .habit-period-switch button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.quotaMode === mode);
    });
    const desc = document.getElementById('quotaModeDesc');
    const taskType = document.getElementById('taskType')?.value;
    if (desc) {
        if (mode === 'quota') {
            desc.textContent = '额度内50%消耗，超出200%消耗';
        } else if (mode === 'dynamic') {
            if (taskType === 'continuous_redeem') {
                desc.textContent = '超出配额后，倍率随使用时长指数增长';
            } else {
                desc.textContent = '动态倍率仅适用于计时消费任务';
            }
        } else {
            desc.textContent = '不使用额度机制，按原始倍率消耗';
        }
    }
    // 动态倍率仅限计时消费，按次消费强制回退到额度模式
    if (mode === 'dynamic' && taskType === 'instant_redeem') {
        selectQuotaMode('quota');
        return;
    }
}

// [v7.24.1] 解析 yyyy-mm-dd 为本地零点时间
function parseLocalDateKey(dateKey) {
    if (!dateKey || typeof dateKey !== 'string') return null;
    const parts = dateKey.split('-').map(Number);
    if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

// [v7.24.1] 交易是否属于某个习惯周期（支持 autoDetectData.originalDate 对齐）
function isTransactionInHabitPeriod(transaction, periodStart, periodEnd) {
    if (!transaction || !periodStart || !periodEnd) return false;

    const startMs = periodStart.getTime();
    const endMs = periodEnd.getTime();
    const txMs = new Date(transaction.timestamp).getTime();
    if (txMs >= startMs && txMs < endMs) return true;

    const originalDate = transaction.autoDetectData?.originalDate;
    if (transaction.isAutoDetected && originalDate) {
        const originalDateStart = parseLocalDateKey(originalDate);
        if (originalDateStart) {
            const originalMs = originalDateStart.getTime();
            if (originalMs >= startMs && originalMs < endMs) return true;
        }
    }
    return false;
}

// [v7.24.1] 提取交易对应的“原始使用秒数”（不含倍率与惩罚）
function getRawUsageSecondsFromTransaction(transaction) {
    if (!transaction) return 0;
    if (typeof transaction.rawSeconds === 'number' && transaction.rawSeconds > 0) {
        return transaction.rawSeconds;
    }

    const ad = transaction.autoDetectData;
    if (ad) {
        if (typeof ad.makeupSecondsRaw === 'number' && ad.makeupSecondsRaw > 0) return ad.makeupSecondsRaw;
        if (typeof ad.correctionSecondsRaw === 'number' && ad.correctionSecondsRaw > 0) return ad.correctionSecondsRaw;
        if (typeof ad.makeupMinutes === 'number' && ad.makeupMinutes > 0) return ad.makeupMinutes * 60;
        if (typeof ad.correctionMinutes === 'number' && ad.correctionMinutes > 0) return ad.correctionMinutes * 60;
        if (typeof ad.actualMinutes === 'number' && ad.actualMinutes > 0) return ad.actualMinutes * 60;
    }

    const parsed = parseTimeFromDescription(transaction.description);
    if (typeof parsed === 'number' && parsed > 0) return parsed;

    return Math.max(0, Math.round(Math.abs(transaction.amount || 0)));
}

// [v7.24.1] 由原始时长估算按次消费次数（用于自动修正回冲）
function estimateUsageCountFromSeconds(task, rawSeconds) {
    const baseCost = Math.max(1, Math.round(task?.consumeTime || 60));
    const safeSeconds = Math.max(0, Math.round(rawSeconds || 0));
    return Math.max(1, Math.round(safeSeconds / baseCost));
}

// [v7.24.1] 获取任务在指定周期的净使用量（秒/次数，已回冲自动修正）
function getQuotaPeriodUsage(task, referenceDate = new Date()) {
    if (!task?.isHabit || !task?.habitDetails) return 0;

    const { periodStart, periodEnd } = getHabitPeriodInfo(task, transactions, referenceDate);
    const periodTxs = transactions.filter(t => {
        if (t.taskId !== task.id) return false;
        if (t.undone) return false;
        return isTransactionInHabitPeriod(t, periodStart, periodEnd);
    });

    const spendTxs = periodTxs.filter(t => (t.type || (t.amount > 0 ? 'earn' : 'spend')) === 'spend');
    const correctionTxs = periodTxs.filter(t =>
        t.isAutoDetected &&
        t.autoDetectType === 'correction' &&
        (t.type || (t.amount > 0 ? 'earn' : 'spend')) === 'earn'
    );

    if (task.type === 'continuous_redeem') {
        const spentSeconds = spendTxs.reduce((sum, t) => sum + getRawUsageSecondsFromTransaction(t), 0);
        const correctionSeconds = correctionTxs.reduce((sum, t) => sum + getRawUsageSecondsFromTransaction(t), 0);
        return Math.max(0, spentSeconds - correctionSeconds);
    }

    const spentCount = spendTxs.length;
    const correctionCount = correctionTxs.reduce((sum, t) => {
        const rawCount = t.autoDetectData?.correctionCount;
        if (typeof rawCount === 'number' && rawCount > 0) {
            return sum + Math.max(1, Math.round(rawCount));
        }
        return sum + estimateUsageCountFromSeconds(task, getRawUsageSecondsFromTransaction(t));
    }, 0);
    return Math.max(0, spentCount - correctionCount);
}

// [v7.24.0] 模式A - 戒除额度模式计算（计时消费任务）
// quotaSeconds: 周期额度（秒），usedSeconds: 已用（秒），rawSeconds: 本次原始时长（秒），multiplier: 任务倍率
// 返回: 最终扣除的秒数
function calculateQuotaSpendTimed(quotaSeconds, usedSeconds, rawSeconds, multiplier) {
    const remaining = Math.max(0, quotaSeconds - usedSeconds);
    if (rawSeconds <= remaining) {
        // 全部在额度内：50%
        return Math.floor(rawSeconds * multiplier * 0.5);
    } else {
        // 分段：额度内50% + 超出200%
        const withinQuota = remaining;
        const overQuota = rawSeconds - remaining;
        return Math.floor(withinQuota * multiplier * 0.5 + overQuota * multiplier * 2.0);
    }
}

// [v7.24.0] 模式A - 戒除额度模式计算（按次消费任务）
// quotaCount: 周期额度（次），usedCount: 已用（次），baseCost: 单次消耗秒数
// 返回: 最终扣除的秒数
function calculateQuotaSpendInstant(quotaCount, usedCount, baseCost) {
    if (usedCount < quotaCount) {
        // 在额度内：50%
        return Math.floor(baseCost * 0.5);
    } else {
        // 超出额度：200%
        return Math.floor(baseCost * 2.0);
    }
}

// [v7.24.0] 模式B - 动态倍率计算（仅计时消费任务）
// 动态倍率 = (累计使用时长 / 额度)²
// 使用积分确保连续性：∫[a,b] (x/Q)² dx = (b³-a³)/(3Q²)
// 最终消耗 = multiplier × ∫[usedSeconds, usedSeconds+rawSeconds] (x/Q)² dx
function calculateDynamicMultiplierSpend(quotaSeconds, usedSeconds, rawSeconds, multiplier) {
    if (quotaSeconds <= 0) return Math.floor(rawSeconds * multiplier); // 无额度退化为原始
    const Q = quotaSeconds;
    const a = usedSeconds;
    const b = usedSeconds + rawSeconds;
    // ∫[a,b] (x/Q)² dx = (b³ - a³) / (3 × Q²)
    const integral = (Math.pow(b, 3) - Math.pow(a, 3)) / (3 * Math.pow(Q, 2));
    // 设定最低消耗：即使积分值很小，至少以 10% 基础倍率计费
    const minSpend = rawSeconds * multiplier * 0.1;
    return Math.max(Math.floor(multiplier * integral), Math.floor(minSpend));
}

function hideTaskTypeModal() {
    document.getElementById('taskTypeModal').classList.remove('show');
}

function selectTaskType(optionEl) {
    const value = optionEl.dataset.value;
    const nameEl = optionEl.querySelector('.task-type-option-name');
    const name = nameEl ? nameEl.textContent : value;
    
    // 更新隐藏字段和触发器
    document.getElementById('taskType').value = value;
    document.getElementById('taskTypeTrigger').textContent = name;
    
    // 更新选中状态
    document.querySelectorAll('#taskTypeModal .task-type-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    optionEl.classList.add('selected');
    
    // 关闭弹窗
    hideTaskTypeModal();
    
    // 触发表单更新
    updateFormForTaskType();

}

// [v5.2.1] 开启关联应用时申请使用情况访问权限
async function toggleAppLauncherSettings(forceState) {
    const toggle = document.getElementById('isAppLauncherToggle');
    const isOn = typeof forceState === 'boolean' ? forceState : toggle.checked;
    const group = document.getElementById('appLauncherSettingsGroup');
    
    // 仅在用户手动开启时检查权限（forceState 为布尔值时是程序调用，跳过权限检查）
    if (isOn && typeof forceState !== 'boolean') {
        // 检查权限
        if (typeof Android !== 'undefined' && Android.hasUsageStatsPermission) {
            if (!Android.hasUsageStatsPermission()) {
                // 显示权限引导
                const confirmed = await showConfirm(
                    '关联应用功能需要"使用情况访问权限"来检测应用使用状态。\n\n' +
                    '点击"确定"后，请在列表中找到"时间银行"并开启权限，然后返回应用。',
                    '需要权限'
                );
                
                if (confirmed) {
                    Android.openUsageAccessSettings();
                }
                toggle.checked = false;
                return;
            }
        }

    }
    
    if (group) group.classList.toggle('hidden', !isOn);
}

// [v5.3.0] 开启自动检测补录时，自动开启屏幕时间管理
// [v5.5.2] 增强权限检查，无论屏幕时间管理是否开启都要检查权限
async function toggleAutoDetect() {
    const toggle = document.getElementById('isAutoDetectToggle');
    if (toggle.checked) {
        // [v5.5.2] 首先检查权限（无论屏幕时间管理是否开启）
        if (typeof Android !== 'undefined' && Android.hasUsageStatsPermission) {
            if (!Android.hasUsageStatsPermission()) {
                // 未授权：显示引导并跳转授权页面
                const confirmed = await showConfirm(
                    '自动检测补录功能需要"使用情况访问权限"来检测应用使用时长。\n\n' +
                    '点击"确定"后，请在列表中找到"时间银行"并开启权限，然后返回应用。',
                    '需要权限'
                );
                
                if (confirmed && typeof Android !== 'undefined' && Android.openUsageAccessSettings) {
                    Android.openUsageAccessSettings();
                }
                toggle.checked = false;
                return;
            }
        }
        
        // 检查屏幕时间管理是否已开启
        if (!screenTimeSettings.enabled) {
            const confirmed = await showConfirm(
                '自动检测补录功能需要开启"屏幕时间管理"。\n\n是否立即开启？',
                '需要开启屏幕时间管理'
            );
            
            if (confirmed) {
                // 开启屏幕时间管理
                screenTimeSettings.enabled = true;
                if (!screenTimeSettings.enabledDate) {
                    screenTimeSettings.enabledDate = getLocalDateString(new Date());
                }
                if (!screenTimeSettings.settledDates) {
                    screenTimeSettings.settledDates = {};
                }
                saveScreenTimeSettings();
                updateScreenTimeCardVisibility();
                // 更新设置页面的开关状态（如果存在）
                const screenTimeToggle = document.getElementById('screenTimeToggle');
                if (screenTimeToggle) {
                    screenTimeToggle.checked = true;
                    document.getElementById('screenTimeSettings').classList.remove('hidden');
                    document.getElementById('screenTimeStatus').textContent = '已启用';
                }
                showToast('已开启屏幕时间管理');
            } else {
                toggle.checked = false;
            }
        }
    }
}

function switchReminderMode(mode) { 
    document.getElementById('reminderAbsoluteMode').classList.toggle('hidden', mode !== 'absolute'); 
    document.getElementById('reminderRelativeMode').classList.toggle('hidden', mode !== 'relative'); 
    document.querySelectorAll('#reminderModeSwitch button').forEach(btn => { btn.classList.toggle('active', btn.dataset.mode === mode); }); 
    toggleRecurringReminderVisibility(); 
}
// [v6.4.0] 自定义下拉菜单控制函数
function toggleDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    const isShowing = dropdown.classList.contains('show');
    // 先关闭所有其他下拉菜单
    document.querySelectorAll('.dropdown-menu.show').forEach(d => d.classList.remove('show'));
    // 切换当前下拉菜单
    if (!isShowing) {
        dropdown.classList.add('show');
    }
}

function selectDropdownItem(item, hiddenInputId, triggerId, dropdownId) {
    const value = item.dataset.value;
    const text = item.textContent;
    // 更新隐藏字段
    document.getElementById(hiddenInputId).value = value;
    // 更新触发器显示文本
    document.getElementById(triggerId).textContent = text;
    // 更新选中状态
    item.closest('.dropdown-menu').querySelectorAll('.dropdown-menu-item').forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');
    // 关闭下拉菜单
    document.getElementById(dropdownId).classList.remove('show');
}

// 点击外部关闭下拉菜单
document.addEventListener('click', function(e) {
    if (!e.target.closest('.custom-select-wrapper')) {
        document.querySelectorAll('.dropdown-menu.show').forEach(d => d.classList.remove('show'));
    }
});

// [v4.8.2] 重写：单位改为"分"，支持递增上限设定
function addHabitRewardRule(rule = null) {
    const container = document.getElementById('habitRewardsContainer');
    const card = document.createElement('div');
    card.className = 'habit-reward-card';
    
    // [v6.4.0] 确保 type 始终有有效值
    const type = (rule && rule.type && (rule.type === 'fixed' || rule.type === 'incremental')) ? rule.type : 'fixed';
    const start = rule ? rule.start : 1;
    // [v4.8.2] 数据转换：如果是旧数据(秒)，显示时转为分。这里假设传入的rule.value已经是秒，需转分。
    // 新建时 rule 为 null，value 为 ''。
    let displayValue = '';
    if (rule && rule.value) displayValue = parseFloat((rule.value / 60).toFixed(2));
    
    // 上限处理
    const limit = (rule && rule.limit) ? parseFloat((rule.limit / 60).toFixed(2)) : '';
    const hasLimit = !!limit;
    
    card.innerHTML = `
        <div style="margin-bottom: 10px;">
            <label class="form-label-small">奖励模式</label>
            <div class="mode-switch reward-type-switch" style="margin-top: 4px;">
                <button type="button" class="${type === 'fixed' ? 'active' : ''}" data-value="fixed" onclick="switchRewardType(this)">固定奖励</button>
                <button type="button" class="${type === 'incremental' ? 'active' : ''}" data-value="incremental" onclick="switchRewardType(this)">递增奖励</button>
            </div>
            <input type="hidden" class="reward-type" value="${type}">
        </div>
        <div class="reward-grid-row">
            <div>
                <label class="form-label-small">🚪 生效门槛</label>
                <div class="input-with-suffix">
                    <input type="number" class="form-input reward-start" value="${start}" min="1" oninput="updateRewardCardDesc(this)">
                    <span class="input-suffix-text">期</span>
                </div>
            </div>
            <div>
                <label class="form-label-small">⭐ 奖励时长</label>
                <div class="input-with-suffix">
                    <input type="number" class="form-input reward-value" placeholder="0" value="${displayValue}" oninput="updateRewardCardDesc(this)">
                    <span class="input-suffix-text">分</span>
                </div>
            </div>
        </div>
        <div class="reward-limit-container ${type === 'fixed' ? 'hidden' : ''}" style="margin-top: 8px; background: rgba(0,0,0,0.03); padding: 8px; border-radius: 4px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                <label class="form-label-small" style="margin:0;">📈 设定递增上限</label>
                <label class="switch" style="transform: scale(0.8);">
                    <input type="checkbox" class="reward-limit-toggle" ${hasLimit ? 'checked' : ''} onchange="toggleRewardLimitInput(this)">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="limit-input-wrapper ${hasLimit ? '' : 'hidden'}">
                <div class="input-with-suffix">
                    <input type="number" class="form-input reward-limit-value" placeholder="封顶时长" value="${limit}">
                    <span class="input-suffix-text">分</span>
                </div>
            </div>
        </div>
        <div class="reward-card-footer">
            <span class="reward-desc-text"></span>
            <button type="button" class="btn-text-danger" onclick="this.closest('.habit-reward-card').remove()">
                删除
            </button>
        </div>
    `;
    
    container.appendChild(card);
    
    // 初始化描述文本
    updateRewardCardDesc(card.querySelector('.reward-type'));
}

// [v6.4.0] 奖励模式滑块切换
function switchRewardType(btn) {
    const card = btn.closest('.habit-reward-card');
    const switchContainer = btn.closest('.reward-type-switch');
    const hiddenInput = card.querySelector('input.reward-type');
    const value = btn.dataset.value;
    
    // 更新按钮状态
    switchContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // 更新隐藏字段值
    hiddenInput.value = value;
    
    // 控制上限容器显示
    const limitContainer = card.querySelector('.reward-limit-container');
    if (value === 'incremental') {
        limitContainer.classList.remove('hidden');
    } else {
        limitContainer.classList.add('hidden');
    }
    
    // 更新描述
    updateRewardCardDesc(hiddenInput);
}

// [v4.8.2] 新增辅助函数：控制上限输入框显示（兼容旧调用）
function toggleRewardLimit(element) {
    const card = element.closest('.habit-reward-card');
    const limitContainer = card.querySelector('.reward-limit-container');
    const type = card.querySelector('.reward-type').value;
    if (type === 'incremental') {
        limitContainer.classList.remove('hidden');
    } else {
        limitContainer.classList.add('hidden');
    }
    updateRewardCardDesc(element);
}

function toggleRewardLimitInput(checkbox) {
    const wrapper = checkbox.closest('.reward-limit-container').querySelector('.limit-input-wrapper');
    if (checkbox.checked) wrapper.classList.remove('hidden');
    else wrapper.classList.add('hidden');
}

// [v4.8.2] 重写：单位改为"分"
function updateRewardCardDesc(element) {
    const card = element.closest('.habit-reward-card');
    if (!card) return;
    const type = card.querySelector('.reward-type').value;
    const start = card.querySelector('.reward-start').value || 'N';
    const value = card.querySelector('.reward-value').value || 'X';
    const descEl = card.querySelector('.reward-desc-text');
    
    if (type === 'fixed') {
        descEl.textContent = `第 ${start} 期起获得 ${value} 分`;
    } else {
        descEl.textContent = `第 ${start} 期起获得 期数 × ${value} 分`;
    }
}
function setTimePreset(fieldId, seconds) { document.getElementById(fieldId).value = seconds; }
function setMultiplierPreset(value) { document.getElementById('multiplier').value = value; }

// [v3.18.0] Updated saveTask to include targetCountInPeriod
async function saveTask(event) {
    event.preventDefault();
    clearFormErrors();
    let shouldRemindFloatingPermission = false;
    
    const formData = {
        name: document.getElementById('taskName').value.trim(),
        category: document.getElementById('taskCategory').value.trim(),
        type: document.getElementById('taskType').value,
        isHabit: document.getElementById('isHabitToggle').checked,
        enableFloatingTimer: document.getElementById('isFloatingTimerToggle').checked,
        note: (document.getElementById('taskNote')?.value || '').trim(),
    };

    const enableAppLaunch = document.getElementById('isAppLauncherToggle')?.checked || false;
    const appInputRaw = (document.getElementById('taskAppPackage')?.value || '').trim();
    if (enableAppLaunch && appInputRaw) {
        // [v5.2.0] 使用新的 resolveAppPackage 支持动态应用列表
        formData.appPackage = resolveAppPackage(appInputRaw);
        // [v5.3.0] 自动检测补录开关
        formData.autoDetect = document.getElementById('isAutoDetectToggle')?.checked || false;
    } else {
        formData.appPackage = null;
        formData.autoDetect = false;
    }

    let hasError = !formData.name || !formData.category || !formData.type;
    if (!formData.name) showFieldError('taskName', '请输入任务名称');
    if (!formData.category) showFieldError('taskCategory', '请输入任务分类');
    if (!formData.type) showFieldError('taskType', '请选择任务类型');
    
    // [v4.8.2] parseAndValidate允许浮点数，用于分钟单位
    const parseAndValidate = (id, fieldName, isFloat = false) => { const input = document.getElementById(id); const value = isFloat ? parseFloat(input.value) : parseInt(input.value); if (isNaN(value) || value <= 0) { showFieldError(id, `请输入有效的${fieldName}`); hasError = true; } return value; };
    const parseAndValidateOptional = (id, fieldName, isFloat = false) => { const input = document.getElementById(id); if (!input.value) return 0; const value = isFloat ? parseFloat(input.value) : parseInt(input.value); if (isNaN(value) || value < 0) { showFieldError(id, `请输入有效的${fieldName}`); hasError = true; } return value; }
    const getMultiplierOrDefault = () => { const input = document.getElementById('multiplier'); if (!input) return 1; const value = parseFloat(input.value); if (isNaN(value) || value <= 0) { return 1; } return value; };
    
    // [v4.8.2] 保存时将分钟乘以60转换为秒
    switch (formData.type) { case 'reward': formData.fixedTime = Math.round(parseAndValidate('fixedTime', '奖励时间', true) * 60); break; case 'instant_redeem': formData.consumeTime = Math.round(parseAndValidate('consumeTime', '消费时间', true) * 60); break; case 'continuous': case 'continuous_redeem': formData.multiplier = getMultiplierOrDefault(); break; case 'continuous_target': formData.multiplier = getMultiplierOrDefault(); formData.targetTime = Math.round(parseAndValidate('targetTime', '目标时长', true) * 60); formData.bonusReward = Math.round(parseAndValidateOptional('bonusReward', '额外奖励', true) * 60); break; }
    
    if (formData.isHabit) {
        // [v3.18.0] New field: targetCountInPeriod
        const targetCountInPeriod = parseInt(document.getElementById('targetCountInPeriod').value);
        const dailyLimit = parseInt(document.getElementById('habitDailyLimit').value);
        
        // [v3.18.0] Validation
        if (isNaN(targetCountInPeriod) || targetCountInPeriod < 1) {
            // [v4.0.2] Fix: Use correct ID for error
            showFieldError('targetCountInPeriod', '周期目标次数必须大于等于1');
            hasError = true;
        }
        
        formData.habitDetails = { 
            period: document.getElementById('habitPeriod').value, 
            // [v3.18.0] Save new field
            targetCountInPeriod: isNaN(targetCountInPeriod) || targetCountInPeriod < 1 ? 1 : targetCountInPeriod,
            dailyLimit: isNaN(dailyLimit) || dailyLimit < 1 ? null : dailyLimit, // [v7.1.0] null = 无限制
            // [v4.9.0] Mark habit type: 'positive' for earning tasks, 'abstinence' for spending tasks
            type: ['instant_redeem', 'continuous_redeem'].includes(formData.type) ? 'abstinence' : 'positive',
            // [v7.24.0] 习惯戒除配额模式
            quotaMode: ['instant_redeem', 'continuous_redeem'].includes(formData.type) ? (document.getElementById('quotaMode')?.value || 'none') : undefined,
            // [v4.9.0] Initialize lastSettledDate to prevent duplicate reward settlement
            lastSettledDate: currentEditingTask?.habitDetails?.lastSettledDate || null,
            rewards: [] 
        };
        
        // [v7.24.0] 保留已有的 planDuration（向后兼容），不再从表单读取
        if (['instant_redeem', 'continuous_redeem'].includes(formData.type) && currentEditingTask?.habitDetails?.planDuration) {
            formData.habitDetails.planDuration = currentEditingTask.habitDetails.planDuration;
            formData.habitDetails.planStartDate = currentEditingTask.habitDetails.planStartDate;
        }
        // [v4.8.2] 习惯奖励：将分钟乘以60转换为秒，支持上限设定
        document.querySelectorAll('.habit-reward-card').forEach(ruleEl => { 
            const type = ruleEl.querySelector('.reward-type').value; 
            const start = parseInt(ruleEl.querySelector('.reward-start').value); 
            const valueInMinutes = parseFloat(ruleEl.querySelector('.reward-value').value); 
            const value = Math.round(valueInMinutes * 60); 
            
            // 处理上限
            let limit = null;
            if (type === 'incremental') {
                const limitToggle = ruleEl.querySelector('.reward-limit-toggle');
                if (limitToggle && limitToggle.checked) {
                    const limitInput = ruleEl.querySelector('.reward-limit-value');
                    if (limitInput && limitInput.value) {
                        limit = Math.round(parseFloat(limitInput.value) * 60);
                    }
                }
            }
            
            if (!isNaN(start) && start > 0 && !isNaN(value) && value > 0) { 
                const rule = { type, start, value };
                if (limit !== null) rule.limit = limit;
                formData.habitDetails.rewards.push(rule); 
            } else { 
                showAlert('习惯奖励规则填写不完整或无效'); 
                hasError = true; 
            } 
        });
    }

    if (document.getElementById('isReminderToggle').checked) {
        const mode = document.querySelector('#reminderModeSwitch .active').dataset.mode;
        let timeValue;
        let isRecurring = false; 
        
        if (mode === 'absolute') {
            timeValue = document.getElementById('reminderDateTime').value;
            if (!timeValue || new Date(timeValue) <= new Date()) {
                showAlert('提醒时间必须是未来的一个时间点'); hasError = true;
            }
            isRecurring = document.getElementById('isRecurringReminderToggle').checked; 
        } else { // relative
            const hours = parseInt(document.getElementById('reminderHours').value || '0');
            const minutes = parseInt(document.getElementById('reminderMinutes').value || '0');
            timeValue = (hours * 3600) + (minutes * 60);
            if (timeValue <= 0) {
                showAlert('倒计时时长必须大于0'); hasError = true;
            }
        }
        if (!hasError) {
            formData.reminderDetails = {
                mode: mode,
                time: mode === 'absolute' ? timeValue : timeValue,
                isRecurring: isRecurring, 
                creationTimestamp: mode === 'relative' ? Date.now() : null,
                status: 'pending'
            };
        }
    } else {
        formData.reminderDetails = null;
    }

    if (hasError) return;
    
    let colorToSet = currentSelectedColor; if (currentEditingTask) { const oldCategory = currentEditingTask.category; if (oldCategory !== formData.category) { if (categoryColors.has(formData.category)) { colorToSet = categoryColors.get(formData.category); } else if (!colorToSet) { colorToSet = getRandomAvailableColor(formData.type); } const oldCategoryInUse = tasks.some(t => t.id !== currentEditingTask.id && t.category === oldCategory); if (!oldCategoryInUse) categoryColors.delete(oldCategory); } } else { if (categoryColors.has(formData.category)) { colorToSet = categoryColors.get(formData.category); } else if (!colorToSet) { colorToSet = getRandomAvailableColor(formData.type); } }
    categoryColors.set(formData.category, colorToSet); 
    
    if (currentEditingTask) { 
        // 保存旧名称以便在需要时更新历史记录
        const _oldTaskName = currentEditingTask.name;
        const renameChanged = formData.name && formData.name !== _oldTaskName;

        if (renameChanged) {
            const doMerge = await showConfirm('检测到任务名称变更。点击【确定】将同步修改所有历史记录；点击【取消】将放弃保存并返回。', '任务名称变更');
            if (!doMerge) {
                // 取消：不保存，保持在编辑界面
                return;
            }
        }

        if (currentEditingTask.isHabit && !formData.isHabit) delete currentEditingTask.habitDetails; 
        else if (!currentEditingTask.isHabit && formData.isHabit) { 
            formData.habitDetails.streak = 0; 
            formData.habitDetails.lastCompletionDate = null; 
            formData.habitDetails.isBroken = false; // [v4.0.3] Init property
        } 
        else if (currentEditingTask.isHabit && formData.isHabit) { 
            // [v7.3.4] 检测周期是否变更，变更则重置连胜和结算状态
            const oldPeriod = currentEditingTask.habitDetails?.period;
            const newPeriod = formData.habitDetails.period;
            if (oldPeriod && oldPeriod !== newPeriod) {
                // 周期变更：重置状态，避免错误的连胜计算
                formData.habitDetails.streak = 0;
                formData.habitDetails.lastSettledDate = null;
                formData.habitDetails.lastCompletionDate = null;
                formData.habitDetails.isBroken = false;
                console.log(`[saveTask] Period changed from ${oldPeriod} to ${newPeriod}, resetting streak/settlement`);
            } else {
                formData.habitDetails.streak = currentEditingTask.habitDetails.streak; 
                formData.habitDetails.lastCompletionDate = currentEditingTask.habitDetails.lastCompletionDate; 
                formData.habitDetails.isBroken = currentEditingTask.habitDetails.isBroken || false; // [v4.0.3] Preserve property
            }
        } 
        
        // [v5.9.0] Phase 4: 记录变更前后的差异
        const changes = {};
        Object.keys(formData).forEach(key => {
            if (JSON.stringify(currentEditingTask[key]) !== JSON.stringify(formData[key])) {
                changes[key] = { from: currentEditingTask[key], to: formData[key] };
            }
        });
        
        Object.assign(currentEditingTask, formData); 

        // 如果任务名称发生变化且已确认，遍历历史记录同步名称
        if (renameChanged) {
            try {
                transactions.forEach(tx => {
                    if (tx.taskId === currentEditingTask.id) {
                        tx.taskName = formData.name;
                        if (tx.description && typeof tx.description === 'string') {
                            tx.description = tx.description.split(_oldTaskName).join(formData.name);
                        }
                    }
                });
            } catch (e) {
                console.error('Rename merge failed', e);
            }
            // [v7.26.2] 批量同步 taskName 到云端，防止 Watch 重新覆盖旧名称
            if (isLoggedIn()) {
                DAL.renameTransactionTaskName(currentEditingTask.id, formData.name).catch(e =>
                    console.error('[rename] 云端 taskName 同步失败:', e.message)
                );
            }
        }
        
        // [v7.1.4] 旁听记录任务更新事件
        logEvent(EVENT_TYPES.TASK_UPDATED, {
            taskId: currentEditingTask.id,
            taskName: currentEditingTask.name,
            changes: changes,
            renamed: renameChanged ? { from: _oldTaskName, to: formData.name } : null
        });
    } else { 
        const newTask = { id: generateId(), ...formData, completionCount: 0, lastUsed: 0 }; 
        if (newTask.isHabit) { 
            newTask.habitDetails.streak = 0; 
            newTask.habitDetails.lastCompletionDate = null; 
            newTask.habitDetails.isBroken = false; // [v4.0.3] Init property
        } 
        
        // [v7.1.4] 传统模式创建任务
        tasks.push(newTask);
        
        // [v5.8.1] 旁听记录任务创建事件
        logEvent(EVENT_TYPES.TASK_CREATED, {
            taskId: newTask.id,
            task: newTask
        });
        
        if (newTask.enableFloatingTimer && notificationSettings.floatingTimer !== false && !notificationSettings.floatingTimerPermissionPrompted && window.Android && window.Android.startFloatingTimer) {
            notificationSettings.floatingTimerPermissionPrompted = true;
            shouldRemindFloatingPermission = true;
        }
        maybeCleanupDemoDataOnFirstUse();
        
        // [v7.1.1] 新任务同步到云端
        if (isLoggedIn()) {
            DAL.saveTask(newTask).catch(err => console.error('[saveTask] 新任务云端同步失败:', err.message));
        }
    }
    
    // [v7.1.1] 编辑任务同步到云端
    if (currentEditingTask && isLoggedIn()) {
        DAL.saveTask(currentEditingTask).catch(err => console.error('[saveTask] 任务编辑云端同步失败:', err.message));
    }
    
    saveData(); updateAllUI(); hideTaskModal(); 
    if (shouldRemindFloatingPermission) {
        showAlert('首次使用悬浮窗计时器需要系统悬浮窗权限，请在系统设置中为本应用开启悬浮窗/画中画权限后再试。');
    }
}

// [v4.8.5 Fix] 全周期戒除习惯结算核心函数 (修复奖励发放逻辑)
// [v7.8.0] 返回结算结果用于启动报告
function checkAbstinenceHabits() {
    // [v7.29.2] 防护：云端数据未加载完成时跳过，避免在旧/空数据上误判并锁定已结算周期
    // [v7.30.1] 增强：同时检查写入门禁状态，防止在门禁激活时误结算
    if ((!hasCompletedFirstCloudSync || cloudSyncWriteLock) && isLoggedIn()) {
        console.warn('[checkAbstinenceHabits] 云端数据未就绪或门禁激活，跳过本次检查');
        return [];
    }
    
    // [v7.30.1] 防止频繁调用：增加执行间隔控制（5 分钟内只运行一次）
    const LAST_AUTODETECT_KEY = 'tb_lastAbstinenceCheck';
    const lastCheck = parseInt(localStorage.getItem(LAST_AUTODETECT_KEY) || '0');
    const now = Date.now();
    if (now - lastCheck < 5 * 60 * 1000) {
        console.log('[checkAbstinenceHabits] 5 分钟内已运行过，跳过预补录');
        return [];
    }
    localStorage.setItem(LAST_AUTODETECT_KEY, now);
    
    const nowDate = new Date();
    let hasUpdates = false; // 标记是否有数据变更
    const abstinenceResults = []; // [v7.8.0] 收集结算结果
    
    // [v7.2.3] 预处理：为所有戒除类习惯任务先运行自动补录
    // 确保在判定成功/失败之前，所有自动补录记录已创建
    const abstinenceTasks = tasks.filter(t => 
        t.isHabit && t.habitDetails && t.habitDetails.type === 'abstinence' &&
        t.appPackage && t.autoDetect
    );
    if (abstinenceTasks.length > 0 && typeof Android !== 'undefined' && Android.getAppScreenTimeForDate) {
        console.log('[checkAbstinenceHabits] Pre-running auto-detect for', abstinenceTasks.length, 'tasks');
        // 生成需要检查的日期列表（最近7天）
        const datesToCheck = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (let i = 1; i <= 7; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            datesToCheck.push(getLocalDateString(d));
        }
        
        let totalMakeups = 0;
        abstinenceTasks.forEach(task => {
            const results = runSilentAutoDetectForTask(task, datesToCheck);
            totalMakeups += results.length;
        });
        if (totalMakeups > 0) {
            console.log('[checkAbstinenceHabits] Auto-detect completed, created', totalMakeups, 'records');
            // 补录已在 runSilentAutoDetectForTask 中更新了 transactions，无需额外操作
        }
    }

    const getPreviousPeriodEnd = (baseDate, period) => {
        if (period === 'daily') {
            const yest = new Date(baseDate);
            yest.setDate(yest.getDate() - 1);
            return yest;
        } else if (period === 'weekly') {
            const day = baseDate.getDay();
            const diffToLastSun = day === 0 ? 7 : day;
            const lastSun = new Date(baseDate);
            lastSun.setDate(baseDate.getDate() - diffToLastSun);
            lastSun.setHours(23, 59, 59, 999);
            return lastSun;
        } else if (period === 'monthly') {
            const firstOfThis = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
            return new Date(firstOfThis.getTime() - 1); // 上个月最后一天
        }
        return null;
    };

    const stepToNextPeriodEnd = (endDate, period) => {
        const next = new Date(endDate);
        if (period === 'daily') {
            next.setDate(next.getDate() + 1);
        } else if (period === 'weekly') {
            next.setDate(next.getDate() + 7);
        } else if (period === 'monthly') {
            next.setMonth(next.getMonth() + 1);
            next.setDate(0); // 设为下个月的第 0 天即本月最后一天
        }
        return next;
    };

    const updatedTasks = []; // [v7.1.1] 收集被更新的任务
    tasks.forEach(task => {
        // 1. 筛选戒除类习惯
        if (!task.isHabit || !task.habitDetails || task.habitDetails.type !== 'abstinence') return;
        const period = task.habitDetails.period;

        // 2. 计算最新可结算周期的结束日（昨天/上周末/上月末）
        const latestEndDate = getPreviousPeriodEnd(now, period);
        if (!latestEndDate) return;
        const latestKey = getLocalDateString(latestEndDate);

        // 首次初始化：只记录结算点，避免错误补发
        if (!task.habitDetails.lastSettledDate) {
            task.habitDetails.lastSettledDate = latestKey;
            hasUpdates = true;
            if (!updatedTasks.includes(task)) updatedTasks.push(task); // [v7.16.2] 确保初始化也同步到云端
            return;
        }
        // 已经结算到最新周期则跳过
        if (task.habitDetails.lastSettledDate === latestKey) return;

        // 从上次结算之后的下一个周期开始逐个补算，避免漏开 App 导致连胜丢失
        let cursorEndDate = stepToNextPeriodEnd(new Date(task.habitDetails.lastSettledDate), period);
        while (cursorEndDate.getTime() <= latestEndDate.getTime()) {
            const settlementKey = getLocalDateString(cursorEndDate);

            // 4. 统计该周期净消费（含自动修正回冲）
            const limit = task.habitDetails.targetCountInPeriod || 0;
            const { periodStart, periodEnd } = getHabitPeriodInfo(task, transactions, cursorEndDate);
            const periodTxs = transactions.filter(t => {
                if (t.taskId !== task.id) return false;
                if (t.undone) return false;
                return isTransactionInHabitPeriod(t, periodStart, periodEnd);
            });

            const spendRecords = periodTxs.filter(t => (t.type || (t.amount > 0 ? 'earn' : 'spend')) === 'spend');
            const autoDetectRecords = spendRecords.filter(r => r.isAutoDetected && r.autoDetectType !== 'correction');
            const correctionRecords = periodTxs.filter(t =>
                t.isAutoDetected &&
                t.autoDetectType === 'correction' &&
                (t.type || (t.amount > 0 ? 'earn' : 'spend')) === 'earn'
            );
            const normalRecords = spendRecords.filter(r => !r.isAutoDetected);

            const usageRaw = getQuotaPeriodUsage(task, cursorEndDate);
            const totalConsumed = task.type === 'continuous_redeem'
                ? Math.floor(usageRaw / 60)
                : usageRaw;

            // [v7.24.1] 增加日志：显示净口径统计（含修正回冲）
            const unitLabel = task.type === 'continuous_redeem' ? '分钟' : '次';
            console.log(`[checkAbstinenceHabits] ${task.name} ${settlementKey}: ` +
                        `总计 ${Math.round(totalConsumed)}${unitLabel}, ` +
                        `额度 ${limit}${unitLabel}, ` +
                        `普通记录 ${normalRecords.length}条, ` +
                        `补录记录 ${autoDetectRecords.length}条, ` +
                        `修正回冲 ${correctionRecords.length}条`);

            // 5. 判定结果

            if (totalConsumed <= limit) {
                // [v7.24.0] 额度内：连胜 +1，不再创建 earn 交易
                task.habitDetails.streak = (task.habitDetails.streak || 0) + 1;
                task.habitDetails.isBroken = false;

                // [v7.8.0] 收集结果用于启动报告
                abstinenceResults.push({
                    type: 'abstinence',
                    taskName: task.name,
                    success: true,
                    streak: task.habitDetails.streak,
                    amount: 0,
                    period: task.habitDetails.period
                });
            } else {
                // === 失败逻辑 ===
                task.habitDetails.streak = 0;
                // [v7.8.0] 收集失败结果
                abstinenceResults.push({
                    type: 'abstinence',
                    taskName: task.name,
                    success: false,
                    streak: 0,
                    amount: 0,
                    period: task.habitDetails.period
                });
            }

            // 6. 标记已结算当前周期并继续补算
            task.habitDetails.lastSettledDate = settlementKey;
            hasUpdates = true;
            if (!updatedTasks.includes(task)) updatedTasks.push(task); // [v7.1.1] 记录更新的任务

            // 如已结算到最新周期则停止
            if (settlementKey === latestKey) break;
            cursorEndDate = stepToNextPeriodEnd(cursorEndDate, period);
        }
    });

    if (hasUpdates) {
        saveData();
        // [v7.1.1] 同步更新的任务到云端
        if (isLoggedIn()) {
            updatedTasks.forEach(task => {
                DAL.saveTask(task).catch(err => console.error('[checkAbstinenceHabits] Task sync failed:', err.message));
            });
        }
        updateAllUI();
    }
    
    return abstinenceResults; // [v7.8.0] 返回结果
}

// [v7.1.0] 检查戒除计划是否到期
async function checkAbstinencePlanExpiry() {
    const now = new Date();
    const todayStr = getLocalDateString(now);
    
    for (const task of tasks) {
        // 只处理有计划周期的戒除任务
        if (!task.isHabit || !task.habitDetails || task.habitDetails.type !== 'abstinence') continue;
        const { planDuration, planStartDate } = task.habitDetails;
        if (!planDuration || !planStartDate) continue;
        
        // 计算计划结束日期
        const startDate = new Date(planStartDate);
        const period = task.habitDetails.period || 'daily';
        let expiryDate;
        
        if (period === 'daily') {
            expiryDate = new Date(startDate);
            expiryDate.setDate(startDate.getDate() + planDuration);
        } else if (period === 'weekly') {
            expiryDate = new Date(startDate);
            expiryDate.setDate(startDate.getDate() + planDuration * 7);
        } else if (period === 'monthly') {
            expiryDate = new Date(startDate);
            expiryDate.setMonth(startDate.getMonth() + planDuration);
        } else if (period === 'yearly') {
            expiryDate = new Date(startDate);
            expiryDate.setFullYear(startDate.getFullYear() + planDuration);
        }
        
        const expiryStr = getLocalDateString(expiryDate);
        
        // 检查是否到期（今天或之前）
        if (todayStr >= expiryStr) {
            const periodUnitMap = { daily: '天', weekly: '周', monthly: '月', yearly: '年' };
            const periodUnit = periodUnitMap[period] || '个周期';
            const streak = task.habitDetails.streak || 0;
            
            const result = await showConfirm(
                `🎉 "${task.name}" 的 ${planDuration}${periodUnit} 戒除计划已完成！\n\n` +
                `连续达标: ${streak}${periodUnit}\n\n` +
                `选择您的下一步：\n` +
                `• 确定 = 继续保持当前计划（重新计时 ${planDuration}${periodUnit}）\n` +
                `• 取消 = 结束计划（保留习惯，不再追踪周期）`,
                '戒除计划完成'
            );
            
            if (result) {
                // 继续：重置开始日期
                task.habitDetails.planStartDate = todayStr;
                showNotification('🔄 计划已重置', `"${task.name}" 开始新的 ${planDuration}${periodUnit} 周期`, 'achievement');
            } else {
                // 结束：清除计划周期设置
                task.habitDetails.planDuration = null;
                task.habitDetails.planStartDate = null;
                showNotification('✅ 计划已结束', `"${task.name}" 已转为永久习惯`, 'success');
            }
            
            // [v7.1.1] 同步任务更改到云端
            if (isLoggedIn()) {
                DAL.saveTask(task).catch(err => console.error('[checkAbstinencePlanExpiry] Task sync failed:', err.message));
            }
            
            await saveData();
            updateAllUI();
        }
    }
}

function clearFormErrors() { document.querySelectorAll('.form-input.error, .form-select.error').forEach(el => el.classList.remove('error')); document.querySelectorAll('.error-message.show').forEach(el => el.classList.remove('show')); }

// --- Task Actions ---
async function completeTask(taskId) {
    lastLocalActionTime = Date.now();
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;
    const task = tasks[taskIndex];
    if (runningTasks.has(taskId) && window.Android && window.Android.stopFloatingTimer) {
        try {
            window.Android.stopFloatingTimer(task.name || "");
        } catch (e) {
            console.error("Float stop failed", e);
        }
    }
    task.lastUsed = Date.now();
    if (task.isHabit) {
        const todayStr = getLocalDateString(new Date());
        const completionsToday = transactions.filter(t => t.taskId === taskId && getLocalDateString(t.timestamp) === todayStr).length;
        if (completionsToday >= (task.habitDetails.dailyLimit || Infinity)) {
            showAlert('已达到此习惯的每日完成上限');
            return;
        }
        await processHabitCompletion(task, task.fixedTime, new Date());
    } else {
        await processNormalCompletion(task);
    }
    if (task.reminderDetails && task.reminderDetails.status === 'pending' && !task.reminderDetails.isRecurring) {
        task.reminderDetails.status = 'triggered';
    }

    if (isLoggedIn()) {
        await DAL.saveTask(task).catch(err => {
            console.error('[completeTask] Task sync failed:', err.message);
        });
    }

    await saveData();
    updateAllUI();
}

async function processNormalCompletion(task, earnedTime = task.fixedTime, descriptionDetails = '', referenceDate = new Date(), pauseHistory = [], options = {}) {
    const isBackdate = descriptionDetails.includes('补录');
    const isTargetNotMet = options.isTargetNotMet || false;

    const multiplier = getBalanceMultiplier();
    const adjustedTime = Math.round(earnedTime * multiplier);
    const hasBalanceAdjust = balanceMode.enabled && multiplier !== 1.0;

    let description = isTargetNotMet
        ? `任务未达标: ${task.name}${descriptionDetails}`
        : `完成任务: ${task.name}${descriptionDetails}`;
    if (hasBalanceAdjust) {
        description += ` (原${formatTime(earnedTime)} ×${multiplier} 均衡调整)`;
    }

    const transaction = {
        id: generateId(),
        type: 'earn',
        taskId: task.id,
        taskName: task.name,
        amount: adjustedTime,
        description: description,
        timestamp: referenceDate.toISOString(),
        pauseHistory: pauseHistory,
        balanceAdjust: hasBalanceAdjust ? { multiplier, originalAmount: earnedTime } : undefined
    };

    currentBalance += adjustedTime;
    task.completionCount = (task.completionCount || 0) + 1;
    addTransaction(transaction);
    updateDailyChanges('earned', adjustedTime, referenceDate);

    logEvent(EVENT_TYPES.TASK_COMPLETED, {
        taskId: task.id,
        taskName: task.name,
        transaction: transaction,
        isHabit: false,
        isBackdate: isBackdate
    });

    if (getLocalDateString(referenceDate) === getLocalDateString(new Date())) {
        let notifyTitle = isTargetNotMet ? '⏱️ 任务未达标' : '🎉 任务完成';
        let notifyMsg = `获得 ${formatTime(adjustedTime)} 时间奖励！`;
        if (hasBalanceAdjust) {
            notifyMsg = `获得 ${formatTime(earnedTime)} ×${multiplier} = ${formatTime(adjustedTime)} (均衡调整)`;
        }
        if (isTargetNotMet) {
            notifyMsg = `未达到目标时长，仅获得基础时间 ${formatTime(adjustedTime)}`;
        }
        showNotification(notifyTitle, notifyMsg, 'achievement');
    }
}

// [v4.8.7 Fix] 获取习惯周期数据 (修复：计时戒除任务应统计时长而非次数)
function getHabitPeriodInfo(task, transactionList, referenceDate = new Date()) {
    const period = task.habitDetails.period;
    const targetCount = task.habitDetails.targetCountInPeriod || 1; 
    
    const refDate = new Date(referenceDate);
    refDate.setHours(0, 0, 0, 0); 
    let periodStart, periodEnd;
    if (period === 'daily') {
        periodStart = refDate;
        periodEnd = new Date(refDate);
        periodEnd.setDate(periodEnd.getDate() + 1);
    } else if (period === 'weekly') {
        const day = refDate.getDay(); 
        const diff = day === 0 ? 6 : day - 1; 
        periodStart = new Date(refDate.getTime() - diff * 86400000); 
        periodEnd = new Date(periodStart.getTime() + 7 * 86400000); 
    } else if (period === 'monthly') {
        periodStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1); 
        periodEnd = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1); 
    } else if (period === 'yearly') {
        periodStart = new Date(refDate.getFullYear(), 0, 1);
        periodEnd = new Date(refDate.getFullYear() + 1, 0, 1);
    } else {
        periodStart = refDate;
        periodEnd = new Date(refDate);
        periodEnd.setDate(periodEnd.getDate() + 1);
    }

const isSpendTask = ['instant_redeem', 'continuous_redeem'].includes(task.type);
const targetType = isSpendTask ? 'spend' : 'earn';
// 筛选周期内的有效记录
const transactionsInPeriod = transactionList.filter(t => {
    if (t.taskId !== task.id) return false;
    if (t.undone) return false;
    const txType = t.type || (t.amount > 0 ? 'earn' : 'spend');
    if (txType !== targetType) return false;
    return isTransactionInHabitPeriod(t, periodStart, periodEnd);
});

let currentCount = 0;

// [v4.8.7] 核心修复：根据任务类型决定统计方式
// [v7.24.1] 统一使用原始时长提取函数，避免自动补录按 actualMinutes 整日误计
if (task.type === 'continuous_redeem' || task.type === 'continuous') {
    // 计时类任务：累加实际使用时长（秒），并转换为分钟
    const totalSeconds = transactionsInPeriod.reduce((sum, t) => sum + getRawUsageSecondsFromTransaction(t), 0);

    // [v7.24.1] 戒除消费习惯需要扣除自动修正返还，保持净使用量一致
    if (task.type === 'continuous_redeem') {
        const correctionSeconds = transactionList.reduce((sum, t) => {
            if (t.taskId !== task.id) return sum;
            if (t.undone) return sum;
            if (!t.isAutoDetected || t.autoDetectType !== 'correction') return sum;
            const txType = t.type || (t.amount > 0 ? 'earn' : 'spend');
            if (txType !== 'earn') return sum;
            if (!isTransactionInHabitPeriod(t, periodStart, periodEnd)) return sum;
            return sum + getRawUsageSecondsFromTransaction(t);
        }, 0);
        currentCount = Math.max(0, Math.floor((totalSeconds - correctionSeconds) / 60));
    } else {
        currentCount = Math.floor(totalSeconds / 60);
    }
} else {
    // 其他（按次消费、普通习惯）：统计次数
    if (task.type === 'instant_redeem') {
        const correctionCount = transactionList.reduce((sum, t) => {
            if (t.taskId !== task.id) return sum;
            if (t.undone) return sum;
            if (!t.isAutoDetected || t.autoDetectType !== 'correction') return sum;
            const txType = t.type || (t.amount > 0 ? 'earn' : 'spend');
            if (txType !== 'earn') return sum;
            if (!isTransactionInHabitPeriod(t, periodStart, periodEnd)) return sum;
            const correctionRawCount = t.autoDetectData?.correctionCount;
            if (typeof correctionRawCount === 'number' && correctionRawCount > 0) {
                return sum + Math.max(1, Math.round(correctionRawCount));
            }
            return sum + estimateUsageCountFromSeconds(task, getRawUsageSecondsFromTransaction(t));
        }, 0);
        currentCount = Math.max(0, transactionsInPeriod.length - correctionCount);
    } else {
        currentCount = transactionsInPeriod.length;
    }
}

return { periodStart, periodEnd, currentCount, targetCount };
    }

// [v7.20.3-fix] 习惯有效完成判定：按“每天至少一次”口径统一计算
function hasHabitValidCompletionOnDate(task, transactionList, dateStr) {
    if (!task || !task.isHabit || !task.habitDetails) return false;
    if (!['reward', 'continuous', 'continuous_target'].includes(task.type)) return false;

    return transactionList.some(t => {
        if (t.taskId !== task.id) return false;
        if ((t.type || (t.amount > 0 ? 'earn' : 'spend')) !== 'earn') return false;
        if (getLocalDateString(t.timestamp) !== dateStr) return false;
        if (task.type === 'continuous_target') {
            return t.amount >= task.targetTime || t.isStreakAdvancement;
        }
        return true;
    });
}

// [v7.20.3-fix] 周期内断签判定：从周期起始到昨天，任意一天未完成则本周期不可达成
function hasMissedHabitDayInCurrentPeriod(task, transactionList, referenceDate = new Date()) {
    if (!task || !task.isHabit || !task.habitDetails) return false;
    if (!['reward', 'continuous', 'continuous_target'].includes(task.type)) return false;

    const { periodStart } = getHabitPeriodInfo(task, transactionList, referenceDate);
    const todayStart = new Date(referenceDate);
    todayStart.setHours(0, 0, 0, 0);

    let cursor = new Date(periodStart);
    cursor.setHours(0, 0, 0, 0);
    while (cursor < todayStart) {
        const dayStr = getLocalDateString(cursor);
        if (!hasHabitValidCompletionOnDate(task, transactionList, dayStr)) {
            return true;
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return false;
}

// [v4.2.0] Updated processHabitCompletion to accept a referenceDate
// [v4.3.0] No longer rebuilds streak. Only checks and advances.
// [v5.8.0] 添加 pauseHistory 参数
async function processHabitCompletion(task, baseReward, referenceDate, descriptionDetails = '', pauseHistory = []) { 
    const refDateStr = getLocalDateString(referenceDate); 
    const isDaily = task.habitDetails.period === 'daily';
    const cycleAlreadyBroken = hasMissedHabitDayInCurrentPeriod(task, transactions, referenceDate);

    // 1. Get current period count (X) and target (N) *relative to the referenceDate*
    // We pass ALL transactions so it can find the period correctly.
    const { currentCount, targetCount, periodStart, periodEnd } = getHabitPeriodInfo(task, transactions, referenceDate);
    const nextCount = currentCount + 1; // Count including this completion

    // Check if streak was already advanced in this *specific* period
    const alreadyAdvancedThisPeriod = transactions.some(t => {
        const txDate = new Date(t.timestamp);
        return t.taskId === task.id && t.isStreakAdvancement && txDate >= periodStart && txDate < periodEnd;
    });

    let finalReward = baseReward;
    let bonusDescription = '';
    let isAdvancement = false;
    let notificationTitle = '👍 习惯重复完成';
    let notificationBody = `获得基础奖励 ${formatTime(baseReward)}`;

    // 2. Logic Branching
    if (cycleAlreadyBroken) {
        task.habitDetails.isBroken = true;
        notificationTitle = '⚠️ 本周期已中断';
        notificationBody = '今日已完成，但本周期此前有断签，需下个周期重新累计。';
    } else if (nextCount < targetCount) {
        // Case 1: Not reached target yet (X < N)
        notificationTitle = '💪 习惯积累中';
        notificationBody = `已完成 ${nextCount}/${targetCount} 次。继续努力！`;
    } else if (nextCount === targetCount && !alreadyAdvancedThisPeriod) {
        // Case 2: Just reached target (X = N) for the first time in this period
        isAdvancement = true; // Mark this transaction as the trigger

        // [v4.3.0] Check streak based on reference date, DO NOT rebuild
        checkHabitStreak(task, referenceDate);
        // [v7.2.3] 如果检测到中断，先重置 streak 再 +1
        if (task.habitDetails.isBroken) {
            task.habitDetails.streak = 0;
        }
        task.habitDetails.streak = (task.habitDetails.streak || 0) + 1; 
        task.habitDetails.isBroken = false; // [v4.0.3] Clear broken status on advancement
        
        // Calculate bonus reward based on the NEW streak
        let habitBonusReward = 0; 
        task.habitDetails.rewards.forEach(rule => { 
            if (task.habitDetails.streak >= rule.start) {
                let ruleReward = (rule.type === 'fixed') ? rule.value : (rule.value * task.habitDetails.streak);
                // [v4.8.5] 修复：应用递增奖励上限
                if (rule.limit && ruleReward > rule.limit) {
                    ruleReward = rule.limit;
                }
                habitBonusReward += ruleReward; 
            }
        }); 
        
        finalReward += habitBonusReward; 
        if (habitBonusReward > 0) bonusDescription = ` (含习惯奖励 ${formatTime(habitBonusReward)})`; 
        
        const unitMap = { daily: '天', weekly: '周', monthly: '月' };
        const periodText = unitMap[task.habitDetails.period] || '次';
        notificationTitle = '⭐ 习惯已达标!';
        notificationBody = `连续${task.habitDetails.streak}${periodText}! 获得 ${formatTime(finalReward)} 时间`; 
    } else {
        // Case 3: Target exceeded (X > N) or (X = N and already advanced)
        // Only basic reward, no streak update.
        notificationTitle = '🎉 习惯超额完成';
        notificationBody = `已完成 ${nextCount}/${targetCount} 次 (已达标)。获得基础奖励 ${formatTime(baseReward)}`;
    }
// 3. Update Status and Transactions
    if (isAdvancement) {
         // Only update the last completion date when an advancement occurs.
        task.habitDetails.lastCompletionDate = refDateStr;
    }
    task.completionCount = (task.completionCount || 0) + 1; // Always increment task total completion count
    
    // [v7.3.0] 均衡模式：对赚取应用乘数
    const multiplier = balanceMode.enabled ? getBalanceMultiplier() : 1;
    const adjustedReward = Math.round(finalReward * multiplier);
    const hasBalanceAdjust = multiplier !== 1;
    
    // [v7.8.1] 计算习惯奖励金额（用于显示时还原基础时间）
    const habitBonusAmount = finalReward - baseReward;
    
    currentBalance += adjustedReward; 
    updateDailyChanges('earned', adjustedReward, referenceDate);
    
    // [v7.3.0] 均衡模式通知调整
    if (hasBalanceAdjust) {
        notificationBody = notificationBody.replace(
            formatTime(finalReward),
            `${formatTime(adjustedReward)} ×${multiplier} (均衡调整)`
        );
    }
    
    const isBackdate = descriptionDetails.includes('补录');
    // [v7.3.0] 均衡模式描述后缀
    const balanceModeSuffix = hasBalanceAdjust ? ` ×${multiplier} (均衡调整)` : '';
    const transaction = {
        id: generateId(),
        type: 'earn', 
        taskId: task.id, 
        taskName: task.name, 
        amount: adjustedReward, 
        description: `${isBackdate ? '' : '完成习惯: '}${task.name}${descriptionDetails}${bonusDescription}${balanceModeSuffix}`, 
        isStreakAdvancement: isAdvancement,
        timestamp: referenceDate.toISOString(),
        isBackdate: isBackdate,
        pauseHistory: pauseHistory,
        // [v7.8.1] 统一 balanceAdjust 格式，记录原始金额和习惯奖励
        balanceAdjust: hasBalanceAdjust ? { 
            multiplier, 
            originalAmount: finalReward,  // 未调整前的总金额
            baseReward: baseReward,        // 基础时间（不含习惯奖励）
            habitBonus: habitBonusAmount   // 习惯奖励金额
        } : undefined
    };

    addTransaction(transaction);

    logEvent(EVENT_TYPES.TASK_COMPLETED, {
        taskId: task.id,
        taskName: task.name,
        transaction: transaction,
        isHabit: true,
        isBackdate: isBackdate,
        habitStreak: isAdvancement ? {
            newStreak: task.habitDetails.streak,
            period: task.habitDetails.period
        } : null
    });
    
    // Only show notification if it's not a backdate
    if (getLocalDateString(referenceDate) === getLocalDateString(new Date())) {
        showNotification(notificationTitle, notificationBody, 'achievement');
    }
}
// [v4.2.0] checkHabitStreak now also sets isBroken status AND accepts a referenceDate
function checkHabitStreak(task, referenceDate = new Date()) { 
    // [v6.4.1] 跳过戒除类习惯，它们有独立的结算逻辑（checkAbstinenceHabits）
    if (task.habitDetails && task.habitDetails.type === 'abstinence') {
        return;
    }
    
    const { lastCompletionDate, period } = task.habitDetails; 
    if (!lastCompletionDate) { 
        task.habitDetails.streak = 0; 
        task.habitDetails.isBroken = false; // [v4.0.3]
        return; 
    } 
    
    const refDate = new Date(referenceDate); 
    refDate.setHours(0, 0, 0, 0); 
    const lastDate = new Date(lastCompletionDate); 
    lastDate.setHours(0, 0, 0, 0); 
    
    // If the last completion was on or after the reference date, no need to check
    if (lastDate >= refDate) {
        task.habitDetails.isBroken = false;
        return;
    }
    
    let isBroken = false; 
    const diffDays = (refDate - lastDate) / 86400000; 

    if (hasMissedHabitDayInCurrentPeriod(task, transactions, refDate)) {
        isBroken = true;
    }

    // 1. Check if the gap is too large
    if (period === 'daily' && diffDays > 1) {
        isBroken = true;
    } else if (period === 'weekly') {
        // Check if lastDate was in the *previous* week relative to refDate
        const refDay = refDate.getDay() === 0 ? 7 : refDate.getDay(); 
        const startOfThisWeek = new Date(refDate.getTime() - (refDay - 1) * 86400000); 
        const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * 86400000);
        
        // If the last completion was before the start of last week
        if (lastDate < startOfLastWeek) {
            isBroken = true;
        }
    } else if (period === 'monthly') { 
        const refMonth = refDate.getFullYear() * 12 + refDate.getMonth();
        const lastMonth = lastDate.getFullYear() * 12 + lastDate.getMonth();
        
        // If the gap is more than one month
        if (refMonth > lastMonth + 1) {
            isBroken = true;
        }
    }
    
    if (isBroken) { 
        // [v7.2.3] 修复：UI 刷新时不直接重置 streak，只设置 isBroken 标志
        // streak 的重置由 processHabitCompletion 在用户完成任务时处理
        // 这样可以避免补录后被 UI 刷新错误重置
        task.habitDetails.isBroken = true; // [v4.0.3] Set broken status
        // [v4.8.5] 静默处理：不再推送“习惯中断”通知
    } else {
        task.habitDetails.isBroken = false; // [v4.0.3] Ensure not broken
    }
}

function startTask(event, taskId) { 
    lastLocalActionTime = Date.now(); // [v4.8.0] 记录本地作業時間
    // [v6.4.4] 关键：立即设置保存保护时间，防止 watch 在保存完成前覆盖状态
    lastSaveTimestamp = Date.now();
    const task = tasks.find(t => t.id === taskId); 
    if (!task) return; 
    if (event && event.target.closest('.recent-tasks-grid') === null) { task.lastUsed = Date.now(); }
    const runningData = { startTime: Date.now(), elapsedTime: 0, isPaused: false, achieved: false, achievedTime: 0, tenMinReminderSent: false, pauseHistory: [] };
    runningTasks.set(taskId, runningData); // [v5.8.0] 添加 pauseHistory
    
    // [v6.5.0] 多表模式：同步到云端 RunningTask 表
    console.log('[startTask] 检查云端同步条件:', isLoggedIn());
    if (isLoggedIn()) {
        console.log('[startTask] 调用 DAL.startTask...');
        DAL.startTask(taskId, runningData).catch(e => {
            console.error('[startTask] DAL.startTask failed:', e);
        });
    }
    
    // [v7.1.4] 旁听记录任务开始事件
    logEvent(EVENT_TYPES.TASK_STARTED, {
        taskId: taskId,
        taskName: task.name,
        taskType: task.type
    });
        
    saveData(); 
    updateAllUI(); 
    showNotification('▶️ 任务开始', `开始执行任务: ${task.name}`, 'achievement'); 

    if (task.appPackage && window.Android && window.Android.launchApp) {
        try { window.Android.launchApp(task.appPackage); } catch (e) { console.error('launchApp failed', e); }
    }
    
    // [v4.11.0] 启动悬浮窗：尊重全局开关且需任务单独开启
    let enableFloatingTimer = false;
    if (task.enableFloatingTimer !== undefined) {
        enableFloatingTimer = task.enableFloatingTimer;
    } else {
        enableFloatingTimer = (task.type === 'continuous_target');
    }

    if (enableFloatingTimer && notificationSettings.floatingTimer !== false && window.Android && window.Android.startFloatingTimer) {
        let duration = 0;
        if (task.type === 'continuous_target') {
            duration = task.targetTime || 0;
        } else {
            duration = 0; // 普通计时/消费类走正计时
        }

        const colorHex = categoryColors.get(task.category) || '#3498db'; // [v7.20.0] fallback改为主色调蓝
        const appPackage = task.appPackage || ''; // [v7.13.0] 关联应用包名

        try {
            window.Android.startFloatingTimer(task.name, duration, colorHex, appPackage);
        } catch(e) { console.error(e); }
    }

    // [v4.8.8] 调用安卓原生闹钟 (严格校验版)
    if (window.Android && window.Android.scheduleAlarm) {
        let duration = 0;
        
        // [Fix] 严格根据任务类型读取时间，防止脏数据(如fixedTime:1)干扰达标任务
        if (task.type === 'reward' || task.type === 'instant_redeem') {
            duration = task.fixedTime || task.consumeTime || 0;
        } else if (['continuous', 'continuous_target', 'continuous_redeem'].includes(task.type)) {
            // 达标任务只认 targetTime，普通计时任务闹钟设为 0 (不响铃) 或根据需求
            if (task.type === 'continuous_target') duration = task.targetTime;
            else duration = 0; // 纯计时任务通常不需要固定时间的闹钟
        }
        
        // 仅针对有明确目标时长的任务设置闹钟
        if (duration > 0) {
            const alarmTitle = "⏰ 任务完成";
            const alarmBody = `任务 "${task.name}" 目标时间已达成！`;
            window.Android.scheduleAlarm(alarmTitle, alarmBody, duration * 1000);
        }
    }
}

// [v7.18.3-fix] 暂停任务 - 强同步方案，优先使用悬浮窗时间
function pauseTask(taskId) { 
    // [v7.1.5] 设置保护期，防止 watch 收到自己的更新后重复处理
    lastSaveTimestamp = Date.now();
    lastLocalActionTime = Date.now();
    const r = runningTasks.get(taskId); 
    if (!r || r.isPaused) return; 
    
    const task = tasks.find(t => t.id === taskId);
    
    // [v7.18.3-fix] 先暂停悬浮窗计时器
    if (task && window.Android && window.Android.pauseFloatingTimer) {
        try { window.Android.pauseFloatingTimer(task.name); } catch(e) { console.error(e); }
    }
    
    // [v7.18.3-fix] 等待悬浮窗更新状态，然后获取其时间
    setTimeout(() => {
        let syncedElapsed = null;
        
        // 尝试获取悬浮窗同步状态
        if (window.Android && window.Android.getFloatingTimerSyncState) {
            try {
                const syncJson = window.Android.getFloatingTimerSyncState();
                if (syncJson) {
                    const sync = JSON.parse(syncJson);
                    if (sync.taskName === task?.name && sync.action === 'pause') {
                        syncedElapsed = sync.elapsedTime;
                        console.log('[pauseTask] Got sync time from floating timer:', syncedElapsed);
                    }
                }
            } catch (e) {
                console.error('[pauseTask] Failed to get sync state:', e);
            }
        }
        
        // [v7.18.3-fix] 强同步：如果有悬浮窗时间，完全以其为准
        if (syncedElapsed !== null && syncedElapsed > 0) {
            r.elapsedTime = syncedElapsed;
            console.log('[pauseTask] Using floating timer time:', syncedElapsed);
        } else {
            // 没有悬浮窗，使用前端计算
            r.elapsedTime += Date.now() - r.startTime;
            console.log('[pauseTask] Using frontend time:', r.elapsedTime);
        }
        
        r.isPaused = true; 
        if (!r.pauseHistory) r.pauseHistory = []; 
        r.pauseHistory.push({ pauseStart: Date.now() }); 
        
        // [v7.1.4] 旁听记录暂停事件
        logEvent(EVENT_TYPES.TASK_PAUSED, {
            taskId: taskId,
            taskName: task?.name,
            elapsedTime: r.elapsedTime
        });
        
        // [v6.5.0] 多表模式：同步暂停状态到云端
        if (isLoggedIn()) {
            DAL.updateRunningTask(taskId, r).catch(e => {
                console.error('[pauseTask] DAL.updateRunningTask failed:', e);
            });
        }
        
        saveData(); 
        updateRecentTasks(); 
        updateCategoryTasks();
    }, 50); // 50ms 延迟，等待悬浮窗更新
}

// [v7.18.3-fix] 恢复任务 - 强同步方案
function resumeTask(taskId) { 
    // [v7.1.5] 设置保护期，防止 watch 收到自己的更新后重复处理
    lastSaveTimestamp = Date.now();
    lastLocalActionTime = Date.now();
    const r = runningTasks.get(taskId); 
    if (!r || !r.isPaused) return; 
    
    const task = tasks.find(t => t.id === taskId);
    
    // [v7.18.3-fix] 先恢复悬浮窗计时器
    if (task && window.Android && window.Android.resumeFloatingTimer) {
        try { window.Android.resumeFloatingTimer(task.name); } catch(e) { console.error(e); }
    }
    
    // [v7.18.3-fix] 等待悬浮窗更新状态
    setTimeout(() => {
        let syncedElapsed = null;
        
        // 尝试获取悬浮窗同步状态
        if (window.Android && window.Android.getFloatingTimerSyncState) {
            try {
                const syncJson = window.Android.getFloatingTimerSyncState();
                if (syncJson) {
                    const sync = JSON.parse(syncJson);
                    if (sync.taskName === task?.name && sync.action === 'resume') {
                        syncedElapsed = sync.elapsedTime;
                        console.log('[resumeTask] Got sync time from floating timer:', syncedElapsed);
                    }
                }
            } catch (e) {
                console.error('[resumeTask] Failed to get sync state:', e);
            }
        }
        
        // [v7.18.3-fix] 强同步：更新暂停历史
        if (r.pauseHistory && r.pauseHistory.length > 0) { 
            const last = r.pauseHistory[r.pauseHistory.length - 1]; 
            if (!last.pauseEnd) last.pauseEnd = Date.now(); 
        }
        
        // 如果有悬浮窗时间，更新 elapsedTime
        if (syncedElapsed !== null && syncedElapsed > 0) {
            r.elapsedTime = syncedElapsed;
            console.log('[resumeTask] Using floating timer time:', syncedElapsed);
        }
        
        r.startTime = Date.now(); 
        r.isPaused = false; 
        
        // [v7.1.4] 旁听记录恢复事件
        logEvent(EVENT_TYPES.TASK_RESUMED, {
            taskId: taskId,
            taskName: task?.name,
            elapsedTime: r.elapsedTime
        });
        
        // [v6.5.0] 多表模式：同步恢复状态到云端
        if (isLoggedIn()) {
            DAL.updateRunningTask(taskId, r).catch(e => {
                console.error('[resumeTask] DAL.updateRunningTask failed:', e);
            });
        }
        
        saveData(); 
        updateRecentTasks(); 
        updateCategoryTasks();
    }, 50);
}

// [v7.18.3] 接收悬浮窗状态变化通知
// [v7.18.3-fix] 接收悬浮窗状态变化通知，支持时间同步
window.__onFloatingTimerAction = function(action, taskName, elapsedMillisFromService) {
    console.log('[FloatingTimer] Received action:', action, 'for task:', taskName, 'elapsed:', elapsedMillisFromService);
    
    // 检查 tasks 是否已加载
    if (!tasks || !Array.isArray(tasks)) {
        console.warn('[FloatingTimer] tasks not loaded yet');
        return;
    }
    
    // 检查 runningTasks 是否已初始化
    if (!runningTasks) {
        console.warn('[FloatingTimer] runningTasks not initialized');
        return;
    }
    
    // 根据任务名称找到 taskId
    const task = tasks.find(t => t.name === taskName);
    if (!task) {
        console.warn('[FloatingTimer] Task not found:', taskName, 'Available tasks:', tasks.map(t => t.name));
        return;
    }
    
    const runningTask = runningTasks.get(task.id);
    if (!runningTask) {
        console.warn('[FloatingTimer] Running task not found:', task.id, 'Running tasks:', [...runningTasks.keys()]);
        return;
    }
    
    console.log('[FloatingTimer] Found task:', task.id, 'Current paused state:', runningTask.isPaused, 'Current elapsed:', runningTask.elapsedTime);
    
    // [v7.18.3-fix] 强同步：直接使用悬浮窗的时间，完全覆盖前端值
    if (elapsedMillisFromService && elapsedMillisFromService > 0) {
        const serviceElapsed = parseInt(elapsedMillisFromService);
        console.log('[FloatingTimer] Strong sync: setting elapsedTime to service value:', serviceElapsed);
        runningTask.elapsedTime = serviceElapsed;
    }
    
    // [v7.18.3-fix] 直接执行暂停/恢复，不调用 pauseTask/resumeTask（避免循环）
    if (action === 'pause' && !runningTask.isPaused) {
        console.log('[FloatingTimer] Auto-pausing task from floating timer click');
        
        // 设置保护期
        lastSaveTimestamp = Date.now();
        lastLocalActionTime = Date.now();
        
        // 执行暂停（时间已同步）
        runningTask.isPaused = true;
        if (!runningTask.pauseHistory) runningTask.pauseHistory = []; 
        runningTask.pauseHistory.push({ pauseStart: Date.now() }); 
        
        // 记录事件
        logEvent(EVENT_TYPES.TASK_PAUSED, {
            taskId: task.id,
            taskName: task.name,
            elapsedTime: runningTask.elapsedTime
        });
        
        // 同步到云端
        if (isLoggedIn()) {
            DAL.updateRunningTask(task.id, runningTask).catch(e => {
                console.error('[FloatingTimer] DAL.updateRunningTask failed:', e);
            });
        }
        
        saveData(); 
        updateRecentTasks(); 
        updateCategoryTasks();
        
    } else if (action === 'resume' && runningTask.isPaused) {
        console.log('[FloatingTimer] Auto-resuming task from floating timer click');
        
        // 设置保护期
        lastSaveTimestamp = Date.now();
        lastLocalActionTime = Date.now();
        
        // 更新暂停历史
        if (runningTask.pauseHistory && runningTask.pauseHistory.length > 0) { 
            const last = runningTask.pauseHistory[runningTask.pauseHistory.length - 1]; 
            if (!last.pauseEnd) last.pauseEnd = Date.now(); 
        }
        
        // 执行恢复（时间已同步）
        runningTask.startTime = Date.now(); 
        runningTask.isPaused = false; 
        
        // 记录事件
        logEvent(EVENT_TYPES.TASK_RESUMED, {
            taskId: task.id,
            taskName: task.name,
            elapsedTime: runningTask.elapsedTime
        });
        
        // 同步到云端
        if (isLoggedIn()) {
            DAL.updateRunningTask(task.id, runningTask).catch(e => {
                console.error('[FloatingTimer] DAL.updateRunningTask failed:', e);
            });
        }
        
        saveData(); 
        updateRecentTasks(); 
        updateCategoryTasks();
    } else {
        console.log('[FloatingTimer] No action needed. Action:', action, 'isPaused:', runningTask.isPaused);
    }
};

// [v7.18.3-fix] 检查待处理的悬浮窗操作（用于应用从后台恢复时），支持时间同步
function checkPendingFloatingTimerAction() {
    if (!window.Android || !window.Android.getPendingFloatingTimerAction) {
        console.log('[FloatingTimer] Native method not available');
        return;
    }
    
    try {
        const pendingJson = window.Android.getPendingFloatingTimerAction();
        if (pendingJson && pendingJson.trim() !== '') {
            const pending = JSON.parse(pendingJson);
            console.log('[FloatingTimer] Found pending action from native:', pending);
            if (pending.action && pending.taskName) {
                // [v7.18.3-fix] 传递 elapsedTime 参数
                window.__onFloatingTimerAction(pending.action, pending.taskName, pending.elapsedTime);
            }
        } else {
            console.log('[FloatingTimer] No pending action found');
        }
    } catch (e) {
        console.error('[FloatingTimer] Error checking pending action:', e);
    }
}

async function cancelTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    const r = runningTasks.get(taskId);
    const elapsedTime = r ? (r.elapsedTime + (r.isPaused ? 0 : Date.now() - r.startTime)) : 0;

    logEvent(EVENT_TYPES.TASK_CANCELLED, {
        taskId: taskId,
        taskName: task?.name,
        elapsedTime: elapsedTime
    });

    if (task && window.Android && window.Android.stopFloatingTimer) {
        try {
            window.Android.stopFloatingTimer(task.name);
        } catch(e) { console.error(e); }
    }

    runningTasks.delete(taskId);

    if (isLoggedIn()) {
        DAL.stopTask(taskId).catch(e => {
            console.error('[cancelTask] DAL.stopTask failed:', e);
        });
    }

    await saveData();
    updateRecentTasks();
    updateCategoryTasks();
}

async function stopTask(taskId) {
    console.log('[stopTask] called with taskId:', taskId);
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    const runningTask = runningTasks.get(taskId);
    console.log('[stopTask] taskIndex:', taskIndex, 'runningTask:', runningTask);
    if (taskIndex === -1 || !runningTask) return;
    console.log('[stopTask] continuing...');
    const task = tasks[taskIndex];
    const stopEventTime = new Date();
    if (window.Android && window.Android.stopFloatingTimer) {
        try {
            window.Android.stopFloatingTimer(task.name);
        } catch(e) { console.error("Float stop failed", e); }
    }

    const totalSeconds = Math.floor((runningTask.elapsedTime + (runningTask.isPaused ? 0 : Date.now() - runningTask.startTime)) / 1000);
    const pauseHistory = runningTask.pauseHistory || [];

    console.log('[stopTask] deleting from runningTasks, totalSeconds:', totalSeconds);
    runningTasks.delete(taskId);
    console.log('[stopTask] runningTasks.has(taskId) after delete:', runningTasks.has(taskId));
    task.lastUsed = Date.now();
    if (isLoggedIn()) {
        await DAL.stopTask(taskId).catch(e => {
            console.error('[stopTask] DAL.stopTask cloud delete failed:', e);
        });
    }

    if (totalSeconds > 0) {
        if (['continuous', 'continuous_target'].includes(task.type)) {
            let baseEarnedTime = Math.floor(totalSeconds * task.multiplier);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            let timeStr = '';
            if (hours > 0) timeStr += `${hours}小时`;
            if (minutes > 0) timeStr += `${minutes}分`;
            if (seconds > 0 || timeStr === '') timeStr += `${seconds}秒`;
            let earnedTimeDescription = ` (${timeStr} × ${task.multiplier})`;
            const targetMet = task.type === 'continuous_target' && (runningTask.achieved || totalSeconds >= task.targetTime);

            if (targetMet) {
                baseEarnedTime += task.bonusReward;
                if (task.bonusReward > 0) earnedTimeDescription += ` + ${formatTime(task.bonusReward)} 达标奖励`;
            }

            if (task.isHabit) {
                const todayStr = getLocalDateString(new Date());
                const completionsToday = transactions.filter(t => t.taskId === taskId && getLocalDateString(t.timestamp) === todayStr).length;
                if (completionsToday >= (task.habitDetails.dailyLimit || Infinity)) {
                    showAlert('已达到此习惯的每日完成上限');
                } else {
                    if (task.type === 'continuous_target' && !targetMet) {
                        await processNormalCompletion(task, baseEarnedTime, earnedTimeDescription, stopEventTime, pauseHistory, { isTargetNotMet: true });
                    } else {
                        await processHabitCompletion(task, baseEarnedTime, stopEventTime, earnedTimeDescription, pauseHistory);
                    }
                }
            } else {
                const isTargetNotMet = task.type === 'continuous_target' && !targetMet;
                await processNormalCompletion(task, baseEarnedTime, earnedTimeDescription, stopEventTime, pauseHistory, { isTargetNotMet });
            }
        } else if (task.type === 'redeem') {
            const isNegativeBalance = currentBalance < 0;
            const applyPenaltyMultiplier = shouldApplyNegativeBalancePenalty(currentBalance);
            const quotaMode = task.isHabit && task.habitDetails ? (task.habitDetails.quotaMode || 'none') : 'none';
            const quotaSeconds = task.isHabit && task.habitDetails ? (task.habitDetails.targetCountInPeriod || 0) * 60 : 0;
            const usedSeconds = (quotaMode !== 'none') ? getQuotaPeriodUsage(task) : 0;
            let finalSpentTime = task.consumeTime;
            let quotaDesc = '';
            if (quotaMode === 'quota' && quotaSeconds > 0) {
                finalSpentTime = calculateQuotaSpendInstant(quotaSeconds, usedSeconds, task.consumeTime);
                if (usedSeconds < quotaSeconds) {
                    quotaDesc = ' (额度内50%)';
                } else {
                    quotaDesc = ' (超出额度200%)';
                }
            }
            const preHolidayCost = applyPenaltyMultiplier ? Math.floor(finalSpentTime * 1.2) : finalSpentTime;
            const finalCost = preHolidayCost;
            const penaltyDesc = isNegativeBalance ? (applyPenaltyMultiplier ? ' (余额不足×1.2)' : ' (负余额预警)') : '';

            currentBalance -= finalCost;
            task.completionCount = (task.completionCount || 0) + 1;
            task.lastUsed = Date.now();
            addTransaction({
                type: 'spend',
                taskId: task.id,
                taskName: task.name,
                amount: finalCost,
                description: `兑换项目: ${task.name} (${formatTimeNoSeconds(task.consumeTime).replace(/小时0分$/, '小时')})${quotaDesc}${applyPenaltyMultiplier ? ' (余额不足, 1.2倍消耗)' : ''}`,
                negativeBalanceWarning: isNegativeBalance,
                negativeBalancePenaltyApplied: applyPenaltyMultiplier
            });
            updateDailyChanges('spent', finalCost);
            showNotification('🎁 兑换成功', `成功兑换: ${task.name}，消费 ${formatTime(finalCost)}${quotaDesc}${penaltyDesc}`, 'achievement');
        } else if (task.type === 'continuous_redeem') {
            const isNegativeBalance = currentBalance < 0;
            const applyPenaltyMultiplier = shouldApplyNegativeBalancePenalty(currentBalance);
            const multiplier = task.multiplier || 1;
            let finalCost = Math.floor(totalSeconds * multiplier);
            const preHolidayCost = applyPenaltyMultiplier ? Math.floor(finalCost * 1.2) : finalCost;
            finalCost = preHolidayCost;
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            let timeStr = '';
            if (hours > 0) timeStr += `${hours}小时`;
            if (minutes > 0) timeStr += `${minutes}分`;
            if (seconds > 0 && hours === 0) timeStr += `${seconds}秒`;
            if (timeStr === '') timeStr = '0秒';
            const penaltyDesc = isNegativeBalance ? (applyPenaltyMultiplier ? ' (余额不足×1.2)' : ' (负余额预警)') : '';

            currentBalance -= finalCost;
            task.completionCount = (task.completionCount || 0) + 1;
            task.lastUsed = Date.now();
            addTransaction({
                type: 'spend',
                taskId: task.id,
                taskName: task.name,
                amount: finalCost,
                description: `计时消费: ${task.name} (${timeStr} × ${multiplier})${applyPenaltyMultiplier ? ' (余额不足, 1.2倍消耗)' : ''}`,
                negativeBalanceWarning: isNegativeBalance,
                negativeBalancePenaltyApplied: applyPenaltyMultiplier
            });
            updateDailyChanges('spent', finalCost);
            showNotification('🎁 兑换成功', `成功兑换: ${task.name}，消费 ${formatTime(finalCost)}${penaltyDesc}`, 'achievement');
        }
    } else {
        logEvent(EVENT_TYPES.TASK_STOPPED, {
            taskId: task.id,
            taskName: task.name,
            taskType: task.type,
            elapsedSeconds: totalSeconds,
            earnedAmount: 0,
            targetMet: false,
            pauseHistory: pauseHistory
        });
        recordLocalEvent(EVENT_TYPES.TASK_STOPPED, {
            taskId: task.id,
            taskName: task.name,
            taskType: task.type,
            elapsedSeconds: totalSeconds,
            earnedAmount: 0,
            targetMet: false
        }, stopEventTime.toISOString());
    }

    if (task.reminderDetails && task.reminderDetails.status === 'pending' && !task.reminderDetails.isRecurring) {
        task.reminderDetails.status = 'triggered';
    }

    saveData();
    updateAllUI();
}

async function redeemTask(taskId) {
    try {
        lastLocalActionTime = Date.now();
        const taskIndex = tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;
        const task = tasks[taskIndex];

        const isNegativeBalance = currentBalance < 0;
        const applyPenaltyMultiplier = shouldApplyNegativeBalancePenalty(currentBalance);
        const baseCost = task.consumeTime;
        // [v7.24.0] 习惯戒除额度模式计算
        const quotaMode = task.isHabit && task.habitDetails ? (task.habitDetails.quotaMode || 'none') : 'none';
        const quotaCount = task.isHabit && task.habitDetails ? (task.habitDetails.targetCountInPeriod || 0) : 0;
        const usedCount = (quotaMode === 'quota' && quotaCount > 0) ? getQuotaPeriodUsage(task) : 0;
        let quotaCost = baseCost;
        let quotaDesc = '';
        if (quotaMode === 'quota' && quotaCount > 0) {
            quotaCost = calculateQuotaSpendInstant(quotaCount, usedCount, baseCost);
            if (usedCount < quotaCount) {
                quotaDesc = ' (额度内50%)';
            } else {
                quotaDesc = ' (超出额度200%)';
            }
        }
        const preHolidayCost = applyPenaltyMultiplier ? Math.floor(quotaCost * 1.2) : quotaCost;
        const finalCost = preHolidayCost;
        const penaltyDesc = isNegativeBalance
            ? (applyPenaltyMultiplier ? ' (余额不足×1.2)' : ' (负余额预警)')
            : '';
        let description = `兑换项目: ${task.name} (${formatTimeNoSeconds(baseCost).replace(/小时0分$/, '小时')})${quotaDesc}`;

        if (task.appPackage && window.Android && window.Android.launchApp) {
            try { window.Android.launchApp(task.appPackage); } catch (e) { console.error('launchApp failed', e); }
        }

        if (applyPenaltyMultiplier) {
            description += ` (余额不足, 1.2倍消耗)`;
        }

        currentBalance -= finalCost;
        task.completionCount = (task.completionCount || 0) + 1;
        task.lastUsed = Date.now();
        addTransaction({
            type: 'spend',
            taskId: task.id,
            taskName: task.name,
            amount: finalCost,
            description: description,
            negativeBalanceWarning: isNegativeBalance,
            negativeBalancePenaltyApplied: applyPenaltyMultiplier
        });
        updateDailyChanges('spent', finalCost);

        if (task.reminderDetails && task.reminderDetails.status === 'pending' && !task.reminderDetails.isRecurring) {
            task.reminderDetails.status = 'triggered';
        }

        await saveData();
        updateAllUI();
        showNotification('🎁 兑换成功', `成功兑换: ${task.name}，消费 ${formatTime(finalCost)}${quotaDesc}${penaltyDesc}`, 'achievement');
    } catch (e) {
        console.error('[redeemTask] error:', e);
    }
}

// --- History Modal and Undo ---

// [v5.5.2] 获取补录类型信息（图标和标签）
// 🤖 自动补录：系统自动检测并补录漏记录
// 🔧 自动修正：系统自动检测并修正多记录
// 📆 手动补录：用户手动补录过往记录
function getBackdateTypeInfo(transaction) {
    if (!transaction.isBackdate && !transaction.isAutoDetected) {
        return { icon: '', label: '' };
    }
    if (transaction.isAutoDetected) {
        if (transaction.autoDetectType === 'correction') {
            // 系统自动修正多记录
            return { icon: '🔧', label: '自动修正' };
        } else {
            // 系统自动补录漏记录
            return { icon: '🤖', label: '自动补录' };
        }
    }
    // 用户手动补录
    return { icon: '📆', label: '手动补录' };
}

// [v4.5.1] Reworked showTaskHistory to initialize views
function showTaskHistory(taskId) { 
    const task = tasks.find(t => t.id === taskId); 
    if (!task) return; 
    currentHistoryTask = task; 
    
    // [v4.5.0] Reset states
    currentHistoryView = 'list';
    currentHistoryCalendarDate = new Date();
    currentHistorySelectedDate = null; // [v5.1.0] Reset selected date filter
    
    document.getElementById('historyModalTitle').textContent = `${task.name} - 历史记录`; 
    
    // Render list view by default
    const listContainer = document.getElementById('historyContentList'); 
    const taskTransactions = transactions
        .filter(t => t.taskId === taskId && !t.undone)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); 

    // 屏幕时间有独立卡片，不在任务历史中展示
    if (task.type === 'screen_time') {
        listContainer.innerHTML = '<div class="empty-message">屏幕时间使用专属卡片展示，不在任务历史中显示</div>';
    } else if (taskTransactions.length === 0) {
        listContainer.innerHTML = '<div class="empty-message">暂无历史记录</div>'; 
    } else { 
        listContainer.innerHTML = taskTransactions.map(transaction => { 
            const isPositive = transaction.type === 'earn' || (!transaction.type && transaction.amount > 0);
            const amount = Math.abs(transaction.amount);

            // 使用统一解析规则，分离标题与详情
            const parsed = parseTransactionDescription(transaction);
            let title = parsed.title;
            const detail = parsed.detail;
            const hasWarning = parsed.warning;

            // [v5.8.0] 新图标组合逻辑：
            // ⚠️ 警告（余额不足）> ⭐ 习惯奖励 > 🎯 达标 > 🤖/🔧/📆 补录类型
            // 自动补录用🤖，自动修正用🔧，手动补录用📆
            let iconPrefix = '';
            if (hasWarning) iconPrefix += '⚠️';
            if (parsed.hasHabitBonus) iconPrefix += '⭐';
            if (parsed.isTarget && parsed.icon === '🎯') iconPrefix += '🎯';
            // 使用 parsed.icon 来区分自动补录(🤖)、自动修正(🔧)、手动补录(📆)
            if (parsed.icon === '🤖' || parsed.icon === '🔧') {
                iconPrefix += parsed.icon;
            } else if (parsed.isBackdate) {
                iconPrefix += '📆';
            }
            if (iconPrefix) iconPrefix += ' ';
            title = iconPrefix + title;

            const dateTimeStr = formatDateTime(transaction.timestamp);
            
            return `<div class="history-item" id="history-item-${transaction.id}">
                        <div class="history-info" title="${transaction.description}">
                            <div class="history-description">
                                <div class="desc-line-1">${title}</div>
                                ${detail ? `<div class="desc-line-2">${detail}</div>` : ''}
                            </div>
                            <div class="history-time">${dateTimeStr}</div>
                        </div>
                        <div class="history-amount-wrapper">
                            <div class="history-amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : '-'}${formatTime(amount)}</div>
                        </div>
                        <button class="undo-btn" onclick="undoTransaction('${transaction.id}')" title="撤回此条记录">撤回</button>
                    </div>`; 
        }).join(''); 
    }
    
    // [v5.1.0] Render both calendar and list views (combined view)
    renderTaskActivityCalendar();
    
    document.getElementById('historyModal').classList.add('show'); 
}

// [v4.5.1] New function to render the task-specific activity calendar
function renderTaskActivityCalendar() {
    const container = document.getElementById('historyContentCalendar');
    if (!currentHistoryTask) {
        container.innerHTML = '<div class="empty-message">错误：未找到任务</div>';
        return;
    }

    const task = currentHistoryTask;
    
    // [v4.5.0] 性能优化: 仅筛选一次
    const taskTransactions = transactions.filter(t => t.taskId === task.id && !t.undone);

    // 1. 聚合数据
    const dailyData = new Map();
    const isCountBased = ['reward', 'instant_redeem'].includes(task.type);
    const isEarn = ['reward', 'continuous', 'continuous_target'].includes(task.type);
    
    taskTransactions.forEach(t => {
        const localDateStr = getLocalDateString(t.timestamp);
        if (!dailyData.has(localDateStr)) {
            dailyData.set(localDateStr, { count: 0, amount: 0 });
        }
        const dayData = dailyData.get(localDateStr);
        dayData.count++;
        dayData.amount += t.amount;
    });

    // 2. 准备日历
    const year = currentHistoryCalendarDate.getFullYear();
    const month = currentHistoryCalendarDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // 3. 渲染导航
    let navHTML = `<div class="report-header" style="margin-bottom: var(--space-lg);">
        <h2 class="report-title" style="font-size: 1rem;">${year}年 ${month + 1}月</h2>
        <div class="heatmap-nav">
            <button id="taskCalPrevMonth" onclick="navigateTaskCalendar(-1)">&lt;</button>
            <button id="taskCalNextMonth" onclick="navigateTaskCalendar(1)">&gt;</button>
        </div>
    </div>`;
    
    // 4. 渲染网格
    let gridHTML = `<div class="heatmap-grid-wrapper">
        <div class="heatmap-weekdays">
            <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
        </div>
        <div class="heatmap-grid">`;
    
    for (let i = 0; i < firstDayOfMonth; i++) {
        gridHTML += `<div class="heatmap-spacer"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month, day);
        const localDateStr = getLocalDateString(currentDate);
        const data = dailyData.get(localDateStr);
        
        let colorClass = '';
        let title = `${localDateStr}`;

        if (data) {
            if (isCountBased) {
                // 阈值: 1, 2, 3+
                if (isEarn) {
                    if (data.count === 1) colorClass = 'task-cal-green-1';
                    else if (data.count === 2) colorClass = 'task-cal-green-2';
                    else if (data.count >= 3) colorClass = 'task-cal-green-3';
                } else {
                    if (data.count === 1) colorClass = 'task-cal-red-1';
                    else if (data.count === 2) colorClass = 'task-cal-red-2';
                    else if (data.count >= 3) colorClass = 'task-cal-red-3';
                }
                title += `: 完成 ${data.count} 次`;
            } else {
                // 阈值: <1h (0-3599s), 1-3h (3600-10800s), >3h (10801s+)
                if (isEarn) {
                    if (data.amount > 0 && data.amount < 3600) colorClass = 'task-cal-green-1';
                    else if (data.amount >= 3600 && data.amount <= 10800) colorClass = 'task-cal-green-2';
                    else if (data.amount > 10800) colorClass = 'task-cal-green-3';
                } else {
                    if (data.amount > 0 && data.amount < 3600) colorClass = 'task-cal-red-1';
                    else if (data.amount >= 3600 && data.amount <= 10800) colorClass = 'task-cal-red-2';
                    else if (data.amount > 10800) colorClass = 'task-cal-red-3';
                }
                title += `: 累计 ${formatTime(data.amount)}`;
            }
        }

        gridHTML += `<div class="heatmap-day" title="${title}" onclick="filterHistoryByDate('${localDateStr}')" style="cursor: pointer;">
                        <div class="heatmap-day-content ${colorClass}">${day}</div>
                     </div>`;
    }
    gridHTML += `</div></div>`;
    
    // 5. 渲染动态图例
    let legendHTML = `<div class="heatmap-legend">`;
    const colorPrefix = isEarn ? 'task-cal-green' : 'task-cal-red';
    const labels = isCountBased 
        ? ['1次', '2次', '3+次'] 
        : ['<1小时', '1-3小时', '>3小时'];
    
    legendHTML += `<div class="legend-item"><div class="legend-box ${colorPrefix}-1"></div> <span>${labels[0]}</span></div>`;
    legendHTML += `<div class="legend-item"><div class="legend-box ${colorPrefix}-2"></div> <span>${labels[1]}</span></div>`;
    legendHTML += `<div class="legend-item"><div class="legend-box ${colorPrefix}-3"></div> <span>${labels[2]}</span></div>`;
    legendHTML += `</div>`;
    
    // 组合并渲染
    container.innerHTML = navHTML + gridHTML + legendHTML;
    
    // 禁用 "Next" 按钮（如果是在当月）
    const nextMonth = new Date(year, month + 1, 1);
    document.getElementById('taskCalNextMonth').disabled = nextMonth > new Date();
}

// [v4.5.0] New function to navigate the task calendar
function navigateTaskCalendar(offset) {
    currentHistoryCalendarDate.setMonth(currentHistoryCalendarDate.getMonth() + offset);
    renderTaskActivityCalendar();
}

// [v5.1.0] State for selected date filter
let currentHistorySelectedDate = null;

// [v5.1.0] Filter history list by clicked date
function filterHistoryByDate(dateStr) {
    if (!currentHistoryTask) return;
    const listContainer = document.getElementById('historyContentList');
    const listHeader = document.querySelector('.history-list-header');
    
    // Toggle: click same date again to show all
    if (currentHistorySelectedDate === dateStr) {
        currentHistorySelectedDate = null;
        if (listHeader) listHeader.innerHTML = '历史记录';
    } else {
        currentHistorySelectedDate = dateStr;
        if (listHeader) listHeader.innerHTML = `历史记录 <span style="font-weight: normal; font-size: 0.8rem; color: var(--text-color-light);">(筛选: ${dateStr}) <span onclick="filterHistoryByDate('${dateStr}')" style="cursor: pointer; color: var(--color-primary);">[显示全部]</span></span>`;
    }
    
    // Re-render list with filter
    const taskId = currentHistoryTask.id;
    let taskTransactions = transactions
        .filter(t => t.taskId === taskId && !t.undone)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (currentHistorySelectedDate) {
        taskTransactions = taskTransactions.filter(t => getLocalDateString(t.timestamp) === currentHistorySelectedDate);
    }
    
    if (taskTransactions.length === 0) {
        listContainer.innerHTML = '<div class="empty-message">当天无记录</div>';
    } else {
        listContainer.innerHTML = taskTransactions.map(transaction => {
            const isPositive = transaction.type === 'earn' || (!transaction.type && transaction.amount > 0);
            const amount = Math.abs(transaction.amount);

            // 使用统一解析规则，分离标题与详情
            const parsed = parseTransactionDescription(transaction);
            let title = parsed.title;
            const detail = parsed.detail;
            const hasWarning = parsed.warning;

            // [v5.8.0] 图标逻辑修复：自动补录用🤖，自动修正用🔧，手动补录用📆
            let iconPrefix = '';
            if (hasWarning) iconPrefix += '⚠️';
            if (parsed.hasHabitBonus) iconPrefix += '⭐';
            if (parsed.isTarget && parsed.icon === '🎯') iconPrefix += '🎯';
            if (parsed.icon === '🤖' || parsed.icon === '🔧') {
                iconPrefix += parsed.icon;
            } else if (parsed.isBackdate) {
                iconPrefix += '📆';
            }
            if (iconPrefix) iconPrefix += ' ';
            title = iconPrefix + title;

            const dateTimeStr = formatDateTime(transaction.timestamp);
            
            return `<div class="history-item" id="history-item-${transaction.id}">
                        <div class="history-info" title="${transaction.description}">
                            <div class="history-description">
                                <div class="desc-line-1">${title}</div>
                                ${detail ? `<div class="desc-line-2">${detail}</div>` : ''}
                            </div>
                            <div class="history-time">${dateTimeStr}</div>
                        </div>
                        <div class="history-amount-wrapper">
                            <div class="history-amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : '-'}${formatTime(amount)}</div>
                        </div>
                        <button class="undo-btn" onclick="undoTransaction('${transaction.id}')" title="撤回此条记录">撤回</button>
                    </div>`;
        }).join('');
    }
    
    // Highlight selected day in calendar
    document.querySelectorAll('#historyContentCalendar .heatmap-day').forEach(el => {
        el.classList.remove('selected');
    });
    if (currentHistorySelectedDate) {
        document.querySelectorAll('#historyContentCalendar .heatmap-day').forEach(el => {
            if (el.getAttribute('title')?.startsWith(currentHistorySelectedDate)) {
                el.classList.add('selected');
            }
        });
    }
}

// [v4.3.0] Modified undoTransaction to call rebuildHabitStreak
// [v7.1.4] 简化：移除 USE_EVENT_SOURCING 分支
async function undoTransaction(transactionId) { 
    const transactionIndex = transactions.findIndex(t => t.id === transactionId); 
    if (transactionIndex === -1) return; 
    const transaction = transactions[transactionIndex]; 
    if (!await showConfirm(`确定要撤回这条记录吗？\n\n描述: ${transaction.description}\n金额: ${transaction.type === 'earn' ? '+' : '-'}${formatTime(transaction.amount)}\n\n此操作将影响总余额、每日统计和任务完成次数，且无法恢复。`, '撤回记录')) return; 
    
    const task = tasks.find(t => t.id === transaction.taskId);
    
    // [v7.1.4] 旁听记录撤回事件
    logEvent(EVENT_TYPES.TRANSACTION_UNDONE, {
targetTransactionId: transactionId,
taskId: transaction.taskId,
taskName: transaction.taskName,
amount: transaction.amount,
type: transaction.type,
originalTimestamp: transaction.timestamp
    });
    
    // [v7.22.0] 已移除：撤回触发利息重算机制
    
    performLegacyUndo(transaction, transactionIndex, task);
    
    // [v4.5.0] Refresh history view if it's open
    if (task && currentHistoryTask && currentHistoryTask.id === task.id) {
if (currentHistoryView === 'list') {
    const historyItemElement = document.getElementById(`history-item-${transactionId}`); 
    if (historyItemElement) { 
        historyItemElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease'; 
        historyItemElement.style.opacity = '0'; 
        historyItemElement.style.transform = 'translateX(20px)'; 
        setTimeout(() => { 
            historyItemElement.remove(); 
            if (!document.getElementById('historyContentList').querySelector('.history-item')) {
                document.getElementById('historyContentList').innerHTML = '<div class="empty-message">暂无历史记录</div>'; 
            }
        }, 300); 
    }
} else {
    // Refresh calendar view
    renderTaskActivityCalendar();
}
    }
    
    showNotification('↩️ 操作已撤回', `成功撤回记录: ${transaction.taskName}`, 'achievement'); 
}

// [v5.9.0] 传统撤回逻辑提取为独立函数
function performLegacyUndo(transaction, transactionIndex, task) {
    if (transaction.type === 'earn') { 
currentBalance -= transaction.amount; 
updateDailyChanges('earned', -transaction.amount, new Date(transaction.timestamp)); 
    } else { 
currentBalance += transaction.amount; 
updateDailyChanges('spent', -transaction.amount, new Date(transaction.timestamp)); 
    } 
    
    if (task) { 
if (task.completionCount > 0) task.completionCount--; 
    } 
    
    transactions.splice(transactionIndex, 1); 
    
    // [v4.3.0] If it was a habit, trigger a full rebuild
    // [v7.2.3] 修复：所有类型的习惯任务撤回都需要重建连胜
    if (task && task.isHabit) {
rebuildHabitStreak(task);
    }
    
    // [v6.6.0] CloudBase: 同步删除云端交易
    if (isLoggedIn()) {
DAL.deleteTransaction(transaction.id)
    .then(() => {
        console.log('[undoTransaction] ✅ 云端删除成功:', transaction.id);
    })
    .catch(err => {
        console.error('[undoTransaction] ❌ 云端删除失败:', err.code, err.message);
        showNotification('⚠️ 同步失败', `撤回记录未能同步到云端: ${err.message}`, 'error');
    });
    }
    
    // [v7.14.0] 修复：撤销睡眠交易时，强制重算对应日期的 dailyChanges，确保清除残留缓存
    if (transaction.sleepData || transaction.taskName === '睡眠时间管理') {
const txDate = getLocalDateString(new Date(transaction.timestamp));
recalculateDailyStats(txDate);
console.log(`[performLegacyUndo] 睡眠记录已撤销，重算 ${txDate} 的 dailyChanges`);
    }
    
    saveData(); 
    updateAllUI(); 
}
function hideHistoryModal() { document.getElementById('historyModal').classList.remove('show'); currentHistoryTask = null; }
// --- Backdate Modal ---
// [v4.2.0] Updated showBackdateModal to support 'count' mode
function showBackdateModal(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    currentBackdateTaskId = taskId;
    document.getElementById('backdateTaskName').textContent = task.name;
    document.getElementById('backdateTaskId').value = taskId;
    
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('backdateDate').value = `${yyyy}-${mm}-${dd}`;
    document.getElementById('backdateDate').max = `${yyyy}-${mm}-${dd}`;
    
    // Reset forms
    document.getElementById('backdateHours').value = '';
    document.getElementById('backdateMinutes').value = '';
    document.getElementById('backdateCount').value = '1';
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;
    document.getElementById('backdateStartTime').value = currentTime;
    document.getElementById('backdateEndTime').value = currentTime;
    
    clearFormErrors();
    
    // [v4.2.0] Auto-select mode based on task type
    const isDurationTask = ['continuous', 'continuous_target', 'continuous_redeem'].includes(task.type);
    
    document.getElementById('backdateModeSwitchContainer').classList.toggle('hidden', !isDurationTask);
    document.getElementById('backdateDurationMode').classList.toggle('hidden', isDurationTask);
    document.getElementById('backdateRangeMode').classList.toggle('hidden', isDurationTask);
    document.getElementById('backdateCountMode').classList.toggle('hidden', isDurationTask);

    if (isDurationTask) {
        switchBackdateMode('duration');
    } else {
        // It's 'reward' or 'instant_redeem', force 'count' mode
        currentBackdateMode = 'count';
        document.getElementById('backdateDurationMode').classList.add('hidden');
        document.getElementById('backdateRangeMode').classList.add('hidden');
        document.getElementById('backdateCountMode').classList.remove('hidden');
    }
    
    document.getElementById('backdateModal').classList.add('show');
}

function hideBackdateModal() { document.getElementById('backdateModal').classList.remove('show'); currentBackdateTaskId = null; }

// [v5.6.0] 手动检测补录功能已删除，改用自动补录系统

// [v4.2.0] switchBackdateMode now only handles duration/range
function switchBackdateMode(mode) {
    currentBackdateMode = mode;
    document.getElementById('backdateDurationMode').classList.toggle('hidden', mode !== 'duration');
    document.getElementById('backdateRangeMode').classList.toggle('hidden', mode === 'duration');
    document.querySelectorAll('#backdateModal .mode-switch button').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
    clearFormErrors();
}

// [v4.3.0] Reworked saveBackdate to NOT call processHabitCompletion, calls rebuildHabitStreak instead
async function saveBackdate(event) {
    event.preventDefault(); clearFormErrors();
    const taskId = document.getElementById('backdateTaskId').value;
    const task = tasks.find(t => t.id === taskId);
    if (!task) { showAlert('发生错误：找不到任务'); return; }
    
    const dateStr = document.getElementById('backdateDate').value;
    if (!dateStr) { showAlert('请选择补记日期'); return; }

    // [v4.5.4] FIX: Use real time if backdating for "today"
    let backdateTimestamp;
    const todayStr = getLocalDateString(new Date());

    if (dateStr === todayStr) {
        backdateTimestamp = new Date(); // Use current time
    } else {
        // Set the timestamp to noon on the selected date to avoid timezone issues
        const [year, month, day] = dateStr.split('-').map(Number);
        backdateTimestamp = new Date(year, month - 1, day, 12, 0, 0); 
    }

    let hasError = false;
    let totalSeconds = 0;
    let completionCount = 0;
    
    if (currentBackdateMode === 'count') {
        completionCount = parseInt(document.getElementById('backdateCount').value);
        if (isNaN(completionCount) || completionCount < 1) {
            showFieldError('backdateCount', '补录次数必须大于0'); hasError = true;
        }
    } else if (currentBackdateMode === 'duration') {
        const hours = parseInt(document.getElementById('backdateHours').value || '0');
        const minutes = parseInt(document.getElementById('backdateMinutes').value || '0');
        if (isNaN(hours) || hours < 0 || isNaN(minutes) || minutes < 0 || minutes > 59) {
            showFieldError('backdateDuration', '请输入有效的小时和分钟'); hasError = true;
        } else {
            totalSeconds = (hours * 3600) + (minutes * 60);
            if (totalSeconds <= 0) { showFieldError('backdateDuration', '总时长必须大于0'); hasError = true; }
        }
        completionCount = 1; // Duration tasks are always 1 completion
    } else { // range mode
        const startTimeStr = document.getElementById('backdateStartTime').value;
        const endTimeStr = document.getElementById('backdateEndTime').value;
        if (!startTimeStr || !endTimeStr) {
            if (!startTimeStr) showFieldError('backdateStartTime', '请输入开始时间');
            if (!endTimeStr) showFieldError('backdateEndTime', '请输入结束时间');
            hasError = true;
        } else {
            const startDateTime = new Date(`${dateStr}T${startTimeStr}`);
            const endDateTime = new Date(`${dateStr}T${endTimeStr}`);
            if (endDateTime <= startDateTime) { showFieldError('backdateEndTime', '结束时间必须晚于开始时间'); hasError = true; } 
            else { totalSeconds = (endDateTime - startDateTime) / 1000; }
        }
        completionCount = 1; // Range tasks are always 1 completion
    }
    
    if (hasError) return;
    
    let totalAmountEarned = 0;
    let totalAmountSpent = 0;
    let didHabitBackdate = false;

    // --- Start processing loop ---
    for (let i = 0; i < completionCount; i++) {
        let amount = 0;
        let transactionType = '';
        let description = `补录: ${task.name}`;
        let hasHistoricalPenalty = false;
        let hasNegativeBalanceWarning = false;

        // --- Handle Habit Daily Limit Check ---
        // [v7.1.0] 戒除类任务不检查每日上限，因为它们用周期额度控制
        if (task.isHabit && task.habitDetails.type !== 'abstinence') {
            const dailyLimit = task.habitDetails.dailyLimit || Infinity;
            // Get completions *on that day*, including ones we just added in this loop
            const completionsOnBackdate = transactions.filter(t => 
                t.taskId === taskId && 
                t.type === 'earn' && 
                getLocalDateString(t.timestamp) === dateStr
            ).length;
            
            if (completionsOnBackdate >= dailyLimit) {
                showAlert(`补录失败：任务 "${task.name}" 在 ${dateStr} 的每日上限为 ${dailyLimit} 次，无法继续添加。`);
                hasError = true;
                break; // Stop the loop
            }
        }

        // --- Calculate Amount and Type ---
        if (task.type === 'reward') {
            transactionType = 'earn';
            amount = task.fixedTime;
            
            if (task.isHabit) {
                // [v4.3.0] This is the core logic change.
                // We DO NOT call processHabitCompletion.
                // We just add a simple transaction. The rebuild will handle the streak.
                didHabitBackdate = true;
                description += ' (补录)';
            }
            
        } else if (task.type === 'instant_redeem') {
            transactionType = 'spend';
            amount = task.consumeTime;
            description += ` (${formatTimeNoSeconds(task.consumeTime).replace(/小时0分$/, '小时')})`;
            const netChangeSinceThen = transactions
                .filter(t => new Date(t.timestamp) > backdateTimestamp)
                .reduce((sum, t) => sum + (t.type === 'earn' ? t.amount : -t.amount), 0);
            const historicalBalance = currentBalance - netChangeSinceThen;
            const isNegativeBalance = historicalBalance < 0;
            const applyHistoricalPenalty = shouldApplyNegativeBalancePenalty(historicalBalance);
            
            if (isNegativeBalance) {
                hasNegativeBalanceWarning = true;
            }
            if (applyHistoricalPenalty) {
                amount = Math.floor(amount * 1.2);
                hasHistoricalPenalty = true;
            }

        } else if (['continuous', 'continuous_target'].includes(task.type)) {
            transactionType = 'earn';
            amount = Math.floor(totalSeconds * task.multiplier);
            // [v7.9.10] 修复：超过1小时不显示秒
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            let timeStr = '';
            if (hours > 0) timeStr += `${hours}小时`;
            if (minutes > 0) timeStr += `${minutes}分`;
            if (seconds > 0 && hours === 0) timeStr += `${seconds}秒`; // 有小时时不显示秒
            if (timeStr === '') timeStr = '0秒';
            description += ` (${timeStr} × ${task.multiplier})`;
            if (task.type === 'continuous_target' && totalSeconds >= task.targetTime && task.bonusReward > 0) {
                amount += task.bonusReward;
                 description += ` + ${formatTime(task.bonusReward)} 达标奖励`;
            }
            // [v5.7.0] 修复：continuous/continuous_target 类型的习惯任务补录也需要触发 rebuildHabitStreak
            if (task.isHabit) {
                didHabitBackdate = true;
            }

        } else if (task.type === 'continuous_redeem') {
            transactionType = 'spend';
            const netChangeSinceThen = transactions
                .filter(t => new Date(t.timestamp) > backdateTimestamp)
                .reduce((sum, t) => sum + (t.type === 'earn' ? t.amount : -t.amount), 0);
            const historicalBalance = currentBalance - netChangeSinceThen;
            const isNegativeBalance = historicalBalance < 0;
            const applyHistoricalPenalty = shouldApplyNegativeBalancePenalty(historicalBalance);

            amount = Math.floor(totalSeconds * task.multiplier);
            // [v7.9.10] 修复：超过1小时不显示秒
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            let timeStr = '';
            if (hours > 0) timeStr += `${hours}小时`;
            if (minutes > 0) timeStr += `${minutes}分`;
            if (seconds > 0 && hours === 0) timeStr += `${seconds}秒`; // 有小时时不显示秒
            if (timeStr === '') timeStr = '0秒';
            description += ` (${timeStr} × ${task.multiplier})`;
            if (isNegativeBalance) {
                hasNegativeBalanceWarning = true;
            }
            if (applyHistoricalPenalty) {
                amount = Math.floor(amount * 1.2);
                hasHistoricalPenalty = true;
            }
        }
        
        // [v7.25.0] 均衡调整：earn 走余额倍率，spend 仅节假日允许倍率
        let balanceAdjustInfo = null;
        if (transactionType === 'earn' && balanceMode.enabled) {
            const multiplier = getBalanceMultiplier();
            if (multiplier !== 1.0) {
                const originalAmount = amount;
                amount = Math.round(amount * multiplier);
                description += ` ×${multiplier} (均衡调整)`;
                balanceAdjustInfo = { multiplier, originalAmount };
            }
        } else if (transactionType === 'spend' && balanceMode.enabled) {
            // No holiday multiplier in v7.30.1+
        }
        
        if (amount <= 0 && !didHabitBackdate) { 
            showAlert('计算出的时间量为0，无法补录'); hasError = true; break; 
        }
        
        // --- Add Transaction (for non-habit reward tasks) ---
        addTransaction({ 
            type: transactionType, 
            taskId: task.id, 
            taskName: task.name, 
            amount: amount, 
            description: description, 
            timestamp: backdateTimestamp.toISOString(),
            isBackdate: true,
            historicalPenalty: hasHistoricalPenalty,
            negativeBalanceWarning: hasNegativeBalanceWarning,
            isStreakAdvancement: false, // [v4.3.0] ALWAYS false, rebuild will set it
            balanceAdjust: balanceAdjustInfo // [v7.4.0] 记录均衡调整信息
        });
        
        if (transactionType === 'earn') { currentBalance += amount; totalAmountEarned += amount; updateDailyChanges('earned', amount, backdateTimestamp); } 
        else { currentBalance -= amount; totalAmountSpent += amount; updateDailyChanges('spent', amount, backdateTimestamp); }
        task.completionCount = (task.completionCount || 0) + 1;
    }
    // --- End processing loop ---

    // [v4.3.0] Trigger rebuild AFTER all transactions are added
    if (didHabitBackdate) {
        rebuildHabitStreak(task);
    }

    if (hasError) {
        // If we hit an error (like daily limit), we still save changes made up to that point
        saveData(); updateAllUI();
        return;
    }
    
    saveData(); updateAllUI(); hideBackdateModal();
    let notifyMsg = `成功为 ${dateStr} 
                    补录 ${task.name}`;
    if (completionCount > 1) notifyMsg += ` ${completionCount} 次`;
    if (totalAmountEarned > 0) notifyMsg += ` (获得 ${formatTime(totalAmountEarned)})`;
    if (totalAmountSpent > 0) notifyMsg += ` (消费 ${formatTime(totalAmountSpent)})`;
    showNotification('📆 补录成功', notifyMsg, 'achievement');
}
function syncHabitRebuildToCloud(task, changedTransactions, prevTxSnapshotMap, prevStreak, prevLastCompletionDate) {
    if (!isLoggedIn()) return;
    
    const newStreak = task.habitDetails?.streak || 0;
    const newLastCompletionDate = task.habitDetails?.lastCompletionDate || null;
    const hasTxChanges = changedTransactions && changedTransactions.length > 0;
    const streakChanged = (prevStreak || 0) !== newStreak;
    const lastDateChanged = (prevLastCompletionDate || null) !== newLastCompletionDate;
    
    if (!hasTxChanges && !streakChanged && !lastDateChanged) return;
    
    (async () => {
try {
    await DAL.saveTask(task);
    console.log('[syncHabitRebuildToCloud] ✅ 任务连胜已同步:', task.name);
} catch (err) {
    console.error('[syncHabitRebuildToCloud] ❌ 任务同步失败:', err.code, err.message);
}

if (hasTxChanges) {
    for (const tx of changedTransactions) {
        try {
            const prevTx = prevTxSnapshotMap?.get(tx.id) || null;
            await DAL.updateTransaction(tx, prevTx);
        } catch (err) {
            console.error('[syncHabitRebuildToCloud] ❌ 交易同步失败:', tx.id, err.code, err.message);
        }
    }
}
    })();
}

// [v4.3.0] New Function: Rebuilds habit streak from scratch based on transaction history
// [v4.3.1] Fix: Corrected date parsing to be timezone-safe
function rebuildHabitStreak(task) {
    if (!task || !task.isHabit) return;

    console.log(`Rebuilding streak for: ${task.name}`);

    const prevStreak = task.habitDetails?.streak || 0;
    const prevLastCompletionDate = task.habitDetails?.lastCompletionDate || null;
    const prevTxSnapshotMap = new Map();
    transactions.forEach(t => {
if (t.taskId === task.id) {
    prevTxSnapshotMap.set(t.id, {
        id: t.id,
        taskId: t.taskId,
        taskName: t.taskName,
        amount: t.amount,
        type: t.type,
        timestamp: t.timestamp,
        description: t.description,
        isStreakAdvancement: t.isStreakAdvancement,
        isSystem: t.isSystem,
        rawSeconds: t.rawSeconds
    });
}
    });

    // 1. Get all relevant transactions, sorted oldest-to-newest
    const taskTransactions = transactions
.filter(t => t.taskId === task.id && t.type === 'earn')
.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // 2. Reset all streak advancement markers for this task
    transactions.forEach(t => {
if (t.taskId === task.id) {
    t.isStreakAdvancement = false;
}
    });

    // 3. Iterate and rebuild
    let newStreak = 0;
    let lastAdvancementDateStr = null; // The date (YYYY-MM-DD) of the last period that advanced the streak
    let lastAdvancementTransactionId = null;

    const { period, targetCountInPeriod } = task.habitDetails;
    const targetCount = targetCountInPeriod || 1;

    // Group transactions by their period
    const periods = new Map(); // Key: periodStartDateStr, Value: { count: number, firstTxDate, advancementTx }
    
    // [v7.2.3] 判断是否是计时类任务（需要按时长统计）
    const isDurationBased = (task.type === 'continuous' || task.type === 'continuous_redeem');
    
    for (const tx of taskTransactions) {
const txDate = new Date(tx.timestamp);

// [v4.3.0] Get the *start* date of the period this tx belongs to
let periodStartDate;
if (period === 'daily') {
    periodStartDate = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate());
} else if (period === 'weekly') {
    const day = txDate.getDay(); // 0 (Sun) to 6 (Sat)
    const diff = day === 0 ? 6 : day - 1; // Days since Monday (0 if Mon, 6 if Sun)
    periodStartDate = new Date(txDate.getTime() - diff * 86400000);
    periodStartDate.setHours(0, 0, 0, 0);
} else { // monthly
    periodStartDate = new Date(txDate.getFullYear(), txDate.getMonth(), 1);
}

const periodKey = getLocalDateString(periodStartDate);

if (!periods.has(periodKey)) {
    periods.set(periodKey, { count: 0, firstTxDate: txDate, advancementTx: null });
}

const periodData = periods.get(periodKey);

// [v7.2.3] 根据任务类型决定计数方式
if (isDurationBased) {
    // [v7.24.1] 统一按原始秒数换算，避免自动补录使用整日 actualMinutes 误计
    const txSeconds = getRawUsageSecondsFromTransaction(tx);
    let txMinutes = Math.floor(txSeconds / 60);
    if (txMinutes === 0) txMinutes = 1; // 至少算1分钟
    periodData.count += txMinutes;
} else {
    // 非计时类：按次数
    periodData.count++;
}

// If this transaction causes the count to meet the target, mark it as advancement
if (periodData.advancementTx === null && periodData.count >= targetCount) {
    periodData.advancementTx = tx;
}
    }

    // Now iterate through the periods *in order*
    const sortedPeriodKeys = Array.from(periods.keys()).sort();
    
    // [v5.8.1] 记录需要补发的习惯奖励总额
    let totalBonusAwarded = 0;

    for (const periodKey of sortedPeriodKeys) {
const periodData = periods.get(periodKey);

// Check if this period met the target
if (periodData.count >= targetCount) {
    const currentPeriodDate = new Date(periodData.firstTxDate);
    currentPeriodDate.setHours(0, 0, 0, 0);

    if (lastAdvancementDateStr) {
        // Check if this period is consecutive
        // [v4.3.1] Fix: Use timezone-safe date constructor
        const [y, m, d] = lastAdvancementDateStr.split('-').map(Number);
        const lastDate = new Date(y, m - 1, d); // Creates local midnight
        
        const diffDays = (currentPeriodDate - lastDate) / 86400000;
        let isConsecutive = false;

        if (period === 'daily') {
            isConsecutive = (diffDays === 1);
        } else if (period === 'weekly') {
            isConsecutive = (diffDays === 7);
        } else if (period === 'monthly') {
            const lastMonth = lastDate.getFullYear() * 12 + lastDate.getMonth();
            const currentMonth = currentPeriodDate.getFullYear() * 12 + currentPeriodDate.getMonth();
            isConsecutive = (currentMonth === lastMonth + 1);
        }
        
        if (isConsecutive) {
            newStreak++;
        } else {
            newStreak = 1; // Streak broken, reset to 1
        }
    } else {
        newStreak = 1; // First ever advancement
    }
    
    lastAdvancementDateStr = getLocalDateString(currentPeriodDate);
    
    // Mark the transaction that caused the advancement
    if (periodData.advancementTx) {
        periodData.advancementTx.isStreakAdvancement = true;
        lastAdvancementTransactionId = periodData.advancementTx.id;
        
        // [v5.8.1] 核心修复：计算并补发习惯奖励
        // 计算当前 streak 对应的习惯奖励
        let habitBonusReward = 0;
        if (task.habitDetails.rewards && task.habitDetails.rewards.length > 0) {
            task.habitDetails.rewards.forEach(rule => {
                if (newStreak >= rule.start) {
                    let ruleReward = (rule.type === 'fixed') ? rule.value : (rule.value * newStreak);
                    // 应用递增奖励上限
                    if (rule.limit && ruleReward > rule.limit) {
                        ruleReward = rule.limit;
                    }
                    habitBonusReward += ruleReward;
                }
            });
        }
        
        // 检查该交易是否已包含习惯奖励
        const tx = periodData.advancementTx;
        const baseReward = task.fixedTime || (task.type === 'continuous' || task.type === 'continuous_target' ? tx.amount : 0);
        
        // 如果交易描述中没有"习惯奖励"字样，说明需要补发
        if (habitBonusReward > 0 && !tx.description.includes('习惯奖励')) {
            const oldAmount = tx.amount;
            tx.amount = oldAmount + habitBonusReward;
            tx.description += ` (含习惯奖励 ${formatTime(habitBonusReward)})`;
            
            // 更新余额和每日统计
            currentBalance += habitBonusReward;
            updateDailyChanges('earned', habitBonusReward, new Date(tx.timestamp));
            totalBonusAwarded += habitBonusReward;
            
            console.log(`🎁 补发习惯奖励: ${task.name} 第${newStreak}次连续, +${formatTime(habitBonusReward)}`);
        }
    }
}
    }
    
    // [v5.8.1] 如果有补发奖励，显示通知
    if (totalBonusAwarded > 0) {
showNotification('🎁 习惯奖励补发', `${task.name} 补发习惯连续奖励 ${formatTime(totalBonusAwarded)}`, 'achievement');
    }
    
    // 4. Apply new state
    task.habitDetails.streak = newStreak;
    
    // Find the actual timestamp of the last advancement
    if (lastAdvancementTransactionId) {
const lastTx = transactions.find(t => t.id === lastAdvancementTransactionId);
if (lastTx) {
    task.habitDetails.lastCompletionDate = getLocalDateString(lastTx.timestamp);
} else {
    task.habitDetails.lastCompletionDate = null; // Should not happen
}
    } else {
task.habitDetails.lastCompletionDate = null;
    }

    // 5. Set UI status
    // Check streak against "today" to set isBroken flag for UI
    checkHabitStreak(task, new Date());
    console.log(`Rebuild complete. New streak: ${newStreak}, Last advancement: ${task.habitDetails.lastCompletionDate}`);

    const changedTransactions = [];
    transactions.forEach(t => {
if (t.taskId !== task.id) return;
const prevTx = prevTxSnapshotMap.get(t.id);
if (!prevTx) return;
if (prevTx.isStreakAdvancement !== t.isStreakAdvancement || prevTx.amount !== t.amount || prevTx.description !== t.description) {
    changedTransactions.push(t);
}
    });
    
    syncHabitRebuildToCloud(task, changedTransactions, prevTxSnapshotMap, prevStreak, prevLastCompletionDate);
}
