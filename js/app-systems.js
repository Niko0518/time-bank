function initDeviceId() {
    if (currentDeviceId) return currentDeviceId; // 已初始化
    
    if (typeof Android !== 'undefined' && Android.getDeviceId) {
        currentDeviceId = Android.getDeviceId();
        console.log('[initDeviceId] Android 设备ID:', currentDeviceId);
    } else {
        // Web 环境使用随机生成的 ID（存储在 localStorage）
        currentDeviceId = localStorage.getItem('deviceId');
        if (!currentDeviceId) {
            currentDeviceId = 'web_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('deviceId', currentDeviceId);
        }
        console.log('[initDeviceId] Web 设备ID:', currentDeviceId);
    }
    return currentDeviceId;
}

function getLatestDeviceSettings(deviceSettingsMap) {
    if (!deviceSettingsMap || typeof deviceSettingsMap !== 'object') return null;
    let latest = null;
    Object.entries(deviceSettingsMap).forEach(([deviceId, settings]) => {
        if (!settings) return;
        const ts = Date.parse(settings.lastUpdated || '') || 0;
        if (!latest || ts > latest.ts) {
            latest = { deviceId, settings, ts };
        }
    });
    return latest;
}

// 初始化屏幕时间设置
function initScreenTimeSettings() {
    // [v7.11.2] 使用原生日志确保可见
    const nlog = (msg) => {
        console.log('[initScreenTimeSettings] ' + msg);
        if (window.Android?.nativeLog) {
            window.Android.nativeLog('initSTS', msg);
        }
    };
    
    nlog('开始初始化');
    
    // [v7.2.3] 确保设备ID已初始化
    initDeviceId();
    nlog('deviceId: ' + currentDeviceId);
    
    // [v7.11.2] 优先从 Android 原生存储加载（最可靠）
    let nativeLoaded = false;
    if (typeof Android !== 'undefined' && Android.getScreenTimeSettingsNative) {
        try {
            const nativeSaved = Android.getScreenTimeSettingsNative();
            nlog('Android原生: ' + (nativeSaved ? 'len=' + nativeSaved.length : 'empty'));
            if (nativeSaved) {
                const parsed = JSON.parse(nativeSaved);
                screenTimeSettings = { ...screenTimeSettings, ...parsed };
                nativeLoaded = true;
                nlog('原生加载成功, enabled=' + screenTimeSettings.enabled);
            }
        } catch (e) {
            nlog('原生加载失败: ' + e.message);
        }
    }
    
    // 如果原生存储没有数据，尝试 localStorage
    if (!nativeLoaded) {
        const saved = localStorage.getItem('screenTimeSettings');
        nlog('localStorage: ' + (saved ? 'exists' : 'null'));
        if (saved) {
            try {
                screenTimeSettings = { ...screenTimeSettings, ...JSON.parse(saved) };
                nlog('localStorage加载成功, enabled=' + screenTimeSettings.enabled);
            } catch (e) {
                nlog('localStorage解析失败: ' + e.message);
            }
        }
    }
    
    // 记录本地加载后的状态
    const localEnabled = screenTimeSettings.enabled;
    const localUpdated = Date.parse(screenTimeSettings.lastUpdated || '') || 0;
    nlog('本地状态: enabled=' + localEnabled + ', lastUpdated=' + localUpdated);
    
    // 2. 如果已登录，尝试与云端同步（云端按设备ID存储）
    nlog('isLoggedIn=' + isLoggedIn() + ', hasProfileData=' + !!DAL.profileData);
    if (isLoggedIn() && currentDeviceId) {
        const deviceMap = DAL.profileData?.deviceScreenTimeSettings || {};
        const cloudSTS = deviceMap[currentDeviceId];
        const cloudUpdated = cloudSTS ? (Date.parse(cloudSTS.lastUpdated || '') || 0) : 0;
        
        nlog('云端设备数: ' + Object.keys(deviceMap).length);
        nlog('云端配置: ' + (cloudSTS ? 'exists,enabled=' + cloudSTS.enabled : 'null'));
        nlog('时间比较: local=' + localUpdated + ', cloud=' + cloudUpdated);

        if (cloudSTS && cloudUpdated > localUpdated) {
            nlog('使用云端配置');
            const localSettledDates = screenTimeSettings.settledDates || {};
            screenTimeSettings = { ...screenTimeSettings, ...cloudSTS };

            // settledDates 特殊处理
            if (!screenTimeSettings.settledDates || typeof screenTimeSettings.settledDates !== 'object') {
                screenTimeSettings.settledDates = localSettledDates;
            }
            if (cloudSTS.settledDates && Array.isArray(cloudSTS.settledDates)) {
                screenTimeSettings.settledDates[currentDeviceId] = cloudSTS.settledDates;
            }
            // 保存到本地
            saveScreenTimeSettings();
        } else if (localUpdated > 0 && localUpdated > cloudUpdated) {
            nlog('本地较新，同步到云端');
            saveScreenTimeSettings();
        } else if (!cloudSTS && Object.keys(deviceMap).length > 0) {
            // 当前设备无云端配置但有其他设备配置时，尝试恢复
            const latest = getLatestDeviceSettings(deviceMap);
            if (latest && latest.settings && latest.ts > localUpdated) {
                nlog('从其他设备恢复: ' + latest.deviceId);
                const fallback = { ...latest.settings };
                delete fallback.settledDates;
                screenTimeSettings = { ...screenTimeSettings, ...fallback };
                saveScreenTimeSettings();
            }
        } else {
            nlog('保持本地配置');
        }
    } else {
        nlog('未登录或无profileData，使用本地');
    }
    
    nlog('最终状态: enabled=' + screenTimeSettings.enabled);
    
    // [v7.2.1] 确保当前设备的 settledDates 数组存在
    if (!screenTimeSettings.settledDates) {
        screenTimeSettings.settledDates = {};
    }
    if (currentDeviceId && !screenTimeSettings.settledDates[currentDeviceId]) {
        screenTimeSettings.settledDates[currentDeviceId] = [];
    }
    
    // 更新 UI
    const screenToggle = document.getElementById('screenTimeToggle');
    nlog('UI更新: toggle=' + (screenToggle ? 'exists' : 'null') + ', 设置checked=' + screenTimeSettings.enabled);
    if (screenToggle) {
        screenToggle.checked = screenTimeSettings.enabled;
        nlog('设置后toggle.checked=' + screenToggle.checked);
    }
    document.getElementById('screenTimeLimitHours').value = Math.floor(screenTimeSettings.dailyLimitMinutes / 60);
    document.getElementById('screenTimeLimitMinutes').value = screenTimeSettings.dailyLimitMinutes % 60;
    document.getElementById('screenTimeCardToggle').checked = screenTimeSettings.showCard;
    document.getElementById('whitelistCount').textContent = `${screenTimeSettings.whitelistApps.length} 个应用不计入使用时间`;
    
    // [v6.0.0] 修复：直接调用 setCardStyle 确保所有元素同步（包括 body.glass-mode）
    const cardStyle = screenTimeSettings.cardStyle || 'classic';
    setCardStyle(cardStyle);
    // [v6.4.x] 应用通透强度（无论模式，以便下次切换已准备好）
    applyGlassStrength(screenTimeSettings.glassStrength || 100, false);
    applyGlassBlurStrength(screenTimeSettings.glassBlurStrength || 100, false);
    
    // [v7.11.2] 从云端 profile.screenTimeCategories 恢复分类标签（跨设备共享）
    if (isLoggedIn() && DAL.profileData?.screenTimeCategories) {
        const categories = DAL.profileData.screenTimeCategories;
        if (categories.earnCategory !== undefined) {
            screenTimeSettings.earnCategory = categories.earnCategory;
        }
        if (categories.spendCategory !== undefined) {
            screenTimeSettings.spendCategory = categories.spendCategory;
        }
        nlog('从云端恢复分类: earn=' + screenTimeSettings.earnCategory + ', spend=' + screenTimeSettings.spendCategory);
    }
    
    // [v5.10.0] 初始化分类选择器
    updateScreenTimeCategorySelectors();
    
    // [v7.11.2] 强制更新 UI 状态（确保与数据同步）
    if (screenTimeSettings.enabled) {
        document.getElementById('screenTimeSettings').classList.remove('hidden');
        document.getElementById('screenTimeStatus').textContent = '已启用';
    } else {
        document.getElementById('screenTimeSettings').classList.add('hidden');
        document.getElementById('screenTimeStatus').textContent = '未启用';
    }
    
    // [v7.11.2] 延迟再次更新，确保 WebView 渲染完成
    setTimeout(() => {
        const toggle = document.getElementById('screenTimeToggle');
        if (toggle && toggle.checked !== screenTimeSettings.enabled) {
            nlog('延迟修正: toggle.checked=' + toggle.checked + ' -> ' + screenTimeSettings.enabled);
            toggle.checked = screenTimeSettings.enabled;
        }
    }, 100);
    
    updateScreenTimeCardVisibility();
    updateLastSettleTimeDisplay();
}

// 保存设置（本地 + 云端）
function saveScreenTimeSettings() {
    // [v7.11.2] 详细调试日志
    console.log('[saveScreenTimeSettings] 开始保存, enabled:', screenTimeSettings.enabled);
    
    // [v7.9.6] 添加更新时间戳（用于云端恢复时的时间比较）
    screenTimeSettings.lastUpdated = new Date().toISOString();
    
    const settingsJson = JSON.stringify(screenTimeSettings);
    
    // [v7.11.2] 优先使用 Android 原生存储（更可靠）
    if (typeof Android !== 'undefined' && Android.saveScreenTimeSettingsNative) {
        try {
            Android.saveScreenTimeSettingsNative(settingsJson);
            console.log('[saveScreenTimeSettings] Android 原生存储成功');
        } catch (e) {
            console.error('[saveScreenTimeSettings] Android 原生存储失败:', e);
        }
    }
    
    // 同时保存到 localStorage（作为备份和网页端兼容）
    try {
        localStorage.setItem('screenTimeSettings', settingsJson);
        console.log('[saveScreenTimeSettings] localStorage 保存成功');
    } catch (e) {
        console.error('[saveScreenTimeSettings] localStorage 保存失败:', e);
    }
    
    // [v7.9.6] 调试日志：检查云端同步条件
    console.log('[saveScreenTimeSettings] 条件检查:', {
        isLoggedIn: isLoggedIn(),
        profileId: DAL.profileId,
        currentDeviceId,
        enabled: screenTimeSettings.enabled
    });
    
    // [v7.2.3] 同步到云端 Profile，按设备ID区分配置
    // 结构: deviceScreenTimeSettings: { deviceId1: {...}, deviceId2: {...} }
    if (isLoggedIn() && DAL.profileId && currentDeviceId) {
        const cloudSettings = {
            enabled: screenTimeSettings.enabled,
            dailyLimitMinutes: screenTimeSettings.dailyLimitMinutes,
            whitelistApps: screenTimeSettings.whitelistApps || [],
            showCard: screenTimeSettings.showCard,
            // [v7.2.4] earnCategory/spendCategory 改为云端统一存储，不在设备配置中
            cardStyle: screenTimeSettings.cardStyle,
            glassStrength: screenTimeSettings.glassStrength,
            glassBlurStrength: screenTimeSettings.glassBlurStrength,
            enabledDate: screenTimeSettings.enabledDate,
            // [v7.2.4] 新增：已结算日期列表（当前设备的）
            settledDates: screenTimeSettings.settledDates?.[currentDeviceId] || [],
            // [v7.9.6] 新增：自动检测上次检查日期（防止设备重启丢失）
            autoDetect: screenTimeSettings.autoDetect || null,
            lastUpdated: screenTimeSettings.lastUpdated
        };
        
        console.log('[saveScreenTimeSettings] 准备保存到云端:', cloudSettings);
        
        // 使用 _.set 来更新嵌套字段
        const updateKey = `deviceScreenTimeSettings.${currentDeviceId}`;
        DAL.saveProfile({ [updateKey]: _.set(cloudSettings) })
            .then(() => console.log('[saveScreenTimeSettings] 云端同步成功'))
            .catch(e => {
                console.error('[saveScreenTimeSettings] 云端同步失败:', e.message, e);
            });
    } else {
        console.warn('[saveScreenTimeSettings] 云端同步跳过 - 条件不满足');
    }
}

// [v7.2.4] 保存设备特定数据到云端（屏幕时间历史、自动检测原始记录、分类排序、主题色）
function saveDeviceSpecificData() {
    if (!isLoggedIn() || !DAL.profileId || !currentDeviceId) return;
    
    try {
        const deviceData = {
            // 设备名称
            deviceName: localStorage.getItem('tb_device_name') || '',
            // 屏幕时间历史记录
            screenTimeHistory: JSON.parse(localStorage.getItem('screenTimeHistory') || '[]'),
            // 自动检测原始记录（设备级）
            autoDetectRawRecords: JSON.parse(localStorage.getItem('autoDetectRawRecords') || '{}'),
            // 分类排序顺序
            categoryOrder: JSON.parse(localStorage.getItem('categoryOrder') || '{"earn":[],"spend":[]}'),
            // [v7.2.4] 主题色
            accentTheme: localStorage.getItem('accentTheme') || 'sky-blue',
            lastUpdated: new Date().toISOString()
        };
        
        const updateKey = `deviceSpecificData.${currentDeviceId}`;
        DAL.saveProfile({ [updateKey]: _.set(deviceData) }).catch(e => {
            console.warn('[saveDeviceSpecificData] 云端同步失败:', e.message);
        });
    } catch (e) {
        console.warn('[saveDeviceSpecificData] 解析数据失败:', e.message);
    }
}

// [v7.2.4] 防抖保存设备特定数据（避免频繁写入）
let saveDeviceSpecificDataTimer = null;
function saveDeviceSpecificDataDebounced() {
    if (saveDeviceSpecificDataTimer) clearTimeout(saveDeviceSpecificDataTimer);
    saveDeviceSpecificDataTimer = setTimeout(saveDeviceSpecificData, 2000);
}

// [v7.2.4] 设备名称设置（含云端重名检测）
async function setDeviceName(newName) {
    const trimmedName = (newName || '').trim();
    if (!trimmedName) {
        showNotification('设备名称不能为空', '', 'warning');
        return false;
    }
    
    // 检查云端是否有相同名称的其他设备
    if (isLoggedIn() && DAL.profileData) {
        const deviceSpecificData = DAL.profileData.deviceSpecificData || {};
        const existingDevice = Object.entries(deviceSpecificData).find(([deviceId, data]) => {
            return deviceId !== currentDeviceId && data.deviceName && 
                   data.deviceName.toLowerCase() === trimmedName.toLowerCase();
        });
        
        if (existingDevice) {
            const [existingDeviceId, existingData] = existingDevice;
            const lastUpdated = existingData.lastUpdated ? new Date(existingData.lastUpdated).toLocaleString('zh-CN') : '未知';
            
            // 显示选择弹窗
            const choice = await showDeviceNameConflictDialog(trimmedName, existingDeviceId, lastUpdated, existingData);
            
            if (choice === 'clone') {
                // 克隆旧设备数据到当前设备
                await cloneDeviceData(existingDeviceId);
                showNotification('已克隆设备配置', `已从旧设备同步配置到当前设备`, 'success');
            } else if (choice === 'independent') {
                // 作为独立设备，自动添加序号
                const newNameWithIndex = await generateUniqueDeviceName(trimmedName);
                localStorage.setItem('tb_device_name', newNameWithIndex);
                saveDeviceSpecificDataDebounced();
                showNotification('设备名称已设置', `新名称: ${newNameWithIndex}`, 'success');
                return true;
            } else {
                // 取消操作
                return false;
            }
        }
    }
    
    // 正常保存
    localStorage.setItem('tb_device_name', trimmedName);
    saveDeviceSpecificDataDebounced();
    return true;
}

// [v7.2.4] 生成唯一设备名称（添加序号）
async function generateUniqueDeviceName(baseName) {
    if (!isLoggedIn() || !DAL.profileData) {
        return baseName;
    }
    
    const deviceSpecificData = DAL.profileData.deviceSpecificData || {};
    const existingNames = Object.values(deviceSpecificData)
        .map(d => d.deviceName?.toLowerCase())
        .filter(Boolean);
    
    if (!existingNames.includes(baseName.toLowerCase())) {
        return baseName;
    }
    
    // 寻找可用的序号
    for (let i = 2; i <= 10; i++) {
        const candidateName = `${baseName} (${i})`;
        if (!existingNames.includes(candidateName.toLowerCase())) {
            return candidateName;
        }
    }
    
    // 最后用时间戳
    return `${baseName} (${Date.now().toString(36).slice(-4)})`;
}

// [v7.2.4] 设备名称冲突选择弹窗
function showDeviceNameConflictDialog(deviceName, existingDeviceId, lastUpdated, existingData) {
    return new Promise((resolve) => {
        const isGlass = document.body.classList.contains('glass-mode');
        
        const overlay = document.createElement('div');
        overlay.id = 'device-name-conflict-overlay';
        overlay.className = 'modal-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
        
        const dialog = document.createElement('div');
        dialog.className = isGlass ? 'glass' : '';
        dialog.style.cssText = `
            background: var(--background-color);
            border-radius: 16px;
            padding: 24px;
            max-width: 400px;
            width: 100%;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        `;
        
        // 获取旧设备的一些配置预览
        const oldAccent = existingData.accentTheme || '默认';
        const oldHistoryCount = existingData.screenTimeHistory?.length || 0;
        
        dialog.innerHTML = `
            <h3 style="margin:0 0 16px 0;color:var(--text-color);font-size:18px;">🔄 检测到相同设备名称</h3>
            <p style="color:var(--text-color-secondary);margin-bottom:16px;line-height:1.5;">
                云端已存在名为 "<strong>${escapeHtml(deviceName)}</strong>" 的设备配置。
            </p>
            <div style="background:var(--btn-secondary-bg);border-radius:12px;padding:12px;margin-bottom:16px;">
                <div style="color:var(--text-color-secondary);font-size:13px;">
                    <div>📅 最后更新: ${lastUpdated}</div>
                    <div>🎨 主题色: ${oldAccent}</div>
                    <div>📊 屏幕时间记录: ${oldHistoryCount} 条</div>
                </div>
            </div>
            <p style="color:var(--text-color);margin-bottom:20px;line-height:1.5;">
                请选择处理方式：
            </p>
            <div style="display:flex;flex-direction:column;gap:12px;">
                <button id="deviceConflictClone" style="padding:14px 20px;border:none;border-radius:12px;background:var(--color-primary);color:white;font-size:15px;cursor:pointer;text-align:left;">
                    <strong>📥 继承旧设备配置</strong><br>
                    <span style="font-size:13px;opacity:0.9;">适用于更换新设备，同步旧配置</span>
                </button>
                <button id="deviceConflictIndependent" style="padding:14px 20px;border:none;border-radius:12px;background:var(--btn-secondary-bg);color:var(--text-color);font-size:15px;cursor:pointer;text-align:left;">
                    <strong>📱 作为独立设备</strong><br>
                    <span style="font-size:13px;opacity:0.7;">自动添加序号区分，保持独立配置</span>
                </button>
                <button id="deviceConflictCancel" style="padding:12px 20px;border:none;border-radius:12px;background:transparent;color:var(--text-color-secondary);font-size:14px;cursor:pointer;">
                    取消
                </button>
            </div>
        `;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        document.getElementById('deviceConflictClone').onclick = () => {
            overlay.remove();
            resolve('clone');
        };
        document.getElementById('deviceConflictIndependent').onclick = () => {
            overlay.remove();
            resolve('independent');
        };
        document.getElementById('deviceConflictCancel').onclick = () => {
            overlay.remove();
            resolve('cancel');
        };
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve('cancel');
            }
        };
    });
}

// [v7.2.4] 克隆旧设备数据到当前设备
async function cloneDeviceData(sourceDeviceId) {
    if (!DAL.profileData?.deviceSpecificData?.[sourceDeviceId]) return;
    
    const sourceData = DAL.profileData.deviceSpecificData[sourceDeviceId];
    
    // 克隆各项设置到本地
    if (sourceData.deviceName) {
        localStorage.setItem('tb_device_name', sourceData.deviceName);
    }
    if (sourceData.accentTheme) {
        // [v7.20.0] 导入时进行主题迁移
        const themeMigration = {
            'blue-purple': 'sky-blue',
            'pink-white': 'warm-earth'
        };
        let migratedAccent = sourceData.accentTheme;
        if (themeMigration[migratedAccent]) {
            console.log(`[v7.20.0] 导入主题迁移: ${migratedAccent} -> ${themeMigration[migratedAccent]}`);
            migratedAccent = themeMigration[migratedAccent];
        }
        localStorage.setItem('accentTheme', migratedAccent);
        setAccentTheme(migratedAccent);
    }
    if (sourceData.categoryOrder) {
        localStorage.setItem('categoryOrder', JSON.stringify(sourceData.categoryOrder));
        if (typeof profileData !== 'undefined') {
            profileData.categoryOrder = sourceData.categoryOrder;
        }
    }
    if (sourceData.screenTimeHistory && sourceData.screenTimeHistory.length > 0) {
        localStorage.setItem('screenTimeHistory', JSON.stringify(sourceData.screenTimeHistory));
    }
    
    // 克隆屏幕时间配置
    if (DAL.profileData?.deviceScreenTimeSettings?.[sourceDeviceId]) {
        const sourceSTS = DAL.profileData.deviceScreenTimeSettings[sourceDeviceId];
        const localSTS = JSON.parse(localStorage.getItem('screenTimeSettings') || '{}');
        Object.assign(localSTS, sourceSTS);
        // settledDates 需要特殊处理
        if (sourceSTS.settledDates) {
            if (!localSTS.settledDates) localSTS.settledDates = {};
            localSTS.settledDates[currentDeviceId] = sourceSTS.settledDates;
        }
        localStorage.setItem('screenTimeSettings', JSON.stringify(localSTS));
        if (typeof screenTimeSettings !== 'undefined') {
            Object.assign(screenTimeSettings, localSTS);
        }
    }
    
    // 保存当前设备的配置到云端
    saveDeviceSpecificData();
    saveScreenTimeSettings();
}

// [v5.10.0] 更新分类选择器选项
// [v6.4.0] 重构为支持自定义弹窗
let categorySelectCurrentType = null; // 'earn' 或 'spend'
let earnCategoriesCache = [];
let spendCategoriesCache = [];
let categoryBottomSheetDragBound = false;
let bottomSheetDragState = null;
let bottomSheetPointerId = null;
let bottomSheetClosing = false;
let glassStrengthRaf = null;
let glassBlurRaf = null;

function initBottomSheetDrag(modalId, onClose) {
    if (categoryBottomSheetDragBound) return; // 仅绑定一次
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const content = modal.querySelector('.bottom-sheet-content');
    const header = modal.querySelector('.bottom-sheet-header');
    if (!content || !header) return;

    const getY = (e) => (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;

    const onStart = (e) => {
        bottomSheetDragState = {
            startY: getY(e),
            delta: 0,
        };
        bottomSheetPointerId = e.pointerId ?? null;
        content.classList.add('dragging');
        content.style.transition = 'none';
        if (content.setPointerCapture && bottomSheetPointerId !== null) {
            try { content.setPointerCapture(bottomSheetPointerId); } catch (_) {}
        }
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onEnd, { passive: false });
        window.addEventListener('pointercancel', onEnd, { passive: false });
        e.preventDefault();
    };

    const onMove = (e) => {
        if (!bottomSheetDragState) return;
        if (bottomSheetPointerId !== null && e.pointerId !== bottomSheetPointerId) return;
        const currentY = getY(e);
        const delta = Math.max(0, currentY - bottomSheetDragState.startY);
        bottomSheetDragState.delta = delta;
        content.style.transform = `translateY(${delta}px)`;
        e.preventDefault();
    };

    const onEnd = () => {
        if (!bottomSheetDragState) return;
        if (bottomSheetClosing) return;
        const delta = bottomSheetDragState.delta;
        const shouldClose = delta > 90;
        content.classList.remove('dragging');
        content.style.transition = 'transform 0.2s ease';
        if (shouldClose) {
            bottomSheetClosing = true;
            // 添加 slide-close 类保持滑出状态，然后直接关闭
            content.classList.add('slide-close');
            content.style.transform = '';
            content.style.transition = '';
            // 等待滑出动画完成后关闭
            setTimeout(() => {
                onClose();
                bottomSheetClosing = false;
            }, 220);
        } else {
            content.style.transform = 'translateY(0)';
            setTimeout(() => {
                content.style.transition = '';
                content.style.transform = '';
            }, 180);
        }
        if (content.releasePointerCapture && bottomSheetPointerId !== null) {
            try { content.releasePointerCapture(bottomSheetPointerId); } catch (_) {}
        }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        bottomSheetDragState = null;
        bottomSheetPointerId = null;
    };

    header.addEventListener('pointerdown', onStart);
    categoryBottomSheetDragBound = true;
}

function updateScreenTimeCategorySelectors() {
    // 收集所有分类（区分获得类和消耗类）
    const earnCategories = new Set();
    const spendCategories = new Set();
    
    tasks.forEach(task => {
        const isEarnType = ['reward', 'continuous', 'continuous_target'].includes(task.type);
        if (isEarnType) {
            earnCategories.add(task.category);
        } else {
            spendCategories.add(task.category);
        }
    });
    
    // 缓存分类列表供弹窗使用
    earnCategoriesCache = Array.from(earnCategories).sort();
    spendCategoriesCache = Array.from(spendCategories).sort();
    
    // 更新触发器显示文本
    const earnTrigger = document.getElementById('screenTimeEarnCategoryTrigger');
    const spendTrigger = document.getElementById('screenTimeSpendCategoryTrigger');
    const earnInput = document.getElementById('screenTimeEarnCategory');
    const spendInput = document.getElementById('screenTimeSpendCategory');
    
    if (earnTrigger && earnInput) {
        earnInput.value = screenTimeSettings.earnCategory || '';
        earnTrigger.textContent = screenTimeSettings.earnCategory || '屏幕（默认）';
    }
    if (spendTrigger && spendInput) {
        spendInput.value = screenTimeSettings.spendCategory || '';
        spendTrigger.textContent = screenTimeSettings.spendCategory || '屏幕（默认）';
    }
}

// [v5.10.0] 保存分类设置
// [v6.4.0] 改为从 hidden input 读取
// [v7.2.4] 分类改为云端统一存储（所有设备共享）
function updateScreenTimeCategories() {
    const earnInput = document.getElementById('screenTimeEarnCategory');
    const spendInput = document.getElementById('screenTimeSpendCategory');
    
    const oldEarnCategory = screenTimeSettings.earnCategory;
    const oldSpendCategory = screenTimeSettings.spendCategory;
    
    screenTimeSettings.earnCategory = earnInput.value || null;
    screenTimeSettings.spendCategory = spendInput.value || null;
    
    // 本地保存
    localStorage.setItem('screenTimeSettings', JSON.stringify(screenTimeSettings));
    
    // [v7.11.2] 同步保存到 Android 原生存储
    if (window.Android?.saveScreenTimeSettingsNative) {
        try {
            window.Android.saveScreenTimeSettingsNative(JSON.stringify(screenTimeSettings));
        } catch (e) {
            console.warn('[updateScreenTimeCategories] Android 原生存储失败:', e);
        }
    }
    
    // [v7.2.4] 云端统一保存分类（不分设备）
    if (isLoggedIn() && DAL.profileId) {
        DAL.saveProfile({
            screenTimeCategories: {
                earnCategory: screenTimeSettings.earnCategory,
                spendCategory: screenTimeSettings.spendCategory,
                lastUpdated: new Date().toISOString()
            }
        }).catch(e => {
            console.warn('[updateScreenTimeCategories] 云端同步失败:', e.message);
        });
    }
    
    // [v7.9.3] 更新历史屏幕时间交易记录的分类
    const earnChanged = oldEarnCategory !== screenTimeSettings.earnCategory;
    const spendChanged = oldSpendCategory !== screenTimeSettings.spendCategory;
    
    if (earnChanged || spendChanged) {
        updateHistoricalScreenTimeCategories(earnChanged, spendChanged);
    }
}

// [v7.9.3] 更新历史屏幕时间交易记录的分类
async function updateHistoricalScreenTimeCategories(updateEarn, updateSpend) {
    // 筛选屏幕时间交易（systemType 或 taskName 匹配）
    const screenTimeTransactions = transactions.filter(t => 
        t.systemType === 'screen-time' || 
        t.taskName === '屏幕时间管理'
    );
    
    console.log(`[updateHistoricalScreenTimeCategories] 找到 ${screenTimeTransactions.length} 条屏幕时间交易`);
    
    if (screenTimeTransactions.length === 0) {
        console.log('[updateHistoricalScreenTimeCategories] 没有屏幕时间交易记录需要更新');
        showNotification('ℹ️ 无需更新', '没有找到历史屏幕时间记录', 'info');
        return;
    }
    
    let updatedCount = 0;
    let cloudUpdatedCount = 0;
    const updatePromises = [];
    
    for (const t of screenTimeTransactions) {
        let needUpdate = false;
        
        // 节省时间 -> earnCategory
        if (updateEarn && t.type === 'earn') {
            const newCategory = screenTimeSettings.earnCategory || '系统';
            if (t.category !== newCategory) {
                t.category = newCategory;
                needUpdate = true;
            }
        }
        
        // 超出时间 -> spendCategory  
        if (updateSpend && t.type === 'spend') {
            const newCategory = screenTimeSettings.spendCategory || '系统';
            if (t.category !== newCategory) {
                t.category = newCategory;
                needUpdate = true;
            }
        }
        
        if (needUpdate) {
            updatedCount++;
            console.log(`[updateHistoricalScreenTimeCategories] 更新交易 ${t.id}: ${t.category}`);
            // 同步到云端 - 使用 transactionCache 获取云端文档 ID
            if (isLoggedIn() && db) {
                let cloudDocId = DAL.transactionCache?.get(t.id);
                
                // [v7.9.3] 如果缓存中没有，尝试从云端查询
                if (!cloudDocId) {
                    console.log(`[updateHistoricalScreenTimeCategories] 缓存未命中，查询云端: ${t.id}`);
                    try {
                        const queryRes = await db.collection('tb_transaction')
                            .where({ 'data.id': t.id })
                            .limit(1)
                            .get();
                        if (queryRes.data && queryRes.data.length > 0) {
                            cloudDocId = queryRes.data[0]._id;
                            // 补充缓存
                            DAL.transactionCache.set(t.id, cloudDocId);
                            console.log(`[updateHistoricalScreenTimeCategories] 云端查询成功: ${cloudDocId}`);
                        }
                    } catch (queryErr) {
                        console.warn(`[updateHistoricalScreenTimeCategories] 云端查询失败: ${t.id}`, queryErr.message);
                    }
                }
                
                if (cloudDocId) {
                    console.log(`[updateHistoricalScreenTimeCategories] 云端更新 docId: ${cloudDocId}`);
                    updatePromises.push(
                        db.collection('tb_transaction').doc(cloudDocId).update({
                            'data.category': t.category
                        }).then(() => {
                            cloudUpdatedCount++;
                        }).catch(e => {
                            console.warn('[updateHistoricalScreenTimeCategories] 更新交易失败:', t.id, e.message);
                        })
                    );
                } else {
                    console.log(`[updateHistoricalScreenTimeCategories] 云端无此记录，跳过: ${t.id}`);
                }
            }
        }
    }
    
    // 等待所有云端更新完成
    try {
        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
        }
    } catch (e) {
        console.error('[updateHistoricalScreenTimeCategories] 云端同步出错:', e);
    }
    
    // 无论是否更新云端，都保存本地数据
    saveData();
    
    if (updatedCount > 0) {
        console.log(`[updateHistoricalScreenTimeCategories] 已更新 ${updatedCount} 条屏幕时间交易记录的分类 (云端: ${cloudUpdatedCount})`);
        showNotification('✅ 分类已更新', `已更新 ${updatedCount} 条历史屏幕时间记录`, 'success');
        // 刷新报告页面（如果在报告页）
        if (document.querySelector('.report-page.active')) {
            updateReportPage();
        }
    } else {
        showNotification('ℹ️ 无需更新', '所有记录分类已是最新', 'info');
    }
}

// [v6.4.0] 分类选择弹窗控制函数
function showCategorySelectModal(type) {
    categorySelectCurrentType = type;
    const modal = document.getElementById('categorySelectModal');
    const title = document.getElementById('categorySelectModalTitle');
    const body = document.getElementById('categorySelectModalBody');
    const content = modal?.querySelector('.bottom-sheet-content');
    
    // 重置上次关闭留下的样式
    if (content) {
        content.classList.remove('slide-close', 'dragging');
        content.style.transform = '';
        content.style.transition = '';
    }
    
    initBottomSheetDrag('categorySelectModal', hideCategorySelectModal);
    
    title.textContent = type === 'earn' ? '选择节省时间分类' : '选择超出时间分类';
    
    const categories = type === 'earn' ? earnCategoriesCache : spendCategoriesCache;
    const currentValue = type === 'earn' 
        ? (screenTimeSettings.earnCategory || '') 
        : (screenTimeSettings.spendCategory || '');
    
    let html = `
        <div class="category-select-item ${currentValue === '' ? 'selected' : ''}" data-value="" onclick="selectScreenTimeCategory(this)">
            <div class="category-select-color" style="background: ${SCREEN_TIME_COLORS[0]};"></div>
            <div class="category-select-name">屏幕（默认）</div>
        </div>
    `;
    
    categories.forEach(cat => {
        const color = categoryColors.get(cat) || '#888';
        html += `
            <div class="category-select-item ${currentValue === cat ? 'selected' : ''}" data-value="${cat}" onclick="selectScreenTimeCategory(this)">
                <div class="category-select-color" style="background: ${color};"></div>
                <div class="category-select-name">${cat}</div>
            </div>
        `;
    });
    
    body.innerHTML = html;
    modal.classList.add('show');
}

function hideCategorySelectModal() {
    const modal = document.getElementById('categorySelectModal');
    const content = modal?.querySelector('.bottom-sheet-content');
    // 移除 show，触发 CSS transition 滑出
    modal?.classList.remove('show');
    if (content) {
        content.classList.remove('dragging');
        // 不在这里重置 transform/transition，防止闪回
        // 样式将在下次 show 时重置
    }
    bottomSheetClosing = false;
}

function selectScreenTimeCategory(item) {
    const value = item.dataset.value;
    const displayText = value || '屏幕（默认）';
    
    if (categorySelectCurrentType === 'earn') {
        document.getElementById('screenTimeEarnCategory').value = value;
        document.getElementById('screenTimeEarnCategoryTrigger').textContent = displayText;
    } else {
        document.getElementById('screenTimeSpendCategory').value = value;
        document.getElementById('screenTimeSpendCategoryTrigger').textContent = displayText;
    }
    
    hideCategorySelectModal();
    updateScreenTimeCategories();
}

// 点击背景关闭底部抽屉
document.getElementById('categorySelectModal')?.addEventListener('click', function(e) {
    if (e.target === this) hideCategorySelectModal();
});

// ============================================================================
// [v7.9.3] 睡眠分类选择功能
// ============================================================================

let sleepCategorySelectType = null; // 'earn' | 'spend'

// 显示睡眠分类选择弹窗
function showSleepCategorySelectModal(type) {
    sleepCategorySelectType = type;
    const modal = document.getElementById('categorySelectModal');
    const title = document.getElementById('categorySelectModalTitle');
    const body = document.getElementById('categorySelectModalBody');
    const content = modal?.querySelector('.bottom-sheet-content');
    
    // 重置上次关闭留下的样式
    if (content) {
        content.classList.remove('slide-close', 'dragging');
        content.style.transform = '';
        content.style.transition = '';
    }
    
    initBottomSheetDrag('categorySelectModal', hideCategorySelectModal);
    
    title.textContent = type === 'earn' ? '选择睡眠奖励分类' : '选择睡眠惩罚分类';
    
    const categories = type === 'earn' ? earnCategoriesCache : spendCategoriesCache;
    const currentValue = type === 'earn' 
        ? (sleepSettings.earnCategory || '') 
        : (sleepSettings.spendCategory || '');
    
    let html = `
        <div class="category-select-item ${currentValue === '' ? 'selected' : ''}" data-value="" onclick="selectSleepCategory(this)">
            <div class="category-select-color" style="background: ${SLEEP_CATEGORY_COLOR};"></div>
            <div class="category-select-name">睡眠（默认）</div>
        </div>
    `;
    
    categories.forEach(cat => {
        const color = categoryColors.get(cat) || '#888';
        html += `
            <div class="category-select-item ${currentValue === cat ? 'selected' : ''}" data-value="${cat}" onclick="selectSleepCategory(this)">
                <div class="category-select-color" style="background: ${color};"></div>
                <div class="category-select-name">${cat}</div>
            </div>
        `;
    });
    
    body.innerHTML = html;
    modal.classList.add('show');
}

// 选择睡眠分类
function selectSleepCategory(item) {
    const value = item.dataset.value;
    const displayText = value || '睡眠（默认）';
    
    if (sleepCategorySelectType === 'earn') {
        document.getElementById('sleepEarnCategory').value = value;
        document.getElementById('sleepEarnCategoryTrigger').textContent = displayText;
    } else {
        document.getElementById('sleepSpendCategory').value = value;
        document.getElementById('sleepSpendCategoryTrigger').textContent = displayText;
    }
    
    hideCategorySelectModal();
    updateSleepCategories();
}

// [v7.9.3] 更新睡眠分类设置（仿屏幕时间管理）
function updateSleepCategories() {
    const earnInput = document.getElementById('sleepEarnCategory');
    const spendInput = document.getElementById('sleepSpendCategory');
    
    const oldEarnCategory = sleepSettings.earnCategory;
    const oldSpendCategory = sleepSettings.spendCategory;
    
    sleepSettings.earnCategory = earnInput.value || null;
    sleepSettings.spendCategory = spendInput.value || null;
    
    // 本地保存
    saveSleepSettings();
    
    // [v7.9.3] 云端统一保存分类（不分设备，所有设备共享）
    if (isLoggedIn() && DAL.profileId) {
        DAL.saveProfile({
            sleepTimeCategories: {
                earnCategory: sleepSettings.earnCategory,
                spendCategory: sleepSettings.spendCategory,
                lastUpdated: new Date().toISOString()
            }
        }).catch(e => {
            console.warn('[updateSleepCategories] 云端同步失败:', e.message);
        });
    }
    
    // 检查变化并刷新报告页面
    const earnChanged = oldEarnCategory !== sleepSettings.earnCategory;
    const spendChanged = oldSpendCategory !== sleepSettings.spendCategory;
    
    if (earnChanged || spendChanged) {
        // 刷新报告页面（如果在报告页）
        if (document.querySelector('.report-page.active')) {
            updateReportPage();
        }
        showNotification('✅ 分类已更新', '睡眠记录分类已更改', 'success');
    }
}

// 更新历史睡眠交易记录的分类
async function updateHistoricalSleepCategories(updateEarn, updateSpend) {
    try {
    console.log('[updateHistoricalSleepCategories] 开始, updateEarn:', updateEarn, 'updateSpend:', updateSpend);
    console.log('[updateHistoricalSleepCategories] transactions 总数:', transactions.length);
    
    // [v7.9.7] 筛选睡眠相关交易（兼容历史数据带图标任务名）
    const sleepTransactions = transactions.filter(t => 
        t.sleepData || 
        t.taskName === '睡眠时间管理' ||
        t.taskName === '😴 睡眠时间管理' || 
        t.taskName === '小睡' ||
        t.taskName === '💤 小睡'
    );
    
    console.log(`[updateHistoricalSleepCategories] 找到 ${sleepTransactions.length} 条睡眠相关交易`);
    
    // 打印前3条用于调试
    sleepTransactions.slice(0, 3).forEach((t, i) => {
        console.log(`[updateHistoricalSleepCategories] 交易[${i}]:`, t.id, t.taskName, t.type, t.category);
    });
    
    if (sleepTransactions.length === 0) {
        console.log('[updateHistoricalSleepCategories] 没有睡眠交易记录需要更新');
        showNotification('ℹ️ 无需更新', '没有找到历史睡眠记录', 'info');
        return;
    }
    
    let updatedCount = 0;
    const updatePromises = [];
    
    for (const t of sleepTransactions) {
        let needUpdate = false;
        
        // 奖励 -> earnCategory
        if (updateEarn && t.type === 'earn') {
            const newCategory = sleepSettings.earnCategory || '系统';
            console.log(`[updateHistoricalSleepCategories] earn交易 ${t.id}: 当前=${t.category}, 目标=${newCategory}`);
            if (t.category !== newCategory) {
                t.category = newCategory;
                needUpdate = true;
            }
        }
        
        // 惩罚 -> spendCategory  
        if (updateSpend && t.type === 'spend') {
            const newCategory = sleepSettings.spendCategory || '系统';
            console.log(`[updateHistoricalSleepCategories] spend交易 ${t.id}: 当前=${t.category}, 目标=${newCategory}`);
            if (t.category !== newCategory) {
                t.category = newCategory;
                needUpdate = true;
            }
        }
        
        if (needUpdate) {
            updatedCount++;
            console.log(`[updateHistoricalSleepCategories] 更新交易 ${t.id}: ${t.category}`);
            // 同步到云端 - 使用 transactionCache 获取云端文档 ID
            if (isLoggedIn() && db) {
                let cloudDocId = DAL.transactionCache?.get(t.id);
                
                // [v7.9.3] 如果缓存中没有，尝试从云端查询
                if (!cloudDocId) {
                    console.log(`[updateHistoricalSleepCategories] 缓存未命中，查询云端: ${t.id}`);
                    try {
                        const queryRes = await db.collection('tb_transaction')
                            .where({ 'data.id': t.id })
                            .limit(1)
                            .get();
                        if (queryRes.data && queryRes.data.length > 0) {
                            cloudDocId = queryRes.data[0]._id;
                            // 补充缓存
                            DAL.transactionCache.set(t.id, cloudDocId);
                            console.log(`[updateHistoricalSleepCategories] 云端查询成功: ${cloudDocId}`);
                        }
                    } catch (queryErr) {
                        console.warn(`[updateHistoricalSleepCategories] 云端查询失败: ${t.id}`, queryErr.message);
                    }
                }
                
                if (cloudDocId) {
                    console.log(`[updateHistoricalSleepCategories] 云端更新 docId: ${cloudDocId}`);
                    updatePromises.push(
                        db.collection('tb_transaction').doc(cloudDocId).update({
                            'data.category': t.category
                        }).catch(e => {
                            console.warn('[updateHistoricalSleepCategories] 更新交易失败:', t.id, e.message);
                        })
                    );
                } else {
                    console.log(`[updateHistoricalSleepCategories] 云端无此记录，跳过: ${t.id}`);
                }
            }
        }
    }
    
    console.log(`[updateHistoricalSleepCategories] 循环结束, updatedCount: ${updatedCount}, promises: ${updatePromises.length}`);
    
    // 等待所有云端更新完成
    try {
        if (updatePromises.length > 0) {
            console.log('[updateHistoricalSleepCategories] 等待云端同步...');
            await Promise.all(updatePromises);
            console.log('[updateHistoricalSleepCategories] 云端同步完成');
        }
    } catch (e) {
        console.error('[updateHistoricalSleepCategories] 云端同步出错:', e);
    }
    
    // 无论是否更新云端，都保存本地数据
    console.log('[updateHistoricalSleepCategories] 保存本地数据...');
    saveData();
    console.log('[updateHistoricalSleepCategories] 本地数据已保存');
    
    if (updatedCount > 0) {
        console.log(`[updateHistoricalSleepCategories] 已更新 ${updatedCount} 条睡眠交易记录的分类`);
        showNotification('✅ 分类已更新', `已更新 ${updatedCount} 条历史睡眠记录`, 'success');
        // 刷新报告页面（如果在报告页）
        if (document.querySelector('.report-page.active')) {
            updateReportPage();
        }
    } else {
        showNotification('ℹ️ 无需更新', '所有记录分类已是最新', 'info');
    }
    
    console.log('[updateHistoricalSleepCategories] 完成');
    } catch (error) {
        console.error('[updateHistoricalSleepCategories] 函数执行出错:', error);
        // [v7.21.1] 移除通知，保留 console.error
    }
}

// 初始化睡眠分类显示
function initSleepCategoryDisplay() {
    const earnTrigger = document.getElementById('sleepEarnCategoryTrigger');
    const spendTrigger = document.getElementById('sleepSpendCategoryTrigger');
    const earnInput = document.getElementById('sleepEarnCategory');
    const spendInput = document.getElementById('sleepSpendCategory');
    
    if (earnTrigger && earnInput) {
        earnInput.value = sleepSettings.earnCategory || '';
        earnTrigger.textContent = sleepSettings.earnCategory || '睡眠（默认）';
    }
    if (spendTrigger && spendInput) {
        spendInput.value = sleepSettings.spendCategory || '';
        spendTrigger.textContent = sleepSettings.spendCategory || '睡眠（默认）';
    }
}

// [v5.10.0] toggleAutoSettle 函数已移除，自动结算功能固定开启

// ============================================================================
// [v7.3.0] 均衡模式功能
// ============================================================================

// 获取均衡模式赚取效率系数
function getBalanceMultiplier() {
    if (!balanceMode.enabled) return 1.0;
    
    const balanceHours = currentBalance / 3600;
    
    // 边界值按较小系数处理（对用户有利）
    if (balanceHours > 48) return 0.8;
    if (balanceHours >= 24) return 0.9;  // 24~48小时
    if (balanceHours >= 0) return 1.0;   // 0~24小时（理想区间）
    if (balanceHours >= -24) return 1.1; // -24~0小时
    return 1.2; // < -24小时
}

async function getBalanceSpendMultiplierContext(referenceDate = new Date()) {
    const countryCode = resolveHolidayCountryCode();
    if (!balanceMode.enabled) {
        return {
            multiplier: 1,
            isHoliday: false,
            holidayApplied: false,
            countryCode
        };
    }

    let isHoliday = false;
    let holidayApplied = false;
    let finalMultiplier = 1;

    if (balanceMode.holidayAllowanceEnabled !== false) {
        isHoliday = await isLocalStatutoryHoliday(referenceDate);
        if (isHoliday) {
            const configured = Number(balanceMode.holidayAllowanceFactor);
            finalMultiplier = Number.isFinite(configured) ? configured : 0.8;
            holidayApplied = finalMultiplier !== 1;
        }
    }

    return {
        multiplier: Number(formatMultiplierValue(finalMultiplier)),
        isHoliday,
        holidayApplied,
        countryCode
    };
}

// [v7.30.1] 非阻塞版本的节假日检查，用于 stopTask 等需要快速响应的场景
// 如果缓存有效则直接返回，否则返回默认值（节假日不生效，由后台预热后下次生效）
function getBalanceSpendMultiplierContextSync(referenceDate = new Date()) {
    const countryCode = resolveHolidayCountryCode();
    if (!balanceMode.enabled) {
        return {
            multiplier: 1,
            isHoliday: false,
            holidayApplied: false,
            countryCode
        };
    }

    if (balanceMode.holidayAllowanceEnabled !== false) {
        const dateObj = new Date(referenceDate);
        const dateKey = getLocalDateString(dateObj);
        const year = dateObj.getFullYear();
        const cacheKey = `${(countryCode || '').toUpperCase()}-${year}`;
        const cached = holidayCalendarCache[cacheKey];

        if (cached && cached.status === 'ok' && cached.dates?.has(dateKey)) {
            const configured = Number(balanceMode.holidayAllowanceFactor);
            const finalMultiplier = Number.isFinite(configured) ? configured : 0.8;
            return {
                multiplier: Number(formatMultiplierValue(finalMultiplier)),
                isHoliday: true,
                holidayApplied: finalMultiplier !== 1,
                countryCode
            };
        }
    }

    return {
        multiplier: 1,
        isHoliday: false,
        holidayApplied: false,
        countryCode
    };
}

// 显示均衡模式说明弹窗
function showBalanceModeInfo() {
    let content = `
        <div style="line-height: 1.6;">
            <p>均衡模式旨在帮助您更好的维持收支平衡，规则如下：</p>
            <div style="margin-top: 8px; padding-left: 8px;">
                <p>📈 <strong>余额充足时自动减速</strong></p>
                <ul style="margin: 4px 0 8px 16px; padding-left: 8px;">
                    <li>24~48小时：获取效率 ×0.9</li>
                    <li>>48小时：获取效率 ×0.8</li>
                </ul>
                <p>📉 <strong>余额透支时自动加速</strong></p>
                <ul style="margin: 4px 0 8px 16px; padding-left: 8px;">
                    <li>-24~0小时：获取效率 ×1.1</li>
                    <li><-24小时：获取效率 ×1.2</li>
                </ul>
                <p>🎉 <strong>法定节假日娱乐允许倍率</strong></p>
                <ul style="margin: 4px 0 8px 16px; padding-left: 8px;">
                    <li>节假日执行消费任务时，消费按 ×0.8 计算</li>
                </ul>
            </div>
            <p style="margin-top: 12px; font-size: 0.8rem; color: var(--text-color-light); font-style: italic;">实践表明，将您的时间余额控制在 0~24 小时最能增强您掌控自己时间的能力。</p>
        </div>
    `;
    showInfoModal('⚖️ 均衡模式说明', content);
}

// 切换均衡模式
async function toggleBalanceMode() {
    const toggle = document.getElementById('balanceModeToggle');
    
    if (toggle.checked) {
        // 开启均衡模式 - 需要确认
        const confirmed = await showConfirm(
            '均衡模式将根据您的时间余额自动调整获取效率，并在法定节假日对消费提供娱乐允许倍率。\n\n确定要开启均衡模式吗？',
            '开启均衡模式'
        );
        
        if (confirmed) {
            balanceMode.enabled = true;
            balanceMode.enabledAt = new Date().toISOString();
            saveBalanceMode();  // 保存到本地+云端
            warmupHolidayCalendar();
            updateBalanceModeUI();
            showNotification('⚖️ 均衡模式已开启', '获取效率将按余额调整，节假日消费允许倍率已启用', 'achievement');
        } else {
            toggle.checked = false;
        }
    } else {
        // 关闭均衡模式
        balanceMode.enabled = false;
        balanceMode.enabledAt = null;
        saveBalanceMode();  // 保存到本地+云端
        updateBalanceModeUI();
        showNotification('⚖️ 均衡模式已关闭', '获取效率恢复正常', 'reminder');
    }
}

// 更新均衡模式UI状态
function updateBalanceModeUI() {
    const toggle = document.getElementById('balanceModeToggle');
    const status = document.getElementById('balanceModeStatus');
    
    if (toggle) toggle.checked = balanceMode.enabled;
    if (status) {
        if (balanceMode.enabled) {
            const earnMultiplier = formatMultiplierValue(getBalanceMultiplier());
            status.textContent = `赚取 ×${earnMultiplier} / 节假日消费 ×${formatMultiplierValue(balanceMode.holidayAllowanceFactor || 0.8)}`;
        } else {
            status.textContent = '未启用';
        }
    }

    updateSettingsSectionOrder();
}

// [v7.3.3] 保存均衡模式（使用本地存储为主）
function saveBalanceMode() {
    saveBalanceModeLocal();
}

// [v7.9.7] 从云端加载均衡模式（云端统一同步，优先级高于本地）
function loadBalanceModeFromCloud(profileData) {
    // 云端数据优先，确保多设备同步
    if (profileData?.balanceMode) {
        balanceMode = { ...balanceMode, ...profileData.balanceMode };
        console.log('[loadBalanceModeFromCloud] 从云端同步:', JSON.stringify(balanceMode));
    }
}

// ============================================================================
// [v7.3.0] 均衡模式功能 END
// ============================================================================

// ============================================================================
// [v7.15.0] 时间金融系统 - 第一步：基础功能
// ============================================================================

// [v7.15.0] 金融系统设置
let financeSettings = {
    enabled: false,              // 总开关
    depositEnabled: true,        // 存款利息开关
    loanEnabled: true,           // 贷款利息开关
    depositRate: 0.5,            // 存款日利率 %
    loanRate: 1.0,               // 贷款日利率 %
    settlementTime: '04:00',     // 每日结算时间
    firstEnabledAt: null,        // 首次开启时间
    settledDates: [],            // [v7.15.0-fix] 已结算日期列表，防止重复结算
    showCard: true,              // [v7.15.0] 首页显示新卡片
    negativeBalancePenaltyEnabled: false // [v7.25.0-fix2] 金融系统开启后可关闭负余额1.2惩罚（建议关闭）
};
const FINANCE_SETTINGS_KEY = 'financeSettings';

// [v7.15.0] 利息账本（保留30天）
let interestLedger = {};
const INTEREST_LEDGER_KEY = 'interestLedger';

// [v7.15.0] 金融统计
let financeStats = {
    totalDepositInterest: 0,     // 累计存款利息（秒）
    totalLoanInterest: 0,        // 累计贷款利息（秒）
    interestDays: 0              // 累计计息天数
};
const FINANCE_STATS_KEY = 'financeStats';

// [v7.15.0] 利率约束
const FINANCE_RATE_CONSTRAINTS = {
    deposit: { min: 0.1, max: 2.0, step: 0.1 },
    loan: { min: 0.5, max: 5.0, step: 0.1 }
};

// [v7.15.0] 初始化金融系统
function initFinanceSystem() {
    // 从本地加载设置
    try {
        const saved = localStorage.getItem(FINANCE_SETTINGS_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            financeSettings = { ...financeSettings, ...parsed };
            // [v7.15.2] settledDates 清理：只保留最近60天
            if (financeSettings.settledDates && financeSettings.settledDates.length > 0) {
                const sixtyDaysAgo = new Date();
                sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
                const cutoffStr = getLocalDateString(sixtyDaysAgo);
                const before = financeSettings.settledDates.length;
                financeSettings.settledDates = financeSettings.settledDates.filter(d => d >= cutoffStr);
                if (financeSettings.settledDates.length < before) {
                    console.log(`[initFinanceSystem] settledDates 清理: ${before} -> ${financeSettings.settledDates.length}`);
                }
            }
        }
    } catch (e) {
        console.warn('[initFinanceSystem] 加载设置失败:', e);
    }
    
    // 从本地加载账本
    try {
        const saved = localStorage.getItem(INTEREST_LEDGER_KEY);
        if (saved) {
            interestLedger = JSON.parse(saved);
            // 清理超过30天的记录
            cleanupOldInterestLedger();
        }
    } catch (e) {
        console.warn('[initFinanceSystem] 加载账本失败:', e);
    }
    
    // 从本地加载统计
    try {
        const saved = localStorage.getItem(FINANCE_STATS_KEY);
        if (saved) {
            financeStats = { ...financeStats, ...JSON.parse(saved) };
        }
    } catch (e) {
        console.warn('[initFinanceSystem] 加载统计失败:', e);
    }
    
    // [v7.15.0-fix] 从交易记录重新计算利息统计（确保准确性）
    recalculateFinanceStatsFromTransactions();
    
    console.log('[initFinanceSystem] 金融系统初始化完成:', financeSettings.enabled ? '已启用' : '未启用');
    
    // [v7.15.0] 强制更新 UI 状态（参考屏幕时间管理）
    if (financeSettings.enabled) {
        const subSettings = document.getElementById('financeSubSettings');
        const statusEl = document.getElementById('financeSystemStatus');
        if (subSettings) subSettings.classList.remove('hidden');
        if (statusEl) statusEl.textContent = '已启用';
    } else {
        const subSettings = document.getElementById('financeSubSettings');
        const statusEl = document.getElementById('financeSystemStatus');
        if (subSettings) subSettings.classList.add('hidden');
        if (statusEl) statusEl.textContent = '未启用';
    }
    
    // [v7.15.0] 延迟再次更新，确保 WebView 渲染完成
    setTimeout(() => {
        const toggle = document.getElementById('financeSystemToggle');
        if (toggle && toggle.checked !== financeSettings.enabled) {
            toggle.checked = financeSettings.enabled;
        }
    }, 100);
}

// [v7.15.0] 清理旧账本记录（保留30天）
function cleanupOldInterestLedger() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = getLocalDateString(thirtyDaysAgo);
    
    let cleaned = 0;
    for (const date in interestLedger) {
        if (date < cutoffDate) {
            delete interestLedger[date];
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`[cleanupOldInterestLedger] 清理了 ${cleaned} 条旧记录`);
        saveInterestLedger();
    }
}

// [v7.15.0] 保存金融设置
function saveFinanceSettings() {
    try {
        localStorage.setItem(FINANCE_SETTINGS_KEY, JSON.stringify(financeSettings));
    } catch (e) {
        console.warn('[saveFinanceSettings] 保存失败:', e);
    }
    
    // 同步到云端
    if (isLoggedIn()) {
        const _ = cloudbase.database().command;
        DAL.saveProfile({ financeSettings: _.set(financeSettings) }).catch(e => {
            console.warn('[saveFinanceSettings] 云端同步失败:', e.message);
        });
    }
}

// [v7.15.0] 保存利息账本
function saveInterestLedger(skipCloudSync) {
    try {
        localStorage.setItem(INTEREST_LEDGER_KEY, JSON.stringify(interestLedger));
    } catch (e) {
        console.warn('[saveInterestLedger] 保存失败:', e);
    }
    // [v7.15.2] 同步到云端（统一同步）
    if (!skipCloudSync && isLoggedIn()) {
        const _ = cloudbase.database().command;
        DAL.saveProfile({ interestLedger: _.set(interestLedger) }).catch(e => {
            console.warn('[saveInterestLedger] 云端同步失败:', e.message);
        });
    }
}

// [v7.15.0] 保存金融统计
function saveFinanceStats() {
    try {
        localStorage.setItem(FINANCE_STATS_KEY, JSON.stringify(financeStats));
    } catch (e) {
        console.warn('[saveFinanceStats] 保存失败:', e);
    }
}

// [v7.25.0-fix2] 负余额惩罚策略：
// - 金融系统关闭：保持旧口径（负余额消费按1.2倍惩罚）
// - 金融系统开启：由用户决定是否保留1.2倍惩罚
function shouldApplyNegativeBalancePenalty(balanceValue = currentBalance) {
    const balanceNum = Number(balanceValue);
    if (!Number.isFinite(balanceNum) || balanceNum >= 0) return false;
    if (!financeSettings.enabled) return true;
    return financeSettings.negativeBalancePenaltyEnabled === true;
}

// [v7.15.2] 从交易记录重新计算利息统计（统计全部利息，非仅今日）
function recalculateFinanceStatsFromTransactions() {
    try {
        let totalDeposit = 0;
        let totalLoan = 0;
        let interestDays = new Set();
        
        // 遍历所有利息交易
        transactions.forEach(t => {
            if (t.undone) return;
            if (t.systemType === 'interest') {
                const txDate = t.interestData?.date || getLocalDateString(t.timestamp);
                interestDays.add(txDate);
                if (t.type === 'earn') {
                    totalDeposit += t.amount;
                } else {
                    totalLoan += t.amount;
                }
            } else if (t.systemType === 'interest-adjust') {
                // 利息调整也计入统计
                if (t.type === 'earn') {
                    totalDeposit += t.amount;
                } else {
                    totalLoan += t.amount;
                }
            }
        });
        
        // 更新统计
        financeStats.totalDepositInterest = totalDeposit;
        financeStats.totalLoanInterest = totalLoan;
        financeStats.interestDays = interestDays.size;
        
        console.log('[recalculateFinanceStats] 利息统计已更新:', {
            deposit: totalDeposit,
            loan: totalLoan,
            net: totalDeposit - totalLoan,
            days: interestDays.size
        });
        
        // 保存到本地
        saveFinanceStats();
    } catch (e) {
        console.warn('[recalculateFinanceStats] 重新计算失败:', e);
    }
}

// [v7.15.2] 从云端应用金融系统全部数据（financeSettings + interestLedger，统一同步）
function applyFinanceDataFromCloud(cloudProfile) {
    if (!cloudProfile) return;
    
    // === 1. 金融设置（合并 settledDates，取并集） ===
    const cloudFinanceSettings = cloudProfile.financeSettings;
    if (cloudFinanceSettings) {
        const localDates = new Set(financeSettings.settledDates || []);
        const cloudDates = new Set(cloudFinanceSettings.settledDates || []);
        const mergedDates = [...new Set([...localDates, ...cloudDates])];
        
        // [v7.15.2] settledDates 清理：只保留最近60天
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const cutoffStr = getLocalDateString(sixtyDaysAgo);
        const trimmedDates = mergedDates.filter(d => d >= cutoffStr);
        
        const oldEnabled = financeSettings.enabled;
        financeSettings = { ...financeSettings, ...cloudFinanceSettings };
        financeSettings.settledDates = trimmedDates;
        
        try {
            localStorage.setItem(FINANCE_SETTINGS_KEY, JSON.stringify(financeSettings));
        } catch (e) {
            console.warn('[applyFinanceDataFromCloud] 设置本地保存失败:', e);
        }
        
        // 更新UI（如果开关状态变了）
        if (oldEnabled !== financeSettings.enabled) {
            if (financeSettings.enabled) {
                const subSettings = document.getElementById('financeSubSettings');
                const statusEl = document.getElementById('financeSystemStatus');
                if (subSettings) subSettings.classList.remove('hidden');
                if (statusEl) statusEl.textContent = '已启用';
            } else {
                const subSettings = document.getElementById('financeSubSettings');
                const statusEl = document.getElementById('financeSystemStatus');
                if (subSettings) subSettings.classList.add('hidden');
                if (statusEl) statusEl.textContent = '未启用';
            }
            const toggle = document.getElementById('financeSystemToggle');
            if (toggle) toggle.checked = financeSettings.enabled;
            updateBalance();
        }
        updateFinanceSystemUI();
        console.log('[applyFinanceDataFromCloud] 设置同步完成, settledDates:', trimmedDates.length, '条');
    }
    
    // === 2. 利息账本（按日期合并，已结算优先，时间戳新者优先） ===
    const cloudLedger = cloudProfile.interestLedger;
    if (cloudLedger && typeof cloudLedger === 'object') {
        let ledgerChanged = false;
        for (const date in cloudLedger) {
            const cloudEntry = cloudLedger[date];
            const localEntry = interestLedger[date];
            if (!localEntry) {
                interestLedger[date] = cloudEntry;
                ledgerChanged = true;
            } else if (cloudEntry.settled && !localEntry.settled) {
                interestLedger[date] = cloudEntry;
                ledgerChanged = true;
            } else if (cloudEntry.settled && localEntry.settled) {
                if ((cloudEntry.settlementTime || '') > (localEntry.settlementTime || '')) {
                    interestLedger[date] = cloudEntry;
                    ledgerChanged = true;
                }
            }
        }
        // 反向检查：本地有但云端没有的，也要保留（它们会在下次saveInterestLedger时上传）
        if (ledgerChanged) {
            cleanupOldInterestLedger();
            // 仅保存本地，不触发云端回写（避免watch循环）
            try {
                localStorage.setItem(INTEREST_LEDGER_KEY, JSON.stringify(interestLedger));
            } catch (e) {
                console.warn('[applyFinanceDataFromCloud] 账本本地保存失败:', e);
            }
        }
        console.log('[applyFinanceDataFromCloud] 账本同步完成, 条目:', Object.keys(interestLedger).length);
    }
}

// [v7.15.0] 计算每日利息（固定利率，不累进）
function calculateDailyInterest(balance, rate) {
    if (balance === 0 || rate <= 0) return 0;
    // 利息 = 余额绝对值 × 日利率
    return Math.round(Math.abs(balance) * (rate / 100));
}

// [v7.15.0] 获取当前预计今日利息（用于显示）
function getExpectedTodayInterest() {
    if (!financeSettings.enabled) return 0;
    
    // 根据当前余额正负决定使用哪个利率
    if (currentBalance > 0 && financeSettings.depositEnabled) {
        return calculateDailyInterest(currentBalance, financeSettings.depositRate);
    } else if (currentBalance < 0 && financeSettings.loanEnabled) {
        return -calculateDailyInterest(currentBalance, financeSettings.loanRate);
    }
    return 0;
}

// [v7.15.0] 执行每日利息结算
async function settleDailyInterest(forDate = null) {
    if (!financeSettings.enabled) return;
    
    // [v7.29.2] 支持指定目标日期，用于追溯漏算的历史天数
    const yesterday = forDate instanceof Date ? new Date(forDate) : (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })();
    const yesterdayStr = getLocalDateString(yesterday);
    const todayStr = getLocalDateString(new Date());
    
    // [v7.15.0-fix] 使用 settledDates 列表检查，更可靠
    if (!financeSettings.settledDates) {
        financeSettings.settledDates = [];
    }
    if (financeSettings.settledDates.includes(yesterdayStr)) {
        console.log(`[settleDailyInterest] 昨日(${yesterdayStr})已结算，跳过`);
        return;
    }
    
    // [v7.15.2] 获取昨日结束时的余额（优先账本，兜底用交易正向累加）
    let yesterdayEndingBalance;
    if (interestLedger[yesterdayStr] && interestLedger[yesterdayStr].endingBalance !== undefined) {
        yesterdayEndingBalance = interestLedger[yesterdayStr].endingBalance;
    } else {
        // 从交易记录正向累加到昨日结束（排除利息交易，避免循环依赖）
        yesterdayEndingBalance = 0;
        transactions.forEach(t => {
            if (t.undone) return;
            if (t.systemType === 'interest' || t.systemType === 'interest-adjust') return;
            const tDate = getLocalDateString(new Date(t.timestamp));
            if (tDate <= yesterdayStr) {
                yesterdayEndingBalance += (t.type === 'earn' ? t.amount : -t.amount);
            }
        });
        // 再加上已有的利息交易（不包括今天）
        transactions.forEach(t => {
            if (t.undone) return;
            if (t.systemType !== 'interest' && t.systemType !== 'interest-adjust') return;
            const tDate = getLocalDateString(new Date(t.timestamp));
            if (tDate <= yesterdayStr) {
                yesterdayEndingBalance += (t.type === 'earn' ? t.amount : -t.amount);
            }
        });
        console.log(`[settleDailyInterest] 无账本记录，从交易累加计算昨日余额: ${yesterdayEndingBalance}s`);
    }
    
    // [v7.15.0-fix] 计算昨日利息
    let interestAmount = 0;
    let rateApplied = 0;
    
    if (yesterdayEndingBalance > 0 && financeSettings.depositEnabled) {
        interestAmount = calculateDailyInterest(yesterdayEndingBalance, financeSettings.depositRate);
        rateApplied = financeSettings.depositRate;
    } else if (yesterdayEndingBalance < 0 && financeSettings.loanEnabled) {
        interestAmount = -calculateDailyInterest(yesterdayEndingBalance, financeSettings.loanRate);
        rateApplied = financeSettings.loanRate;
    }
    
    // [v7.15.4] 交易级去重：检查是否已存在该日期的利息交易（防竞态 + 防修复脚本残留）
    const existingInterestTx = transactions.find(t => 
        (t.systemType === 'interest' || t.systemType === 'interest-adjust') && 
        !t.undone && 
        t.interestData?.date === yesterdayStr
    );
    if (existingInterestTx) {
        console.warn(`[settleDailyInterest] 已存在 ${yesterdayStr} 的利息交易(id=${existingInterestTx.id || existingInterestTx._id})，跳过创建`);
        // 仍标记为已结算，防止后续重试
        if (!financeSettings.settledDates.includes(yesterdayStr)) {
            financeSettings.settledDates.push(yesterdayStr);
        }
        saveFinanceSettings();
        saveInterestLedger();
        return;
    }
    
    // [v7.15.0-fix] 添加到已结算日期列表
    financeSettings.settledDates.push(yesterdayStr);
    
    // [v7.15.0-fix] 记录账本
    interestLedger[yesterdayStr] = {
        ...interestLedger[yesterdayStr],
        date: yesterdayStr,
        endingBalance: yesterdayEndingBalance,
        interestAmount: interestAmount,
        rateApplied: rateApplied,
        settled: true,
        settlementTime: new Date().toISOString()
    };
    
    // [v7.15.0-fix] 创建利息交易记录
    if (interestAmount !== 0) {
        const isDeposit = interestAmount > 0;
        // [v7.15.0] 方案B：交易时间设为昨日23:59，显示在昨日详情中
        const yesterdayEndTime = new Date(yesterday);
        yesterdayEndTime.setHours(23, 59, 59, 999);
        addTransaction({
            type: isDeposit ? 'earn' : 'spend',
            taskId: 'system_interest',
            taskName: isDeposit ? '💰 存款利息' : '💸 贷款利息',
            amount: Math.abs(interestAmount),
            description: `${isDeposit ? '昨日余额' : '昨日欠款'} ${formatTime(Math.abs(yesterdayEndingBalance))} × ${rateApplied}% 日利率`,
            isSystem: true,
            systemType: 'interest',
            interestData: {
                baseBalance: yesterdayEndingBalance,
                rate: rateApplied,
                date: yesterdayStr
            },
            timestamp: yesterdayEndTime.toISOString()
        });
        
        // 更新余额
        currentBalance += interestAmount;
        
        // 更新统计
        if (isDeposit) {
            financeStats.totalDepositInterest += interestAmount;
        } else {
            financeStats.totalLoanInterest += Math.abs(interestAmount);
        }
        financeStats.interestDays++;
        
        // 通知
        showNotification(
            isDeposit ? '💰 获得存款利息' : '💸 扣除贷款利息',
            `${isDeposit ? '+' : '-'}${formatTime(Math.abs(interestAmount))}`,
            isDeposit ? 'achievement' : 'warning'
        );
    }
    
    // [v7.29.2] 初始化今日账本（仅结算真实昨日时才更新，追溯历史日期时不覆盖今日起始余额）
    const actualYesterdayStr = getLocalDateString((() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })());
    if (yesterdayStr === actualYesterdayStr) {
        interestLedger[todayStr] = {
            date: todayStr,
            startingBalance: currentBalance,
            endingBalance: currentBalance,
            interestAmount: 0,
            rateApplied: 0,
            settled: false
        };
    }
    
    // 保存
    saveFinanceSettings(); // [v7.15.2] 修复：结算后必须保存settledDates到localStorage和云端，防止重启后重复结算
    saveInterestLedger();
    saveFinanceStats();
    saveData();
    updateBalance();
    
    console.log(`[settleDailyInterest] 结算完成: ${yesterdayStr} 利息 ${interestAmount}秒`);
}

// [v7.15.0-fix] 检查并执行利息结算（在自动结算中调用）
function checkAndSettleInterest() {
    // [v7.15.2] 防护：云端数据未加载完成时跳过结算，避免在旧/空数据上执行
    if (!hasCompletedFirstCloudSync && isLoggedIn()) {
        console.warn('[checkAndSettleInterest] 云端数据尚未加载完成，跳过本次结算');
        return;
    }
    
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // [v7.15.0-fix] 确保 settledDates 数组存在
    if (!financeSettings.settledDates) {
        financeSettings.settledDates = [];
    }
    
    // [v7.29.2] 追溯过去7天内未结算的日期，确保多天未开应用后能补算利息
    // settleDailyInterest 内部会检查 settledDates 和交易级去重，防止重复结算
    if (currentTime >= financeSettings.settlementTime) {
        (async () => {
            for (let i = 7; i >= 1; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = getLocalDateString(d);
                if (!financeSettings.settledDates.includes(dateStr)) {
                    await settleDailyInterest(d);
                }
            }
        })();
    }
}

// [v7.15.0] 切换金融系统总开关
async function toggleFinanceSystem() {
    const toggle = document.getElementById('financeSystemToggle');
    
    if (toggle.checked) {
        const confirmed = await showConfirm(
            '时间金融系统将根据您的余额每日自动结算利息。\n\n' +
            '• 正余额：每日获得存款利息\n' +
            '• 负余额：每日扣除贷款利息\n\n' +
            '确定要开启时间金融系统吗？',
            '开启时间金融系统'
        );
        
        if (confirmed) {
            financeSettings.enabled = true;
            financeSettings.firstEnabledAt = new Date().toISOString();
            if (typeof financeSettings.negativeBalancePenaltyEnabled !== 'boolean') {
                financeSettings.negativeBalancePenaltyEnabled = false;
            }
            // [v7.15.0-fix] 初始化 settledDates，并将今天之前的所有日期标记为"已结算"
            // 防止开启时结算历史日期的利息
            financeSettings.settledDates = [];
            const today = new Date();
            // 将昨天及之前的日期都标记为已结算，防止历史结算
            for (let i = 1; i <= 30; i++) {
                const pastDate = new Date(today);
                pastDate.setDate(pastDate.getDate() - i);
                financeSettings.settledDates.push(getLocalDateString(pastDate));
            }
            saveFinanceSettings();
            
            // [v7.15.0] 直接操作 classList，参考屏幕时间管理
            document.getElementById('financeSubSettings').classList.remove('hidden');
            document.getElementById('financeSystemStatus').textContent = '已启用';
            updateFinanceSystemUI();
            
            const penaltyHint = financeSettings.negativeBalancePenaltyEnabled
                ? '已保留负余额1.2倍惩罚'
                : '已默认关闭负余额1.2倍惩罚（推荐）';
            showNotification('💰 时间金融系统已开启', `每日将自动结算利息，${penaltyHint}`, 'achievement');
            
            // 立即更新余额卡片
            updateBalance();
        } else {
            toggle.checked = false;
        }
    } else {
        financeSettings.enabled = false;
        saveFinanceSettings();
        
        // [v7.15.0] 直接操作 classList，参考屏幕时间管理
        document.getElementById('financeSubSettings').classList.add('hidden');
        document.getElementById('financeSystemStatus').textContent = '未启用';
        updateFinanceSystemUI();
        
        showNotification('💰 时间金融系统已关闭', '利息计算已停止', 'reminder');
        updateBalance();
    }
}

// [v7.15.0] 切换存款利息
function toggleDepositInterest() {
    const toggle = document.getElementById('depositInterestToggle');
    financeSettings.depositEnabled = toggle.checked;
    saveFinanceSettings();
    updateFinanceSystemUI();
    updateBalance();
}

// [v7.15.0] 切换贷款利息
function toggleLoanInterest() {
    const toggle = document.getElementById('loanInterestToggle');
    financeSettings.loanEnabled = toggle.checked;
    saveFinanceSettings();
    updateFinanceSystemUI();
    updateBalance();
}

// [v7.15.0] 切换首页卡片显示
function toggleFinanceCard() {
    const toggle = document.getElementById('financeCardToggle');
    financeSettings.showCard = toggle.checked;
    saveFinanceSettings();
    updateFinanceSystemUI();
    // 刷新首页卡片显示状态
    updateBalance();
}

// [v7.25.0-fix2] 金融系统内的负余额惩罚开关
function toggleFinanceNegativePenalty() {
    const toggle = document.getElementById('financePenaltyToggle');
    if (!toggle) return;
    financeSettings.negativeBalancePenaltyEnabled = !!toggle.checked;
    saveFinanceSettings();
    updateFinanceSystemUI();

    if (financeSettings.negativeBalancePenaltyEnabled) {
        showNotification('⚠️ 已保留 1.2 倍惩罚', '负余额消费将继续按1.2倍执行，请注意与贷款利息叠加风险', 'warning');
    } else {
        showNotification('✅ 已关闭 1.2 倍惩罚', '负余额时仅保留⚠预警，不再额外乘以1.2', 'achievement');
    }
}

// [v7.15.0] 调整存款利率
function adjustDepositRate(delta) {
    const newRate = Math.round((financeSettings.depositRate + delta) * 10) / 10;
    const { min, max, step } = FINANCE_RATE_CONSTRAINTS.deposit;
    
    if (newRate >= min && newRate <= max) {
        financeSettings.depositRate = newRate;
        saveFinanceSettings();
        updateFinanceSystemUI();
        updateBalance();
    }
}

// [v7.15.0] 调整贷款利率
function adjustLoanRate(delta) {
    const newRate = Math.round((financeSettings.loanRate + delta) * 10) / 10;
    const { min, max, step } = FINANCE_RATE_CONSTRAINTS.loan;
    
    if (newRate >= min && newRate <= max) {
        financeSettings.loanRate = newRate;
        saveFinanceSettings();
        updateFinanceSystemUI();
        updateBalance();
    }
}

// [v7.15.0] 更新金融系统UI
function updateFinanceSystemUI() {
    // 主开关
    const mainToggle = document.getElementById('financeSystemToggle');
    if (mainToggle) mainToggle.checked = financeSettings.enabled;
    
    // 状态文字
    const statusEl = document.getElementById('financeSystemStatus');
    if (statusEl) {
        statusEl.textContent = financeSettings.enabled ? '已启用' : '未启用';
    }
    
    // 子设置显示/隐藏
    const subSettings = document.getElementById('financeSubSettings');
    if (subSettings) {
        if (financeSettings.enabled) {
            subSettings.classList.remove('hidden');
        } else {
            subSettings.classList.add('hidden');
        }
    }
    
    if (!financeSettings.enabled) return;
    
    // 存款利率显示
    const depositRateEl = document.getElementById('depositRateValue');
    if (depositRateEl) depositRateEl.textContent = financeSettings.depositRate.toFixed(1) + '%';
    
    // 贷款利率显示
    const loanRateEl = document.getElementById('loanRateValue');
    if (loanRateEl) loanRateEl.textContent = financeSettings.loanRate.toFixed(1) + '%';
    
    // 首页显示新卡片开关
    const cardToggle = document.getElementById('financeCardToggle');
    if (cardToggle) cardToggle.checked = financeSettings.showCard !== false; // 默认为true

    // 负余额惩罚开关（金融系统内可选）
    const penaltyToggle = document.getElementById('financePenaltyToggle');
    if (penaltyToggle) penaltyToggle.checked = financeSettings.negativeBalancePenaltyEnabled === true;
    const penaltyStatusEl = document.getElementById('financePenaltyStatus');
    if (penaltyStatusEl) {
        penaltyStatusEl.textContent = financeSettings.negativeBalancePenaltyEnabled === true
            ? '当前：开启（负余额消费 ×1.2）'
            : '当前：关闭（仅⚠预警，推荐）';
    }
}

// [v7.15.0] 显示金融系统说明
function showFinanceSystemInfo() {
    const content = `
        <div style="line-height: 1.7;">
            <p>时间金融系统将您的时间余额视为"时间货币"，根据余额正负自动结算利息：</p>
            <div style="margin-top: 12px; padding: 12px; background: rgba(76,175,80,0.1); border-radius: 8px;">
                <p><strong>💰 存款利息（正余额）</strong></p>
                <p style="font-size: 0.9rem; color: var(--text-color-light);">余额为正时，每日凌晨按设定利率获得利息</p>
                <p style="font-size: 0.85rem; margin-top: 4px;">利率范围：0.1% ~ 2.0%</p>
            </div>
            <div style="margin-top: 12px; padding: 12px; background: rgba(244,67,54,0.1); border-radius: 8px;">
                <p><strong>💸 贷款利息（负余额）</strong></p>
                <p style="font-size: 0.9rem; color: var(--text-color-light);">余额为负时，每日凌晨按设定利率扣除利息</p>
                <p style="font-size: 0.85rem; margin-top: 4px;">利率范围：0.5% ~ 5.0%</p>
            </div>
            <div style="margin-top: 12px; padding: 12px; background: rgba(33,150,243,0.1); border-radius: 8px;">
                <p><strong>🔄 结算规则</strong></p>
                <ul style="margin: 8px 0 0 16px; font-size: 0.9rem;">
                    <li>每日 ${financeSettings.settlementTime} 自动结算</li>
                    <li>按昨日结束时的余额计算</li>
                    <li>利息自动添加到余额中</li>
                </ul>
            </div>
            <div style="margin-top: 12px; padding: 12px; background: rgba(255,152,0,0.1); border-radius: 8px;">
                <p><strong>⚠️ 负余额 1.2 倍惩罚（可选）</strong></p>
                <p style="font-size: 0.9rem; color: var(--text-color-light);">开启金融系统后，可自行决定是否保留“负余额消费 ×1.2”。默认建议关闭，避免与贷款利息叠加导致债务滚雪球；关闭后交易仍会保留 ⚠ 预警标识。</p>
            </div>
            <p style="margin-top: 12px; font-size: 0.85rem; color: var(--text-color-light); font-style: italic;">合理设置利率可以鼓励储蓄或抑制过度透支。</p>
        </div>
    `;
    showInfoModal('💰 时间金融系统说明', content);
}

// [v7.15.4] 启动时静默去重：检测并清理同日期的重复利息交易
function autoDeduplicateInterest() {
    if (!financeSettings.enabled) return;
    
    const interestTxs = transactions.filter(t => 
        t.systemType === 'interest' && t.interestData?.date && !t.undone
    );
    if (interestTxs.length === 0) return;
    
    // 按 interestData.date 分组
    const grouped = {};
    interestTxs.forEach(t => {
        const d = t.interestData.date;
        if (!grouped[d]) grouped[d] = [];
        grouped[d].push(t);
    });
    
    let totalRemoved = 0;
    let totalBalanceAdj = 0;
    
    for (const date in grouped) {
        const group = grouped[date];
        if (group.length <= 1) continue;
        
        // 优先保留正常结算记录（有 taskId），同 taskId 时保留较新
        group.sort((a, b) => {
            const aIsNormal = a.taskId ? 1 : 0;
            const bIsNormal = b.taskId ? 1 : 0;
            if (bIsNormal !== aIsNormal) return bIsNormal - aIsNormal;
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        // 标记除第一个外的全部为 undone
        for (let i = 1; i < group.length; i++) {
            const dup = group[i];
            const txId = dup.id || dup._id;
            const idx = txId 
                ? transactions.findIndex(t => (t.id || t._id) === txId) 
                : transactions.indexOf(dup);
            if (idx !== -1 && !transactions[idx].undone) {
                transactions[idx].undone = true;
                transactions[idx].undoneAt = new Date().toISOString();
                const adj = dup.type === 'spend' ? dup.amount : -dup.amount;
                totalBalanceAdj += adj;
                totalRemoved++;
                console.log(`[autoDeduplicateInterest] 去重: date=${date}, amount=${dup.amount}s, id=${txId}`);
            }
        }
    }
    
    if (totalRemoved > 0) {
        currentBalance += totalBalanceAdj;
        console.log(`[autoDeduplicateInterest] 共去重 ${totalRemoved} 条，余额调整 ${totalBalanceAdj}s，新余额 ${currentBalance}s`);
        // [v7.15.4] 同步 undone 状态到云端，防止下次加载时重复出现
        if (isLoggedIn()) {
            const undoneList = transactions.filter(t => t.undone && t.undoneAt && (t.systemType === 'interest' || t.systemType === 'interest-adjust'));
            undoneList.forEach(t => {
                const txId = t.id || t._id;
                if (txId) {
                    DAL.deleteTransaction(txId).catch(e => 
                        console.warn(`[autoDeduplicateInterest] 云端删除失败: ${txId}`, e.message));
                }
            });
        }
        saveData();
        updateBalance();
    }
}

// [v7.15.0] 显示利率详情弹窗
function showInterestRateDetails() {
    const todayInterest = getExpectedTodayInterest();
    const todayStr = getLocalDateString(new Date());
    const yesterdayStr = getLocalDateString(new Date(Date.now() - 86400000));
    const yesterdayLedger = interestLedger[yesterdayStr];
    
    const content = `
        <div style="line-height: 1.8;">
            <div style="text-align: center; padding: 16px; background: rgba(102,126,234,0.1); border-radius: 12px; margin-bottom: 16px;">
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--color-primary);">${formatTime(currentBalance)}</div>
                <div style="font-size: 0.9rem; color: var(--text-color-light);">当前余额</div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                <div style="padding: 12px; background: rgba(76,175,80,0.08); border-radius: 8px; text-align: center;">
                    <div style="font-size: 1.1rem; font-weight: 600; color: var(--color-positive);">${financeSettings.depositRate.toFixed(1)}%</div>
                    <div style="font-size: 0.8rem; color: var(--text-color-light);">存款利率</div>
                </div>
                <div style="padding: 12px; background: rgba(244,67,54,0.08); border-radius: 8px; text-align: center;">
                    <div style="font-size: 1.1rem; font-weight: 600; color: var(--color-negative);">${financeSettings.loanRate.toFixed(1)}%</div>
                    <div style="font-size: 0.8rem; color: var(--text-color-light);">贷款利率</div>
                </div>
            </div>
            
            <div style="padding: 12px; border: 1px dashed var(--border-color); border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>预计今日利息：</span>
                    <span style="font-weight: 600; ${todayInterest > 0 ? 'color: var(--color-positive);' : todayInterest < 0 ? 'color: var(--color-negative);' : ''}">${todayInterest > 0 ? '+' : ''}${formatTime(todayInterest)}</span>
                </div>
                ${yesterdayLedger ? `
                <div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: var(--text-color-light);">
                    <span>昨日利息：</span>
                    <span>${yesterdayLedger.interestAmount > 0 ? '+' : ''}${formatTime(yesterdayLedger.interestAmount)}</span>
                </div>
                ` : ''}
            </div>
            
            <div style="margin-top: 16px; font-size: 0.85rem; color: var(--text-color-light);">
                <p>💡 利息每日 ${financeSettings.settlementTime} 结算</p>
                <p>📊 累计计息天数：${financeStats.interestDays} 天</p>
            </div>
        </div>
    `;
    showInfoModal('📊 利率详情', content);
}

// ============================================================================
// [v7.15.1] 时间金融系统 END
// ============================================================================

// 开关屏幕时间管理
async function toggleScreenTimeManagement() {
    const toggle = document.getElementById('screenTimeToggle');
    
    if (toggle.checked) {
        // 检查权限
        if (typeof Android !== 'undefined' && Android.hasUsageStatsPermission) {
            if (!Android.hasUsageStatsPermission()) {
                // 显示权限引导
                const confirmed = await showConfirm(
                    '屏幕时间管理需要"使用情况访问权限"。\n\n' +
                    '点击"确定"后，请在列表中找到"时间银行"并开启权限，然后返回应用重新开启此功能。',
                    '需要权限'
                );
                
                if (confirmed) {
                    Android.openUsageAccessSettings();
                }
                toggle.checked = false;
                return;
            }
        } else {
            showToast('此功能仅在 Android 应用中可用');
            toggle.checked = false;
            return;
        }
        
        // 启用成功
        screenTimeSettings.enabled = true;
        if (!screenTimeSettings.enabledDate) {
            screenTimeSettings.enabledDate = getLocalDateString(new Date());
        }
        if (!screenTimeSettings.settledDates) {
            screenTimeSettings.settledDates = {};
        }
        document.getElementById('screenTimeSettings').classList.remove('hidden');
        document.getElementById('screenTimeStatus').textContent = '已启用';
        saveScreenTimeSettings();
        updateScreenTimeCard();
    } else {
        screenTimeSettings.enabled = false;
        document.getElementById('screenTimeSettings').classList.add('hidden');
        document.getElementById('screenTimeStatus').textContent = '未启用';
        saveScreenTimeSettings();
    }
    
    updateScreenTimeCardVisibility();
}

// 更新每日限额
function updateScreenTimeLimit() {
    const hours = parseInt(document.getElementById('screenTimeLimitHours').value) || 0;
    const minutes = parseInt(document.getElementById('screenTimeLimitMinutes').value) || 0;
    screenTimeSettings.dailyLimitMinutes = hours * 60 + minutes;
    if (screenTimeSettings.dailyLimitMinutes < 1) {
        screenTimeSettings.dailyLimitMinutes = 1; // 最少 1 分钟
        document.getElementById('screenTimeLimitMinutes').value = 1;
    }
    saveScreenTimeSettings();
    updateScreenTimeCard();
}

// 开关首页卡片
function toggleScreenTimeCard() {
    screenTimeSettings.showCard = document.getElementById('screenTimeCardToggle').checked;
    saveScreenTimeSettings();
    updateScreenTimeCardVisibility();
}

// [v5.2.1] 屏幕时间卡片自动刷新定时器
let screenTimeRefreshTimer = null;
const SCREEN_TIME_REFRESH_INTERVAL = 60000; // 每60秒刷新一次

// [v5.2.1] 启动屏幕时间卡片自动刷新
function startScreenTimeAutoRefresh() {
    stopScreenTimeAutoRefresh(); // 先清除已有定时器
    if (!screenTimeSettings.enabled || !screenTimeSettings.showCard) return;
    
    screenTimeRefreshTimer = setInterval(() => {
        if (document.visibilityState === 'visible') {
            updateScreenTimeCard();
        }
    }, SCREEN_TIME_REFRESH_INTERVAL);
}

// [v5.2.1] 停止屏幕时间卡片自动刷新
function stopScreenTimeAutoRefresh() {
    if (screenTimeRefreshTimer) {
        clearInterval(screenTimeRefreshTimer);
        screenTimeRefreshTimer = null;
    }
}

// [v5.10.0] 更新卡片显示状态
// [v7.18.0] 修复：屏幕时间卡片显示不再控制堆叠容器，避免影响睡眠卡片
function updateScreenTimeCardVisibility() {
    const wrapper = document.getElementById('screenTimeWrapper');
    
    if (screenTimeSettings.enabled && screenTimeSettings.showCard) {
        if (wrapper) wrapper.style.display = '';
        updateScreenTimeCard();
        startScreenTimeAutoRefresh(); // [v5.2.1] 启动自动刷新
    } else {
        if (wrapper) wrapper.style.display = 'none';
        stopScreenTimeAutoRefresh(); // [v5.2.1] 停止自动刷新
    }
    // [v7.18.0] 统一更新堆叠容器可见性
    updateStackedContainerVisibility();
}

// [v7.18.0] 新增：统一更新堆叠容器可见性
// 根据屏幕时间和睡眠卡片的显示状态决定是否显示容器
function updateStackedContainerVisibility() {
    const stackedContainer = document.getElementById('stackedCardsContainer');
    const screenTimeWrapper = document.getElementById('screenTimeWrapper');
    const sleepWrapper = document.getElementById('sleepCardWrapper');
    const isWeb = !window.Android;
    
    // 检查屏幕时间是否可见
    const screenTimeVisible = screenTimeSettings.enabled && screenTimeSettings.showCard;
    // 检查睡眠卡片是否可见
    const sleepVisible = isWeb ? sleepSettings.showCard : (sleepSettings.enabled && sleepSettings.showCard);
    
    // 任一卡片可见时，容器就可见
    if (stackedContainer) {
        stackedContainer.style.display = (screenTimeVisible || sleepVisible) ? '' : 'none';
    }
    
    // [v7.18.0] 修复：控制睡眠卡片是否是第一个可见卡片
    // 当屏幕时间隐藏且睡眠卡片可见时，睡眠卡片是第一个，需要移除负margin
    if (sleepWrapper) {
        const isFirstVisible = !screenTimeVisible && sleepVisible;
        sleepWrapper.classList.toggle('first-visible-card', isFirstVisible);
    }
    
    // [v7.18.0] 更新卡片交错渐变方向
    updateCardGradientDirections();
}

// [v7.18.0] 三卡片交错渐变方向分配
// [v7.18.0-fix] 规则调整：仅当相邻卡片渐变色相同时才方向相反，否则正常左浅右深
// [v7.20.1] 更新卡片渐变方向（纯色模式下不添加方向类）
function updateCardGradientDirections() {
    const balanceCard = document.getElementById('balanceCardFinance');
    const screenTimeCard = document.getElementById('screenTimeWrapper');
    const sleepCard = document.getElementById('sleepCardWrapper');
    
    // [v7.20.1] 纯色模式下移除所有方向类，不使用渐变
    if (getGradientStyle() === 'flat') {
        if (balanceCard) balanceCard.classList.remove('gradient-dir-a', 'gradient-dir-b');
        if (screenTimeCard) screenTimeCard.classList.remove('gradient-dir-a', 'gradient-dir-b');
        if (sleepCard) sleepCard.classList.remove('gradient-dir-a', 'gradient-dir-b');
        return;
    }
    
    // 检查各卡片是否可见（且为经典模式）
    const isBalanceVisible = balanceCard && 
        !balanceCard.classList.contains('hidden') && 
        !document.body.classList.contains('glass-mode');
    const isScreenTimeVisible = screenTimeCard && 
        screenTimeCard.style.display !== 'none' && 
        screenTimeSettings.cardStyle !== 'glass';
    const isSleepVisible = sleepCard && 
        sleepCard.style.display !== 'none' && 
        !document.body.classList.contains('glass-mode');
    
    // 构建可见卡片数组（按z-index从高到低：余额>屏幕>睡眠）
    const visibleCards = [];
    if (isBalanceVisible) visibleCards.push(balanceCard);
    if (isScreenTimeVisible) visibleCards.push(screenTimeCard);
    if (isSleepVisible) visibleCards.push(sleepCard);
    
    // 获取各卡片的等级（用于判断颜色是否相同）
    const getCardLevel = (card) => {
        const startColor = card.style.getPropertyValue('--card-gradient-start');
        // 根据startColor判断等级
        if (startColor === '#27ae60' || startColor === '#3498db') return 2; // 翠绿/蓝色
        if (startColor === '#f39c12') return 3; // 橙色
        if (startColor === '#e74c3c') return 4; // 红色
        return 1; // 默认
    };
    
    // 分配方向：仅当相邻卡片颜色相同时才反向，否则默认方向A(135deg左浅右深)
    visibleCards.forEach((card, index) => {
        let isDirA = true; // 默认方向A（左浅右深）
        
        // 如果不是第一个卡片，检查与前一个卡片的颜色
        if (index > 0) {
            const prevCard = visibleCards[index - 1];
            const prevLevel = getCardLevel(prevCard);
            const currLevel = getCardLevel(card);
            
            // 仅当颜色等级相同时，才使用相反方向
            if (prevLevel === currLevel) {
                const prevIsDirA = prevCard.classList.contains('gradient-dir-a');
                isDirA = !prevIsDirA; // 与前一个相反
            }
            // 否则保持默认方向A（左浅右深）
        }
        
        card.classList.remove('gradient-dir-a', 'gradient-dir-b');
        card.classList.add(isDirA ? 'gradient-dir-a' : 'gradient-dir-b');
    });
}

// [v7.18.0] 根据余额获取渐变颜色
// [v7.20.0] 卡片配色方案1：自然过渡色系
// [v7.20.1] 获取余额卡片颜色（支持纯色/渐变切换）
function getBalanceGradientColors(balanceHours) {
    const isFlat = getGradientStyle() === 'flat';
    if (balanceHours > 24) {
        return { start: '#3498db', end: isFlat ? '#3498db' : '#1a6dad', level: 1 };      // >24h - 天蓝
    } else if (balanceHours >= 0) {
        return { start: '#27ae60', end: isFlat ? '#27ae60' : '#16a085', level: 2 };      // 0~24h - 翠绿
    } else if (balanceHours >= -24) {
        return { start: '#f39c12', end: isFlat ? '#f39c12' : '#d35400', level: 3 };      // -24~0h - 琥珀
    } else {
        return { start: '#e74c3c', end: isFlat ? '#e74c3c' : '#922b21', level: 4 };      // <-24h - 砖红
    }
}

// [v7.18.0] 根据昨日睡眠结算获取渐变颜色
// [v7.18.0-fix] 修复：amount存储的是绝对值，需根据type判断奖惩
// [v7.20.0] 统一使用昨天记录，与条形图保持一致
// [v7.20.1] 支持纯色/渐变切换
function getSleepGradientColorsFromLastRecord() {
    const isFlat = getGradientStyle() === 'flat';
    // [v7.20.1-fix] 使用睡眠周期日（非24点自然日）获取“昨日”记录
    const record = getYesterdaySleepRecord();

    if (!record) {
        return { start: '#2e4a6e', end: isFlat ? '#2e4a6e' : '#1a2f47', level: 0 }; // 无记录-深夜海军蓝
    }
    
    // [v7.20.1-fix] 兼容 record 无 type/amount 场景，回退到 reward 正负
    const rewardMinutes = record.amount ? (record.amount / 60) : Math.abs(record.reward || 0); // 转为分钟
    const isPenalty = record.type ? (record.type === 'spend') : ((record.reward || 0) < 0); // spend=惩罚，earn=奖励
    
    // [v7.18.0-fix] 区间改为1小时（60分钟）
    // [v7.20.0] 卡片配色方案1：自然过渡色系
    if (!isPenalty && rewardMinutes >= 60) {
        return { start: '#27ae60', end: isFlat ? '#27ae60' : '#16a085', level: 1 };      // 大奖励(≥1h)-翠绿
    } else if (!isPenalty && rewardMinutes > 0) {
        return { start: '#3498db', end: isFlat ? '#3498db' : '#1a6dad', level: 2 };      // 小奖励(<1h)-天蓝
    } else if (isPenalty && rewardMinutes < 60) {
        return { start: '#f39c12', end: isFlat ? '#f39c12' : '#d35400', level: 3 };      // 小惩罚(<1h)-琥珀
    } else {
        return { start: '#e74c3c', end: isFlat ? '#e74c3c' : '#922b21', level: 4 };      // 大惩罚(≥1h)-砖红
    }
}

// 更新首页卡片数据
function updateScreenTimeCard() {
    if (!screenTimeSettings.enabled || !screenTimeSettings.showCard) return;
    
    if (typeof Android !== 'undefined' && Android.getTodayScreenTime) {
        const usedMs = Android.getTodayScreenTime(JSON.stringify(screenTimeSettings.whitelistApps));
        if (usedMs < 0) return; // 无权限或异常
        
        let usedMinutes = Math.floor(usedMs / 60000);
        
        // [v7.18.2-fix] 数据一致性检查：如果显示时间超过当前时间，强制修正
        const now = new Date();
        const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
        const maxReasonableMinutes = currentTotalMinutes + 10; // 允许10分钟误差（跨分钟刷新）
        
        if (usedMinutes > maxReasonableMinutes) {
            console.warn(`[ScreenTime] 数据异常: API返回 ${usedMinutes} 分钟，但当前时间仅 ${currentTotalMinutes} 分钟，强制修正`);
            logEvent('screen_time_anomaly', { usedMinutes, currentTotalMinutes, deviceId: currentDeviceId });
            // 强制限制为当前时间的合理上限
            usedMinutes = maxReasonableMinutes;
        }
        const limitMinutes = screenTimeSettings.dailyLimitMinutes;
        const percent = (usedMinutes / limitMinutes) * 100;
        const displayPercent = Math.min(100, percent);
        const diff = limitMinutes - usedMinutes;
        
        // 更新进度条
        const progressBarEl = document.getElementById('screenTimeProgressBar');
        progressBarEl.style.width = displayPercent + '%';
        
        // [v7.26.2] 进度条颜色等级与卡片背景统一（均用 33/66 阈值）
        progressBarEl.classList.remove('level-1', 'level-2', 'level-3', 'level-4');
        if (percent <= 33) {
            progressBarEl.classList.add('level-1'); // 绿色：使用较少
        } else if (percent <= 66) {
            progressBarEl.classList.add('level-2'); // 蓝色：正常范围
        } else if (percent <= 100) {
            progressBarEl.classList.add('level-3'); // 橙色：接近限额
        } else {
            progressBarEl.classList.add('level-4'); // 红色：超出限额
        }
        
        // 更新百分比显示
        document.getElementById('screenTimePercent').textContent = Math.round(percent) + '%';
        
        // 更新统计
        document.getElementById('screenTimeUsed').textContent = formatScreenTimeMinutes(usedMinutes);
        document.getElementById('screenTimeLimit').textContent = '/ ' + formatScreenTimeMinutes(limitMinutes);
        
        // 更新预计奖惩
        const footer = document.getElementById('screenTimeFooter');
        
        if (diff >= 0) {
            footer.textContent = `预计奖励: +${formatScreenTimeMinutes(diff)}`;
        } else {
            footer.textContent = `预计消耗: ${formatScreenTimeMinutes(-diff)}`;
        }
        
        const wrapper = document.getElementById('screenTimeWrapper');
        const progressBar = document.getElementById('screenTimeProgressBar');
        const percentEl = document.getElementById('screenTimePercent');
        const isGlass = screenTimeSettings.cardStyle === 'glass';
        
        if (isGlass) {
            // [v7.18.1] 通透模式：进度条颜色使用图形配色方案1
            let progressStart, progressEnd;
            if (percent <= 33) {
                progressStart = '#81c784'; progressEnd = '#27ae60';      // 浅绿→深绿
            } else if (percent <= 66) {
                progressStart = '#64b5f6'; progressEnd = '#3498db';      // 浅蓝→深蓝
            } else if (percent <= 100) {
                progressStart = '#ffb74d'; progressEnd = '#f39c12';      // 浅橙→深橙
            } else {
                progressStart = '#e57373'; progressEnd = '#c0392b';      // 浅红→深红
            }
            if (progressBar) {
                progressBar.style.background = `linear-gradient(90deg, ${progressStart}, ${progressEnd})`;
            }
            // 通透模式不设置wrapper背景渐变（由CSS控制毛玻璃效果）
            if (wrapper) wrapper.style.background = '';
        } else {
            // [v7.18.0] 经典模式：卡片背景使用CSS变量设置颜色
            // [v7.20.0] 卡片配色方案1：自然过渡色系
            // [v7.20.1] 支持纯色/渐变切换
            const isFlat = getGradientStyle() === 'flat';
            let startColor, endColor;
            if (percent <= 33) {
                startColor = '#27ae60'; endColor = isFlat ? '#27ae60' : '#16a085';      // 翠绿
            } else if (percent <= 66) {
                startColor = '#3498db'; endColor = isFlat ? '#3498db' : '#1a6dad';      // 天蓝
            } else if (percent <= 100) {
                startColor = '#f39c12'; endColor = isFlat ? '#f39c12' : '#d35400';      // 琥珀
            } else {
                startColor = '#e74c3c'; endColor = isFlat ? '#e74c3c' : '#922b21';      // 砖红
            }
            // 设置CSS变量，由gradient-dir类控制方向
            if (wrapper) {
                wrapper.style.setProperty('--card-gradient-start', startColor);
                wrapper.style.setProperty('--card-gradient-end', endColor);
            }
            // 先更新交错方向类，再依据卡片方向决定进度条渐变方向
            updateCardGradientDirections();
            // [v7.18.1] 进度条颜色使用图形配色方案1
            // [v7.20.2] 纯色模式：清除内联样式，由 CSS 规则控制白色叠加层
            if (isFlat) {
                if (progressBar) progressBar.style.background = '';
            } else {
                let progressStart, progressEnd;
                if (percent <= 33) {
                    progressStart = '#81c784'; progressEnd = '#27ae60';
                } else if (percent <= 66) {
                    progressStart = '#64b5f6'; progressEnd = '#3498db';
                } else if (percent <= 100) {
                    progressStart = '#ffb74d'; progressEnd = '#f39c12';
                } else {
                    progressStart = '#e57373'; progressEnd = '#c0392b';
                }
                // [v7.25.2] 进度条渐变方向与卡片背景方向相反（与睡眠时间卡片条形图同一逻辑）：
                // 卡片 gradient-dir-a (135deg 左浅右深) → 进度条 270deg（右浅左深）
                // 卡片 gradient-dir-b (225deg 右浅左深) → 进度条 90deg（左浅右深）
                const hasDirA = wrapper && wrapper.classList.contains('gradient-dir-a');
                const gradientDeg = hasDirA ? '270deg' : '90deg';
                if (progressBar) {
                    progressBar.style.background = `linear-gradient(${gradientDeg}, ${progressStart}, ${progressEnd})`;
                }
            }
            if (percentEl) percentEl.style.color = '';
            if (footer) footer.style.color = '';
        }
    }
}

// 格式化分钟数
function formatScreenTimeMinutes(minutes) {
    if (minutes < 60) {
        return `${minutes}分钟`;
    }
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}小时${m}分钟` : `${h}小时`;
}

// 简洁格式化分钟数（用于结算记录）
function formatScreenTimeCompact(minutes) {
    if (minutes < 60) {
        return `${minutes}分`;
    }
    const hours = minutes / 60;
    // 如果是整小时，不显示小数
    if (minutes % 60 === 0) {
        return `${Math.floor(hours)}h`;
    }
    // 显示一位小数
    return `${hours.toFixed(1)}h`;
}

// [v5.2.0] 自动结算 - 应用启动时自动结算过去未处理的天数
// [v7.2.1] 重构：添加设备ID支持、执行锁、改进去重逻辑
// [v7.8.0] 返回结算结果用于启动报告
function autoSettleScreenTime() {
    const emptyResult = { screenTimeResults: [], autoDetectResults: [] }; // [v7.8.0]
    const results = []; // 屏幕时间结算结果
    
    // [v7.9.3] 确保分类设置已从 localStorage 正确加载（修复时序问题）
    const localSTS = JSON.parse(localStorage.getItem('screenTimeSettings') || '{}');
    if (localSTS.earnCategory && !screenTimeSettings.earnCategory) {
        screenTimeSettings.earnCategory = localSTS.earnCategory;
        console.log('[ScreenTime] 从 localStorage 恢复 earnCategory:', localSTS.earnCategory);
    }
    if (localSTS.spendCategory && !screenTimeSettings.spendCategory) {
        screenTimeSettings.spendCategory = localSTS.spendCategory;
        console.log('[ScreenTime] 从 localStorage 恢复 spendCategory:', localSTS.spendCategory);
    }
    
    // [v7.2.1] 执行锁，防止并发
    if (isAutoSettling) {
        console.log('[ScreenTime] 结算正在进行中，跳过');
        return emptyResult;
    }
    
    // [v7.15.4] 防护：云端数据未加载完成时跳过结算，避免在旧/空数据上重复创建
    // [v7.30.1] 增强：同时检查写入门禁状态，防止在门禁激活时误结算
    if ((!hasCompletedFirstCloudSync || cloudSyncWriteLock) && isLoggedIn()) {
        console.warn('[ScreenTime] 云端数据未就绪或门禁激活，跳过结算');
        return emptyResult;
    }
    
    if (!screenTimeSettings.enabled) {
        // 即使屏幕时间未启用，也要执行应用检测
        const autoDetectResults = autoDetectAppUsage() || [];
        return { screenTimeResults: [], autoDetectResults };
    }
    if (typeof Android === 'undefined' || !Android.getScreenTimeForDate) {
        const autoDetectResults = autoDetectAppUsage() || [];
        return { screenTimeResults: [], autoDetectResults };
    }
    if (!currentDeviceId) {
        console.warn('[ScreenTime] 设备ID未初始化，跳过结算');
        const autoDetectResults = autoDetectAppUsage() || [];
        return { screenTimeResults: [], autoDetectResults };
    }
    
    isAutoSettling = true;
    console.log('[ScreenTime] 开始自动结算，设备ID:', currentDeviceId);
    
    try {
        const today = getLocalDateString(new Date());
        
        // [v7.2.1] 确保当前设备的 settledDates 数组存在
        if (!screenTimeSettings.settledDates) {
            screenTimeSettings.settledDates = {};
        }
        if (!screenTimeSettings.settledDates[currentDeviceId]) {
            screenTimeSettings.settledDates[currentDeviceId] = [];
        }
        const deviceSettledDates = screenTimeSettings.settledDates[currentDeviceId];
        
        // [v7.2.1] 检查是否已有该日期+设备的屏幕时间记录
        function hasScreenTimeRecordForDate(dateStr, deviceId) {
            return transactions.some(t => 
                t.screenTimeData?.originalDate === dateStr &&
                t.screenTimeData?.deviceId === deviceId
            );
        }
        
        // 获取过去7天未结算的日期（不含今天）
        const unsettledDates = [];
        for (let i = 1; i <= 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = getLocalDateString(date);

            // [v7.11.1] 首次启用后不追溯历史日期
            if (screenTimeSettings.enabledDate && dateStr < screenTimeSettings.enabledDate) {
                continue;
            }
            
            // [v7.2.1] 检查：1) 本设备的 settledDates 2) 交易记录中的 date+deviceId
            const isSettled = deviceSettledDates.includes(dateStr);
            const hasRecord = hasScreenTimeRecordForDate(dateStr, currentDeviceId);
            
            if (!isSettled && !hasRecord) {
                // 检查是否有数据
                try {
                    const usedMs = Android.getScreenTimeForDate(dateStr, JSON.stringify(screenTimeSettings.whitelistApps || []));
                    if (usedMs > 0) {
                        unsettledDates.push({
                            date: dateStr,
                            usedMs: usedMs,
                            usedMinutes: Math.floor(usedMs / 60000)
                        });
                    }
                } catch (e) {
                    console.error('[ScreenTime] Error getting screen time for', dateStr, e);
                }
            }
        }
        
        if (unsettledDates.length === 0) {
            console.log('[ScreenTime] No unsettled dates found for device:', currentDeviceId);
            // [v5.5.2 Fix] 即使没有待结算的屏幕时间，也要执行应用检测补录
            const autoDetectResults = autoDetectAppUsage() || [];
            return { screenTimeResults: results, autoDetectResults: autoDetectResults };
        }
        
        // 静默执行结算
        const limitMinutes = screenTimeSettings.dailyLimitMinutes;
        let totalChange = 0;
        let settledCount = 0;
        
        for (const item of unsettledDates) {
            const dateStr = item.date;
            
            // [v7.2.1] 再次检查，防止并发/云端同步导致的重复
            if (hasScreenTimeRecordForDate(dateStr, currentDeviceId)) {
                console.log(`[ScreenTime] 日期 ${dateStr} 已被当前设备结算，跳过`);
                continue;
            }
            
            const usedMinutes = item.usedMinutes;
            const diff = limitMinutes - usedMinutes;
            const diffSeconds = diff * 60;
            const isReward = diff >= 0;
            let absAmount = Math.abs(diffSeconds);
            
            // [v7.3.0] 均衡模式：仅对收入应用效率系数，支出不受影响
            let balanceAdjust = null;
            if (isReward && balanceMode.enabled) {
                const multiplier = getBalanceMultiplier();
                if (multiplier !== 1.0) {
                    const originalAmount = absAmount;
                    absAmount = Math.round(absAmount * multiplier);
                    balanceAdjust = { multiplier, originalAmount };
                }
            }
            
            // 更新余额
            const balanceChange = isReward ? absAmount : -absAmount;
            currentBalance += balanceChange;
            totalChange += balanceChange;
            
            // 计算该日期对应的 dailyChanges key
            const [year, month, day] = dateStr.split('-').map(Number);
            const dateObj = new Date(year, month - 1, day);
            const dayKey = dateObj.toDateString();
            dailyChanges[dayKey] = dailyChanges[dayKey] || { earned: 0, spent: 0 };
            
            if (isReward) {
                dailyChanges[dayKey].earned += absAmount;
            } else {
                dailyChanges[dayKey].spent += absAmount;
            }
            
            // 添加 transaction 记录
            const systemTask = SYSTEM_TASKS.SCREEN_TIME;
            // [v5.10.0] 使用用户自定义的分类
            const customCategory = isReward ? screenTimeSettings.earnCategory : screenTimeSettings.spendCategory;
            
            // [v7.3.0] 构建描述（包含均衡调整信息）
            let description = `📱 屏幕时间: ${formatScreenTimeMinutes(usedMinutes)}/${formatScreenTimeMinutes(limitMinutes)} (${isReward ? '奖励' : '超出'}${formatScreenTimeMinutes(Math.abs(diff))})`;
            if (balanceAdjust) {
                description += ` ×${balanceAdjust.multiplier} (均衡调整)`;
            }
            
            addTransaction({
                type: isReward ? 'earn' : 'spend',
                taskId: systemTask.id,
                taskName: systemTask.name,
                category: customCategory || SYSTEM_CATEGORY, // [v5.10.0] 保存分类
                amount: absAmount,
                description: description,
                timestamp: new Date(dateObj.getTime() + 23 * 60 * 60 * 1000).toISOString(),
                isSystem: true,
                systemType: 'screen-time',
                isBackdate: true,
                screenTimeData: {
                    usedMinutes,
                    limitMinutes,
                    diffMinutes: diff,
                    originalDate: dateStr,
                    deviceId: currentDeviceId  // [v7.2.1] 添加设备ID
                },
                // [v7.3.0] 记录均衡调整信息
                balanceAdjust: balanceAdjust
            });
            
            // 记录到已结算日期（当前设备）
            screenTimeSettings.settledDates[currentDeviceId].push(dateStr);
            
            // 添加历史记录
            addScreenTimeHistory(usedMinutes, limitMinutes, diff, dateStr);
            
            // [v7.8.0] 收集结果用于启动报告
            results.push({
                type: 'screen_time',
                date: dateStr,
                usedMinutes: usedMinutes,
                limitMinutes: limitMinutes,
                diffMinutes: diff,
                amount: isReward ? Math.round(absAmount / 60) : -Math.round(absAmount / 60),
                isReward: isReward
            });
            
            settledCount++;
        }
        
        if (settledCount > 0) {
            // 保存数据
            saveScreenTimeSettings();
            saveData();
            updateBalanceDisplay();
            
            // [v7.8.0] 不再显示 Toast，改为启动报告统一显示
            const changeStr = totalChange >= 0 
                ? `+${formatTime(totalChange)}`
                : `-${formatTime(Math.abs(totalChange))}`;
            console.log(`[ScreenTime] Auto-settled ${settledCount} days, balance change: ${changeStr}, device: ${currentDeviceId}`);
        }
        
        // [v5.3.0] 自动结算后执行应用时间检测补录
        const autoDetectResults = autoDetectAppUsage() || [];
        
        // [v7.8.0] 返回包含屏幕时间和应用检测两种结果
        return { screenTimeResults: results, autoDetectResults: autoDetectResults };
    } finally {
        isAutoSettling = false;
    }
}

// [v5.3.0] 应用时间自动检测补录
// [v5.6.0] 重构：追溯多天 + 修正多记录 + 开启时追溯7天
const AUTO_DETECT_MIN_THRESHOLD = 5; // 最小补录/修正阈值：5分钟
const AUTO_DETECT_MAX_DAYS = 7; // 最大追溯天数
let pendingAutoDetectNotifications = []; // 待显示的补录通知
// [v7.11.1] 自动检测补录：多设备原始记录 + 汇总
const AUTO_DETECT_RAW_KEEP_DAYS = 30;
function getAutoDetectRawRecordsLocal() {
    return JSON.parse(localStorage.getItem('autoDetectRawRecords') || '{}');
}
function saveAutoDetectRawRecordsLocal(records) {
    localStorage.setItem('autoDetectRawRecords', JSON.stringify(records));
    saveDeviceSpecificDataDebounced();
}
function cleanupAutoDetectRawRecords(records) {
    const cutoff = Date.now() - AUTO_DETECT_RAW_KEEP_DAYS * 24 * 60 * 60 * 1000;
    Object.keys(records).forEach(key => {
        if ((records[key]?.timestamp || 0) < cutoff) {
            delete records[key];
        }
    });
}
function recordAutoDetectRawUsage(task, dateStr, actualMinutes, recordedMinutes) {
    if (!currentDeviceId || !task) return;
    const records = getAutoDetectRawRecordsLocal();
    const key = `${task.id}_${dateStr}`;
    records[key] = {
        taskId: task.id,
        date: dateStr,
        actualMinutes,
        recordedMinutes,
        timestamp: Date.now()
    };
    cleanupAutoDetectRawRecords(records);
    saveAutoDetectRawRecordsLocal(records);
}
function collectAutoDetectRawRecords(taskId, dateStr) {
    const items = [];
    const key = `${taskId}_${dateStr}`;
    const localDeviceId = currentDeviceId || 'local';
    const seenDevices = new Set();

    // [v7.29.2] 始终优先从本机 localStorage 读取最新原始记录
    // saveDeviceSpecificDataDebounced 有 2s 延迟，且 DAL.saveProfile 使用 dot-notation key
    // 导致 profileData.deviceSpecificData[currentDeviceId] 在内存中永远不会被当前会话更新
    // 若只读 profileData，当日新记录将永远被当作"缺失"，导致补录交易不创建
    const local = getAutoDetectRawRecordsLocal();
    const localRec = local[key];
    if (localRec && typeof localRec.actualMinutes === 'number') {
        items.push({ deviceId: localDeviceId, ...localRec });
        seenDevices.add(localDeviceId);
    }

    // 再从云端读取其他设备的记录（跨设备聚合）
    if (DAL?.profileData?.deviceSpecificData) {
        Object.entries(DAL.profileData.deviceSpecificData).forEach(([deviceId, data]) => {
            if (seenDevices.has(deviceId)) return; // 当前设备已从 localStorage 读取，跳过避免覆盖
            const rec = data?.autoDetectRawRecords?.[key];
            if (rec && typeof rec.actualMinutes === 'number') {
                items.push({ deviceId, ...rec });
                seenDevices.add(deviceId);
            }
        });
    }
    return items;
}
function hasAutoDetectTransactionForDate(taskId, dateStr) {
    return transactions.some(t =>
        t.taskId === taskId &&
        t.isAutoDetected &&
        getLocalDateString(new Date(t.timestamp)) === dateStr
    );
}
function getAutoDetectProcessedDates() {
    if (isLoggedIn() && DAL?.profileData?.autoDetectProcessedDates) {
        return JSON.parse(JSON.stringify(DAL.profileData.autoDetectProcessedDates));
    }
    return JSON.parse(localStorage.getItem('autoDetectProcessedDates') || '{}');
}
function saveAutoDetectProcessedDates(processedDates) {
    localStorage.setItem('autoDetectProcessedDates', JSON.stringify(processedDates));
    if (isLoggedIn()) {
        const _ = cloudbase.database().command;
        if (DAL?.profileData) DAL.profileData.autoDetectProcessedDates = processedDates;
        DAL.saveProfile({ autoDetectProcessedDates: _.set(processedDates) })
            .catch(e => console.warn('[AutoDetect] Failed to sync processedDates:', e.message));
    }
}

function aggregateAutoDetectForTaskDates(task, dates) {
    const processedDates = getAutoDetectProcessedDates();
    const results = [];
    const details = [];
    // [v7.24.1] 按日期正序处理，确保配额/动态倍率按真实时间累进
    const orderedDates = Array.from(new Set(dates || [])).sort((a, b) => {
        const aMs = parseLocalDateKey(a)?.getTime() || 0;
        const bMs = parseLocalDateKey(b)?.getTime() || 0;
        return aMs - bMs;
    });
    // [v7.15.3] 昨天的数据允许重新检查（首次检查时使用量可能不完整）
    const _yesterday = new Date();
    _yesterday.setDate(_yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateString(_yesterday);

    orderedDates.forEach(dateStr => {
        const taskKey = `${task.id}_${dateStr}`;
        // [v7.15.3] 已存在自动检测交易的日期始终跳过（防止重复创建交易）
        if (hasAutoDetectTransactionForDate(task.id, dateStr)) {
            details.push({ date: dateStr, status: 'skipped' });
            return;
        }
        // [v7.15.3] 昨天的数据跳过 processedDates 缓存（允许二次检查以获取更完整数据）
        // 更早日期尊重缓存
        if (dateStr !== yesterdayStr && processedDates[taskKey]) {
            details.push({ date: dateStr, status: 'skipped' });
            return;
        }

        const deviceRecords = collectAutoDetectRawRecords(task.id, dateStr);
        if (!deviceRecords || deviceRecords.length === 0) {
            details.push({ date: dateStr, status: 'missing' });
            return;
        }

        const totalActualMinutes = deviceRecords.reduce((sum, r) => sum + (r.actualMinutes || 0), 0);
        const recordedSeconds = getTaskRecordedTimeForDateIncludeAuto(task.id, dateStr);
        const recordedMinutes = Math.floor(recordedSeconds / 60);
        const diffMinutes = totalActualMinutes - recordedMinutes;

        if (diffMinutes <= -AUTO_DETECT_MIN_THRESHOLD) {
            const correctionMinutes = Math.abs(diffMinutes);
            const result = createAutoCorrection(task, dateStr, correctionMinutes, totalActualMinutes, recordedMinutes, deviceRecords);
            if (result) {
                results.push(result);
                processedDates[taskKey] = {
                    type: 'correction',
                    timestamp: Date.now(),
                    deviceCount: deviceRecords.length,
                    actualMinutes: totalActualMinutes,
                    recordedMinutes
                };
                details.push({ date: dateStr, status: 'correction', actual: totalActualMinutes, recorded: recordedMinutes, diff: diffMinutes, deviceCount: deviceRecords.length });
            }
        } else if (diffMinutes >= AUTO_DETECT_MIN_THRESHOLD) {
            const result = createAutoMakeup(task, dateStr, diffMinutes, totalActualMinutes, recordedMinutes, deviceRecords);
            if (result) {
                results.push(result);
                processedDates[taskKey] = {
                    type: 'makeup',
                    timestamp: Date.now(),
                    deviceCount: deviceRecords.length,
                    actualMinutes: totalActualMinutes,
                    recordedMinutes
                };
                details.push({ date: dateStr, status: 'makeup', actual: totalActualMinutes, recorded: recordedMinutes, diff: diffMinutes, deviceCount: deviceRecords.length });
            }
        } else {
            processedDates[taskKey] = {
                type: 'ok',
                timestamp: Date.now(),
                deviceCount: deviceRecords.length,
                actualMinutes: totalActualMinutes,
                recordedMinutes
            };
            details.push({ date: dateStr, status: 'ok', actual: totalActualMinutes, recorded: recordedMinutes, diff: diffMinutes, deviceCount: deviceRecords.length });
        }
    });

    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    Object.keys(processedDates).forEach(key => {
        if ((processedDates[key]?.timestamp || 0) < cutoff) {
            delete processedDates[key];
        }
    });

    if (orderedDates.length > 0) {
        saveAutoDetectProcessedDates(processedDates);
    }

    return { results, details };
}

// [v5.6.0] 获取需要检查的日期范围（从上次检查到昨天）
function getAutoDetectDateRange() {
    const dates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 获取上次检查日期
    const lastChecked = screenTimeSettings.autoDetect?.lastCheckedDate;
    let startDate;
    
    if (lastChecked) {
        // 从上次检查的下一天开始
        const [y, m, d] = lastChecked.split('-').map(Number);
        startDate = new Date(y, m - 1, d);
        startDate.setDate(startDate.getDate() + 1);
        // [v7.15.3] 安全上限：即使 lastCheckedDate 很旧，也不超过 MAX_DAYS 天前
        const maxStart = new Date(today);
        maxStart.setDate(maxStart.getDate() - AUTO_DETECT_MAX_DAYS);
        if (startDate < maxStart) {
            console.log(`[AutoDetect] lastCheckedDate ${lastChecked} 过旧，cap到 ${AUTO_DETECT_MAX_DAYS} 天前`);
            startDate = new Date(maxStart);
        }
    } else {
        // 首次运行，追溯7天
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - AUTO_DETECT_MAX_DAYS);
    }

    // [v7.11.1] 首次启用后不追溯历史日期
    if (screenTimeSettings.enabledDate) {
        const [ey, em, ed] = screenTimeSettings.enabledDate.split('-').map(Number);
        const enabledDate = new Date(ey, em - 1, ed);
        if (startDate < enabledDate) {
            startDate = new Date(enabledDate);
        }
    }
    
    // 生成日期列表（到昨天为止）
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const current = new Date(startDate);
    while (current <= yesterday) {
        dates.push(getLocalDateString(current));
        current.setDate(current.getDate() + 1);
    }
    
    return dates;
}

// [v5.6.0] 手动触发单个任务的自动检测
function runAutoDetectForTask(taskId, forceRecheck = false) {
    try {
        console.log('[runAutoDetectForTask] Called with taskId:', taskId, 'forceRecheck:', forceRecheck);
        
        const task = tasks.find(t => t.id === taskId);
        if (!task) {
            showInfoModal('检测失败', '任务不存在');
            return;
        }
        
        if (!task.appPackage || !task.autoDetect) {
            showInfoModal('检测失败', '此任务未开启自动补录，请在编辑任务中开启。');
            return;
        }
    
    if (typeof Android === 'undefined' || !Android.getAppScreenTimeForDate) {
        showInfoModal('检测失败', '此功能仅在 Android 应用中可用，浏览器环境不支持。');
        return;
    }

    
    // 检查权限
    if (typeof Android !== 'undefined' && Android.hasUsageStatsPermission) {
        if (!Android.hasUsageStatsPermission()) {
            showInfoModal('需要权限', '请先授予"应用使用情况访问"权限，才能读取应用使用时间。');
            if (Android.openUsageAccessSettings) {
                Android.openUsageAccessSettings();
            }
            return;
        }
    }
    
    showToast('正在检测...');
    
    // 获取检测日期范围（最近7天）
    const dates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 1; i <= AUTO_DETECT_MAX_DAYS; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(getLocalDateString(d));
    }
    
    let processedDates = getAutoDetectProcessedDates();
    
    // 强制重新检测时，清除此任务的所有处理记录
    if (forceRecheck) {
        dates.forEach(dateStr => {
            const taskKey = `${task.id}_${dateStr}`;
            delete processedDates[taskKey];
        });
        saveAutoDetectProcessedDates(processedDates);
        const rawRecords = getAutoDetectRawRecordsLocal();
        dates.forEach(dateStr => {
            const taskKey = `${task.id}_${dateStr}`;
            delete rawRecords[taskKey];
        });
        saveAutoDetectRawRecordsLocal(rawRecords);
        console.log('[runAutoDetectForTask] Cleared processed dates for task:', taskId);
    }
    
    const results = [];
    let checkedCount = 0;
    let skippedCount = 0;
    const checkDetails = [];
    
    dates.forEach(dateStr => {
        const taskKey = `${task.id}_${dateStr}`;
        try {
            const actualMs = Android.getAppScreenTimeForDate(task.appPackage, dateStr);
            if (actualMs < 0) {
                checkDetails.push({ date: dateStr, status: 'error', msg: '无法获取数据' });
                return;
            }

            checkedCount++;
            const actualMinutes = Math.floor(actualMs / 60000);
            const recordedSeconds = getTaskRecordedTimeForDateIncludeAuto(task.id, dateStr);
            const recordedMinutes = Math.floor(recordedSeconds / 60);
            recordAutoDetectRawUsage(task, dateStr, actualMinutes, recordedMinutes);

            if (processedDates[taskKey]) {
                skippedCount++;
                checkDetails.push({ date: dateStr, status: 'skipped' });
                return;
            }
        } catch (e) {
            console.error('[AutoDetect Manual] Error:', e);
            checkDetails.push({ date: dateStr, status: 'error', msg: e.message });
        }
    });

    const aggregate = aggregateAutoDetectForTaskDates(task, dates);
    const finalResults = aggregate.results || [];
    const finalDetails = (aggregate.details && aggregate.details.length > 0) ? aggregate.details : checkDetails;
    results.push(...finalResults);
    
    if (results.length > 0) {
        saveData();
        updateBalance();
        showAutoDetectNotification(results);
    } else {
        // 构建详细反馈
        let content = `<div style="text-align: left;">`;
        content += `<p><strong>任务：</strong>${escapeHtml(task.name)}</p>`;
        content += `<p><strong>关联应用：</strong>${escapeHtml(task.appPackage)}</p>`;
        content += `<p style="margin-top: 12px;"><strong>检测范围：</strong>最近 ${AUTO_DETECT_MAX_DAYS} 天</p>`;
        
        if (skippedCount === dates.length) {
            content += `<p style="color: var(--text-color-light); margin-top: 8px;">⏭️ 所有日期已检测过，无需重复检测。</p>`;
            content += `<p style="font-size: 0.85rem; color: var(--text-color-light); margin-top: 8px;">提示：如果撤回了之前的补录记录，可点击下方按钮重新检测。</p>`;
            content += `<div style="margin-top: 16px; text-align: center;">
                <button class="btn btn-primary" onclick="hideInfoModal(); runAutoDetectForTask('${task.id}', true);">🔄 清除缓存重新检测</button>
            </div>`;
        } else if (checkedCount === 0) {
            content += `<p style="color: #f39c12; margin-top: 8px;">⚠️ 无法获取应用使用数据，请检查权限设置。</p>`;
        } else {
            content += `<p style="color: var(--color-positive); margin-top: 8px;">✅ 检测完成，记录匹配良好，无需补录或修正。</p>`;
            content += `<ul style="font-size: 0.85rem; color: var(--text-color-light); margin-top: 8px; padding-left: 20px;">`;
            finalDetails.filter(d => d.status === 'ok').slice(0, 3).forEach(d => {
                content += `<li>${d.date}: 实际 ${d.actual}分钟，记录 ${d.recorded}分钟${d.deviceCount ? `（${d.deviceCount}台设备）` : ''}</li>`;
            });
            if (finalDetails.filter(d => d.status === 'ok').length > 3) {
                content += `<li>... 等 ${finalDetails.filter(d => d.status === 'ok').length} 天</li>`;
            }
            content += `</ul>`;
        }
        
        content += `</div>`;
        showInfoModal('🤖 自动检测结果', content);
    }
    } catch (e) {
        console.error('[runAutoDetectForTask] Error:', e);
        showInfoModal('检测出错', `<div style="text-align: left;">
            <p style="color: #e74c3c; margin-bottom: 12px;">发生错误:</p>
            <p style="word-break: break-all;"><strong>${escapeHtml(e.message || String(e))}</strong></p>
            <details style="margin-top: 12px;">
                <summary style="cursor: pointer; color: var(--text-color-light);">技术详情</summary>
                <pre style="font-size: 0.75rem; color: var(--text-color-light); white-space: pre-wrap; margin-top: 8px;">${escapeHtml(e.stack || '无堆栈信息')}</pre>
            </details>
        </div>`);
    }
}

// [v7.8.0] 返回结果用于启动报告
function autoDetectAppUsage() {
    console.log('[AutoDetect] === Starting auto-detect check ===');
    console.log('[AutoDetect] tasks count:', tasks.length, ', hasAndroid:', typeof Android !== 'undefined');
    
    const autoDetectResults = []; // [v7.8.0] 用于返回
    
    if (typeof Android === 'undefined' || !Android.getAppScreenTimeForDate) {
        console.log('[AutoDetect] Android interface not available');
        return autoDetectResults;
    }

    // [v5.5.2] 检查权限
    if (typeof Android !== 'undefined' && Android.hasUsageStatsPermission) {
        if (!Android.hasUsageStatsPermission()) {
            console.log('[AutoDetect] No usage stats permission');
            return autoDetectResults;
        }
    }
    
    // 获取所有启用了自动检测的任务
    const autoDetectTasks = tasks.filter(t => t.appPackage && t.autoDetect);
    console.log('[AutoDetect] Tasks with auto-detect:', autoDetectTasks.length, autoDetectTasks.map(t => t.name));
    if (autoDetectTasks.length === 0) {
        console.log('[AutoDetect] No tasks with auto-detect enabled');
        return autoDetectResults;
    }
    
    console.log('[AutoDetect] Checking', autoDetectTasks.length, 'tasks with auto-detect enabled');
    
    // [v5.6.0] 获取需要检查的日期范围（追溯多天）
    const datesToCheck = getAutoDetectDateRange();
    if (datesToCheck.length === 0) {
        console.log('[AutoDetect] No dates to check');
        return autoDetectResults;
    }
    console.log('[AutoDetect] Dates to check:', datesToCheck);
    
    const results = []; // 存储检测结果
    const taskDatesMap = new Map();
    
    // [v5.6.0] 遍历每个日期和每个任务
    datesToCheck.forEach(dateStr => {
        autoDetectTasks.forEach(task => {
            try {
                // 获取应用实际使用时长
                const actualMs = Android.getAppScreenTimeForDate(task.appPackage, dateStr);
                if (actualMs < 0) {
                    console.log('[AutoDetect] Failed to get app time for', task.appPackage, dateStr);
                    return;
                }
                
                const actualMinutes = Math.floor(actualMs / 60000);
                
                // 计算该任务在该日期的已记录时长（包含之前的自动补录/修正）
                const recordedSeconds = getTaskRecordedTimeForDateIncludeAuto(task.id, dateStr);
                const recordedMinutes = Math.floor(recordedSeconds / 60);
                
                recordAutoDetectRawUsage(task, dateStr, actualMinutes, recordedMinutes);
                if (!taskDatesMap.has(task.id)) {
                    taskDatesMap.set(task.id, { task, dates: new Set() });
                }
                taskDatesMap.get(task.id).dates.add(dateStr);
                
                console.log(`[AutoDetect Raw] ${task.name} ${dateStr}: actual=${actualMinutes}min, recorded=${recordedMinutes}min`);
            } catch (e) {
                console.error('[AutoDetect] Error processing task', task.name, dateStr, e);
            }
        });
    });

    taskDatesMap.forEach(({ task, dates }) => {
        const aggregate = aggregateAutoDetectForTaskDates(task, Array.from(dates));
        if (aggregate?.results?.length) {
            results.push(...aggregate.results);
        }
    });
    
    // [v5.6.0] 更新上次检查日期
    if (datesToCheck.length > 0) {
        if (!screenTimeSettings.autoDetect) {
            screenTimeSettings.autoDetect = {};
        }
        screenTimeSettings.autoDetect.lastCheckedDate = datesToCheck[datesToCheck.length - 1];
        saveScreenTimeSettings();
    }
    
    // 如果有结果，保存数据并显示通知
    if (results.length > 0) {
        saveData();
        updateBalanceDisplay();
        // [v7.8.0] 不再显示通知，返回结果用于启动报告
        // showAutoDetectNotification(results);
        
        // 转换为启动报告格式
        results.forEach(r => {
            autoDetectResults.push({
                type: 'auto_detect',
                taskName: r.taskName,
                date: r.date,
                amount: r.isSpend ? -r.minutes : r.minutes,
                isMakeup: r.type === 'makeup',
                isCorrection: r.type === 'correction'
            });
        });
    }
    
    return autoDetectResults;
}

// [v7.2.3] 静默自动补录：为戒除习惯检查预处理，不显示通知
// 确保在 checkAbstinenceHabits() 判定前，所有自动补录记录已创建
function runSilentAutoDetectForTask(task, datesToCheck) {
    if (!task || !task.appPackage || !task.autoDetect) return [];
    
    if (typeof Android === 'undefined' || !Android.getAppScreenTimeForDate) {
        return [];
    }

    // 检查权限
    if (typeof Android !== 'undefined' && Android.hasUsageStatsPermission) {
        if (!Android.hasUsageStatsPermission()) {
            return [];
        }
    }
    const results = [];
    const dateList = [];
    
    datesToCheck.forEach(dateStr => {
        try {
            const actualMs = Android.getAppScreenTimeForDate(task.appPackage, dateStr);
            if (actualMs < 0) return;
            
            const actualMinutes = Math.floor(actualMs / 60000);
            const recordedSeconds = getTaskRecordedTimeForDateIncludeAuto(task.id, dateStr);
            const recordedMinutes = Math.floor(recordedSeconds / 60);
            recordAutoDetectRawUsage(task, dateStr, actualMinutes, recordedMinutes);
            dateList.push(dateStr);
        } catch (e) {
            console.error('[SilentAutoDetect] Error:', e);
        }
    });

    if (dateList.length > 0) {
        const aggregate = aggregateAutoDetectForTaskDates(task, dateList);
        if (aggregate?.results?.length) {
            results.push(...aggregate.results);
        }
    }

    return results;
}

// [v7.24.1] 自动检测倍率值格式化
function formatAutoDetectMultiplierValue(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return '1';
    return num.toFixed(2).replace(/\.?0+$/, '');
}

// [v7.24.1] 自动检测消费记录：复用戒除配额/动态倍率公式
function calculateAutoDetectSpendByHabitMode(task, rawSeconds, dateStr, phase = 'makeup') {
    const safeRawSeconds = Math.max(0, Math.round(rawSeconds || 0));
    const isCorrection = phase === 'correction';
    const multiplier = task?.multiplier || 1;
    const isAbstinence = !!(task?.isHabit && task?.habitDetails?.type === 'abstinence');
    const quotaMode = isAbstinence ? (task.habitDetails.quotaMode || 'none') : 'none';
    const referenceDate = parseLocalDateKey(dateStr) || new Date();

    const result = {
        baseSeconds: 0,
        mode: 'none',
        rawSeconds: safeRawSeconds,
        taskMultiplier: multiplier,
        quotaUsedBefore: 0,
        quotaValue: 0,
        quotaWithinSeconds: 0,
        quotaOverSeconds: 0,
        dynamicRatePercent: null,
        estimatedCount: 0,
    };

    if (!task || safeRawSeconds <= 0) return result;

    // 计时消费：优先复用 quota/dynamic 公式
    if (task.type === 'continuous_redeem') {
        const linearBase = Math.floor(safeRawSeconds * multiplier);
        if (!isAbstinence || quotaMode === 'none') {
            result.baseSeconds = linearBase;
            return result;
        }

        const quotaSeconds = Math.max(0, Math.round((task.habitDetails.targetCountInPeriod || 0) * 60));
        const usedSeconds = getQuotaPeriodUsage(task, referenceDate);
        const calcUsedSeconds = isCorrection ? Math.max(0, usedSeconds - safeRawSeconds) : usedSeconds;

        result.quotaUsedBefore = usedSeconds;
        result.quotaValue = quotaSeconds;

        if (quotaMode === 'quota' && quotaSeconds > 0) {
            result.mode = 'quota';
            result.baseSeconds = calculateQuotaSpendTimed(quotaSeconds, calcUsedSeconds, safeRawSeconds, multiplier);
            const remaining = Math.max(0, quotaSeconds - calcUsedSeconds);
            result.quotaWithinSeconds = Math.min(safeRawSeconds, remaining);
            result.quotaOverSeconds = Math.max(0, safeRawSeconds - result.quotaWithinSeconds);
            return result;
        }

        if (quotaMode === 'dynamic' && quotaSeconds > 0) {
            result.mode = 'dynamic';
            result.baseSeconds = calculateDynamicMultiplierSpend(quotaSeconds, calcUsedSeconds, safeRawSeconds, multiplier);
            const denom = safeRawSeconds * multiplier;
            result.dynamicRatePercent = denom > 0 ? (result.baseSeconds / denom) * 100 : 0;
            return result;
        }

        result.baseSeconds = linearBase;
        return result;
    }

    // 按次消费：按基础消耗估算次数后逐次套用 quota 公式
    if (task.type === 'instant_redeem') {
        const baseCost = Math.max(1, Math.round(task.consumeTime || 60));
        const estimatedCount = estimateUsageCountFromSeconds(task, safeRawSeconds);
        const linearBase = baseCost * estimatedCount;

        result.estimatedCount = estimatedCount;
        if (!isAbstinence || quotaMode !== 'quota') {
            result.baseSeconds = linearBase;
            return result;
        }

        const quotaCount = Math.max(0, Math.round(task.habitDetails.targetCountInPeriod || 0));
        if (quotaCount <= 0) {
            result.baseSeconds = linearBase;
            return result;
        }

        const usedCount = getQuotaPeriodUsage(task, referenceDate);
        const calcUsedCount = isCorrection ? Math.max(0, usedCount - estimatedCount) : usedCount;
        let total = 0;
        for (let i = 0; i < estimatedCount; i++) {
            total += calculateQuotaSpendInstant(quotaCount, calcUsedCount + i, baseCost);
        }

        result.mode = 'quota';
        result.baseSeconds = total;
        result.quotaUsedBefore = usedCount;
        result.quotaValue = quotaCount;
        return result;
    }

    // 兜底：保持旧逻辑
    result.baseSeconds = Math.floor(safeRawSeconds * multiplier);
    return result;
}

// [v5.6.0] 创建自动补录交易（漏记录）
function createAutoMakeup(task, dateStr, makeupMinutes, actualMinutes, recordedMinutes, deviceRecords = []) {
    const makeupSeconds = makeupMinutes * 60;
    const isSpend = ['instant_redeem', 'continuous_redeem'].includes(task.type);
    const multiplier = task.multiplier || 1;

    // [v5.6.0] 惩罚逻辑：
    // - 消耗类漏记录：×1.2 消耗（多扣作为惩罚）
    // - 获得类漏记录：×0.8 获得（少给作为惩罚）
    const penaltyMultiplier = isSpend ? 1.2 : 0.8;
    const spendCalc = isSpend
        ? calculateAutoDetectSpendByHabitMode(task, makeupSeconds, dateStr, 'makeup')
        : null;

    const baseAdjustedSeconds = isSpend
        ? Math.max(0, Math.round(spendCalc?.baseSeconds || 0))
        : Math.max(0, Math.round(makeupSeconds * multiplier));
    const adjustedSeconds = Math.max(0, Math.round(baseAdjustedSeconds * penaltyMultiplier));

    // 记录中保持“任务倍率 × 有效惩罚倍率”格式，兼容旧解析逻辑
    const taskMultiplierForDisplay = (isSpend && task.type !== 'continuous_redeem') ? 1 : multiplier;
    const displayBaseSeconds = Math.max(1, Math.round(makeupSeconds * taskMultiplierForDisplay));
    const effectivePenaltyMultiplier = adjustedSeconds > 0 ? (adjustedSeconds / displayBaseSeconds) : penaltyMultiplier;
    const multiplierStr = taskMultiplierForDisplay !== 1 ? `×${formatAutoDetectMultiplierValue(taskMultiplierForDisplay)}` : '';
    const penaltyDesc = `×${formatAutoDetectMultiplierValue(effectivePenaltyMultiplier)}惩罚`;

    // 更新余额
    if (isSpend) {
        currentBalance -= adjustedSeconds;
    } else {
        currentBalance += adjustedSeconds;
    }

    // 更新每日统计
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayKey = dateObj.toDateString();
    dailyChanges[dayKey] = dailyChanges[dayKey] || { earned: 0, spent: 0 };

    if (isSpend) {
        dailyChanges[dayKey].spent += adjustedSeconds;
    } else {
        dailyChanges[dayKey].earned += adjustedSeconds;
    }

    // [v7.21.2] 添加日志：显示补录详情
    console.log(`[createAutoMakeup] ${task.name}: ` +
                `originalDate=${dateStr}, ` +
                `实际${actualMinutes}分, 已记录${recordedMinutes}分, 补录${makeupMinutes}分, ` +
                `模式=${spendCalc?.mode || 'none'}, 惩罚后${adjustedSeconds}秒`);

    addTransaction({
        type: isSpend ? 'spend' : 'earn',
        taskId: task.id,
        taskName: task.name,
        amount: adjustedSeconds,
        description: `自动补录: ${task.name} (漏记${makeupMinutes}分钟, ${multiplierStr}${penaltyDesc})`,
        multiplier: multiplier,
        rawSeconds: makeupSeconds,
        timestamp: new Date(dateObj.getTime() + 23 * 60 * 60 * 1000).toISOString(),
        isAutoDetected: true,
        autoDetectType: 'makeup',
        isBackdate: true,
        autoDetectData: {
            actualMinutes,
            recordedMinutes,
            makeupMinutes,
            makeupSecondsRaw: makeupSeconds,
            makeupCount: spendCalc?.estimatedCount || 0,
            penaltyMultiplier,
            effectivePenaltyMultiplier,
            baseAdjustedSeconds,
            quotaModeApplied: spendCalc?.mode || 'none',
            quotaUsedBefore: spendCalc?.quotaUsedBefore || 0,
            quotaValue: spendCalc?.quotaValue || 0,
            quotaWithinSeconds: spendCalc?.quotaWithinSeconds || 0,
            quotaOverSeconds: spendCalc?.quotaOverSeconds || 0,
            dynamicRatePercent: typeof spendCalc?.dynamicRatePercent === 'number' ? spendCalc.dynamicRatePercent : null,
            originalDate: dateStr,
            deviceCount: deviceRecords.length,
            deviceRecords: deviceRecords.map(r => ({ deviceId: r.deviceId, actualMinutes: r.actualMinutes }))
        }
    });

    return {
        task,
        type: 'makeup',
        actualMinutes,
        recordedMinutes,
        diffMinutes: makeupMinutes,
        adjustedSeconds,
        penaltyMultiplier,
        effectivePenaltyMultiplier,
        isSpend,
        date: dateStr,
        mode: spendCalc?.mode || 'none'
    };
}

// [v5.6.0] 创建自动修正交易（多记录）
function createAutoCorrection(task, dateStr, correctionMinutes, actualMinutes, recordedMinutes, deviceRecords = []) {
    const correctionSeconds = correctionMinutes * 60;
    const isSpend = ['instant_redeem', 'continuous_redeem'].includes(task.type);
    const multiplier = task.multiplier || 1;

    // [v5.6.0] 惩罚逻辑：
    // - 消耗类多记录：×0.8 返还（少还作为惩罚）
    // - 获得类多记录：×1.2 扣减（多扣作为惩罚）
    const penaltyMultiplier = isSpend ? 0.8 : 1.2;
    const spendCalc = isSpend
        ? calculateAutoDetectSpendByHabitMode(task, correctionSeconds, dateStr, 'correction')
        : null;

    const baseAdjustedSeconds = isSpend
        ? Math.max(0, Math.round(spendCalc?.baseSeconds || 0))
        : Math.max(0, Math.round(correctionSeconds * multiplier));
    const adjustedSeconds = Math.max(0, Math.round(baseAdjustedSeconds * penaltyMultiplier));

    const taskMultiplierForDisplay = (isSpend && task.type !== 'continuous_redeem') ? 1 : multiplier;
    const displayBaseSeconds = Math.max(1, Math.round(correctionSeconds * taskMultiplierForDisplay));
    const effectivePenaltyMultiplier = adjustedSeconds > 0 ? (adjustedSeconds / displayBaseSeconds) : penaltyMultiplier;
    const multiplierStr = taskMultiplierForDisplay !== 1 ? `×${formatAutoDetectMultiplierValue(taskMultiplierForDisplay)}` : '';
    const penaltyDesc = isSpend
        ? `×${formatAutoDetectMultiplierValue(effectivePenaltyMultiplier)}返还`
        : `×${formatAutoDetectMultiplierValue(effectivePenaltyMultiplier)}扣减`;

    // 更新余额（反向操作）
    // earn型多记录 → 扣减余额
    // spend型多记录 → 返还余额
    if (isSpend) {
        currentBalance += adjustedSeconds; // 返还（包含惩罚）
    } else {
        currentBalance -= adjustedSeconds; // 扣减（包含惩罚）
    }

    // 更新每日统计（反向）
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayKey = dateObj.toDateString();
    dailyChanges[dayKey] = dailyChanges[dayKey] || { earned: 0, spent: 0 };

    if (isSpend) {
        // 原本多消耗了，现在返还，减少spent
        dailyChanges[dayKey].spent = Math.max(0, (dailyChanges[dayKey].spent || 0) - adjustedSeconds);
    } else {
        // 原本多获得了，现在扣减，减少earned
        dailyChanges[dayKey].earned = Math.max(0, (dailyChanges[dayKey].earned || 0) - adjustedSeconds);
    }

    addTransaction({
        type: isSpend ? 'earn' : 'spend', // 反向类型
        taskId: task.id,
        taskName: task.name,
        amount: adjustedSeconds,
        description: `自动修正: ${task.name} (多记录${correctionMinutes}分钟, ${multiplierStr}${penaltyDesc})`,
        multiplier: multiplier,
        rawSeconds: correctionSeconds,
        timestamp: new Date(dateObj.getTime() + 23 * 60 * 60 * 1000 + 1000).toISOString(), // +1秒区分
        isAutoDetected: true,
        autoDetectType: 'correction',
        isBackdate: true,
        autoDetectData: {
            actualMinutes,
            recordedMinutes,
            correctionMinutes,
            correctionSecondsRaw: correctionSeconds,
            correctionCount: spendCalc?.estimatedCount || 0,
            penaltyMultiplier,
            effectivePenaltyMultiplier,
            baseAdjustedSeconds,
            quotaModeApplied: spendCalc?.mode || 'none',
            quotaUsedBefore: spendCalc?.quotaUsedBefore || 0,
            quotaValue: spendCalc?.quotaValue || 0,
            quotaWithinSeconds: spendCalc?.quotaWithinSeconds || 0,
            quotaOverSeconds: spendCalc?.quotaOverSeconds || 0,
            dynamicRatePercent: typeof spendCalc?.dynamicRatePercent === 'number' ? spendCalc.dynamicRatePercent : null,
            originalDate: dateStr,
            deviceCount: deviceRecords.length,
            deviceRecords: deviceRecords.map(r => ({ deviceId: r.deviceId, actualMinutes: r.actualMinutes }))
        }
    });

    return {
        task,
        type: 'correction',
        actualMinutes,
        recordedMinutes,
        diffMinutes: correctionMinutes,
        adjustedSeconds,
        penaltyMultiplier,
        effectivePenaltyMultiplier,
        isSpend,
        date: dateStr,
        mode: spendCalc?.mode || 'none'
    };
}

// [v5.6.0] 获取任务在指定日期的已记录时长（包含自动补录/修正，用于检测时计算总记录）
// [v5.8.0 Fix] 从描述中解析时间，而不是用当前倍率反推（倍率可能已更改）
function getTaskRecordedTimeForDateIncludeAuto(taskId, dateStr) {
    let totalSeconds = 0;
    
    transactions.forEach(t => {
        if (t.taskId !== taskId) return;
        if (t.isHabitReward || t.isStreakAdvancement || t.isSystem) return;
        
        const tDateStr = getLocalDateString(new Date(t.timestamp));
        if (tDateStr === dateStr) {
            // [v5.8.0] 从描述中解析实际时长，避免倍率变化导致的计算错误
            let recordedSeconds = parseTimeFromDescription(t.description);

            // [v7.24.1] 统一回退到原始秒数提取函数，兼容 makeup/correction 新字段
            if (recordedSeconds === null) {
                recordedSeconds = getRawUsageSecondsFromTransaction(t);
            }
            
            // 修正类型是反向的，需要减去
            if (t.autoDetectType === 'correction') {
                totalSeconds -= recordedSeconds;
            } else {
                totalSeconds += recordedSeconds;
            }
            
            console.log(`[getTaskRecordedTimeForDateIncludeAuto] ${t.description?.substring(0, 40)}... parsed=${recordedSeconds}s (${Math.floor(recordedSeconds/60)}min), autoType=${t.autoDetectType || 'none'}`);
        }
    });
    
    console.log(`[getTaskRecordedTimeForDateIncludeAuto] Total for ${taskId} on ${dateStr}: ${totalSeconds}s = ${Math.floor(totalSeconds/60)}min`);
    return Math.max(0, totalSeconds);
}

// [v5.8.0] 从描述中解析时间
// 支持格式: "(1小时15分 × 2)", "(30分54秒 × 1.2)", "(2小时20分 × 2)"
function parseTimeFromDescription(description) {
    if (!description) return null;
    
    // 匹配时间格式：(时间 × 倍率)
    // 时间可以是: "1小时15分", "30分54秒", "2小时20分", "59分10秒" 等
    const timeMatch = description.match(/\((\d+小时)?(\d+分)?(\d+秒)?\s*[×x]\s*[\d.]+\)/);
    if (!timeMatch) return null;
    
    let seconds = 0;
    const hourMatch = description.match(/(\d+)小时/);
    const minMatch = description.match(/(\d+)分/);
    const secMatch = description.match(/(\d+)秒/);
    
    // 需要确保这些匹配在括号内
    const bracketContent = description.match(/\(([^)]+[×x]\s*[\d.]+)\)/);
    if (!bracketContent) return null;
    
    const content = bracketContent[1];
    const hourInBracket = content.match(/(\d+)小时/);
    const minInBracket = content.match(/(\d+)分/);
    const secInBracket = content.match(/(\d+)秒/);
    
    if (hourInBracket) seconds += parseInt(hourInBracket[1]) * 3600;
    if (minInBracket) seconds += parseInt(minInBracket[1]) * 60;
    if (secInBracket) seconds += parseInt(secInBracket[1]);
    
    return seconds > 0 ? seconds : null;
}

// [v5.3.0] 获取任务在指定日期的已记录时长（秒）- 仅用户记录，不含自动补录
// [v5.5.2 Fix] 返回原始记录时长（未乘倍率），用于与应用实际使用时长对比
// [v5.8.0 Fix] 从描述中解析时间，而不是用当前倍率反推
function getTaskRecordedTimeForDate(taskId, dateStr) {
    let totalSeconds = 0;
    
    transactions.forEach(t => {
        if (t.taskId !== taskId) return;
        
        // 排除习惯奖励、连续奖励、系统记录、自动补录等非用户直接记录
        if (t.isHabitReward || t.isStreakAdvancement || t.isSystem || t.isAutoDetected) return;
        
        // 解析 transaction 的日期
        const tDate = new Date(t.timestamp);
        const tDateStr = getLocalDateString(tDate);
        
        if (tDateStr === dateStr) {
            // [v5.8.0] 从描述中解析实际时长
            let recordedSeconds = parseTimeFromDescription(t.description);
            
            // 如果无法从描述解析，回退到旧方法
            if (recordedSeconds === null) {
                const task = tasks.find(tk => tk.id === taskId);
                const multiplier = task?.multiplier || 1;
                recordedSeconds = Math.round((t.amount || 0) / multiplier);
                // 检查透支惩罚（兼容旧文案与新标记字段）
                if (t.historicalPenalty || (t.description && (t.description.includes('余额不足, 1.2倍消耗') || t.description.includes('历史余额不足, 1.2倍消耗')))) {
                    recordedSeconds = Math.round(recordedSeconds / 1.2);
                }
            }
            
            totalSeconds += recordedSeconds;
        }
    });
    
    return totalSeconds;
}

// [v5.6.0] 显示自动检测通知（支持补录和修正）
function showAutoDetectNotification(results) {
    let content = '<div style="max-height: 400px; overflow-y: auto;">';
    
    const makeupResults = results.filter(r => r.type === 'makeup');
    const correctionResults = results.filter(r => r.type === 'correction');
    
    if (makeupResults.length > 0) {
        content += '<div style="margin-bottom: 16px;"><div style="font-weight: 600; color: var(--color-primary); margin-bottom: 8px;">🤖 已自动补录（漏记录）</div>';
        makeupResults.forEach(r => {
            const defaultPenalty = r.isSpend ? 1.2 : 0.8;
            const penaltyValue = formatAutoDetectMultiplierValue(r.effectivePenaltyMultiplier || r.penaltyMultiplier || defaultPenalty);
            const penaltyStr = `×${penaltyValue}惩罚`;
            const changeStr = r.isSpend 
                ? `<span style="color: #e74c3c;">-${formatTime(r.adjustedSeconds)}</span>`
                : `<span style="color: var(--color-positive);">+${formatTime(r.adjustedSeconds)}</span>`;
            content += `
                <div style="padding: 8px; background: var(--card-bg); border-radius: 8px; margin-bottom: 8px;">
                    <div style="font-weight: 500;">${escapeHtml(r.task.name)}</div>
                    <div style="font-size: 0.85rem; color: var(--text-color-light); margin-top: 4px;">
                        ${r.date}: 实际 ${r.actualMinutes}分钟，已记录 ${r.recordedMinutes}分钟
                    </div>
                    <div style="font-size: 0.9rem; margin-top: 4px;">
                        补录 ${r.diffMinutes}分钟 (${penaltyStr}) → ${changeStr}
                    </div>
                </div>`;
        });
        content += '</div>';
    }
    
    if (correctionResults.length > 0) {
        content += '<div><div style="font-weight: 600; color: #f39c12; margin-bottom: 8px;">🔧 已自动修正（多记录）</div>';
        correctionResults.forEach(r => {
            const defaultPenalty = r.isSpend ? 0.8 : 1.2;
            const penaltyValue = formatAutoDetectMultiplierValue(r.effectivePenaltyMultiplier || r.penaltyMultiplier || defaultPenalty);
            const penaltyStr = r.isSpend ? `×${penaltyValue}返还` : `×${penaltyValue}扣减`;
            const changeStr = r.isSpend 
                ? `<span style="color: var(--color-positive);">+${formatTime(r.adjustedSeconds)}</span>` // 返还
                : `<span style="color: #e74c3c;">-${formatTime(r.adjustedSeconds)}</span>`; // 扣减
            content += `
                <div style="padding: 8px; background: rgba(243, 156, 18, 0.1); border-radius: 8px; margin-bottom: 8px;">
                    <div style="font-weight: 500;">${escapeHtml(r.task.name)}</div>
                    <div style="font-size: 0.85rem; color: var(--text-color-light); margin-top: 4px;">
                        ${r.date}: 实际 ${r.actualMinutes}分钟，已记录 ${r.recordedMinutes}分钟
                    </div>
                    <div style="font-size: 0.9rem; margin-top: 4px;">
                        修正 ${r.diffMinutes}分钟 (${penaltyStr}) → ${changeStr}
                    </div>
                </div>`;
        });
        content += '</div>';
    }
    
    content += '</div>';
    
    showInfoModal('应用时间检测报告', content);
}

// [v5.2.0] 提前结算今日（可选）
async function settleScreenTimeToday() {
    if (!screenTimeSettings.enabled) {
        showToast('请先启用屏幕时间管理');
        return;
    }
    
    if (typeof Android === 'undefined' || !Android.getTodayScreenTime) {
        showToast('此功能仅在 Android 应用中可用');
        return;
    }
    
    const usedMs = Android.getTodayScreenTime(JSON.stringify(screenTimeSettings.whitelistApps || []));
    if (usedMs < 0) {
        showToast('获取屏幕时间失败，请检查权限');
        return;
    }
    
    const usedMinutes = Math.floor(usedMs / 60000);
    const limitMinutes = screenTimeSettings.dailyLimitMinutes;
    const diff = limitMinutes - usedMinutes;
    const diffSeconds = diff * 60;
    
    const today = getLocalDateString(new Date());
    
    // [v7.18.2-fix] 修复 settledDates 结构使用错误
    const deviceSettledDates = screenTimeSettings.settledDates?.[currentDeviceId] || [];
    if (deviceSettledDates.includes(today)) {
        showToast('今日已结算过');
        return;
    }
    
    // 确认结算
    const confirmMsg = diff >= 0 
        ? `今日屏幕使用 ${formatScreenTimeMinutes(usedMinutes)}，未超过限额 ${formatScreenTimeMinutes(limitMinutes)}。\n\n将获得奖励: +${formatScreenTimeMinutes(diff)}\n\n⚠️ 提前结算后，今日后续使用将不再计入。\n\n确定提前结算吗？`
        : `今日屏幕使用 ${formatScreenTimeMinutes(usedMinutes)}，超出限额 ${formatScreenTimeMinutes(limitMinutes)}。\n\n将消耗时间: ${formatScreenTimeMinutes(-diff)}\n\n⚠️ 提前结算后，今日后续使用将不再计入。\n\n确定提前结算吗？`;
    
    if (!await showConfirm(confirmMsg, '提前结算今日')) return;
    
    // 执行结算
    const isReward = diffSeconds >= 0;
    const absAmount = Math.abs(diffSeconds);
    const todayKey = new Date().toDateString();
    
    // [v7.3.0] 均衡模式：仅对奖励应用乘数
    const multiplier = (balanceMode.enabled && isReward) ? getBalanceMultiplier() : 1;
    const adjustedAmount = Math.round(absAmount * multiplier);
    const balanceAdjust = adjustedAmount - absAmount;
    
    currentBalance += isReward ? adjustedAmount : -absAmount;
    dailyChanges[todayKey] = dailyChanges[todayKey] || { earned: 0, spent: 0 };
    
    if (isReward) {
        dailyChanges[todayKey].earned += adjustedAmount;
        const toastMsg = multiplier !== 1 
            ? `🎉 屏幕时间奖励: +${formatTime(adjustedAmount)} ×${multiplier} (均衡调整)`
            : `🎉 屏幕时间奖励: +${formatTime(adjustedAmount)}`;
        showToast(toastMsg);
    } else {
        dailyChanges[todayKey].spent += absAmount;
        showToast(`📱 屏幕时间消耗: ${formatTime(absAmount)}`);
    }
    
    // 添加 transaction 记录
    const systemTask = SYSTEM_TASKS.SCREEN_TIME;
    // [v5.10.0] 使用用户自定义的分类
    const customCategory = isReward ? screenTimeSettings.earnCategory : screenTimeSettings.spendCategory;
    // [v7.3.0] 均衡模式描述
    const balanceModeSuffix = (isReward && multiplier !== 1) ? ` ×${multiplier} (均衡调整)` : '';
    addTransaction({
        type: isReward ? 'earn' : 'spend',
        taskId: systemTask.id,
        taskName: systemTask.name,
        category: customCategory || SYSTEM_CATEGORY, // [v5.10.0] 保存分类
        amount: isReward ? adjustedAmount : absAmount,
        description: `📱 屏幕时间: ${formatScreenTimeMinutes(usedMinutes)}/${formatScreenTimeMinutes(limitMinutes)} (${isReward ? '奖励' : '超出'}${formatScreenTimeMinutes(Math.abs(diff))})${balanceModeSuffix}`,
        isSystem: true,
        systemType: 'screen-time',
        screenTimeData: {
            usedMinutes,
            limitMinutes,
            diffMinutes: diff
        },
        balanceAdjust: balanceAdjust !== 0 ? balanceAdjust : undefined
    });
    
    // [v7.18.2-fix] 修复 settledDates 结构使用错误
    if (!screenTimeSettings.settledDates) screenTimeSettings.settledDates = {};
    if (!screenTimeSettings.settledDates[currentDeviceId]) screenTimeSettings.settledDates[currentDeviceId] = [];
    screenTimeSettings.settledDates[currentDeviceId].push(today);
    screenTimeSettings.lastSettleDate = today;
    screenTimeSettings.lastSettleTime = Date.now();
    
    saveScreenTimeSettings();
    saveData();
    updateBalanceDisplay();
    updateScreenTimeCard();
    updateLastSettleTimeDisplay();
    
    // 添加历史记录
    addScreenTimeHistory(usedMinutes, limitMinutes, diff, today);
}

// [保留旧函数名以兼容] 原手动结算函数
function settleScreenTime() {
    settleScreenTimeToday();
}

// 添加屏幕时间历史记录
function addScreenTimeHistory(usedMinutes, limitMinutes, diffMinutes, actualDate) {
    // actualDate 格式: 'YYYY-MM-DD' 或 Date 对象
    let dateToStore;
    if (actualDate) {
        dateToStore = typeof actualDate === 'string' ? actualDate : getLocalDateString(actualDate);
    } else {
        dateToStore = getLocalDateString(new Date());
    }
    
    const record = {
        date: dateToStore,
        usedMinutes,
        limitMinutes,
        diffMinutes,
        type: diffMinutes >= 0 ? 'reward' : 'consume'
    };
    
    let history = JSON.parse(localStorage.getItem('screenTimeHistory') || '[]');
    history.push(record);
    // 只保留最近 30 条
    if (history.length > 30) {
        history = history.slice(-30);
    }
    localStorage.setItem('screenTimeHistory', JSON.stringify(history));
    saveDeviceSpecificDataDebounced(); // [v7.2.4] 同步到云端
}

// [v5.10.0] 屏幕时间分类迁移工具：将历史记录从「系统」分类迁移到用户选择的分类
async function migrateScreenTimeCategoryRecords() {
    // 检查用户是否已设置自定义分类
    const earnCategory = screenTimeSettings.earnCategory;
    const spendCategory = screenTimeSettings.spendCategory;
    
    if (!earnCategory && !spendCategory) {
        showInfoModal('分类修复', `
            <p>ℹ️ 您还未设置屏幕时间的自定义分类。</p>
            <p style="margin-top: 12px;">请先在 <strong>屏幕时间管理 → 分类标签</strong> 中选择您希望的分类，然后再运行此修复工具。</p>
        `);
        return;
    }
    
    // 找出所有屏幕时间记录（仅限「系统」分类的）
    const screenTimeRecords = transactions.filter(t => 
        t.systemType === 'screen-time' && 
        (!t.category || t.category === SYSTEM_CATEGORY)
    );
    
    if (screenTimeRecords.length === 0) {
        showInfoModal('分类修复', `<p>✅ 没有需要修复的记录，所有屏幕时间记录已使用自定义分类。</p>`);
        return;
    }
    
    // 统计待修复记录
    const earnRecords = screenTimeRecords.filter(r => r.type === 'earn');
    const spendRecords = screenTimeRecords.filter(r => r.type === 'spend');
    
    // 构建确认弹窗
    let content = `<div style="text-align: left;">`;
    content += `<p style="margin-bottom: 12px;">发现 <strong>${screenTimeRecords.length}</strong> 条屏幕时间记录使用「系统」分类，可修复为您设置的自定义分类：</p>`;
    content += `<div style="background: var(--card-bg); padding: 12px; border-radius: 8px; margin-bottom: 12px;">`;
    
    if (earnRecords.length > 0 && earnCategory) {
        content += `<p>🟢 <strong>${earnRecords.length}</strong> 条节省时间记录 → <strong>${earnCategory}</strong></p>`;
    } else if (earnRecords.length > 0) {
        content += `<p style="color: var(--text-color-light);">🟢 ${earnRecords.length} 条节省时间记录（未设置分类，将保持「系统」）</p>`;
    }
    
    if (spendRecords.length > 0 && spendCategory) {
        content += `<p>🔴 <strong>${spendRecords.length}</strong> 条超出时间记录 → <strong>${spendCategory}</strong></p>`;
    } else if (spendRecords.length > 0) {
        content += `<p style="color: var(--text-color-light);">🔴 ${spendRecords.length} 条超出时间记录（未设置分类，将保持「系统」）</p>`;
    }
    
    content += `</div>`;
    content += `<p style="color: var(--text-color-light); font-size: 0.9rem;">ℹ️ 此操作仅修改分类标签，不影响时间余额。</p>`;
    content += `</div>`;
    
    if (!await showConfirm(content, '确认修复分类')) return;
    
    // 执行修复
    let fixedCount = 0;
    screenTimeRecords.forEach(record => {
        if (record.type === 'earn' && earnCategory) {
            record.category = earnCategory;
            fixedCount++;
        } else if (record.type === 'spend' && spendCategory) {
            record.category = spendCategory;
            fixedCount++;
        }
    });
    
    // 保存数据
    saveData();
    updateAllUI();
    
    showToast(`✅ 已修复 ${fixedCount} 条屏幕时间记录的分类`);
}

// [v5.6.0] 清理重复的屏幕时间记录
function cleanupDuplicateScreenTimeRecords() {
    // 找出所有屏幕时间相关的记录
    const screenTimeRecords = transactions.filter(t => 
        t.systemType === 'screen-time' || 
        (t.description && t.description.includes('屏幕时间'))
    );
    
    // 按 originalDate 分组
    const recordsByDate = {};
    screenTimeRecords.forEach(record => {
        const dateStr = record.screenTimeData?.originalDate;
        if (dateStr) {
            if (!recordsByDate[dateStr]) {
                recordsByDate[dateStr] = [];
            }
            recordsByDate[dateStr].push(record);
        }
    });
    
    // 找出需要删除的记录
    const duplicateDates = []; // 有重复的日期
    const oldFormatDates = []; // 只有旧格式的日期
    const toRemove = [];
    
    Object.keys(recordsByDate).forEach(dateStr => {
        const records = recordsByDate[dateStr];
        const newFormat = records.filter(r => r.description && r.description.startsWith('📱'));
        const oldFormat = records.filter(r => r.description && !r.description.startsWith('📱'));
        
        if (records.length > 1) {
            // 有重复记录
            duplicateDates.push(dateStr);
            if (newFormat.length > 0 && oldFormat.length > 0) {
                // 有新格式，删除所有旧格式
                toRemove.push(...oldFormat);
            } else {
                // 全是同一格式，保留第一条
                toRemove.push(...records.slice(1));
            }
        } else if (records.length === 1 && oldFormat.length === 1) {
            // 只有一条旧格式记录，也标记为待清理（可选）
            oldFormatDates.push(dateStr);
        }
    });
    
    // 构建确认弹窗
    let content = `<div style="text-align: left; max-height: 400px; overflow-y: auto;">`;
    
    if (toRemove.length === 0 && oldFormatDates.length === 0) {
        showInfoModal('数据检查', `<p>✅ 未发现需要清理的屏幕时间记录，数据正常。</p>`);
        return;
    }
    
    // 计算重复记录的退还金额
    let refundAmount = 0;
    toRemove.forEach(record => {
        if (record.type === 'spend') {
            refundAmount += record.amount;
        } else if (record.type === 'earn') {
            refundAmount -= record.amount;
        }
    });
    
    // 显示重复记录
    if (toRemove.length > 0) {
        content += `<p style="color: #e74c3c; margin-bottom: 12px;">⚠️ 发现 <strong>${duplicateDates.length}</strong> 天有重复记录，共 <strong>${toRemove.length}</strong> 条</p>`;
        content += `<p style="margin-bottom: 12px;">重复日期: ${duplicateDates.sort().join(', ')}</p>`;
        content += `<div style="background: var(--card-bg); padding: 12px; border-radius: 8px; margin-bottom: 12px;">`;
        content += `<p><strong>将删除的重复记录:</strong></p>`;
        content += `<ul style="font-size: 0.85rem; padding-left: 20px; margin-top: 8px;">`;
        toRemove.slice(0, 10).forEach(r => {
            const typeIcon = r.type === 'spend' ? '🔻' : '🔺';
            content += `<li>${r.screenTimeData?.originalDate}: ${typeIcon} ${formatTime(r.amount)}</li>`;
        });
        if (toRemove.length > 10) {
            content += `<li>... 等 ${toRemove.length} 条</li>`;
        }
        content += `</ul></div>`;
        
        const refundStr = refundAmount >= 0 
            ? `<span style="color: var(--color-positive);">+${formatTime(refundAmount)}</span>` 
            : `<span style="color: #e74c3c;">${formatTime(refundAmount)}</span>`;
        content += `<p>清理重复记录后余额变化: ${refundStr}</p>`;
    }
    
    // 显示旧格式单独记录（可选删除）
    if (oldFormatDates.length > 0) {
        const oldRecords = oldFormatDates.map(d => recordsByDate[d][0]);
        let oldRefund = 0;
        oldRecords.forEach(r => {
            if (r.type === 'spend') oldRefund += r.amount;
            else if (r.type === 'earn') oldRefund -= r.amount;
        });
        
        content += `<div style="margin-top: 16px; padding: 12px; background: rgba(243, 156, 18, 0.1); border-radius: 8px;">`;
        content += `<p style="color: #f39c12; margin-bottom: 8px;">📋 发现 <strong>${oldFormatDates.length}</strong> 天有旧格式记录（启用屏幕时间管理前被补结算的）:</p>`;
        content += `<p style="font-size: 0.85rem; margin-bottom: 8px;">${oldFormatDates.sort().join(', ')}</p>`;
        content += `<ul style="font-size: 0.85rem; padding-left: 20px;">`;
        oldRecords.forEach(r => {
            const typeIcon = r.type === 'spend' ? '🔻' : '🔺';
            content += `<li>${r.screenTimeData?.originalDate}: ${typeIcon} ${formatTime(r.amount)}</li>`;
        });
        content += `</ul>`;
        const oldRefundStr = oldRefund >= 0 
            ? `<span style="color: var(--color-positive);">+${formatTime(oldRefund)}</span>` 
            : `<span style="color: #e74c3c;">${formatTime(oldRefund)}</span>`;
        content += `<p style="margin-top: 8px;">如同时删除，额外变化: ${oldRefundStr}</p>`;
        content += `<label style="display: flex; align-items: center; margin-top: 8px; cursor: pointer;">`;
        content += `<input type="checkbox" id="includeOldFormat" style="margin-right: 8px;"> 同时删除这些旧格式记录`;
        content += `</label></div>`;
        
        // 暂存旧格式记录
        window._pendingOldFormatIds = oldRecords.map(r => r.id);
        window._pendingOldFormatRefund = oldRefund;
    }
    
    content += `<div style="margin-top: 16px; text-align: center;">`;
    content += `<button class="btn btn-secondary" onclick="hideInfoModal()" style="margin-right: 8px;">取消</button>`;
    content += `<button class="btn btn-primary" onclick="executeCleanupDuplicates()">确认清理</button>`;
    content += `</div></div>`;
    
    // 暂存待删除的记录 ID
    window._pendingCleanupIds = toRemove.map(r => r.id);
    window._pendingRefundAmount = refundAmount;
    
    showInfoModal('🔧 清理屏幕时间记录', content);
}

// 执行清理
function executeCleanupDuplicates() {
    let idsToRemove = window._pendingCleanupIds || [];
    let refundAmount = window._pendingRefundAmount || 0;
    
    // 检查是否勾选了删除旧格式记录
    const includeOldFormat = document.getElementById('includeOldFormat')?.checked;
    if (includeOldFormat && window._pendingOldFormatIds) {
        idsToRemove = idsToRemove.concat(window._pendingOldFormatIds);
        refundAmount += window._pendingOldFormatRefund || 0;
    }
    
    if (idsToRemove.length === 0) {
        hideInfoModal();
        showToast('没有需要清理的记录');
        return;
    }
    
    // 从 transactions 中删除
    const beforeCount = transactions.length;
    transactions = transactions.filter(t => !idsToRemove.includes(t.id));
    const removedCount = beforeCount - transactions.length;
    
    // 调整余额
    currentBalance += refundAmount;
    
    // 保存
    saveData();
    updateBalanceDisplay();
    
    // 清理暂存
    delete window._pendingCleanupIds;
    delete window._pendingRefundAmount;
    delete window._pendingOldFormatIds;
    delete window._pendingOldFormatRefund;
    
    hideInfoModal();
    
    const refundStr = refundAmount >= 0 
        ? `+${formatTime(refundAmount)}` 
        : formatTime(refundAmount);
    showToast(`✅ 已清理 ${removedCount} 条重复记录，余额 ${refundStr}`);
}
// [v5.2.0] 检查并提供历史补结算
function checkAndOfferHistoricalSettlement() {
    try {
        console.log('[ScreenTime] checkAndOfferHistoricalSettlement called');
        
        if (typeof Android === 'undefined') {
            showAlert('此功能仅在 Android 应用中可用');
            return;
        }
        
        if (!Android.getScreenTimeForDate) {
            showAlert('请重新编译安装 App 以启用此功能\n\n当前 Android 接口缺少 getScreenTimeForDate 方法');
            return;
        }
        
        if (!screenTimeSettings.enabled) {
            showAlert('请先启用屏幕时间管理');
            return;
        }
        
        // 获取过去7天有数据的日期（不含今天）
        const today = getLocalDateString(new Date());
        const availableDates = [];
        const debugLines = [];
        
        for (let i = 1; i <= 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = getLocalDateString(date);
            
            // [v7.18.2-fix] 修复 settledDates 结构使用错误
            const deviceSettledDates = screenTimeSettings.settledDates?.[currentDeviceId] || [];
            if (deviceSettledDates.includes(dateStr)) {
                debugLines.push(`${dateStr}: 已结算，跳过`);
                continue;
            }
            
            // 检查是否有数据
            try {
                const usedMs = Android.getScreenTimeForDate(dateStr, JSON.stringify(screenTimeSettings.whitelistApps || []));
                debugLines.push(`${dateStr}: ${usedMs}ms (${Math.floor(usedMs/60000)}分钟)`);
                if (usedMs > 0) {
                    availableDates.push({
                        date: dateStr,
                        usedMs: usedMs,
                        usedMinutes: Math.floor(usedMs / 60000)
                    });
                }
            } catch (e) {
                debugLines.push(`${dateStr}: 查询出错 - ${e.message}`);
            }
        }
        
        console.log('[ScreenTime] Query results:', debugLines);
        
        if (availableDates.length === 0) {
            showAlert('过去7天没有可补结算的数据\n\n详情:\n' + debugLines.join('\n'));
            return;
        }
        
        // 显示补结算弹窗
        showHistoricalSettlementModal(availableDates);
    } catch (e) {
        showAlert('补结算检查出错: ' + e.message + '\n\n' + e.stack, '错误');
    }
}

// 显示历史补结算弹窗
let pendingSettlementDates = null; // 临时存储待结算数据，避免通过 onclick 传递复杂对象

function showHistoricalSettlementModal(availableDates) {
    // 存储到全局变量，避免 JSON 序列化问题
    pendingSettlementDates = availableDates;
    
    const limitMinutes = screenTimeSettings.dailyLimitMinutes;
    
    let totalReward = 0;
    let totalPenalty = 0;
    
    const rows = availableDates.map(item => {
        const diff = limitMinutes - item.usedMinutes;
        if (diff >= 0) {
            totalReward += diff;
        } else {
            totalPenalty += Math.abs(diff);
        }
        const diffStr = diff >= 0 
            ? `<span style="color: var(--color-primary);">+${formatScreenTimeMinutes(diff)}</span>` 
            : `<span style="color: #e74c3c;">-${formatScreenTimeMinutes(-diff)}</span>`;
        return `
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
                <span>${item.date}</span>
                <span>${formatScreenTimeMinutes(item.usedMinutes)}</span>
                <span>${diffStr}</span>
            </div>
        `;
    }).join('');
    
    const netEffect = totalReward - totalPenalty;
    const netStr = netEffect >= 0 
        ? `<span style="color: var(--color-primary); font-weight: bold;">+${formatScreenTimeMinutes(netEffect)}</span>`
        : `<span style="color: #e74c3c; font-weight: bold;">-${formatScreenTimeMinutes(-netEffect)}</span>`;
    
    const content = `
        <div style="margin-bottom: 16px;">
            <p>检测到过去 ${availableDates.length} 天有屏幕使用数据。</p>
            <p>是否按当前限额 (${formatScreenTimeMinutes(limitMinutes)}/天) 进行补结算？</p>
        </div>
        <div style="background: var(--bg-color-light); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; padding: 8px 0; font-weight: 600; border-bottom: 2px solid var(--border-color);">
                <span>日期</span>
                <span>使用时间</span>
                <span>奖惩</span>
            </div>
            ${rows}
            <div style="display: flex; justify-content: space-between; padding: 12px 0 4px; font-weight: 600;">
                <span>合计</span>
                <span></span>
                <span>${netStr}</span>
            </div>
        </div>
        <div style="display: flex; gap: 12px; justify-content: center;">
            <button class="btn-secondary" onclick="hideInfoModal(); pendingSettlementDates = null;">跳过</button>
            <button class="btn-primary" id="confirmSettlementBtn" onclick="executeHistoricalSettlement()">确认补结算</button>
        </div>
    `;
    
    showInfoModal('历史数据补结算', content);
}

// 执行历史补结算
function executeHistoricalSettlement() {
    // 从全局变量获取数据
    if (!pendingSettlementDates || pendingSettlementDates.length === 0) {
        showToast('没有待结算的数据');
        hideInfoModal();
        return;
    }
    
    // 禁用按钮防止重复点击
    const btn = document.getElementById('confirmSettlementBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '处理中...';
    }
    
    const availableDates = pendingSettlementDates;
    pendingSettlementDates = null; // 清空，防止重复执行
    
    const limitMinutes = screenTimeSettings.dailyLimitMinutes;
    let totalChange = 0;
    let settledCount = 0;
    
    // 初始化 settledDates 数组
    if (!screenTimeSettings.settledDates) {
        screenTimeSettings.settledDates = [];
    }
    
    // 使用 Set 进行去重，防止同一天多次结算
    const processedDates = new Set();
    
    availableDates.forEach(item => {
        const dateStr = item.date;
        
        // [v7.18.2-fix] 修复 settledDates 结构使用错误
        const deviceSettledDates = screenTimeSettings.settledDates?.[currentDeviceId] || [];
        if (processedDates.has(dateStr) || deviceSettledDates.includes(dateStr)) {
            console.log(`[ScreenTime] 跳过已结算日期: ${dateStr}`);
            return;
        }
        
        // [v5.6.0] 检查是否已有该日期的屏幕时间交易记录（兼容旧格式）
        const hasExistingRecord = transactions.some(t => 
            t.screenTimeData?.originalDate === dateStr ||
            (t.systemType === 'screen-time' && t.screenTimeData?.originalDate === dateStr)
        );
        if (hasExistingRecord) {
            console.log(`[ScreenTime] 跳过已有记录的日期: ${dateStr}`);
            return;
        }
        
        processedDates.add(dateStr);
        
        const usedMinutes = item.usedMinutes;
        const diff = limitMinutes - usedMinutes;
        const diffSeconds = diff * 60;
        const isReward = diff >= 0;
        const absAmount = Math.abs(diffSeconds);
        
        // 更新余额
        currentBalance += diffSeconds;
        totalChange += diffSeconds;
        
        // 计算该日期对应的 dailyChanges key
        const [year, month, day] = dateStr.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        const dayKey = dateObj.toDateString();
        dailyChanges[dayKey] = dailyChanges[dayKey] || { earned: 0, spent: 0 };
        
        if (isReward) {
            dailyChanges[dayKey].earned += absAmount;
        } else {
            dailyChanges[dayKey].spent += absAmount;
        }
        
        // 添加 transaction 记录（标记为补结算）
        const systemTask = SYSTEM_TASKS.SCREEN_TIME;
        // [v5.10.0] 使用用户自定义的分类
        const customCategory = isReward ? screenTimeSettings.earnCategory : screenTimeSettings.spendCategory;
        addTransaction({
            type: isReward ? 'earn' : 'spend',
            taskId: systemTask.id,
            taskName: systemTask.name,
            category: customCategory || SYSTEM_CATEGORY, // [v5.10.0] 保存分类
            amount: absAmount,
            description: `📱 屏幕时间: ${formatScreenTimeMinutes(usedMinutes)}/${formatScreenTimeMinutes(limitMinutes)} (${isReward ? '奖励' : '超出'}${formatScreenTimeMinutes(Math.abs(diff))})`,
            timestamp: new Date(dateObj.getTime() + 23 * 60 * 60 * 1000).toISOString(), // 设为当天23:00
            isSystem: true,
            systemType: 'screen-time',
            isBackdate: true, // 标记为补结算
            screenTimeData: {
                usedMinutes,
                limitMinutes,
                diffMinutes: diff,
                originalDate: dateStr
            }
        });
        
        // 记录到已结算日期（前面已初始化，这里直接添加）
        screenTimeSettings.settledDates.push(dateStr);
        
        // 添加历史记录
        addScreenTimeHistory(usedMinutes, limitMinutes, diff, dateStr);
        
        settledCount++;
    });
    
    // 保存数据
    saveScreenTimeSettings();
    saveData();
    updateBalanceDisplay();
    hideInfoModal();
    
    // 显示结果
    const changeStr = totalChange >= 0 
        ? `+${formatTime(totalChange)}`
        : `-${formatTime(Math.abs(totalChange))}`;
    showToast(`✅ 已补结算 ${settledCount} 天，余额变化: ${changeStr}`);
}

// 更新上次结算时间显示
function updateLastSettleTimeDisplay() {
    const el = document.getElementById('lastSettleTime');
    if (!el) return;
    
    const today = getLocalDateString(new Date());
    
    // [v7.18.2-fix] 修复 settledDates 结构使用错误
    const deviceSettledDates = screenTimeSettings.settledDates?.[currentDeviceId] || [];
    if (deviceSettledDates.includes(today)) {
        const time = screenTimeSettings.lastSettleTime ? new Date(screenTimeSettings.lastSettleTime) : new Date();
        el.textContent = `今日已提前结算 (${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')})`;
    } else {
        el.textContent = '可选：提前锁定今日结果';
    }
}

// 屏幕时间详情弹窗
function showScreenTimeDetails() {
    if (typeof Android !== 'undefined' && Android.getTodayScreenTime) {
        const usedMs = Android.getTodayScreenTime(JSON.stringify(screenTimeSettings.whitelistApps));
        if (usedMs < 0) {
            showToast('获取屏幕时间失败');
            return;
        }
        
        const usedMinutes = Math.floor(usedMs / 60000);
        const limitMinutes = screenTimeSettings.dailyLimitMinutes;
        const diff = limitMinutes - usedMinutes;
        
        // [v5.5.0] 获取应用使用时长列表
        let appUsageHtml = '';
        if (Android.getAppUsageList) {
            try {
                const appListJson = Android.getAppUsageList(JSON.stringify(screenTimeSettings.whitelistApps));
                const appList = JSON.parse(appListJson);
                
                if (appList.length > 0) {
                    const top5 = appList.slice(0, 5);
                    const others = appList.slice(5);
                    const othersTime = others.reduce((sum, app) => sum + app.timeMs, 0);
                    const othersCount = others.length;
                    
                    // 颜色调色板
                    const colors = ['#4CAF50', '#FF9800', '#2196F3', '#9C27B0', '#795548', '#607D8B'];
                    
                    appUsageHtml = `
                    <div style="margin-top: 16px; border-top: 1px solid var(--border-color); padding-top: 12px;">
                        <div style="font-weight: 600; margin-bottom: 10px; font-size: 0.95rem;">📊 今日使用分布</div>
                        <div style="display: flex; flex-direction: column; gap: 8px;">`;
                    
                    top5.forEach((app, index) => {
                        const timeMinutes = Math.floor(app.timeMs / 60000);
                        const percent = usedMs > 0 ? Math.round(app.timeMs / usedMs * 100) : 0;
                        const color = colors[index];
                        appUsageHtml += `
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 10px; height: 10px; border-radius: 50%; background: ${color}; flex-shrink: 0;"></div>
                            <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem;">${app.appName}</div>
                            <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-color-light); white-space: nowrap;">${formatScreenTimeCompact(timeMinutes)}</div>
                            <div style="width: 40px; text-align: right; font-size: 0.8rem; color: var(--text-color-light);">${percent}%</div>
                        </div>`;
                    });
                    
                    // 显示"其他"类别
                    if (othersCount > 0) {
                        const othersMinutes = Math.floor(othersTime / 60000);
                        const othersPercent = usedMs > 0 ? Math.round(othersTime / usedMs * 100) : 0;
                        appUsageHtml += `
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 10px; height: 10px; border-radius: 50%; background: ${colors[5]}; flex-shrink: 0;"></div>
                            <div style="flex: 1; min-width: 0; font-size: 0.9rem; color: var(--text-color-light);">其他 (${othersCount}个)</div>
                            <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-color-light); white-space: nowrap;">${formatScreenTimeCompact(othersMinutes)}</div>
                            <div style="width: 40px; text-align: right; font-size: 0.8rem; color: var(--text-color-light);">${othersPercent}%</div>
                        </div>`;
                    }
                    
                    appUsageHtml += '</div></div>';
                }
            } catch (e) {
                console.error('获取应用使用列表失败:', e);
            }
        }
        
        const history = JSON.parse(localStorage.getItem('screenTimeHistory') || '[]');
        const recentHistory = history.slice(-6).reverse();
        
        let historyHtml = '';
        if (recentHistory.length > 0) {
            historyHtml = `
            <div style="margin-top: 16px; border-top: 1px solid var(--border-color); padding-top: 12px;">
                <div style="font-weight: 600; margin-bottom: 10px; font-size: 0.95rem;">最近结算记录</div>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">`;
            recentHistory.forEach(record => {
                // 兼容新旧格式：新格式 'YYYY-MM-DD'，旧格式 ISO 字符串
                let dateStr;
                if (record.date.includes('T')) {
                    // 旧格式：ISO 字符串
                    const date = new Date(record.date);
                    dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
                } else {
                    // 新格式：'YYYY-MM-DD'
                    const parts = record.date.split('-');
                    dateStr = `${parseInt(parts[1])}/${parseInt(parts[2])}`;
                }
                const isReward = record.type === 'reward';
                const diffValue = isReward ? record.diffMinutes : -record.diffMinutes;
                const diffColor = isReward ? 'var(--color-primary)' : '#e74c3c';
                const diffSign = isReward ? '+' : '-';
                // [v6.1.0] 使用CSS变量获取动态主题色
                const primaryRgb = getComputedStyle(document.documentElement).getPropertyValue('--color-primary-rgb').trim() || '33, 150, 243';
                const bgColor = isReward ? `rgba(${primaryRgb}, 0.12)` : 'rgba(231, 76, 60, 0.1)';
                
                historyHtml += `
                <div style="flex: 0 0 calc(50% - 4px); background: ${bgColor}; border-radius: 8px; padding: 8px 10px; box-sizing: border-box;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="font-weight: 600; font-size: 0.85rem;">${dateStr}</span>
                        <span style="font-weight: 600; font-size: 0.9rem; color: ${diffColor};">${diffSign}${formatScreenTimeCompact(Math.abs(diffValue))}</span>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-color-light);">
                        ${formatScreenTimeCompact(record.usedMinutes)} / ${formatScreenTimeCompact(record.limitMinutes)}
                    </div>
                </div>`;
            });
            historyHtml += '</div></div>';
        }
        
        const content = `
            <div style="text-align: center; padding: 20px 0;">
                <div style="font-size: 2.5rem; margin-bottom: 8px;">📱</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: var(--color-primary);">${formatScreenTimeMinutes(usedMinutes)}</div>
                <div style="color: var(--text-color-light); margin-top: 4px;">今日已使用 / 限额 ${formatScreenTimeMinutes(limitMinutes)}</div>
                <div style="margin-top: 0px; margin-bottom: -18px; padding: 12px; background: ${diff >= 0 ? 'var(--color-primary-light)' : 'rgba(231, 76, 60, 0.1)'}; border-radius: 8px;">
                    <span style="font-weight: 600; color: ${diff >= 0 ? 'var(--color-primary)' : '#e74c3c'};">
                        ${diff >= 0 ? '预计奖励: +' + formatScreenTimeMinutes(diff) : '预计消耗: ' + formatScreenTimeMinutes(-diff)}
                    </span>
                </div>
            </div>
            ${appUsageHtml}
            ${historyHtml}
        `;
        
        showInfoModal('屏幕时间详情', content);
    }
}

// 白名单应用列表
let installedAppsCache = null;

function openScreenTimeWhitelist() {
    if (typeof Android === 'undefined' || !Android.getInstalledApps) {
        showToast('此功能仅在 Android 应用中可用');
        return;
    }
    
    // 获取已安装应用列表
    if (!installedAppsCache) {
        const appsJson = Android.getInstalledApps();
        installedAppsCache = JSON.parse(appsJson);
        // 按应用名排序
        installedAppsCache.sort((a, b) => a.appName.localeCompare(b.appName, 'zh'));
    }
    
    showWhitelistModal(installedAppsCache);
}

function showWhitelistModal(apps) {
    const modal = document.getElementById('whitelistModal');
    if (!modal) {
        // 动态创建弹窗
        const modalHtml = `
            <div id="whitelistModal" class="modal" onclick="if(event.target===this)closeWhitelistModal()">
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h2 class="modal-title">白名单应用</h2>
                        <button class="close-btn" onclick="closeWhitelistModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p style="font-size: 0.85rem; color: var(--text-color-light); margin-bottom: 8px;">勾选的应用不计入屏幕使用时间</p>
                        <p id="whitelistSelectedCount" style="font-size: 0.85rem; color: var(--color-earn); margin-bottom: 12px; font-weight: 500;"></p>
                        <input type="text" id="whitelistSearch" class="whitelist-search" placeholder="搜索应用名称或包名..." oninput="filterWhitelistApps()">
                        <div id="whitelistAppList" class="whitelist-modal-content"></div>
                    </div>
                    <div class="modal-footer" style="justify-content: flex-end;">
                        <button class="btn btn-secondary" onclick="closeWhitelistModal()">取消</button>
                        <button class="btn btn-primary" onclick="saveWhitelist()">保存</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    renderWhitelistApps(apps);
    updateWhitelistSelectedCount();
    document.getElementById('whitelistModal').classList.add('show');
}

function updateWhitelistSelectedCount() {
    const pkgs = screenTimeSettings.whitelistApps;
    const el = document.getElementById('whitelistSelectedCount');
    if (el) {
        if (pkgs.length === 0) {
            el.textContent = '';
        } else {
            // 通过包名查找应用名称
            const names = pkgs.map(pkg => {
                const app = (installedAppsCache || []).find(a => a.packageName === pkg);
                return app ? app.appName : pkg.split('.').pop(); // 没找到则显示包名最后一段
            });
            el.textContent = `已选择: ${names.join('、')}`;
        }
    }
}

function renderWhitelistApps(apps, filter = '') {
    const container = document.getElementById('whitelistAppList');
    const filterLower = filter.toLowerCase();
    
    const html = apps
        .filter(app => !filter || app.appName.toLowerCase().includes(filterLower) || app.packageName.toLowerCase().includes(filterLower))
        .map(app => `
            <label class="whitelist-item">
                <input type="checkbox" value="${app.packageName}" 
                       ${screenTimeSettings.whitelistApps.includes(app.packageName) ? 'checked' : ''}
                       onchange="onWhitelistCheckChange(this)">
                <div>
                    <div class="whitelist-item-name">${app.appName}</div>
                    <div class="whitelist-item-pkg">${app.packageName}</div>
                </div>
            </label>
        `).join('');
    
    container.innerHTML = html || '<div style="text-align: center; padding: 20px; color: var(--text-color-light);">没有找到匹配的应用</div>';
}

function onWhitelistCheckChange(checkbox) {
    const pkg = checkbox.value;
    if (checkbox.checked) {
        if (!screenTimeSettings.whitelistApps.includes(pkg)) {
            screenTimeSettings.whitelistApps.push(pkg);
        }
    } else {
        screenTimeSettings.whitelistApps = screenTimeSettings.whitelistApps.filter(p => p !== pkg);
    }
    updateWhitelistSelectedCount();
}

function filterWhitelistApps() {
    const filter = document.getElementById('whitelistSearch').value;
    renderWhitelistApps(installedAppsCache || [], filter);
}

function saveWhitelist() {
    // 获取当前显示的已勾选项
    const checkboxes = document.querySelectorAll('#whitelistAppList input[type="checkbox"]:checked');
    const currentChecked = Array.from(checkboxes).map(cb => cb.value);
    
    // 获取当前显示的所有项（包括未勾选的）
    const allDisplayedCheckboxes = document.querySelectorAll('#whitelistAppList input[type="checkbox"]');
    const displayedPackages = Array.from(allDisplayedCheckboxes).map(cb => cb.value);
    
    // 保留不在当前显示列表中的已有选项（因为可能被搜索过滤掉了）
    const hiddenSelected = screenTimeSettings.whitelistApps.filter(pkg => !displayedPackages.includes(pkg));
    
    // 合并：当前显示的已勾选 + 隐藏的已选项
    screenTimeSettings.whitelistApps = [...new Set([...currentChecked, ...hiddenSelected])];
    
    saveScreenTimeSettings();
    document.getElementById('whitelistCount').textContent = `${screenTimeSettings.whitelistApps.length} 个应用不计入使用时间`;
    closeWhitelistModal();
    updateScreenTimeCard();
    showToast(`已保存 ${screenTimeSettings.whitelistApps.length} 个白名单应用`);
}

function closeWhitelistModal() {
    const modal = document.getElementById('whitelistModal');
    if (modal) modal.classList.remove('show');
}

// ========== 屏幕时间管理结束 ==========

// [v7.20.0] 主题色方案 - 四套纯色主题 + 油画主题
const accentThemes = {
    // [v7.20.1] 天蓝 - 清新天空风格（浅色系，背景色进一步变浅）
    'sky-blue': {
        primary: '#29b6f6',      // 天蓝主色
        tint: '#81d4fa',         // 浅天蓝
        bgLight: '#4fc3f7',      // [v7.20.1] 日间：变浅为浅天蓝
        bgDark: '#0277bd',       // [v7.20.1] 夜间：变浅为中天蓝
        bgImage: null,
        label: '天蓝',
        isFlat: true
    },
    // [v7.20.0] 深海蓝调 - 沉稳专注风格
    'ocean-deep': {
        primary: '#1565c0',
        tint: '#00b4d8',
        bgLight: '#0d3d6b',      // 日间：深海蓝
        bgDark: '#051220',       // 夜间：深海黑蓝
        bgImage: null,
        label: '深海蓝调',
        isFlat: true
    },
    // [v7.20.1] 暖木原色 - 温暖自然风格
    'warm-earth': {
        primary: '#8d6e63',
        tint: '#a1887f',
        bgLight: '#4e342e',      // 日间：深木棕
        bgDark: '#1a1410',       // 夜间：深棕黑
        bgImage: null,
        label: '暖木原色',
        isFlat: true
    },

    // [v6.2.0] 梵高《星月夜》主题 - 普鲁士蓝/钴蓝/铬黄
    'the-starry-night': {
        primary: '#1565c0',
        start: '#0d1b2a',
        mid: '#1b3a5f',
        end: '#f4d35e',
        gradient: 'linear-gradient(135deg, #0d1b2a 0%, #1b3a5f 50%, #f4d35e 100%)',
        bgImage: 'themes/the-starry-night.png',
        label: '星月夜'
    },
    // [v6.2.0] 莫奈《撑阳伞的女人》主题 - 天蓝/草绿/暖黄
    'woman-with-a-parasol': {
        primary: '#4db6ac',
        start: '#64b5f6',
        mid: '#81c784',
        end: '#fff8e1',
        gradient: 'linear-gradient(135deg, #64b5f6 0%, #81c784 50%, #fff8e1 100%)',
        bgImage: 'themes/woman-with-a-parasol.png',
        label: '撑阳伞的女人'
    },
    // [v6.4.6] 梵高《杏花盛开》主题 - 青蓝天空/白色花朵
    'almond-blossoms': {
        primary: '#468499',
        start: '#3a6f7f',
        mid: '#5a9fb0',
        end: '#a8d5e2',
        gradient: 'linear-gradient(135deg, #3a6f7f 0%, #5a9fb0 50%, #a8d5e2 100%)',
        bgImage: 'themes/almond-blossoms.png',
        label: '杏花盛开'
    }
};

// [v6.0.0] 更新主题背景色
// [v7.20.0] 纯色主题直接使用纯色背景，油画主题使用渐变
function updateAccentBackground(isDark) {
    const accentName = localStorage.getItem('accentTheme') || 'sky-blue';
    const accent = accentThemes[accentName];
    if (!accent) return;
    
    const bgColor = isDark ? accent.bgDark : accent.bgLight;
    const root = document.documentElement;
    
    if (accent.isFlat) {
        // [v7.20.0] 纯色主题：直接使用纯色，不使用渐变
        root.style.setProperty('--bg-gradient-themed', bgColor);
        // 同时覆盖 body 背景确保生效
        document.body.style.background = bgColor;
    } else {
        // 油画主题：使用渐变背景
        root.style.setProperty('--bg-gradient-themed', bgColor);
        document.body.style.background = '';
    }
}

// [v6.2.0] 主题系统 - 使用开关控制夜间模式和跟随系统
let systemThemeListener = null;
function applyTheme(theme) {
    // [v7.20.0] 仅主题切换时启用全局颜色过渡，350ms 后移除，避免影响 DOM 批量渲染性能
    document.body.classList.add('theme-transitioning');
    setTimeout(() => document.body.classList.remove('theme-transitioning'), 350);
    if (systemThemeListener) {
        window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', systemThemeListener);
        systemThemeListener = null;
    }
    if (theme === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const themeValue = isDark ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', themeValue);
        document.body.setAttribute('data-theme', themeValue);
        updateAccentBackground(isDark);
        systemThemeListener = e => {
            const v = e.matches ? 'dark' : 'light';
            // [v7.20.0] 系统主题跟随切换时同样触发过渡
            document.body.classList.add('theme-transitioning');
            setTimeout(() => document.body.classList.remove('theme-transitioning'), 350);
            document.documentElement.setAttribute('data-theme', v);
            document.body.setAttribute('data-theme', v);
            updateAccentBackground(e.matches);
        };
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', systemThemeListener);
    } else {
        document.documentElement.setAttribute('data-theme', theme);
        document.body.setAttribute('data-theme', theme);
        updateAccentBackground(theme === 'dark');
    }
    // [v6.2.0] 更新开关状态
    const darkModeSwitch = document.getElementById('darkModeSwitch');
    const systemModeSwitch = document.getElementById('systemModeSwitch');
    const darkModeSettingItem = document.getElementById('darkModeSettingItem');
    if (darkModeSwitch) {
        darkModeSwitch.checked = theme === 'dark';
        // [v6.3.1] 逻辑变更：跟随系统时隐藏夜间模式开关，不再只是禁用
        // darkModeSwitch.disabled = theme === 'system';
    }
    if (darkModeSettingItem) {
        if (theme === 'system') {
            darkModeSettingItem.style.display = 'none';
        } else {
            darkModeSettingItem.style.display = 'flex'; // setting-item 是 flex 布局
        }
    }
    if (systemModeSwitch) {
        systemModeSwitch.checked = theme === 'system';
    }
}
function setTheme(theme) { applyTheme(theme); localStorage.setItem('themePreference', theme); }

// [v6.2.0] 新增开关控制函数
function toggleDarkMode(enabled) {
    const systemModeSwitch = document.getElementById('systemModeSwitch');
    if (systemModeSwitch && systemModeSwitch.checked) {
        // 如果跟随系统开启，关闭它
        systemModeSwitch.checked = false;
        toggleSystemMode(false);
    }
    setTheme(enabled ? 'dark' : 'light');
}

function toggleSystemMode(enabled) {
    if (enabled) {
        setTheme('system');
    } else {
        // 关闭跟随系统时，根据当前系统主题设置为 light 或 dark
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(isDark ? 'dark' : 'light');
    }
}

// [v7.20.2-fix] Android 原生 uiMode 变化回调（Activity 接管 uiMode 时用于前端同步）
window.__onAndroidUiModeChanged = function(isDark) {
    try {
        const themePreference = localStorage.getItem('themePreference') || 'system';
        if (themePreference !== 'system') return;
        const themeValue = isDark ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', themeValue);
        document.body.setAttribute('data-theme', themeValue);
        updateAccentBackground(!!isDark);
    } catch (e) {
        console.error('[Theme] __onAndroidUiModeChanged failed:', e);
    }
};

function setAccentTheme(accentName) {
    const accent = accentThemes[accentName];
    if (!accent) return;
    
    // [v6.2.0] 设置 body 的 data-accent 属性用于特殊主题样式
    document.body.setAttribute('data-accent', accentName);
    
    // 更新 CSS 变量
    const root = document.documentElement;
    root.style.setProperty('--color-primary', accent.primary);
    // [v6.1.0] 解析RGB值用于透明度调节
    const rgb = accent.primary.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (rgb) {
        const r = parseInt(rgb[1], 16);
        const g = parseInt(rgb[2], 16);
        const b = parseInt(rgb[3], 16);
        root.style.setProperty('--color-primary-rgb', `${r}, ${g}, ${b}`);
    }
    // [v7.20.0] 纯色主题生成主色→辅助色的渐变，油画主题使用预设渐变
    if (accent.isFlat) {
        // 纯色主题：生成主色到辅助色的渐变
        const gradient = `linear-gradient(135deg, ${accent.primary} 0%, ${accent.tint || accent.primary} 100%)`;
        root.style.setProperty('--accent-gradient', gradient);
        root.style.setProperty('--accent-start', accent.primary);
        root.style.setProperty('--accent-mid', accent.tint || accent.primary);
        root.style.setProperty('--accent-end', accent.tint || accent.primary);
    } else {
        // 油画主题：使用预设渐变
        root.style.setProperty('--accent-gradient', accent.gradient);
        root.style.setProperty('--accent-start', accent.start);
        root.style.setProperty('--accent-mid', accent.mid);
        root.style.setProperty('--accent-end', accent.end);
    }
    
    // [v7.20.0] 更新主题背景（纯色主题直接设置 body 背景，油画主题使用 CSS 变量）
    if (accent.bgLight && accent.bgDark) {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const bgColor = isDark ? accent.bgDark : accent.bgLight;
        
        if (accent.isFlat) {
            // 纯色主题：直接设置 body 背景色
            document.body.style.background = bgColor;
            root.style.setProperty('--bg-gradient-themed', bgColor);
        } else {
            // 油画主题：使用 CSS 变量
            root.style.setProperty('--bg-gradient-themed', bgColor);
            document.body.style.background = '';
        }
    }
    
    // [v6.2.0] 如果是画作主题且没有自定义背景，自动应用画作背景
    const customBg = localStorage.getItem('customBackground');
    const currentBgMode = localStorage.getItem('bgStyle') || 'theme';
    if (accent.bgImage && currentBgMode === 'theme') {
        document.body.classList.add('bg-image');
        document.body.style.setProperty('--bg-image', `url("${accent.bgImage}")`);
    } else if (!accent.bgImage && currentBgMode === 'theme') {
        // 纯渐变主题，移除图片背景
        document.body.classList.remove('bg-image');
        document.body.style.removeProperty('--bg-image');
    }
    // 如果是自定义背景模式，保持自定义背景不变
    
    // 更新选择器按钮状态
    document.querySelectorAll('.accent-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.accent === accentName);
    });
    
    // 保存设置
    localStorage.setItem('accentTheme', accentName);
    saveDeviceSpecificDataDebounced(); // [v7.2.4] 同步到云端
    
    // 刷新界面
    if (typeof updateBalanceCard === 'function') updateBalanceCard();
    if (typeof updateScreenTimeCard === 'function') updateScreenTimeCard();
}

function initAccentTheme() {
    let saved = localStorage.getItem('accentTheme') || 'sky-blue';
    // [v7.20.0] 旧主题迁移：blue-purple -> classic-blue, pink-white -> warm-earth
    // [v7.20.1] 删除活力橙主题，迁移到暖木原色
    const themeMigration = {
        'blue-purple': 'sky-blue',
        'pink-white': 'warm-earth',
        'vibrant-orange': 'warm-earth'
    };
    if (themeMigration[saved]) {
        console.log(`[Theme Migration] ${saved} -> ${themeMigration[saved]}`);
        saved = themeMigration[saved];
        localStorage.setItem('accentTheme', saved);
    }
    setAccentTheme(saved);
}

// [v7.20.2] 初始化三态卡片风格（兼容旧版 cardStyle + gradientStyle）
function initCardVisualMode() {
    const savedMode = localStorage.getItem('cardVisualMode');
    if (savedMode === 'flat' || savedMode === 'gradient' || savedMode === 'glass') {
        setCardVisualMode(savedMode, false);
        return;
    }

    const legacyCardStyle = screenTimeSettings.cardStyle || 'classic';
    const legacyGradientStyle = localStorage.getItem('gradientStyle') || 'gradient';
    const migratedMode = legacyCardStyle === 'glass' ? 'glass' : (legacyGradientStyle === 'flat' ? 'flat' : 'gradient');
    setCardVisualMode(migratedMode, false);
}

// [v6.2.0] 背景设置 - 跟随主题或自定义
function setBackground(bgMode) {
    const accentName = localStorage.getItem('accentTheme') || 'sky-blue';
    const accent = accentThemes[accentName];
    
    if (bgMode === 'theme') {
        // 跟随主题 - 使用主题色定义的背景（渐变或画作）
        const customBg = localStorage.getItem('customBackground');
        if (customBg) {
            // 清除之前的自定义背景
            localStorage.removeItem('customBackground');
        }
        
        if (accent && accent.bgImage) {
            // 画作主题：使用画作背景
            document.body.classList.add('bg-image');
            document.body.style.setProperty('--bg-image', `url("${accent.bgImage}")`);
        } else {
            // 渐变主题：使用渐变背景
            document.body.classList.remove('bg-image');
            document.body.style.removeProperty('--bg-image');
        }
        
        // 隐藏清除按钮
        const clearBtn = document.getElementById('bgClearBtn');
        if (clearBtn) clearBtn.classList.add('hidden');
    }
    // custom模式由handleCustomBgUpload处理
    
    // 更新选择器按钮状态
    document.querySelectorAll('.bg-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.bg === bgMode);
    });
    
    // 保存设置
    localStorage.setItem('bgStyle', bgMode);
}

// [v6.2.0] 自定义背景上传
function handleCustomBgUpload(event) {
    const inputEl = event.target;
    const file = inputEl.files[0];
    if (!file) return;
    
    // 限制文件大小 (2MB)
    if (file.size > 2 * 1024 * 1024) {
        // [v7.21.1] 移除通知，保留验证和提示行为
        inputEl.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const dataUrl = e.target.result;
        
        // 保存到 localStorage
        try {
            localStorage.setItem('customBackground', dataUrl);
            localStorage.setItem('bgStyle', 'custom');
            
            // 应用自定义背景
            document.body.classList.add('bg-image');
            document.body.style.setProperty('--bg-image', `url("${dataUrl}")`);
            
            // 更新UI
            document.querySelectorAll('.bg-option').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.bg === 'custom');
            });
            
            // 显示清除按钮
            const clearBtn = document.getElementById('bgClearBtn');
            if (clearBtn) clearBtn.classList.remove('hidden');
            
            showNotification('✅ 背景已设置', '自定义背景已应用', 'success');
        } catch (err) {
            // localStorage 可能已满
            console.error('[BG] 保存自定义背景失败:', err);
            // [v7.21.1] 移除通知，保留 console.error
        }
        // 允许重复选择同一文件
        inputEl.value = '';
    };
    reader.readAsDataURL(file);
}

// [v6.2.0] 清除自定义背景
function clearCustomBackground() {
    localStorage.removeItem('customBackground');
    setBackground('theme');
}

function initBackground() {
    const savedMode = localStorage.getItem('bgStyle') || 'theme';
    const customBg = localStorage.getItem('customBackground');
    
    if (savedMode === 'custom' && customBg) {
        // 恢复自定义背景
        document.body.classList.add('bg-image');
        document.body.style.setProperty('--bg-image', `url("${customBg}")`);
        
        // 更新UI
        document.querySelectorAll('.bg-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.bg === 'custom');
        });
        
        // 显示清除按钮
        const clearBtn = document.getElementById('bgClearBtn');
        if (clearBtn) clearBtn.classList.remove('hidden');
    } else {
        setBackground('theme');
    }
}

// [v7.8.0] 返回触发的提醒列表用于启动报告
function checkReminders() {
    const now = Date.now();
    let changed = false;
    const triggeredReminders = []; // [v7.8.0] 收集触发的提醒
    
    tasks.forEach(task => {
        if (task.reminderDetails && task.reminderDetails.status === 'pending') {
            const { mode, time, creationTimestamp, isRecurring } = task.reminderDetails;
            let targetTime;
            if (mode === 'absolute') {
                const [datePart, timePart] = time.split('T');
                const [year, month, day] = datePart.split('-').map(Number);
                const [hours, minutes] = timePart.split(':').map(Number);
                targetTime = new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
            } else { // relative
                targetTime = creationTimestamp + (time * 1000);
            }

            if (now >= targetTime) {
                let shouldNotify = true;
                
                if (task.isHabit) {
                    const todayStr = getLocalDateString(new Date());
                    // [v3.18.0] Check if target is achieved this period, not just if completed today
                    // [v4.2.0] Use referenceDate (today)
                    const { currentCount, targetCount } = getHabitPeriodInfo(task, transactions, new Date());
                    if (currentCount >= targetCount) {
                        shouldNotify = false; // Don't notify, already achieved target this period
                    }
                }
                
                if (shouldNotify) {
                    // [v7.8.0] 收集提醒而非直接显示通知
                    triggeredReminders.push({
                        type: 'reminder',
                        taskName: task.name,
                        taskId: task.id
                    });
                }
                
                if (isRecurring && task.isHabit && mode === 'absolute') {
                    const [datePart, timePart] = time.split('T');
                    const [year, month, day] = datePart.split('-').map(Number);
                    const [hours, minutes] = timePart.split(':').map(Number);
                    
                    let nextTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
                    
                    const period = task.habitDetails.period;
                    const nowDateTime = new Date();
                    
                    do {
                        if (period === 'daily') {
                            nextTime.setDate(nextTime.getDate() + 1);
                        } else if (period === 'weekly') {
                            nextTime.setDate(nextTime.getDate() + 7);
                        } else if (period === 'monthly') {
                            // [v3.17.3] Ensure month wrap-around logic is correct
                            nextTime.setMonth(nextTime.getMonth() + 1);
                            // Handle day overflow (e.g., trying to set Feb 30)
                            if (nextTime.getDate() !== day) {
                                nextTime.setDate(0); // Set to last day of previous month
                            }
                        } else {
                            nextTime.setDate(nextTime.getDate() + 1);
                        }
                    } while (nextTime <= nowDateTime); 
                    
                    const pad = (num) => String(num).padStart(2, '0');
                    const y = nextTime.getFullYear();
                    const m = pad(nextTime.getMonth() + 1);
                    const d = pad(nextTime.getDate());
                    const h = pad(hours); 
                    const min = pad(minutes); 
                    
                    task.reminderDetails.time = `${y}-${m}-${d}T${h}:${min}`;
                    
                } else {
                    task.reminderDetails.status = 'triggered';
                }
                changed = true;
            }
        }
    });
    if (changed) {
        saveData();
    }
    
    return triggeredReminders; // [v7.8.0] 返回触发的提醒
}
// --- [v4.0.0] Authentication Functions ---
