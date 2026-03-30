function saveSleepSettings() {
    console.log('[saveSleepSettings] 开始保存, enabled:', sleepSettings.enabled);
    
    // 添加更新时间戳
    sleepSettings.lastUpdated = new Date().toISOString();
    
    const settingsJson = JSON.stringify(sleepSettings);
    
    // [v7.11.2] 优先使用 Android 原生存储（更可靠）
    if (typeof Android !== 'undefined' && Android.saveSleepSettingsNative) {
        try {
            Android.saveSleepSettingsNative(settingsJson);
            console.log('[saveSleepSettings] Android 原生存储成功');
        } catch (e) {
            console.error('[saveSleepSettings] Android 原生存储失败:', e);
        }
    }
    
    // 同时保存到 localStorage（备份和网页端兼容）
    try {
        localStorage.setItem('sleepSettings', settingsJson);
        console.log('[saveSleepSettings] localStorage 保存成功');
    } catch (e) {
        console.error('[saveSleepSettings] localStorage 保存失败:', e);
    }

    // [v7.11.3] 云端统一存储（跨设备共享）
    saveSleepSettingsShared('save');
    
    // [v7.11.2] 云端按设备存储（恢复原逻辑）
    if (isLoggedIn() && DAL.profileId && currentDeviceId) {
        const cloudSettings = {
            enabled: sleepSettings.enabled,
            plannedBedtime: sleepSettings.plannedBedtime,
            plannedWakeTime: sleepSettings.plannedWakeTime,
            targetDurationMinutes: sleepSettings.targetDurationMinutes,
            durationTolerance: sleepSettings.durationTolerance,
            toleranceReward: sleepSettings.toleranceReward,
            showCard: sleepSettings.showCard,
            autoDetectWake: sleepSettings.autoDetectWake,
            wakeDetectThreshold: sleepSettings.wakeDetectThreshold,
            earlyBedtimeRate: sleepSettings.earlyBedtimeRate,
            lateBedtimeRate: sleepSettings.lateBedtimeRate,
            earlyWakeRate: sleepSettings.earlyWakeRate,
            lateWakeRate: sleepSettings.lateWakeRate,
            durationDeviationRate: sleepSettings.durationDeviationRate,
            cardMode: sleepSettings.cardMode,
            napEnabled: sleepSettings.napEnabled,
            napDurationMinutes: sleepSettings.napDurationMinutes,
            napMaxDurationMinutes: sleepSettings.napMaxDurationMinutes,
            napReward: sleepSettings.napReward,
            napAlarmEnabled: sleepSettings.napAlarmEnabled,
            napVibrateEnabled: sleepSettings.napVibrateEnabled,
            nightAlarmMode: sleepSettings.nightAlarmMode,  // [v7.16.0]
            sleepAlarmEnabled: sleepSettings.sleepAlarmEnabled,
            autoSyncSystemAlarm: sleepSettings.autoSyncSystemAlarm,
            earnCategory: sleepSettings.earnCategory,
            spendCategory: sleepSettings.spendCategory,
            countdownSeconds: sleepSettings.countdownSeconds,
            lastUpdated: sleepSettings.lastUpdated
        };
        
        console.log('[saveSleepSettings] 保存到云端 deviceSleepSettings:', currentDeviceId);
        
        // 按设备ID存储
        const updateKey = `deviceSleepSettings.${currentDeviceId}`;
        DAL.saveProfile({ [updateKey]: _.set(cloudSettings) })
            .then(() => console.log('[saveSleepSettings] 云端同步成功'))
            .catch(e => {
                console.error('[saveSleepSettings] 云端同步失败:', e.message, e);
            });
    } else {
        console.warn('[saveSleepSettings] 云端同步跳过 - 条件不满足:', {
            isLoggedIn: isLoggedIn(),
            profileId: DAL.profileId,
            deviceId: currentDeviceId
        });
    }
}

// 保存睡眠状态（本地 + 云端关键字段）
// [v7.9.7] 云端同步关键状态，防止手机关机后状态丢失
function saveSleepState() {
    // 更新本地时间戳
    sleepState.lastUpdated = Date.now();
    
    // [v7.11.2] 优先保存到 Android 原生存储
    if (window.Android?.saveSleepStateNative) {
        window.Android.saveSleepStateNative(JSON.stringify(sleepState));
        console.log('[saveSleepState] Android 原生保存成功');
    }
    localStorage.setItem('sleepState', JSON.stringify(sleepState));

    // [v7.11.3] 云端统一存储（跨设备共享）
    saveSleepStateShared('save');
    
    // [v7.16.0] 同步关键状态到云端（统一睡眠状态）
    if (isLoggedIn() && DAL.profileId && currentDeviceId) {
        const criticalState = {
            isSleeping: sleepState.isSleeping,
            sleepStartTime: sleepState.sleepStartTime,
            lastUpdated: sleepState.lastUpdated
        };
        
        const updateKey = `deviceSleepState.${currentDeviceId}`;
        DAL.saveProfile({ [updateKey]: _.set(criticalState) })
            .then(() => console.log('[SleepState] 云端同步成功:', criticalState.isSleeping ? '睡眠中' : '未睡眠'))
            .catch(e => console.error('[SleepState] 云端同步失败:', e.message));
    }
}

// [v7.11.3] 保存睡眠设置到云端共享字段
function saveSleepSettingsShared(reason = 'save') {
    if (!isLoggedIn() || !DAL.profileId) return;
    const sharedSettings = { ...sleepSettings };
    if (!sharedSettings.lastUpdated) {
        sharedSettings.lastUpdated = new Date().toISOString();
        sleepSettings.lastUpdated = sharedSettings.lastUpdated;
    }
    DAL.saveProfile({ sleepSettingsShared: _.set(sharedSettings) })
        .then(() => console.log('[SleepSettingsShared] 云端同步成功, reason:', reason))
        .catch(e => console.error('[SleepSettingsShared] 云端同步失败:', e.message));
}

// [v7.11.3] 保存睡眠状态到云端共享字段
// [v7.16.0] 统一睡眠状态，不再区分午睡/夜间
function saveSleepStateShared(reason = 'save') {
    if (!isLoggedIn() || !DAL.profileId) return;
    const sharedState = {
        isSleeping: sleepState.isSleeping,
        sleepStartTime: sleepState.sleepStartTime,
        lastUpdated: sleepState.lastUpdated || Date.now()
    };
    DAL.saveProfile({ sleepStateShared: _.set(sharedState) })
        .then(() => console.log('[SleepStateShared] 云端同步成功, reason:', reason))
        .catch(e => console.error('[SleepStateShared] 云端同步失败:', e.message));
}

// [v7.11.3] 从云端共享设置应用到本地
function applySleepSettingsFromCloud(cloudSettings, source = 'cloud', force = false) {
    if (!cloudSettings) return false;
    const cloudUpdated = Date.parse(cloudSettings.lastUpdated || '') || 0;
    const localUpdated = Date.parse(sleepSettings.lastUpdated || '') || 0;
    if (force || cloudUpdated >= localUpdated) {
        sleepSettings = { ...sleepSettings, ...cloudSettings };
        localStorage.setItem('sleepSettings', JSON.stringify(sleepSettings));
        if (window.Android?.saveSleepSettingsNative) {
            window.Android.saveSleepSettingsNative(JSON.stringify(sleepSettings));
        }
        console.log('[Sleep] 已应用云端设置:', source, 'ts=', cloudUpdated);
        return true;
    }
    return false;
}

// [v7.11.3] 从云端共享状态应用到本地
function applySleepStateFromCloud(cloudState, source = 'cloud') {
    if (!cloudState) return false;
    const cloudUpdated = cloudState.lastUpdated || 0;
    const localUpdated = sleepState.lastUpdated || 0;
    if (cloudUpdated > localUpdated) {
        if (cloudState.isSleeping !== undefined) sleepState.isSleeping = cloudState.isSleeping;
        if (cloudState.sleepStartTime !== undefined) sleepState.sleepStartTime = cloudState.sleepStartTime;
        // [v7.16.0] 兼容旧版云端数据：如果旧数据有 isNapping=true，转换为统一的 isSleeping
        if (cloudState.isNapping && cloudState.napStartTime && !cloudState.isSleeping) {
            sleepState.isSleeping = true;
            sleepState.sleepStartTime = cloudState.napStartTime;
        }
        sleepState.lastUpdated = cloudUpdated;
        localStorage.setItem('sleepState', JSON.stringify(sleepState));
        if (window.Android?.saveSleepStateNative) {
            window.Android.saveSleepStateNative(JSON.stringify(sleepState));
        }
        console.log('[Sleep] 已应用云端状态:', source, 'ts=', cloudUpdated);
        return true;
    }
    return false;
}

// [v7.11.3] 从设备状态中选最新
function getLatestDeviceState(deviceStateMap) {
    if (!deviceStateMap || typeof deviceStateMap !== 'object') return null;
    let latest = null;
    Object.entries(deviceStateMap).forEach(([deviceId, state]) => {
        if (!state) return;
        const ts = state.lastUpdated || 0;
        if (!latest || ts > latest.ts) {
            latest = { deviceId, state, ts };
        }
    });
    return latest;
}

// 初始化睡眠设置
function initSleepSettings() {
    // [v7.11.2] 调试日志
    console.log('[initSleepSettings] 开始初始化');
    console.log('[initSleepSettings] isLoggedIn:', isLoggedIn());
    console.log('[initSleepSettings] currentDeviceId:', currentDeviceId);
    console.log('[initSleepSettings] DAL.profileId:', DAL.profileId);
    console.log('[initSleepSettings] deviceSleepSettings:', DAL.profileData?.deviceSleepSettings);
    
    // [v7.11.2] 优先从 Android 原生存储加载（最可靠）
    let nativeLoaded = false;
    if (window.Android?.getSleepSettingsNative) {
        try {
            const nativeSettings = window.Android.getSleepSettingsNative();
            console.log('[initSleepSettings] Android native settings:', nativeSettings ? 'exists' : 'null');
            if (nativeSettings) {
                sleepSettings = { ...sleepSettings, ...JSON.parse(nativeSettings) };
                nativeLoaded = true;
                console.log('[initSleepSettings] Android 原生加载成功, enabled:', sleepSettings.enabled);
            }
        } catch (e) {
            console.error('[initSleepSettings] Android 原生解析失败:', e);
        }
    }
    
    // 原生加载失败时，回退到 localStorage
    if (!nativeLoaded) {
        const savedSettings = localStorage.getItem('sleepSettings');
        console.log('[initSleepSettings] localStorage saved:', savedSettings ? 'exists' : 'null');
        if (savedSettings) {
            try {
                sleepSettings = { ...sleepSettings, ...JSON.parse(savedSettings) };
                console.log('[initSleepSettings] localStorage 加载成功, enabled:', sleepSettings.enabled);
            } catch (e) {
                console.error('[initSleepSettings] localStorage 解析失败:', e);
            }
        }
    }
    
    // 加载睡眠状态（也优先从 Android 原生）
    let stateNativeLoaded = false;
    if (window.Android?.getSleepStateNative) {
        try {
            const nativeState = window.Android.getSleepStateNative();
            if (nativeState) {
                sleepState = { ...sleepState, ...JSON.parse(nativeState) };
                stateNativeLoaded = true;
                console.log('[initSleepSettings] sleepState Android 原生加载成功');
            }
        } catch (e) {
            console.error('[initSleepSettings] sleepState Android 原生解析失败:', e);
        }
    }
    if (!stateNativeLoaded) {
        const savedState = localStorage.getItem('sleepState');
        if (savedState) {
            try {
                sleepState = { ...sleepState, ...JSON.parse(savedState) };
            } catch (e) {
                console.error('[initSleepSettings] sleepState 解析失败:', e);
            }
        }
    }
    
    // [v7.11.3] 云端共享优先 + 设备配置兜底/迁移
    if (isLoggedIn() && currentDeviceId) {
        const sharedSleep = DAL.profileData?.sleepSettingsShared;
        const sharedUpdated = Date.parse(sharedSleep?.lastUpdated || '') || 0;
        const deviceMap = DAL.profileData?.deviceSleepSettings || {};
        
        console.log('[initSleepSettings] sharedSleep:', sharedSleep ? 'exists' : 'null');
        console.log('[initSleepSettings] deviceMap keys:', Object.keys(deviceMap));
        
        if (sharedSleep) {
            applySleepSettingsFromCloud(sharedSleep, 'shared', true);
        }
        
        if (!sharedSleep) {
            const cloudSleep = deviceMap[currentDeviceId];
            const localUpdated = Date.parse(sleepSettings.lastUpdated || '') || 0;
            const cloudUpdated = cloudSleep ? (Date.parse(cloudSleep.lastUpdated || '') || 0) : 0;
            
            console.log('[initSleepSettings] cloudSleep:', cloudSleep ? 'exists' : 'null');
            console.log('[initSleepSettings] localUpdated:', localUpdated, 'cloudUpdated:', cloudUpdated);

            if (cloudSleep && cloudUpdated >= localUpdated) {
                console.log('[Sleep] 从云端加载设备配置:', currentDeviceId);
                sleepSettings = { ...sleepSettings, ...cloudSleep };
                localStorage.setItem('sleepSettings', JSON.stringify(sleepSettings));
                if (window.Android?.saveSleepSettingsNative) {
                    window.Android.saveSleepSettingsNative(JSON.stringify(sleepSettings));
                }
                saveSleepSettingsShared('migrate-device');
            } else if (localUpdated > cloudUpdated) {
                console.log('[Sleep] 本地配置较新，同步到云端共享');
                saveSleepSettingsShared('local-newer');
            } else if (!cloudSleep && Object.keys(deviceMap).length > 0) {
                const latest = getLatestDeviceSettings(deviceMap);
                if (latest && latest.settings && latest.ts > localUpdated) {
                    console.log('[Sleep] 从其他设备恢复配置:', latest.deviceId);
                    sleepSettings = { ...sleepSettings, ...latest.settings };
                    localStorage.setItem('sleepSettings', JSON.stringify(sleepSettings));
                    if (window.Android?.saveSleepSettingsNative) {
                        window.Android.saveSleepSettingsNative(JSON.stringify(sleepSettings));
                    }
                    saveSleepSettingsShared('migrate-device');
                }
            } else {
                console.log('[initSleepSettings] 无云端配置，使用本地');
            }
        } else if (Object.keys(deviceMap).length > 0) {
            const latest = getLatestDeviceSettings(deviceMap);
            if (latest && latest.settings && latest.ts > sharedUpdated) {
                console.log('[Sleep] 设备配置较新，迁移到共享:', latest.deviceId);
                sleepSettings = { ...sleepSettings, ...latest.settings };
                localStorage.setItem('sleepSettings', JSON.stringify(sleepSettings));
                if (window.Android?.saveSleepSettingsNative) {
                    window.Android.saveSleepSettingsNative(JSON.stringify(sleepSettings));
                }
                saveSleepSettingsShared('migrate-device');
            } else {
                const localUpdated = Date.parse(sleepSettings.lastUpdated || '') || 0;
                if (localUpdated > sharedUpdated) {
                    console.log('[Sleep] 本地配置较新，同步到云端共享');
                    saveSleepSettingsShared('local-newer');
                }
            }
        }
    } else {
        console.log('[initSleepSettings] 未登录或无设备ID，使用本地配置');
    }
    
    // [v7.11.3] 从云端恢复睡眠状态（共享优先 + 设备兜底）
    if (isLoggedIn()) {
        const sharedState = DAL.profileData?.sleepStateShared;
        const appliedShared = applySleepStateFromCloud(sharedState, 'shared');
        if (!appliedShared && currentDeviceId && DAL.profileData?.deviceSleepState) {
            const latestState = getLatestDeviceState(DAL.profileData.deviceSleepState);
            if (latestState && latestState.state) {
                console.log('[Sleep] 从设备状态恢复:', latestState.deviceId);
                applySleepStateFromCloud(latestState.state, 'device-fallback');
                saveSleepStateShared('migrate-device');
            }
        }
    }

    // [v7.11.3] 规范化入睡倒计时配置，避免异常值导致跳过倒计时
    if (!Number.isFinite(sleepSettings.countdownSeconds) || sleepSettings.countdownSeconds < 1) {
        sleepSettings.countdownSeconds = 30;
        localStorage.setItem('sleepSettings', JSON.stringify(sleepSettings));
    }
    
    // [v7.8.1] 更新设置入口的摘要文本
    console.log('[initSleepSettings] 最终状态: enabled=', sleepSettings.enabled);
    const sleepToggle = document.getElementById('sleepToggle');
    console.log('[initSleepSettings] UI 更新: toggle元素=', sleepToggle ? 'exists' : 'null', ', 设置 checked=', sleepSettings.enabled);
    if (sleepToggle) {
        sleepToggle.checked = sleepSettings.enabled;
        console.log('[initSleepSettings] UI 更新后: toggle.checked=', sleepToggle.checked);
    }
    document.getElementById('sleepCardToggle').checked = sleepSettings.showCard;
    updateSleepSettingsSummary();
    
    // [v7.11.2] 从云端 profile.sleepTimeCategories 恢复分类标签（跨设备共享）
    if (isLoggedIn() && DAL.profileData?.sleepTimeCategories) {
        const categories = DAL.profileData.sleepTimeCategories;
        if (categories.earnCategory !== undefined) {
            sleepSettings.earnCategory = categories.earnCategory;
        }
        if (categories.spendCategory !== undefined) {
            sleepSettings.spendCategory = categories.spendCategory;
        }
        console.log('[initSleepSettings] 从云端恢复分类: earn=' + sleepSettings.earnCategory + ', spend=' + sleepSettings.spendCategory);
    }
    
    // [v7.9.3] 初始化分类显示
    initSleepCategoryDisplay();
    
    // 显示/隐藏设置面板
    document.getElementById('sleepSettingsPanel').classList.toggle('hidden', !sleepSettings.enabled);
    document.getElementById('sleepStatus').textContent = sleepSettings.enabled ? '已启用' : '未启用';
    
    // [v7.11.2] 延迟再次更新，确保 WebView 渲染完成
    setTimeout(() => {
        const toggle = document.getElementById('sleepToggle');
        if (toggle && toggle.checked !== sleepSettings.enabled) {
            console.log('[initSleepSettings] 延迟修正: toggle.checked=' + toggle.checked + ' -> ' + sleepSettings.enabled);
            toggle.checked = sleepSettings.enabled;
        }
    }, 100);
    
    // 更新首页卡片
    updateSleepCardVisibility();
    updateSleepCard();
}

// [v7.8.1] 更新设置入口的摘要文本
// [v7.16.0] 更新设置页摘要文本
function updateSleepSettingsSummary() {
    // 小睡摘要
    const napSummary = document.getElementById('napSettingsSummary');
    if (napSummary) {
        napSummary.textContent = `${sleepSettings.napDurationMinutes}分钟达标 · 奖励${sleepSettings.napReward}分钟`;
    }
    // 夜间睡眠摘要
    const nightSummary = document.getElementById('nightSleepSettingsSummary');
    if (nightSummary) {
        const hours = Math.floor(sleepSettings.targetDurationMinutes / 60);
        const mins = sleepSettings.targetDurationMinutes % 60;
        const durationText = mins > 0 ? `${hours}时${mins}分` : `${hours}时`;
        nightSummary.textContent = `${sleepSettings.plannedBedtime}入睡 · ${durationText} · 奖励${sleepSettings.toleranceReward}分`;
    }
}

// 切换睡眠时间管理开关
function toggleSleepManagement() {
    sleepSettings.enabled = document.getElementById('sleepToggle').checked;
    document.getElementById('sleepSettingsPanel').classList.toggle('hidden', !sleepSettings.enabled);
    document.getElementById('sleepStatus').textContent = sleepSettings.enabled ? '已启用' : '未启用';
    saveSleepSettings();
    updateSleepCardVisibility();
    updateSleepCard();
}

// [v7.16.0] 小睡设置弹窗
function showNapSettingsModal() {
    const modal = document.getElementById('napSettingsModal');
    // 填充当前值
    document.getElementById('napDurationInput').value = sleepSettings.napDurationMinutes;
    document.getElementById('napRewardInput').value = sleepSettings.napReward;
    document.getElementById('napAlarmEnabled').checked = sleepSettings.napAlarmEnabled !== false;
    document.getElementById('napVibrateEnabled').checked = sleepSettings.napVibrateEnabled !== false;
    modal.classList.remove('hidden');
}

function closeNapSettingsModal() {
    document.getElementById('napSettingsModal').classList.add('hidden');
}

function saveNapSettings() {
    sleepSettings.napDurationMinutes = parseInt(document.getElementById('napDurationInput').value) || 30;
    sleepSettings.napReward = parseInt(document.getElementById('napRewardInput').value) || 15;
    sleepSettings.napAlarmEnabled = document.getElementById('napAlarmEnabled').checked;
    sleepSettings.napVibrateEnabled = document.getElementById('napVibrateEnabled').checked;
    saveSleepSettings();
    updateSleepSettingsSummary();
    updateSleepCard();
    closeNapSettingsModal();
    showNotification('✅ 已保存', '小睡设置已更新', 'info');
}

// [v7.9.7] 手动添加睡眠记录弹窗
function showManualSleepModal() {
    const modal = document.getElementById('manualSleepModal');
    
    // 默认日期：入睡为昨天，起床为今天
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    document.getElementById('manualSleepDate').value = getLocalDateString(yesterday);
    document.getElementById('manualSleepTime').value = sleepSettings.plannedBedtime || '22:30';
    document.getElementById('manualWakeDate').value = getLocalDateString(today);
    document.getElementById('manualWakeTime').value = sleepSettings.plannedWakeTime || '06:30';
    document.getElementById('manualSleepNote').value = '';
    
    // 添加实时计算事件
    ['manualSleepDate', 'manualSleepTime', 'manualWakeDate', 'manualWakeTime'].forEach(id => {
        document.getElementById(id).onchange = calculateManualSleepPreview;
    });
    
    // 初始计算
    calculateManualSleepPreview();
    
    modal.classList.remove('hidden');
}

// [v7.9.8] 从条形图点击进入手动补录，自动填充对应日期
function showManualSleepModalForDate(targetDate) {
    const modal = document.getElementById('manualSleepModal');
    
    // targetDate 是睡眠周期日期（如 2026-01-28），入睡日期就是该日期，起床日期是第二天
    const sleepDate = new Date(targetDate);
    const wakeDate = new Date(sleepDate);
    wakeDate.setDate(wakeDate.getDate() + 1);
    
    document.getElementById('manualSleepDate').value = targetDate;
    document.getElementById('manualSleepTime').value = sleepSettings.plannedBedtime || '22:30';
    document.getElementById('manualWakeDate').value = getLocalDateString(wakeDate);
    document.getElementById('manualWakeTime').value = sleepSettings.plannedWakeTime || '06:30';
    document.getElementById('manualSleepNote').value = '';
    
    // 添加实时计算事件
    ['manualSleepDate', 'manualSleepTime', 'manualWakeDate', 'manualWakeTime'].forEach(id => {
        document.getElementById(id).onchange = calculateManualSleepPreview;
    });
    
    // 初始计算
    calculateManualSleepPreview();
    
    modal.classList.remove('hidden');
}

function closeManualSleepModal() {
    document.getElementById('manualSleepModal').classList.add('hidden');
}

// [v7.9.7] 实时计算手动睡眠预览
function calculateManualSleepPreview() {
    const sleepDate = document.getElementById('manualSleepDate').value;
    const sleepTime = document.getElementById('manualSleepTime').value;
    const wakeDate = document.getElementById('manualWakeDate').value;
    const wakeTime = document.getElementById('manualWakeTime').value;
    
    const durationEl = document.getElementById('manualSleepDuration');
    const rewardEl = document.getElementById('manualSleepReward');
    
    if (!sleepDate || !sleepTime || !wakeDate || !wakeTime) {
        durationEl.textContent = '--';
        rewardEl.textContent = '--';
        return;
    }
    
    // [v7.13.0] 显式指定本地时区，确保时间戳正确
    const sleepStartTime = new Date(`${sleepDate}T${sleepTime}:00`).getTime();
    const wakeTimeMs = new Date(`${wakeDate}T${wakeTime}:00`).getTime();
    
    if (wakeTimeMs <= sleepStartTime) {
        durationEl.textContent = '时间无效';
        durationEl.style.color = '#F44336';
        rewardEl.textContent = '--';
        return;
    }
    
    const durationMinutes = Math.floor((wakeTimeMs - sleepStartTime) / 60000);
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    durationEl.textContent = `${hours}小时${mins > 0 ? mins + '分' : ''}`;
    durationEl.style.color = 'var(--text-color)';
    
    // 计算奖惩 [v7.9.8] 使用固定颜色确保通透模式可读
    const result = calculateSleepReward(sleepStartTime, wakeTimeMs);
    const isPositive = result.totalReward >= 0;
    rewardEl.textContent = `${isPositive ? '+' : ''}${result.totalReward} 分钟`;
    rewardEl.style.color = isPositive ? '#4CAF50' : '#F44336';
}

// [v7.9.7] 提交手动睡眠记录
async function submitManualSleep() {
    const sleepDate = document.getElementById('manualSleepDate').value;
    const sleepTime = document.getElementById('manualSleepTime').value;
    const wakeDate = document.getElementById('manualWakeDate').value;
    const wakeTime = document.getElementById('manualWakeTime').value;
    const note = document.getElementById('manualSleepNote').value.trim();
    
    if (!sleepDate || !sleepTime || !wakeDate || !wakeTime) {
        showNotification('⚠️ 请填写完整时间', '', 'warning');
        return;
    }
    
    const sleepStartTime = new Date(`${sleepDate}T${sleepTime}`).getTime();
    const wakeTimeMs = new Date(`${wakeDate}T${wakeTime}`).getTime();
    
    if (wakeTimeMs <= sleepStartTime) {
        showNotification('⚠️ 起床时间必须晚于入睡时间', '', 'warning');
        return;
    }
    
    const durationMinutes = Math.floor((wakeTimeMs - sleepStartTime) / 60000);
    
    // 合理性检查
    if (durationMinutes < 60 || durationMinutes > 24 * 60) {
        if (!await showConfirm(`睡眠时长为 ${Math.floor(durationMinutes / 60)}小时${durationMinutes % 60}分，是否继续？`, '时长确认')) {
            return;
        }
    }
    
    // [v7.14.0] 检查是否已有该日期的睡眠记录，改进提示信息
    const cycleDate = getSleepCycleDate(sleepStartTime);
    const existingRecord = getSleepRecordForDate(cycleDate);
    if (existingRecord) {
        const existingStartStr = formatSleepTimeHM(existingRecord.sleepStartTime);
        const existingWakeStr = formatSleepTimeHM(existingRecord.wakeTime);
        const newStartStr = formatSleepTimeHM(sleepStartTime);
        const newWakeStr = formatSleepTimeHM(wakeTimeMs);
        const confirmMsg = `${cycleDate} 已有睡眠记录\n\n` +
                         `已有记录: ${existingStartStr} ~ ${existingWakeStr}\n` +
                         `新记录: ${newStartStr} ~ ${newWakeStr}\n\n` +
                         `是否仍要添加？（同一睡眠周期）`;
        if (!await showConfirm(confirmMsg, '记录已存在')) {
            return;
        }
    }
    
    // 计算奖惩
    const result = calculateSleepReward(sleepStartTime, wakeTimeMs);
    const isPositive = result.totalReward >= 0;
    
    // 创建交易记录
    const transaction = {
        id: generateId(),
        type: isPositive ? 'earn' : 'spend',
        taskName: '睡眠时间管理',
        amount: Math.abs(result.totalReward) * 60, // 转换为秒
        timestamp: wakeTimeMs, // 使用起床时间作为记录时间
        description: `📝 手动记录 | ${note || '睡眠结算'}`,
        note: note || `手动记录: ${new Date(sleepStartTime).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})} ~ ${new Date(wakeTimeMs).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})}`,
        category: isPositive ? (sleepSettings.earnCategory || '系统') : (sleepSettings.spendCategory || '系统'),
        isSystem: true,
        sleepData: {
            startTime: sleepStartTime,
            wakeTime: wakeTimeMs,
            durationMinutes: durationMinutes,
            sleepType: 'night', // [v7.16.0] 手动记录默认为夜间睡眠
            details: result,
            manualEntry: true // 标记为手动输入
        }
    };
    
    // [v7.9.8] 添加交易并等待云端同步完成
    try {
        await addTransaction(transaction);
        console.log('[submitManualSleep] ✅ 交易已同步到云端');
    } catch (err) {
        console.error('[submitManualSleep] ❌ 云端同步失败，但本地已保存:', err);
    }
    
    // [v7.9.8] 修复：手动补录必须更新余额！
    const balanceChange = isPositive ? transaction.amount : -transaction.amount;
    currentBalance += balanceChange;
    console.log(`💰 [submitManualSleep] 余额变更: ${balanceChange > 0 ? '+' : ''}${Math.round(balanceChange/60)}分钟, 新余额: ${Math.round(currentBalance/60)}分钟`);
    
    // [v7.14.0] 修复：先强制重算目标日期的 dailyChanges，覆盖可能残留的错误缓存
    const targetDate = getLocalDateString(new Date(wakeTimeMs));
    recalculateDailyStats(targetDate);
    console.log(`[submitManualSleep] 已重算 ${targetDate} 的 dailyChanges`);
    
    // 更新UI
    updateAllUI();
    
    // [v7.14.0] 修复：强制刷新睡眠卡片和条形图
    updateSleepCard();
    // 如果睡眠详情弹窗已打开，重新渲染
    const sleepCardWrapper = document.getElementById('sleepCardWrapper');
    if (sleepCardWrapper && sleepCardWrapper.classList.contains('expanded')) {
        const sleepDetailContent = document.getElementById('sleepDetailContent');
        if (sleepDetailContent) {
            sleepDetailContent.innerHTML = renderSleepDetailContent();
        }
    }
    
    // 关闭弹窗
    closeManualSleepModal();
    
    // 刷新系统任务历史
    showSystemTaskHistory('睡眠时间管理');
    
    showNotification('✅ 已添加', `睡眠记录: ${isPositive ? '+' : ''}${result.totalReward}分钟`, 'achievement');
}

// [v7.9.7] 系统任务撤回（包装 undoTransaction 并刷新列表）
async function undoSystemTransaction(transactionId) {
    const transaction = transactions.find(t => t.id === transactionId);
    if (!transaction) {
        // [v7.21.1] 移除通知，保留默默返回
        return;
    }
    
    // 调用原有撤回逻辑
    await undoTransaction(transactionId);
    
    // 刷新系统任务历史（如果弹窗仍然打开）
    if (currentSystemTaskName && document.getElementById('historyModal').classList.contains('show')) {
        showSystemTaskHistory(currentSystemTaskName);
    }
}

// 切换首页睡眠卡片显示
function toggleSleepCard() {
    sleepSettings.showCard = document.getElementById('sleepCardToggle').checked;
    saveSleepSettings();
    updateSleepCardVisibility();
}

// 更新睡眠卡片可见性
// [v7.18.0] 修复：更新堆叠容器可见性
function updateSleepCardVisibility() {
    const sleepWrapper = document.getElementById('sleepCardWrapper');
    // [v7.14.0] 网页端调试：强制显示睡眠卡片以便调试
    const isWeb = !window.Android;
    const sleepVisible = isWeb ? sleepSettings.showCard : (sleepSettings.enabled && sleepSettings.showCard);
    
    if (sleepVisible) {
        if (sleepWrapper) sleepWrapper.style.display = '';
    } else {
        if (sleepWrapper) sleepWrapper.style.display = 'none';
    }
    // [v7.18.0] 统一更新堆叠容器可见性
    updateStackedContainerVisibility();
}

// [v7.16.0] 智能睡眠类型检测：根据入睡时间和睡眠时长判断夜间/小睡
// 夜间判定：入睡时间在 20:00-06:00 之间，或睡眠时长 >= napMinDurationMinutes (默认4小时)
// 小睡判定：其他情况
function detectSleepType(sleepStartTime, wakeTime) {
    const startHour = new Date(sleepStartTime).getHours();
    const durationMinutes = Math.floor((wakeTime - sleepStartTime) / 60000);
    const isNightHour = (startHour >= 20 || startHour < 6);
    const isLongSleep = durationMinutes >= (sleepSettings.napMinDurationMinutes || 240);
    return (isNightHour || isLongSleep) ? 'night' : 'nap';
}

// [v7.16.0] 入睡时判断睡眠类型（仅根据入睡时间，用于选择正确的闹钟）
function detectSleepTypeAtStart(startTime) {
    const startHour = new Date(startTime).getHours();
    return (startHour >= 20 || startHour < 6) ? 'night' : 'nap';
}

// [v7.16.0] 统一处理睡眠操作（替代原 handleSleepAction）
function handleSleepAction() {
    if (sleepState.isSleeping) {
        endUnifiedSleep();
    } else {
        startUnifiedSleep();
    }
}

// [v7.16.0] 统一取消操作（替代原 handleSleepCancel）
function handleSleepCancel() {
    if (!sleepState.isSleeping) return;
    cancelSleep();
}

// [v7.16.0] 更新首页睡眠卡片（统一模式）
// [v7.18.0] 新增：经典模式使用动态渐变颜色
function updateSleepCard() {
    const isWeb = !window.Android;
    if (!isWeb && !sleepSettings.enabled) return;
    if (!sleepSettings.showCard) return;
    
    const wrapper = document.getElementById('sleepCardWrapper');
    const statusEl = document.getElementById('sleepCardStatus');
    const startBtn = document.getElementById('sleepStartBtn');
    const cancelBtn = document.getElementById('sleepCancelBtn');
    const addBtn = document.getElementById('sleepAddBtn');
    const durationRow = document.getElementById('sleepDurationRow');
    const chartEl = document.getElementById('sleepCardChart');
    
    if (!wrapper) return;
    
    // [v7.18.0] 经典模式：使用CSS变量设置动态渐变颜色
    if (!document.body.classList.contains('glass-mode')) {
        const colors = getSleepGradientColorsFromLastRecord();
        wrapper.style.setProperty('--card-gradient-start', colors.start);
        wrapper.style.setProperty('--card-gradient-end', colors.end);
        // 添加方向类（由updateCardGradientDirections统一控制）
        updateCardGradientDirections();
    }
    
    // [v7.16.0] 补录按钮：未在睡眠中时显示
    if (addBtn) {
        addBtn.style.display = !sleepState.isSleeping ? '' : 'none';
    }
    
    // 更新状态
    wrapper.classList.remove('sleeping', 'napping');
    
    if (sleepState.isSleeping) {
        wrapper.classList.add('sleeping');
        statusEl.textContent = '睡眠中';
        // [v7.26.2] 收起状态下点击"睡眠中"标签可结束睡眠
        const isSleepExpanded = wrapper.classList.contains('expanded');
        statusEl.style.cursor = isSleepExpanded ? '' : 'pointer';
        statusEl.onclick = isSleepExpanded ? null : function(e) { e.stopPropagation(); endUnifiedSleep(); };
        startBtn.textContent = '结束睡眠';
        startBtn.onclick = function(e) { e.stopPropagation(); endUnifiedSleep(); };
        if (cancelBtn) {
            cancelBtn.style.display = '';
            cancelBtn.onclick = function(e) { e.stopPropagation(); cancelSleep(); };
        }
        if (chartEl) chartEl.style.display = 'none';
        if (durationRow) {
            durationRow.style.display = '';
            updateSleepDurationDisplay();
        }
    } else {
        // [v7.16.0] 收起时显示"开始睡眠"可点击快捷入睡，展开时显示"未开始"
        const isExpanded = wrapper.classList.contains('expanded');
        statusEl.textContent = isExpanded ? '未开始' : '开始睡眠';
        statusEl.style.cursor = isExpanded ? '' : 'pointer';
        statusEl.onclick = isExpanded ? null : function(e) { e.stopPropagation(); startUnifiedSleep(); };
        startBtn.textContent = '开始睡眠';
        startBtn.onclick = function(e) { e.stopPropagation(); startUnifiedSleep(); };
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (durationRow) durationRow.style.display = 'none';
        updateSleepCardChart();
    }
}

// [v7.16.0] 更新睡眠时长显示（统一模式）
function updateSleepDurationDisplay() {
    const durationValue = document.getElementById('sleepDurationValue');
    if (!durationValue) return;
    
    if (!sleepState.isSleeping || !sleepState.sleepStartTime) return;
    
    const now = Date.now();
    const durationMs = now - sleepState.sleepStartTime;
    const totalSeconds = Math.floor(durationMs / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const secs = totalSeconds % 60;
    
    // 1小时内显示"xx分xx秒"，超过1小时显示"xx小时xx分"
    if (hours < 1) {
        durationValue.textContent = `${mins}分${secs}秒`;
    } else {
        durationValue.textContent = `${hours}小时${mins}分`;
    }
}

// [v7.9.0] 获取睡眠周期日期
// 规则：凌晨入睡（0:00-12:00）算作前一天的睡眠
// 例如：1月25日凌晨2:30入睡 → 算作1月24日的睡眠
function getSleepCycleDate(timestamp) {
    const date = new Date(timestamp);
    const hour = date.getHours();
    
    // 凌晨0:00-11:59入睡，算作前一天的睡眠周期
    if (hour < 12) {
        date.setDate(date.getDate() - 1);
    }
    
    return getLocalDateString(date);
}

// [v7.4.2] 获取指定日期的睡眠记录（优先本地记录，回退到交易）
// [v7.9.0] 使用睡眠周期日期匹配（凌晨入睡算前一天）
function getSleepRecordForDate(dateStr) {
    // 检查本地记录（lastSleepRecord 的 date 已经是睡眠周期日期）
    if (sleepState.lastSleepRecord && sleepState.lastSleepRecord.date === dateStr) {
        return sleepState.lastSleepRecord;
    }
    if (typeof transactions === 'undefined' || !Array.isArray(transactions)) return null;

    const tx = [...transactions].reverse().find(t => {
        if (!t || !t.sleepData || !t.sleepData.startTime) return false;
        // [v7.16.0] 仅匹配夜间睡眠记录（排除小睡）
        if (t.sleepData.sleepType === 'nap') return false;
        // [v7.9.0] 使用睡眠周期日期匹配（凌晨入睡算前一天）
        const cycleDate = getSleepCycleDate(t.sleepData.startTime);
        return cycleDate === dateStr;
    });

    if (!tx) return null;

    // [v7.14.0] 修复：确保时间戳是数字（云端可能返回字符串）
    const startTime = Number(tx.sleepData.startTime);
    const wakeTime = Number(tx.sleepData.wakeTime);
    
    // [v7.14.0] 调试：检查时间戳类型
    if (typeof tx.sleepData.startTime === 'string') {
        console.warn(`[getSleepRecordForDate] ${dateStr}: startTime 是字符串`, tx.sleepData.startTime, '转换后:', startTime);
    }
    
    const signedReward = (tx.type === 'earn' ? 1 : -1) * Math.round((tx.amount || 0) / 60);
    return {
        date: dateStr,
        sleepStartTime: startTime,
        wakeTime: wakeTime,
        durationMinutes: Number(tx.sleepData.durationMinutes) || 0,
        amount: Number(tx.amount) || 0,
        type: tx.type,
        timestamp: Number(tx.timestamp) || 0,
        reward: signedReward,
        details: null
    };
}

// [v7.5.3] 检测未操作睡眠惩罚
// 规则：启用睡眠管理后，如果前一天24点前未点击"进入睡眠"或"取消"，则惩罚2小时
// 判断逻辑基于"睡眠周期日期"（从计划入睡时间到次日计划入睡时间为一个周期）
// [v7.7.0] 检查昨日未操作睡眠惩罚（使用 lastPenaltyCheckDate 确保不遗漏）
// [v7.8.0] 返回结果对象用于启动报告，不再直接显示通知
// [v7.9.7] 从云端同步睡眠状态（用于惩罚检查前确保状态最新）
function syncSleepStateFromCloud() {
    console.log('[Sleep] 尝试从云端同步状态...', {
        isLoggedIn: isLoggedIn(),
        currentDeviceId,
        hasCloudState: !!DAL.profileData?.deviceSleepState?.[currentDeviceId]
    });
    
    if (!isLoggedIn() || !currentDeviceId || !DAL.profileData?.deviceSleepState?.[currentDeviceId]) {
        console.log('[Sleep] 无云端睡眠状态数据');
        return false; // 无云端数据
    }
    
    const cloudState = DAL.profileData.deviceSleepState[currentDeviceId];
    const localUpdated = sleepState.lastUpdated || 0;
    const cloudUpdated = cloudState.lastUpdated || 0;
    
    console.log('[Sleep] 状态时间对比:', { localUpdated, cloudUpdated, diff: cloudUpdated - localUpdated });
    
    if (cloudUpdated > localUpdated) {
        console.log('[Sleep] 云端状态较新，同步:', cloudState);
        if (cloudState.isSleeping !== undefined) sleepState.isSleeping = cloudState.isSleeping;
        if (cloudState.sleepStartTime !== undefined) sleepState.sleepStartTime = cloudState.sleepStartTime;
        // [v7.16.0] 向后兼容：旧云端的 isNapping 转换为统一 isSleeping
        if (cloudState.isNapping && !cloudState.isSleeping) {
            sleepState.isSleeping = true;
            sleepState.sleepStartTime = cloudState.napStartTime || sleepState.sleepStartTime;
        }
        sleepState.lastUpdated = cloudUpdated;
        localStorage.setItem('sleepState', JSON.stringify(sleepState));
        return true; // 已同步
    }
    console.log('[Sleep] 本地状态较新或相同，无需同步');
    return false;
}

// [v7.9.8] 改为 async 以支持等待云端同步
// [v7.4.2] 获取昨日睡眠记录
function getYesterdaySleepRecord() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = getLocalDateString(yesterday);
    return getSleepRecordForDate(dateStr);
}

// [v7.16.0] 更新睡眠卡片内嵌昨日条形图
function updateSleepCardChart() {
    const chartEl = document.getElementById('sleepCardChart');
    if (!chartEl) return;

    if (sleepState.isSleeping) {
        chartEl.style.display = 'none';
        return;
    }
    chartEl.style.display = '';

    const record = getYesterdaySleepRecord();

    // 解析计划时间
    const parseTimeToHours = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h + m / 60;
    };
    const plannedBedHour = parseTimeToHours(sleepSettings.plannedBedtime);
    const plannedWakeHour = parseTimeToHours(sleepSettings.plannedWakeTime);

    // 坐标轴范围：计划入睡前1h ~ 计划起床后1h
    const axisStartHour = plannedBedHour - 1;
    const axisEndHour = plannedWakeHour + 1;
    let axisTotalHours;
    if (axisEndHour < axisStartHour || (axisEndHour < 12 && axisStartHour > 12)) {
        axisTotalHours = (24 - axisStartHour) + axisEndHour;
    } else {
        axisTotalHours = axisEndHour - axisStartHour;
    }

    const bedtimePercent = (1 / axisTotalHours) * 100;
    const waketimePercent = ((axisTotalHours - 1) / axisTotalHours) * 100;

    const timeToPercent = (timestamp, isWakeTime = false) => {
        const d = new Date(timestamp);
        let hour = d.getHours() + d.getMinutes() / 60;
        if (!isWakeTime && hour > axisEndHour && hour < axisStartHour) hour -= 24;
        if (isWakeTime && hour < axisStartHour && axisStartHour > 12) hour += 24;
        let relativeHour;
        if (hour >= axisStartHour) {
            relativeHour = hour - axisStartHour;
        } else {
            relativeHour = (24 - axisStartHour) + hour;
        }
        relativeHour = Math.max(0, Math.min(relativeHour, axisTotalHours));
        return (relativeHour / axisTotalHours) * 100;
    };

    const formatTimeHM = (timestamp) => {
        const d = new Date(timestamp);
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    };

    let html = '';

    if (record && record.sleepStartTime && record.wakeTime) {
        const startPercent = timeToPercent(record.sleepStartTime, false);
        const endPercent = timeToPercent(record.wakeTime, true);
        const width = Math.max(endPercent - startPercent, 10);
        const durationMin = record.durationMinutes || 0;
        const h = Math.floor(durationMin / 60);
        const m = durationMin % 60;
        const durationStr = m > 0 ? `${h}h${m}m` : `${h}h`;
        const actualBed = formatTimeHM(record.sleepStartTime);
        const actualWake = formatTimeHM(record.wakeTime);
        const reward = record.reward || 0;
        const rewardSign = reward >= 0 ? '+' : '-';
        const rewardH = (Math.abs(reward) / 60).toFixed(1);
        const rewardText = `${rewardSign}${rewardH}h`;
        
        // [v7.18.0] 根据奖惩等级确定条形图颜色 (1h=60分钟为区间)
        // [v7.20.1-fix] 修复：record 可能没有 amount/type，回退到 reward 正负判断
        let barLevelClass = '';
        const rewardMinutes = record.amount ? (record.amount / 60) : Math.abs(reward);
        const isPenalty = record.type ? (record.type === 'spend') : (reward < 0);
        if (!isPenalty && rewardMinutes >= 60) {
            barLevelClass = 'level-1'; // 大奖励-翠绿
        } else if (!isPenalty && rewardMinutes > 0) {
            barLevelClass = 'level-2'; // 小奖励-蓝紫
        } else if (isPenalty && rewardMinutes < 60) {
            barLevelClass = 'level-3'; // 小惩罚-橙红
        } else {
            barLevelClass = 'level-4'; // 大惩罚-深红
        }

        html += `<div class="sleep-card-bar-row">`;
        html += `<div class="sleep-card-bar-label">昨日</div>`;
        html += `<div class="sleep-card-bar-container">`;
        html += `<div class="sleep-card-bar-marker bedtime" style="left:${bedtimePercent}%"></div>`;
        html += `<div class="sleep-card-bar-marker waketime" style="left:${waketimePercent}%"></div>`;
        html += `<div class="sleep-card-bar ${barLevelClass}" style="left:${startPercent}%;width:${width}%;">`;
        html += `<span class="sleep-card-bar-time">${actualBed}</span>`;
        html += `<span class="sleep-card-bar-text">${durationStr}</span>`;
        html += `<span class="sleep-card-bar-time">${actualWake}</span>`;
        html += `</div></div>`;
        html += `<div class="sleep-card-bar-reward">${rewardText}</div>`;
        html += `</div>`;
        // 时间轴标签
        html += `<div class="sleep-card-axis">`;
        html += `<span style="left:calc(28px + (100% - 60px) * ${bedtimePercent / 100})">${sleepSettings.plannedBedtime}</span>`;
        html += `<span style="left:calc(28px + (100% - 60px) * ${waketimePercent / 100})">${sleepSettings.plannedWakeTime}</span>`;
        html += `</div>`;
    } else {
        html += `<div class="sleep-card-empty">昨日无睡眠记录</div>`;
    }

    chartEl.innerHTML = html;


}

// [v7.4.2] 显示睡眠详细报告
// [v7.9.8] 改进：添加日期显示、通透模式样式优化（使用白色+阴影）
// [v7.13.0] 显示睡眠报告弹窗

// [v7.13.0] 从睡眠记录重构完整的结算结果（强力修复：确保任何记录都能显示完整明细）
function rebuildSleepResultFromRecord(record) {
    if (!record || !record.sleepStartTime || !record.wakeTime) return null;
    
    // 如果记录已有完整的 details，直接使用
    if (record.details && record.details.totalReward !== undefined) {
        return record.details;
    }
    
    // 否则，从时间信息重新计算
    return calculateSleepReward(record.sleepStartTime, record.wakeTime);
}

// [v7.13.0] 从条形图元素中解析记录数据并显示报告（强力修复点击问题）
function showSleepReportModalFromElement(element) {
    try {
        const recordData = element.getAttribute('data-record');
        if (!recordData) {
            console.error('[showSleepReportModalFromElement] 未找到记录数据');
            return;
        }
        const record = JSON.parse(decodeURIComponent(recordData));
        showSleepReportModal(record);
    } catch (e) {
        console.error('[showSleepReportModalFromElement] 解析记录数据失败:', e);
        showNotification('⚠️ 无法显示睡眠报告', '数据解析错误', 'warning');
    }
}

// [v7.13.0] 显示睡眠报告弹窗（使用与结束睡眠时相同的显示逻辑）
function showSleepReportModal(record) {
    // 防御性检查：确保记录数据完整
    if (!record || !record.sleepStartTime || !record.wakeTime) {
        console.warn('[showSleepReportModal] 睡眠记录数据不完整，跳过显示');
        return;
    }
    
    // 重构完整的结算结果（确保有明细数据）
    const result = rebuildSleepResultFromRecord(record);
    const durationMinutes = record.durationMinutes || 
        Math.floor((record.wakeTime - record.sleepStartTime) / 60000);
    
    const startStr = formatSleepTimeHM(record.sleepStartTime);
    const wakeStr = formatSleepTimeHM(record.wakeTime);
    const durationStr = formatSleepDuration(durationMinutes);
    const totalReward = result ? result.totalReward : (record.reward || 0);
    const rewardText = totalReward > 0 ? `+${totalReward}` : `${totalReward}`;
    const rewardLabel = totalReward > 0 ? '奖励' : totalReward < 0 ? '惩罚' : '无奖惩';
    const rewardColor = totalReward >= 0 ? '#4CAF50' : '#F44336';

    // [v7.9.8] 计算日期标签（显示具体日期而非固定"昨日"）
    // [v7.13.0] 增加星期显示，格式：今日 · 周一、昨日 · 周日、2月3日 · 周一
    const sleepDate = record.date || getSleepCycleDate(record.sleepStartTime);
    const today = getLocalDateString(new Date());
    const yesterday = getLocalDateString(new Date(Date.now() - 86400000));
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekDay = weekDays[new Date(record.sleepStartTime).getDay()];
    
    let dateLabel;
    if (sleepDate === today) {
        dateLabel = `今日 · ${weekDay}`;
    } else if (sleepDate === yesterday) {
        dateLabel = `昨日 · ${weekDay}`;
    } else {
        // 格式化为 M月D日 · 周一（使用 · 分隔更清晰）
        const [y, m, d] = sleepDate.split('-');
        dateLabel = `${parseInt(m)}月${parseInt(d)}日 · ${weekDay}`;
    }

    // [v7.13.0] 构建明细 HTML（使用与 showSleepResultModal 相同的逻辑）
    let detailsHtml = '';
    if (result) {
        detailsHtml += '<div class="sleep-report-details" style="text-align: left; font-size: 0.9rem; margin-top: 12px;">';

        // 入睡时间偏差
        if (result.bedtimeDiff !== 0) {
            const bedIcon = result.bedtimeDiff < 0 ? '🌙' : '⚠️';
            const bedText = result.bedtimeDiff < 0 ? `早睡 ${Math.abs(result.bedtimeDiff)} 分钟` : `晚睡 ${result.bedtimeDiff} 分钟`;
            const bedReward = result.bedtimeReward >= 0 ? `+${result.bedtimeReward.toFixed(1)}` : result.bedtimeReward.toFixed(1);
            const bedColor = result.bedtimeReward >= 0 ? '#4CAF50' : '#F44336';
            detailsHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>${bedIcon} ${bedText}</span><span style="color: ${bedColor}; font-weight: 600;">${bedReward} 分钟</span></div>`;
        }

        // 起床时间偏差
        if (result.wakeDiff !== 0) {
            const wakeIcon = result.wakeDiff < 0 ? '🌅' : '⚠️';
            const wakeText = result.wakeDiff < 0 ? `早起 ${Math.abs(result.wakeDiff)} 分钟` : `晚起 ${result.wakeDiff} 分钟`;
            const wakeReward = result.wakeReward >= 0 ? `+${result.wakeReward.toFixed(1)}` : result.wakeReward.toFixed(1);
            const wakeColor = result.wakeReward >= 0 ? '#4CAF50' : '#F44336';
            detailsHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>${wakeIcon} ${wakeText}</span><span style="color: ${wakeColor}; font-weight: 600;">${wakeReward} 分钟</span></div>`;
        }

        // 时长奖励/惩罚
        if (result.toleranceBonus > 0) {
            detailsHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>✅ 时长达标奖励</span><span style="color: #4CAF50; font-weight: 600;">+${result.toleranceBonus} 分钟</span></div>`;
        } else if (result.durationReward < 0) {
            const durText = result.durationDiff > 0 ? '睡眠过多' : '睡眠不足';
            detailsHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>❌ ${durText}</span><span style="color: #F44336; font-weight: 600;">${result.durationReward.toFixed(1)} 分钟</span></div>`;
        }

        // 解锁惩罚（v7.7.0 已移除，保留兼容）
        if (result.unlockPenalty && result.unlockPenalty !== 0) {
            detailsHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>📱 入睡后解锁手机惩罚</span><span style="color: #F44336; font-weight: 600;">${result.unlockPenalty.toFixed(1)} 分钟</span></div>`;
        }

        detailsHtml += '</div>';
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'sleepReportModal';
    modal.innerHTML = `
        <div class="modal-content" style="text-align: center; max-width: 380px;">
            <div style="font-size: 2.4rem; margin-bottom: 6px;">😴</div>
            <h3 style="margin-bottom: 6px;">睡眠报告（${dateLabel}）</h3>
            <p class="text-muted" style="margin-bottom: 10px;">${startStr}~${wakeStr} · ${durationStr}</p>
            <div style="font-size: 1.8rem; font-weight: 700; color: ${rewardColor}; margin-bottom: 4px;">
                ${rewardText} 分钟
            </div>
            <p class="text-muted" style="font-size: 0.85rem; margin-bottom: 8px;">${rewardLabel}</p>
            <p class="text-muted" style="font-size: 0.85rem;">
                计划时间 ${sleepSettings.plannedBedtime}~${sleepSettings.plannedWakeTime} · ${Math.floor(sleepSettings.targetDurationMinutes / 60)}小时${sleepSettings.targetDurationMinutes % 60}分
            </p>
            ${detailsHtml}
            <button class="btn btn-primary" onclick="document.getElementById('sleepReportModal').remove()" style="width: 100%; margin-top: 16px;">知道了</button>
        </div>
    `;
    document.body.appendChild(modal);
}

// 点击睡眠卡片
function handleSleepCardClick(event) {
    // 如果点击的是按钮，不处理
    if (event.target.closest('.sleep-action-btn')) return;
    // [v7.16.0] 收起时点击"开始睡眠"状态标签，不展开卡片（由状态标签自身onclick处理）
    if (event.target.id === 'sleepCardStatus' && event.target.onclick) return;
    
    event.stopPropagation();
    const wrapper = document.getElementById('sleepCardWrapper');
    if (!wrapper) return;
    
    const isExpanded = wrapper.classList.contains('expanded');
    const header = document.getElementById('sleepCardHeader');
    const clickedHeader = header && header.contains(event.target);
    const isActionBtn = event.target.classList.contains('sleep-action-btn');
    
    if (isActionBtn) return; // 按钮点击不处理展开/收起
    
    if (!isExpanded) {
        // 收起状态，点击任何位置都展开
        wrapper.classList.add('expanded');
        saveCardExpandedState('sleep', true);
        // [v7.16.0] 展开后更新状态标签
        const statusElExp = document.getElementById('sleepCardStatus');
        if (statusElExp) {
            if (sleepState.isSleeping) {
                // [v7.26.2] 展开后睡眠中标签去除点击事件（展开时通过按钮操作）
                statusElExp.style.cursor = '';
                statusElExp.onclick = null;
            } else {
                statusElExp.textContent = '未开始'; statusElExp.style.cursor = ''; statusElExp.onclick = null;
            }
        }
    } else if (clickedHeader) {
        // 展开状态，点击 header 收起
        wrapper.classList.remove('expanded');
        saveCardExpandedState('sleep', false);
        // [v7.16.0] 收起后更新状态标签
        const statusElCol = document.getElementById('sleepCardStatus');
        if (statusElCol) {
            if (sleepState.isSleeping) {
                // [v7.26.2] 收起后为睡眠中标签添加点击结束睡眠
                statusElCol.style.cursor = 'pointer';
                statusElCol.onclick = function(e) { e.stopPropagation(); endUnifiedSleep(); };
            } else {
                statusElCol.textContent = '开始睡眠'; statusElCol.style.cursor = 'pointer'; statusElCol.onclick = function(e) { e.stopPropagation(); startUnifiedSleep(); };
            }
        }
    } else {
        // 展开状态，点击 body 显示睡眠详情/历史
        showSleepHistory();
    }
}

// [v7.11.3] 入睡倒计时状态（防止非用户操作中断）
let sleepCountdownState = {
    active: false,
    endTime: 0,
    intervalId: null,
    userCanceled: false
};

// [v7.16.2] 持久化倒计时状态，防止休眠导致丢失
function saveSleepCountdownState() {
    const data = { active: sleepCountdownState.active, endTime: sleepCountdownState.endTime };
    localStorage.setItem('sleepCountdownState', JSON.stringify(data));
}
function clearSleepCountdownState() {
    localStorage.removeItem('sleepCountdownState');
}

function getSleepCountdownRemainingSeconds() {
    if (!sleepCountdownState.active) return sleepSettings.countdownSeconds;
    const remaining = Math.ceil((sleepCountdownState.endTime - Date.now()) / 1000);
    return Math.max(0, remaining);
}

function stopSleepCountdownTimer() {
    if (sleepCountdownState.intervalId) {
        clearInterval(sleepCountdownState.intervalId);
    }
    sleepCountdownState.intervalId = null;
    sleepCountdownState.active = false;
    clearSleepCountdownState(); // [v7.16.2]
}

function startSleepCountdown() {
    if (sleepCountdownState.active) return;
    sleepCountdownState.active = true;
    sleepCountdownState.userCanceled = false;
    sleepCountdownState.endTime = Date.now() + sleepSettings.countdownSeconds * 1000;
    saveSleepCountdownState(); // [v7.16.2] 持久化

    sleepCountdownState.intervalId = setInterval(() => {
        const remaining = getSleepCountdownRemainingSeconds();
        const display = document.getElementById('sleepCountdownDisplay');
        if (display) {
            display.textContent = remaining;
        }
        if (remaining <= 0) {
            stopSleepCountdownTimer();
            closeSleepCountdownModal();
            startSleepRecording();
        }
    }, 1000);
}

// [v7.16.0] 统一开始睡眠（替代原 startSleepMode + startNap）
// 所有睡眠统一进入倒计时 → 记录 → 结束时智能判定类型
function startUnifiedSleep() {
    if (sleepState.isSleeping) {
        showNotification('⚠️ 已在睡眠中', '', 'warning');
        return;
    }
    // [v7.11.3] 防止倒计时配置异常导致直接进入睡眠
    if (!Number.isFinite(sleepSettings.countdownSeconds) || sleepSettings.countdownSeconds < 1) {
        console.warn('[Sleep] countdownSeconds invalid, reset to 30', sleepSettings.countdownSeconds);
        sleepSettings.countdownSeconds = 30;
    }
    if (sleepCountdownState.active) {
        showSleepCountdownModal();
        return;
    }
    // 显示倒计时界面并启动倒计时
    showSleepCountdownModal();
    startSleepCountdown();
}

// 显示入睡倒计时弹窗
// [v7.16.0] 增加闹钟预告和本次跳过开关
let sleepCountdownAlarmEnabled = true; // [v7.19.0] 本次是否启用闹钟（默认跟随全局）
let sleepCountdownSkipAlarm = false;  // [v7.16.0] 本次跳过闹钟
let sleepCountdownSyncSystemAlarm = true; // [v7.19.0] 本次是否同步到系统时钟闹钟
let sleepCountdownAlarmPrepared = false; // [v7.19.0] 本次会话是否已提前创建过 App 闹钟
let sleepCountdownSystemSyncState = { ok: false, message: '未同步', triggerAt: 0, lastLabel: '', detailResult: null, phase: 'sync' };
let sleepCountdownSession = null;

function isSystemAlarmSyncSupported() {
    return typeof Android !== 'undefined' && !!Android.canSetSystemAlarm && (!!Android.syncSystemAlarmWithResult || !!Android.syncSystemAlarm);
}

function getNextTriggerFromClockTime(timeStr, baseTimeMs) {
    if (!timeStr) return 0;
    const [hour, minute] = timeStr.split(':').map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
    const target = new Date(baseTimeMs || Date.now());
    target.setHours(hour, minute, 0, 0);
    if (target.getTime() <= Date.now()) {
        target.setDate(target.getDate() + 1);
    }
    return target.getTime();
}

function getSleepCountdownSelectedType(baseTimeMs = Date.now()) {
    if (!sleepCountdownSession) return detectSleepTypeAtStart(baseTimeMs);
    if (sleepCountdownSession.mode === 'night') return 'night';
    if (sleepCountdownSession.mode === 'nap') return 'nap';
    return detectSleepTypeAtStart(baseTimeMs);
}

function initSleepCountdownSession() {
    const defaultNightMode = sleepSettings.nightAlarmMode && sleepSettings.nightAlarmMode !== 'none'
        ? sleepSettings.nightAlarmMode
        : 'wakeTime';
    const defaultNapMinutes = Math.max(5, Math.min(240, Number(sleepSettings.napDurationMinutes) || 30));
    sleepCountdownSession = {
        mode: 'auto', // auto/night/nap
        napAlarmType: 'duration', // duration/time
        napDurationMinutes: defaultNapMinutes,
        napDurationHoursPart: Math.floor(defaultNapMinutes / 60),
        napDurationMinutesPart: defaultNapMinutes % 60,
        napTimeValue: (() => {
            const t = new Date(Date.now() + (defaultNapMinutes * 60000));
            return `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`;
        })(),
        nightAlarmType: defaultNightMode === 'duration' ? 'duration' : 'time', // duration/time
        nightDurationHoursPart: Math.floor((Number(sleepSettings.targetDurationMinutes) || 480) / 60),
        nightDurationMinutesPart: (Number(sleepSettings.targetDurationMinutes) || 480) % 60,
        nightTimeValue: sleepSettings.plannedWakeTime || '06:45'
    };
    sleepCountdownAlarmEnabled = sleepSettings.sleepAlarmEnabled !== false;
    sleepCountdownSkipAlarm = false;
    sleepCountdownSyncSystemAlarm = sleepSettings.autoSyncSystemAlarm !== false;
    sleepCountdownAlarmPrepared = false;
    sleepCountdownSystemSyncState = { ok: false, message: '未同步', triggerAt: 0, lastLabel: '', detailResult: null, phase: 'sync' };
}

function getSleepNapDurationMinutesFromSession() {
    if (!sleepCountdownSession) return Math.max(5, Math.min(240, Number(sleepSettings.napDurationMinutes) || 30));
    const h = Math.max(0, Math.min(4, parseInt(sleepCountdownSession.napDurationHoursPart, 10) || 0));
    const m = Math.max(0, Math.min(59, parseInt(sleepCountdownSession.napDurationMinutesPart, 10) || 0));
    const total = Math.max(5, Math.min(240, h * 60 + m));
    sleepCountdownSession.napDurationHoursPart = Math.floor(total / 60);
    sleepCountdownSession.napDurationMinutesPart = total % 60;
    sleepCountdownSession.napDurationMinutes = total;
    return total;
}

function getSleepAlarmPlan(baseTimeMs = Date.now()) {
    const selectedType = getSleepCountdownSelectedType(baseTimeMs);
    let triggerAt = 0;
    let title = '';
    let body = '';
    let alarmId = 0;

    if (!sleepCountdownAlarmEnabled) {
        return { selectedType, triggerAt: 0, title, body, alarmId, disabled: true, reason: 'alarm_disabled' };
    }

    if (sleepCountdownSkipAlarm) {
        return { selectedType, triggerAt: 0, title, body, alarmId, disabled: true, reason: 'skip' };
    }

    if (selectedType === 'nap') {
        alarmId = ALARM_ID_NAP;
        title = '⏰ 小睡时间到';
        if (sleepCountdownSession?.napAlarmType === 'time') {
            const napTime = sleepCountdownSession.napTimeValue || '06:45';
            triggerAt = getNextTriggerFromClockTime(napTime, baseTimeMs);
            body = `已到小睡闹钟时间 ${napTime}，可以起床啦！`;
        } else {
            const napMinutes = getSleepNapDurationMinutesFromSession();
            triggerAt = (baseTimeMs || Date.now()) + napMinutes * 60 * 1000;
            body = `已睡满 ${napMinutes} 分钟，可以起床啦！`;
        }
    } else {
        const nightType = sleepCountdownSession?.nightAlarmType || sleepSettings.nightAlarmMode || 'none';
        alarmId = ALARM_ID_SLEEP;
        title = '⏰ 起床时间到';
        if (nightType === 'duration') {
            const hourPart = Math.max(0, parseInt(sleepCountdownSession?.nightDurationHoursPart, 10) || 0);
            const minutePart = Math.max(0, Math.min(59, parseInt(sleepCountdownSession?.nightDurationMinutesPart, 10) || 0));
            const mins = Math.max(30, hourPart * 60 + minutePart);
            triggerAt = (baseTimeMs || Date.now()) + mins * 60 * 1000;
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            body = `已睡满目标时长 ${h}小时${m > 0 ? m + '分钟' : ''}，该起床啦！`;
        } else {
            const wake = sleepCountdownSession?.nightTimeValue || sleepSettings.plannedWakeTime || '06:45';
            triggerAt = getNextTriggerFromClockTime(wake, baseTimeMs);
            body = `到了起床时间 ${wake}，该起床啦！`;
        }
    }

    return { selectedType, triggerAt, title, body, alarmId, disabled: !triggerAt, reason: triggerAt ? '' : 'invalid_time' };
}

function formatAlarmClockTime(ms) {
    if (!ms) return '--:--';
    const d = new Date(ms);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function updateSleepSystemSyncStatus(ok, message, triggerAt = 0, extra = null) {
    sleepCountdownSystemSyncState = {
        ok: !!ok,
        message: message || (ok ? '同步成功' : '同步失败'),
        triggerAt: triggerAt || 0,
        lastLabel: extra?.label || sleepCountdownSystemSyncState?.lastLabel || '',
        detailResult: extra?.detailResult || null,
        phase: extra?.phase || 'sync'
    };
    const statusEl = document.getElementById('sleepSystemSyncStatus');
    if (statusEl) {
        statusEl.textContent = sleepCountdownSystemSyncState.message;
        statusEl.style.color = sleepCountdownSystemSyncState.ok ? 'var(--color-positive)' : 'var(--color-spend)';
    }
}

function getSystemAlarmFailureTips(reason) {
    if (reason === 'missing_set_alarm_permission') {
        return [
            '系统未授予“闹钟/精确闹钟”相关权限。',
            '部分机型需要在系统设置里手动开启后才允许创建/取消系统闹钟。'
        ];
    }
    if (reason === 'no_alarm_app') {
        return [
            '系统未找到可处理闹钟的时钟应用。',
            '请确认系统“时钟”应用可用，或安装可用时钟应用后重试。'
        ];
    }
    if (reason === 'skip_ui_exception' || reason === 'with_ui_exception' || reason === 'exception') {
        return [
            '系统限制了当前调用方式（常见于后台/锁屏状态）。',
            '请先点“去系统闹钟设置”，再返回应用重试一次。'
        ];
    }
    if (reason === 'cancel_not_supported') {
        return [
            '当前系统时钟应用可能不支持“按条件取消”接口。',
            '可手动打开系统时钟删除对应闹钟。'
        ];
    }
    return [
        '系统返回了异常结果。',
        '建议打开系统闹钟设置后重试，或手动在时钟应用中处理。'
    ];
}

function openSleepSystemAlarmSettings() {
    if (window.Android?.openAlarmSettings) {
        window.Android.openAlarmSettings();
        return;
    }
    showAlert('当前环境不支持自动跳转，请在系统设置中搜索“闹钟/精确闹钟/时间银行”并开启相关权限。');
}

function showSleepSystemSyncDetailModal() {
    const detail = sleepCountdownSystemSyncState?.detailResult || null;
    if (!detail) {
        showAlert('当前没有可展示的失败详情。');
        return;
    }
    const reason = detail.reason || 'unknown';
    const summary = formatSystemAlarmSyncFailureReason(detail);
    const tips = getSystemAlarmFailureTips(reason);
    const isPermissionIssue = reason === 'missing_set_alarm_permission' || reason === 'skip_ui_exception' || reason === 'with_ui_exception';
    const phaseText = sleepCountdownSystemSyncState.phase === 'cancel' ? '取消系统闹钟' : '同步系统闹钟';
    const triggerText = sleepCountdownSystemSyncState.triggerAt ? formatAlarmClockTime(sleepCountdownSystemSyncState.triggerAt) : '--:--';
    const errorText = detail.errorMessage || detail.error || '';

    showInfoModal(`${phaseText}失败详情`, `
        <div style="line-height:1.6; font-size:0.92rem;">
            <div style="margin-bottom:8px;"><strong>失败原因：</strong>${escapeHtml(summary)}</div>
            <div style="margin-bottom:8px;"><strong>目标时间：</strong>${escapeHtml(triggerText)}</div>
            <ul style="margin: 4px 0 10px 18px; padding:0; color:var(--text-color-light);">
                ${tips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
            </ul>
            ${errorText ? `<div style="font-size:0.78rem; color:var(--text-color-light); margin-bottom:8px;">系统详情：${escapeHtml(errorText)}</div>` : ''}
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
                ${isPermissionIssue ? `<button class="btn btn-primary" onclick="openSleepSystemAlarmSettings()" style="flex:1; min-width:140px;">去系统闹钟设置</button>` : ''}
                <button class="btn btn-secondary" onclick="openSleepSystemAlarmSettings()" style="flex:1; min-width:140px;">打开相关设置</button>
            </div>
        </div>
    `);
}

function formatSystemAlarmSyncFailureReason(result) {
    const reason = result?.reason || 'unknown';
    const error = result?.error || '';
    const errorMessage = result?.errorMessage || '';
    const detail = errorMessage || error;
    switch (reason) {
        case 'time_in_past': return '目标时间已过，请重新设置';
        case 'no_alarm_app': return '未检测到系统时钟应用';
        case 'missing_set_alarm_permission': return '缺少系统闹钟权限（SET_ALARM）';
        case 'cancel_not_supported': return '当前系统时钟不支持按条件取消';
        case 'dismiss_security_exception': return detail ? `取消权限受限（${detail}）` : '取消权限受限';
        case 'dismiss_label_exception': return detail ? `按标签取消失败（${detail}）` : '按标签取消失败';
        case 'dismiss_time_exception': return detail ? `按时间取消失败（${detail}）` : '按时间取消失败';
        case 'skip_ui_failed': return detail ? `静默创建失败（${detail}）` : '静默创建失败';
        case 'skip_ui_exception': return detail ? `静默创建异常（${detail}）` : '静默创建异常';
        case 'with_ui_exception': return detail ? `拉起系统时钟异常（${detail}）` : '拉起系统时钟异常';
        case 'exception': return detail ? `系统异常（${detail}）` : '系统异常';
        default: return detail ? `${reason}（${detail}）` : reason;
    }
}

function trySyncSystemAlarmFromCountdown(source = 'manual', planBaseTimeMs = Date.now()) {
    const plan = getSleepAlarmPlan(planBaseTimeMs);
    if (!sleepCountdownSyncSystemAlarm) {
        updateSleepSystemSyncStatus(false, '系统时钟同步已关闭');
        return;
    }
    if (!sleepCountdownAlarmEnabled) {
        updateSleepSystemSyncStatus(false, '闹钟总开关已关闭，不执行系统同步');
        return;
    }
    if (sleepCountdownSkipAlarm || plan.disabled || !plan.triggerAt) {
        updateSleepSystemSyncStatus(false, '本次无可同步闹钟');
        return;
    }
    if (!isSystemAlarmSyncSupported()) {
        updateSleepSystemSyncStatus(false, '当前设备不支持系统时钟同步');
        return;
    }

    try {
        const labelPrefix = plan.selectedType === 'nap' ? '💤' : '🌙';
        const label = `${labelPrefix} Time Bank ${plan.selectedType === 'nap' ? '小睡' : '起床'}提醒`;

        if (window.Android?.syncSystemAlarmWithResult) {
            const raw = window.Android.syncSystemAlarmWithResult(plan.triggerAt, label, true);
            let result = null;
            try { result = raw ? JSON.parse(raw) : null; } catch (e) {}
            if (result?.success) {
                updateSleepSystemSyncStatus(true, `已同步到系统闹钟（${formatAlarmClockTime(plan.triggerAt)}）`, plan.triggerAt, {
                    label,
                    detailResult: null,
                    phase: 'sync'
                });
            } else {
                const reason = result?.reason || 'unknown';
                if ((reason === 'exception' || reason === 'skip_ui_exception') && window.Android?.syncSystemAlarm) {
                    const fallbackOk = window.Android.syncSystemAlarm(plan.triggerAt, label);
                    if (fallbackOk) {
                        updateSleepSystemSyncStatus(true, `已同步到系统闹钟（${formatAlarmClockTime(plan.triggerAt)}）`, plan.triggerAt, {
                            label,
                            detailResult: null,
                            phase: 'sync'
                        });
                        return;
                    }
                }
                updateSleepSystemSyncStatus(false, `同步失败：${formatSystemAlarmSyncFailureReason(result)}`, plan.triggerAt, {
                    label,
                    detailResult: result || { reason: 'unknown' },
                    phase: 'sync'
                });
            }
        } else if (window.Android?.syncSystemAlarm) {
            const ok = window.Android.syncSystemAlarm(plan.triggerAt, label);
            updateSleepSystemSyncStatus(!!ok, ok ? `已同步到系统闹钟（${formatAlarmClockTime(plan.triggerAt)}）` : '同步失败', plan.triggerAt, {
                label,
                detailResult: ok ? null : { reason: 'legacy_sync_failed' },
                phase: 'sync'
            });
        }
        console.log('[Sleep] System alarm sync attempt:', source, sleepCountdownSystemSyncState);
    } catch (e) {
        console.error('[Sleep] System alarm sync error:', e);
        updateSleepSystemSyncStatus(false, '同步异常，请重试', plan.triggerAt || 0, {
            label: '',
            detailResult: { reason: 'exception', errorMessage: e?.message || String(e || '') },
            phase: 'sync'
        });
    }
}

function prepareSleepAlarmFromCountdown(source = 'confirm') {
    const baseTime = (sleepCountdownState.active && sleepCountdownState.endTime > 0)
        ? sleepCountdownState.endTime
        : Date.now();
    const plan = getSleepAlarmPlan(baseTime);

    if (sleepCountdownAlarmEnabled && !sleepCountdownSkipAlarm && !plan.disabled && plan.triggerAt > Date.now() && window.Android?.scheduleAlarmWithId) {
        const delayMs = plan.triggerAt - Date.now();
        window.Android.scheduleAlarmWithId(plan.alarmId, plan.title, plan.body, delayMs);
        sleepCountdownAlarmPrepared = true;
        console.log('[Sleep] Alarm prepared before countdown end:', source, plan);
    }

    if (sleepCountdownSyncSystemAlarm && sleepCountdownAlarmEnabled && !sleepCountdownSkipAlarm) {
        trySyncSystemAlarmFromCountdown(`prepare-${source}`, baseTime);
    }
}

function confirmSleepCountdownAndPrepareAlarm() {
    // [v7.19.0] 确认即视为“倒计时结束”，立即进入睡眠
    sleepCountdownState.userCanceled = false;
    sleepCountdownState.endTime = Date.now();
    prepareSleepAlarmFromCountdown('confirm-btn');
    startSleepRecording();
}

function tryCancelSystemAlarmFromCountdown(source = 'cancel-countdown') {
    const triggerAt = Number(sleepCountdownSystemSyncState?.triggerAt) || 0;
    const label = sleepCountdownSystemSyncState?.lastLabel || '';
    if (!triggerAt || !window.Android?.dismissSystemAlarmWithResult) {
        return;
    }
    try {
        const raw = window.Android.dismissSystemAlarmWithResult(triggerAt, label || 'Time Bank 睡眠提醒');
        let result = null;
        try { result = raw ? JSON.parse(raw) : null; } catch (e) {}
        if (result?.success) {
            updateSleepSystemSyncStatus(true, `已尝试取消系统闹钟（${formatAlarmClockTime(triggerAt)}）`, 0, {
                label: '',
                detailResult: null,
                phase: 'cancel'
            });
        } else {
            updateSleepSystemSyncStatus(false, `取消失败：${formatSystemAlarmSyncFailureReason(result)}`, triggerAt, {
                label,
                detailResult: result || { reason: 'cancel_failed' },
                phase: 'cancel'
            });
        }
        console.log('[Sleep] System alarm cancel attempt:', source, result);
    } catch (e) {
        console.error('[Sleep] System alarm cancel error:', e);
        updateSleepSystemSyncStatus(false, '取消系统闹钟异常', triggerAt, {
            label,
            detailResult: { reason: 'exception', errorMessage: e?.message || String(e || '') },
            phase: 'cancel'
        });
    }
}

function onSleepSystemAlarmToggle(checked) {
    sleepCountdownSyncSystemAlarm = !!checked;
    sleepSettings.autoSyncSystemAlarm = sleepCountdownSyncSystemAlarm;
    saveSleepSettings();

    if (!sleepCountdownSyncSystemAlarm && sleepCountdownSystemSyncState?.ok && sleepCountdownSystemSyncState?.triggerAt) {
        tryCancelSystemAlarmFromCountdown('sync-toggle-off');
    }

    refreshSleepAlarmInfoPanel(false);
}

function onSleepAlarmEnabledToggle(checked) {
    // [v7.26.2] 仅更新会话状态，不写入全局 sleepSettings（全局开关已移至睡眠设置页）
    sleepCountdownAlarmEnabled = !!checked;

    if (!sleepCountdownAlarmEnabled && sleepCountdownSystemSyncState?.ok && sleepCountdownSystemSyncState?.triggerAt) {
        tryCancelSystemAlarmFromCountdown('master-off');
    }

    refreshSleepAlarmInfoPanel(false);
}

function onSleepSkipAlarmToggle(checked) {
    sleepCountdownSkipAlarm = !!checked;

    if (sleepCountdownSkipAlarm && sleepCountdownSystemSyncState?.ok && sleepCountdownSystemSyncState?.triggerAt) {
        tryCancelSystemAlarmFromCountdown('session-skip-on');
    }

    refreshSleepAlarmInfoPanel(false);
}

function setSleepCountdownMode(mode) {
    if (!sleepCountdownSession) return;
    sleepCountdownSession.mode = mode;
    refreshSleepAlarmInfoPanel(false);
}

function setSleepNapAlarmType(type) {
    if (!sleepCountdownSession) return;
    sleepCountdownSession.napAlarmType = type;
    refreshSleepAlarmInfoPanel(false);
}

function setSleepNightAlarmType(type) {
    if (!sleepCountdownSession) return;
    sleepCountdownSession.nightAlarmType = type;
    refreshSleepAlarmInfoPanel(false);
}

function setSleepNapDurationFromInput(val) {
    if (!sleepCountdownSession) return;
    const total = Math.max(5, Math.min(240, parseInt(val, 10) || 30));
    sleepCountdownSession.napDurationMinutes = total;
    sleepCountdownSession.napDurationHoursPart = Math.floor(total / 60);
    sleepCountdownSession.napDurationMinutesPart = total % 60;
    refreshSleepAlarmInfoPanel(false);
}

function setSleepNapDurationHoursFromInput(val) {
    if (!sleepCountdownSession) return;
    const nextH = Math.max(0, Math.min(4, parseInt(val, 10) || 0));
    const nextM = Math.max(0, Math.min(59, parseInt(sleepCountdownSession.napDurationMinutesPart, 10) || 0));
    const total = Math.max(5, Math.min(240, nextH * 60 + nextM));
    sleepCountdownSession.napDurationMinutes = total;
    sleepCountdownSession.napDurationHoursPart = Math.floor(total / 60);
    sleepCountdownSession.napDurationMinutesPart = total % 60;
    refreshSleepAlarmInfoPanel(false);
}

function setSleepNapDurationMinutesFromInput(val) {
    if (!sleepCountdownSession) return;
    const nextH = Math.max(0, Math.min(4, parseInt(sleepCountdownSession.napDurationHoursPart, 10) || 0));
    const nextM = Math.max(0, Math.min(59, parseInt(val, 10) || 0));
    const total = Math.max(5, Math.min(240, nextH * 60 + nextM));
    sleepCountdownSession.napDurationMinutes = total;
    sleepCountdownSession.napDurationHoursPart = Math.floor(total / 60);
    sleepCountdownSession.napDurationMinutesPart = total % 60;
    refreshSleepAlarmInfoPanel(false);
}

function setSleepNapTimeFromInput(val) {
    if (!sleepCountdownSession) return;
    sleepCountdownSession.napTimeValue = val || sleepCountdownSession.napTimeValue;
    refreshSleepAlarmInfoPanel(false);
}

function setSleepNightTimeFromInput(val) {
    if (!sleepCountdownSession) return;
    sleepCountdownSession.nightTimeValue = val || sleepCountdownSession.nightTimeValue;
    refreshSleepAlarmInfoPanel(false);
}

function setSleepNightDurationHoursFromInput(val) {
    if (!sleepCountdownSession) return;
    sleepCountdownSession.nightDurationHoursPart = Math.max(0, Math.min(23, parseInt(val, 10) || 0));
    refreshSleepAlarmInfoPanel(false);
}

function setSleepNightDurationMinutesFromInput(val) {
    if (!sleepCountdownSession) return;
    sleepCountdownSession.nightDurationMinutesPart = Math.max(0, Math.min(59, parseInt(val, 10) || 0));
    refreshSleepAlarmInfoPanel(false);
}

function buildAlarmInfoHtml() {
    const plan = getSleepAlarmPlan(Date.now());
    const selectedType = plan.selectedType;
    const supportsSystemSync = isSystemAlarmSyncSupported() && window.Android?.canSetSystemAlarm && window.Android.canSetSystemAlarm();
    const alarmEnabledChecked = sleepCountdownAlarmEnabled;
    const defaultSyncChecked = sleepSettings.autoSyncSystemAlarm !== false;
    const systemSyncShortStatus = (() => {
        if (!supportsSystemSync) return '不可用';
        if (!defaultSyncChecked) return '关闭';
        if (sleepCountdownSystemSyncState?.ok) return '已同步';
        if (sleepCountdownSystemSyncState?.detailResult) return '失败';
        return '未同步';
    })();

    const modeBtns = `
        <div style="display:flex; border:1px solid var(--border-color); border-radius:10px; overflow:hidden; margin:8px 0 12px;">
            <button type="button" class="btn" style="flex:1; border:none; border-right:1px solid var(--border-color); border-radius:0; padding:8px 0; background:${selectedType === 'night' ? 'var(--color-primary)' : 'transparent'}; color:${selectedType === 'night' ? '#fff' : 'var(--text-color)'};" onclick="setSleepCountdownMode('night')">夜间</button>
            <button type="button" class="btn" style="flex:1; border:none; border-radius:0; padding:8px 0; background:${selectedType === 'nap' ? 'var(--color-primary)' : 'transparent'}; color:${selectedType === 'nap' ? '#fff' : 'var(--text-color)'};" onclick="setSleepCountdownMode('nap')">小睡</button>
        </div>
    `;

    const napPreviewAt = sleepCountdownSession.napAlarmType === 'time'
        ? getNextTriggerFromClockTime(sleepCountdownSession.napTimeValue, Date.now())
        : Date.now() + getSleepNapDurationMinutesFromSession() * 60000;

    const nightPreviewAt = sleepCountdownSession.nightAlarmType === 'time'
        ? getNextTriggerFromClockTime(sleepCountdownSession.nightTimeValue, Date.now())
        : (() => {
            const h = Math.max(0, parseInt(sleepCountdownSession.nightDurationHoursPart, 10) || 0);
            const m = Math.max(0, Math.min(59, parseInt(sleepCountdownSession.nightDurationMinutesPart, 10) || 0));
            const totalMinutes = Math.max(30, h * 60 + m);
            return Date.now() + totalMinutes * 60000;
        })();

    const napControls = `
        <div style="margin:8px 0 10px; padding:10px; border-radius:8px; background: rgba(var(--color-primary-rgb), 0.05); ${selectedType === 'nap' ? '' : 'display:none;'}">
            <div style="font-weight:600; margin-bottom:8px;">💤 小睡闹钟</div>
            <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:6px; margin-bottom:8px;">
                <button type="button" class="btn" style="padding:6px 0; border:${sleepCountdownSession.napAlarmType === 'time' ? '1px solid var(--color-primary)' : '1px solid var(--border-color)'}; background:${sleepCountdownSession.napAlarmType === 'time' ? 'rgba(var(--color-primary-rgb), 0.12)' : 'transparent'};" onclick="setSleepNapAlarmType('time')">按时间</button>
                <button type="button" class="btn" style="padding:6px 0; border:${sleepCountdownSession.napAlarmType === 'duration' ? '1px solid var(--color-primary)' : '1px solid var(--border-color)'}; background:${sleepCountdownSession.napAlarmType === 'duration' ? 'rgba(var(--color-primary-rgb), 0.12)' : 'transparent'};" onclick="setSleepNapAlarmType('duration')">按时长</button>
            </div>
            <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                <div style="flex:0 0 46%;">
                    <div style="font-size:0.78rem; color:var(--text-color-light); margin-bottom:4px;">${sleepCountdownSession.napAlarmType === 'time' ? '闹钟时间' : '时长（小时/分）'}</div>
                    ${sleepCountdownSession.napAlarmType === 'time'
                        ? `<input type="time" value="${sleepCountdownSession.napTimeValue}" onchange="setSleepNapTimeFromInput(this.value)" style="width:100%; height:34px; box-sizing:border-box; padding:4px 8px; border:1px solid var(--border-color); border-radius:8px; background:var(--card-bg); color:var(--text-color);">`
                        : `<div style="display:flex; align-items:center; gap:4px; white-space:nowrap;"><input type="number" min="0" max="4" value="${sleepCountdownSession.napDurationHoursPart}" onchange="setSleepNapDurationHoursFromInput(this.value)" style="width:42%; height:34px; box-sizing:border-box; padding:4px 8px; border:1px solid var(--border-color); border-radius:8px; background:var(--card-bg); color:var(--text-color);"><span style="display:inline-block; white-space:nowrap; writing-mode:horizontal-tb; font-size:0.78rem; color:var(--text-color-light);">小时</span><input type="number" min="0" max="59" value="${sleepCountdownSession.napDurationMinutesPart}" onchange="setSleepNapDurationMinutesFromInput(this.value)" style="width:42%; height:34px; box-sizing:border-box; padding:4px 8px; border:1px solid var(--border-color); border-radius:8px; background:var(--card-bg); color:var(--text-color);"><span style="display:inline-block; white-space:nowrap; writing-mode:horizontal-tb; font-size:0.78rem; color:var(--text-color-light);">分</span></div>`
                    }
                </div>
                <div style="flex:1; font-size:0.8rem; color:var(--text-color-light); text-align:right; padding-top:18px;">预计响起 ${formatAlarmClockTime(napPreviewAt)}</div>
            </div>
        </div>
    `;

    const nightControls = `
        <div style="margin:8px 0 10px; padding:10px; border-radius:8px; background: rgba(var(--color-primary-rgb), 0.05); ${selectedType === 'night' ? '' : 'display:none;'}">
            <div style="font-weight:600; margin-bottom:8px;">🌙 夜间闹钟</div>
            <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:6px; margin-bottom:8px;">
                <button type="button" class="btn" style="padding:6px 0; border:${sleepCountdownSession.nightAlarmType === 'time' ? '1px solid var(--color-primary)' : '1px solid var(--border-color)'}; background:${sleepCountdownSession.nightAlarmType === 'time' ? 'rgba(var(--color-primary-rgb), 0.12)' : 'transparent'};" onclick="setSleepNightAlarmType('time')">按时间</button>
                <button type="button" class="btn" style="padding:6px 0; border:${sleepCountdownSession.nightAlarmType === 'duration' ? '1px solid var(--color-primary)' : '1px solid var(--border-color)'}; background:${sleepCountdownSession.nightAlarmType === 'duration' ? 'rgba(var(--color-primary-rgb), 0.12)' : 'transparent'};" onclick="setSleepNightAlarmType('duration')">按时长</button>
            </div>
            <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                <div style="flex:0 0 46%;">
                    <div style="font-size:0.78rem; color:var(--text-color-light); margin-bottom:4px;">${sleepCountdownSession.nightAlarmType === 'time' ? '闹钟时间' : '时长（小时/分）'}</div>
                    ${sleepCountdownSession.nightAlarmType === 'time'
                        ? `<input type="time" value="${sleepCountdownSession.nightTimeValue}" onchange="setSleepNightTimeFromInput(this.value)" style="width:100%; height:34px; box-sizing:border-box; padding:4px 8px; border:1px solid var(--border-color); border-radius:8px; background:var(--card-bg); color:var(--text-color);">`
                        : `<div style="display:flex; align-items:center; gap:4px; white-space:nowrap;"><input type="number" min="0" max="23" value="${sleepCountdownSession.nightDurationHoursPart}" onchange="setSleepNightDurationHoursFromInput(this.value)" style="width:42%; height:34px; box-sizing:border-box; padding:4px 8px; border:1px solid var(--border-color); border-radius:8px; background:var(--card-bg); color:var(--text-color);"><span style="display:inline-block; white-space:nowrap; writing-mode:horizontal-tb; font-size:0.78rem; color:var(--text-color-light);">小时</span><input type="number" min="0" max="59" value="${sleepCountdownSession.nightDurationMinutesPart}" onchange="setSleepNightDurationMinutesFromInput(this.value)" style="width:42%; height:34px; box-sizing:border-box; padding:4px 8px; border:1px solid var(--border-color); border-radius:8px; background:var(--card-bg); color:var(--text-color);"><span style="display:inline-block; white-space:nowrap; writing-mode:horizontal-tb; font-size:0.78rem; color:var(--text-color-light);">分</span></div>`
                    }
                </div>
                <div style="flex:1; font-size:0.8rem; color:var(--text-color-light); text-align:right; padding-top:18px;">预计响起 ${formatAlarmClockTime(nightPreviewAt)}</div>
            </div>
        </div>
    `;

    const compactControls = `
        <div style="margin-top:8px; padding:8px; border:1px solid var(--border-color); border-radius:8px; background:rgba(var(--color-primary-rgb), 0.03);">
            <div style="display:flex; gap:16px;">
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.8rem; color:var(--text-color);">
                    <input type="checkbox" ${alarmEnabledChecked ? 'checked' : ''} onchange="onSleepAlarmEnabledToggle(this.checked)" style="width: 15px; height: 15px; accent-color: var(--color-primary);">
                    本次启用闹钟
                </label>
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.8rem; color:var(--text-color); ${supportsSystemSync ? '' : 'opacity:0.6; cursor:not-allowed;'}">
                    <input type="checkbox" id="sleepSystemAlarmToggle" ${defaultSyncChecked ? 'checked' : ''} ${supportsSystemSync ? '' : 'disabled'} onchange="onSleepSystemAlarmToggle(this.checked)" style="width: 15px; height: 15px; accent-color: var(--color-primary);">
                    <span style="display:inline-block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">设置系统闹钟</span>
                </label>
            </div>
        </div>
    `;

    return `
        <div style="margin-bottom: 12px; text-align:left;">
            <div style="font-size: 0.82rem; color: var(--text-color-light); margin-bottom:6px;">本次睡眠模式</div>
            ${modeBtns}
            ${napControls}
            ${nightControls}
            ${compactControls}
            ${!sleepCountdownSystemSyncState.ok && sleepCountdownSystemSyncState.detailResult ? `<button type="button" class="btn btn-secondary" style="width:100%; margin-top:6px;" onclick="showSleepSystemSyncDetailModal()">查看失败详情</button>` : ''}
        </div>
    `;
}

function refreshSleepAlarmInfoPanel(autoSync = false) {
    const host = document.getElementById('sleepAlarmInfoSection');
    if (!host) return;
    host.innerHTML = buildAlarmInfoHtml();
    if (autoSync && sleepCountdownAlarmEnabled && sleepCountdownSyncSystemAlarm && !sleepCountdownSkipAlarm) {
        trySyncSystemAlarmFromCountdown('auto-refresh');
    }
}

function showSleepCountdownModal() {
    let modal = document.getElementById('sleepCountdownModal');
    if (modal) {
        const display = document.getElementById('sleepCountdownDisplay');
        if (display) {
            display.textContent = getSleepCountdownRemainingSeconds();
        }
        refreshSleepAlarmInfoPanel(false);
        return;
    }

    initSleepCountdownSession();
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'sleepCountdownModal';
    modal.innerHTML = `
        <div class="modal-content" style="text-align: center; max-width: 360px;">
            <div style="font-size: 3.6rem; margin-bottom: 10px;">😴</div>
            <h3 style="margin-bottom: 6px;">准备入睡</h3>
            <div id="sleepCountdownDisplay" style="font-size: 3rem; font-weight: 700; color: var(--color-primary); margin: 4px 0 12px;">${getSleepCountdownRemainingSeconds()}</div>
            <div id="sleepAlarmInfoSection"></div>
            <div style="display:flex; gap:10px; margin-top:8px;">
                <button class="btn btn-secondary" onclick="cancelSleepCountdown()" style="flex:1;">取消</button>
                <button class="btn btn-primary" onclick="confirmSleepCountdownAndPrepareAlarm()" style="flex:1;">确认</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    refreshSleepAlarmInfoPanel(false);
}

// 取消入睡倒计时
function cancelSleepCountdown() {
    sleepCountdownState.userCanceled = true;
    stopSleepCountdownTimer();
    if (sleepCountdownSystemSyncState?.ok && sleepCountdownSystemSyncState?.triggerAt) {
        tryCancelSystemAlarmFromCountdown('user-cancel-countdown');
    }
    sleepCountdownSession = null;
    closeSleepCountdownModal();
}

// 关闭入睡倒计时弹窗
function closeSleepCountdownModal() {
    const modal = document.getElementById('sleepCountdownModal');
    if (modal) {
        modal.remove();
    }
}

// [v7.13.0] 获取当前UTC时间戳（确保跨时区一致性）
// [v7.14.0] 修复：直接使用 Date.now() 获取正确的 UTC 时间戳
function getCurrentUTCTimestamp() {
    return Date.now();
}

// [v7.16.0] 开始记录睡眠（统一，用于倒计时结束后）
function startSleepRecording() {
    // [v7.16.2] 防止重复调用（visibilitychange 恢复 + setInterval 都可能触发）
    if (sleepState.isSleeping) {
        console.log('[Sleep] startSleepRecording: 已在睡眠中，跳过重复调用');
        stopSleepCountdownTimer();
        closeSleepCountdownModal();
        return;
    }
    stopSleepCountdownTimer();
    closeSleepCountdownModal(); // [v7.16.2] 确保弹窗关闭
    sleepState.isSleeping = true;
    // [v7.16.2] 使用倒计时结束时间作为入睡时间（而非当前时间）
    // 手机休眠时 setInterval 暂停，唤醒后 Date.now() 已是唤醒时间
    // sleepCountdownState.endTime 才是真正的倒计时结束（即入睡）时刻
    const persistedCountdown = localStorage.getItem('sleepCountdownState');
    let countdownEndTime = 0;
    if (sleepCountdownState.endTime > 0) {
        countdownEndTime = sleepCountdownState.endTime;
    } else if (persistedCountdown) {
        try { countdownEndTime = JSON.parse(persistedCountdown).endTime || 0; } catch(e) {}
    }
    sleepState.sleepStartTime = countdownEndTime > 0 ? countdownEndTime : getCurrentUTCTimestamp();
    sleepState.unlockCount = 0;
    sleepState.lastUnlockTime = null;
    saveSleepState();
    updateSleepCard();
    
    showNotification('😴 睡眠开始', '晚安！睡眠记录已开始', 'success');
    
    // [v7.19.0] 使用本次倒计时会话配置调度闹钟（支持模式切换与自定义时间）
    const plan = getSleepAlarmPlan(sleepState.sleepStartTime || Date.now());
    console.log('[Sleep] Alarm plan at recording:', plan);

    if (!sleepCountdownAlarmPrepared && sleepCountdownAlarmEnabled && !sleepCountdownSkipAlarm && !plan.disabled && plan.triggerAt > Date.now() && window.Android?.scheduleAlarmWithId) {
        const delayMs = plan.triggerAt - Date.now();
        window.Android.scheduleAlarmWithId(plan.alarmId, plan.title, plan.body, delayMs);
        console.log('[Sleep] Alarm scheduled:', plan.selectedType, 'delay(min)=', Math.round(delayMs / 60000));

        // [v7.19.0] 若前台预同步未成功，入睡时再尝试一次系统同步（兜底）
        if (sleepCountdownSyncSystemAlarm && (!sleepCountdownSystemSyncState.ok || !sleepCountdownSystemSyncState.triggerAt)) {
            trySyncSystemAlarmFromCountdown('recording-fallback');
        }
    } else if (sleepCountdownAlarmEnabled && !sleepCountdownSkipAlarm && !plan.disabled && plan.triggerAt <= Date.now()) {
        console.warn('[Sleep] Alarm trigger time is in the past, skip scheduling:', plan.triggerAt);
    }

    // 重置本次会话配置，防止影响下次入睡
    sleepCountdownSession = null;
    sleepCountdownAlarmPrepared = false;
    
    // 调用 Android 原生服务监控屏幕解锁
    if (typeof Android !== 'undefined' && Android.startSleepMonitor) {
        try {
            Android.startSleepMonitor();
            console.log('[Sleep] Started Android sleep monitor');
        } catch (e) {
            console.error('[Sleep] Failed to start Android sleep monitor', e);
        }
    }
    
    // 启动定时器更新显示
    if (sleepDurationTimer) clearInterval(sleepDurationTimer);
    sleepDurationTimer = setInterval(updateSleepDurationDisplay, 1000);
}

// [v7.4.0] 屏幕解锁回调（由 Android 原生层调用）
// 注意：这与任务的自动检测解锁惩罚是不同的功能
// - 任务自动检测：检测应用使用时长，用于漏记补录
// - 睡眠解锁检测：检测是否起床，用于结束睡眠记录
window.onSleepScreenUnlock = function() {
    if (!sleepState.isSleeping) return;
    
    const now = Date.now();
    sleepState.unlockCount = (sleepState.unlockCount || 0) + 1;
    
    // [v7.4.0] 自动检测起床逻辑
    if (sleepSettings.autoDetectWake) {
        const sleepDurationMinutes = Math.floor((now - sleepState.sleepStartTime) / 60000);
        const minSleepMinutes = 120; // 至少睡了2小时才考虑自动结束
        
        if (sleepDurationMinutes >= minSleepMinutes) {
            // 检查是否在合理的起床时间范围内（计划起床时间 ± 2小时）
            const [wakeHour, wakeMin] = sleepSettings.plannedWakeTime.split(':').map(Number);
            const currentHour = new Date(now).getHours();
            const currentMin = new Date(now).getMinutes();
            const currentTimeMinutes = currentHour * 60 + currentMin;
            const plannedWakeMinutes = wakeHour * 60 + wakeMin;
            const wakeWindowMinutes = 120; // ±2小时
            
            // 处理跨午夜的情况
            let timeDiff = Math.abs(currentTimeMinutes - plannedWakeMinutes);
            if (timeDiff > 720) timeDiff = 1440 - timeDiff;
            
            if (timeDiff <= wakeWindowMinutes) {
                // 在合理起床时间范围内解锁，弹出确认框
                showWakeConfirmModal();
            }
        }
    }
    
    sleepState.lastUnlockTime = now;
    saveSleepState();
    console.log('[Sleep] Screen unlocked, count:', sleepState.unlockCount);
};

// [v7.4.0] 显示起床确认弹窗
function showWakeConfirmModal() {
    // 避免重复弹出
    if (document.getElementById('wakeConfirmModal')) return;
    
    const sleepDurationMs = Date.now() - sleepState.sleepStartTime;
    const sleepDurationMinutes = Math.floor(sleepDurationMs / 60000);
    const hours = Math.floor(sleepDurationMinutes / 60);
    const mins = sleepDurationMinutes % 60;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'wakeConfirmModal';
    modal.innerHTML = `
        <div class="modal-content" style="text-align: center; max-width: 320px;">
            <div style="font-size: 4rem; margin-bottom: 16px;">☀️</div>
            <h3 style="margin-bottom: 8px;">早安！</h3>
            <p style="color: var(--text-color-light); margin-bottom: 16px;">检测到您已睡眠 <b>${hours}小时${mins}分钟</b></p>
            <p style="margin-bottom: 24px;">确认起床吗？</p>
            <div style="display: flex; gap: 12px;">
                <button class="btn btn-secondary" onclick="closeWakeConfirmModal()" style="flex: 1;">继续睡眠</button>
                <button class="btn btn-primary" onclick="closeWakeConfirmModal(); endSleep();" style="flex: 1;">确认起床</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    // 30秒后自动关闭（如果用户继续睡觉没操作）
    setTimeout(() => {
        closeWakeConfirmModal();
    }, 30000);
}

// [v7.4.0] 关闭起床确认弹窗
function closeWakeConfirmModal() {
    const modal = document.getElementById('wakeConfirmModal');
    if (modal) modal.remove();
}

// 确认取消睡眠
function confirmCancelSleep() {
    showConfirmModal(
        '⚠️ 确认取消睡眠？',
        '取消后今日将无法再次进入睡眠模式，且不记录本次睡眠数据。',
        () => {
            cancelSleep();
        },
        '确认取消',
        '返回睡眠'
    );
}

// [v7.16.0] 取消睡眠（统一版本，替代原 cancelSleep + cancelNap）
function cancelSleep() {
    if (!sleepState.isSleeping) return;
    
    sleepState.isSleeping = false;
    sleepState.sleepStartTime = null;
    saveSleepState();
    
    // 停止定时器
    if (sleepDurationTimer) {
        clearInterval(sleepDurationTimer);
        sleepDurationTimer = null;
    }
    
    // 取消可能存在的闹钟
    if (window.Android?.cancelAlarmWithId) {
        window.Android.cancelAlarmWithId(ALARM_ID_NAP);
        window.Android.cancelAlarmWithId(ALARM_ID_SLEEP);  // [v7.16.0]
    }

    // [v7.26.2] 取消睡眠时：尝试自动撤销系统闹钟，若创建过则提示用户手动确认关闭
    if (sleepCountdownSystemSyncState?.ok && sleepCountdownSystemSyncState?.triggerAt) {
        tryCancelSystemAlarmFromCountdown('cancel-sleep-card');
        showNotification('⏰ 请手动关闭系统闹钟', '本次睡眠已同步系统闹钟，若仍响起，请到系统时钟应用手动关闭', 'info');
    }
    
    // 停止 Android 原生监控
    if (typeof Android !== 'undefined' && Android.stopSleepMonitor) {
        try { Android.stopSleepMonitor(); } catch (e) {}
    }
    
    updateSleepCard();
    showNotification('❌ 睡眠已取消', '可随时重新开始', 'info');
}

// [v7.7.0] 切换小睡功能开关
function toggleNapEnabled() {
    const toggle = document.getElementById('sleepNapToggle');
    const panel = document.getElementById('napSettingsPanel');
    sleepSettings.napEnabled = toggle ? toggle.checked : false;
    if (panel) {
        panel.style.display = sleepSettings.napEnabled ? '' : 'none';
    }
    saveSleepSettings();
    updateSleepCard();
}

// [v7.7.0] 更新小睡时长设置
function updateNapDuration(value) {
    const minutes = parseInt(value) || 30;
    sleepSettings.napDurationMinutes = Math.max(5, Math.min(120, minutes));
    document.getElementById('napDurationValue').textContent = sleepSettings.napDurationMinutes + '分钟';
    saveSleepSettings();
}

// [v7.7.0] 更新小睡奖励设置
// [v7.9.3] 闹钟 ID 常量（避免不同功能的闹钟互相覆盖）
const ALARM_ID_TASK = 1;      // 任务闹钟
const ALARM_ID_NAP = 2;       // 小睡闹钟
const ALARM_ID_SLEEP = 3;     // 夜间睡眠闹钟

// [v7.9.3] 检查并请求闹钟权限
async function checkAlarmPermission() {
    if (window.Android?.canScheduleExactAlarms) {
        const hasPermission = window.Android.canScheduleExactAlarms();
        if (!hasPermission) {
            const result = await showConfirm(
                '需要"精确闹钟"权限才能在小睡结束时准时提醒。\n\n点击确定将跳转到设置页面，请开启"允许设置精确闹钟"权限。',
                '需要闹钟权限'
            );
            if (result && window.Android?.openAlarmSettings) {
                window.Android.openAlarmSettings();
            }
            return false;
        }
        return true;
    }
    // 非 Android 环境或旧版本，假设有权限
    return true;
}

function updateNapReward(value) {
    sleepSettings.napReward = parseInt(value) || 15;
    saveSleepSettings();
}

// [v7.16.0] 统一结束睡眠（智能检测夜间/小睡）
// 替代原 endSleep + endNap，根据入睡时间和时长自动判定类型
async function endUnifiedSleep() {
    if (!sleepState.isSleeping) return;
    
    const wakeTime = Date.now();
    const startTime = sleepState.sleepStartTime;
    const sleepDurationMs = wakeTime - startTime;
    const sleepDurationMinutes = Math.floor(sleepDurationMs / 60000);
    
    // [v7.16.0] 智能检测睡眠类型
    const detectedType = detectSleepType(startTime, wakeTime);
    
    // 取消可能存在的闹钟
    if (window.Android?.cancelAlarmWithId) {
        window.Android.cancelAlarmWithId(ALARM_ID_NAP);
        window.Android.cancelAlarmWithId(ALARM_ID_SLEEP);  // [v7.16.0]
    }
    
    // 停止 Android 原生监控
    if (typeof Android !== 'undefined' && Android.stopSleepMonitor) {
        try { Android.stopSleepMonitor(); } catch (e) { console.error(e); }
    }
    
    // 停止定时器
    if (sleepDurationTimer) {
        clearInterval(sleepDurationTimer);
        sleepDurationTimer = null;
    }
    
    // [v7.16.1] 直接按检测类型结算，不再弹出确认弹窗
    await doSleepSettlement(startTime, wakeTime, sleepDurationMinutes, detectedType);
}

// [v7.16.0] 显示睡眠结算确认弹窗
function showSleepSettlementModal(startTime, wakeTime, durationMinutes, detectedType) {
    const startStr = formatSleepTimeHM(startTime);
    const wakeStr = formatSleepTimeHM(wakeTime);
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    const durationText = hours > 0 ? `${hours}小时${mins > 0 ? mins + '分' : ''}` : `${mins}分钟`;
    
    // 预计算两种方案的结果
    const nightResult = calculateSleepReward(startTime, wakeTime);
    const napRewardBase = durationMinutes >= sleepSettings.napDurationMinutes ? sleepSettings.napReward : 0;
    const napMultiplier = balanceMode.enabled ? getBalanceMultiplier() : 1;
    const napReward = Math.round(napRewardBase * napMultiplier);
    
    const nightRewardText = nightResult.totalReward >= 0 ? `+${nightResult.totalReward}` : `${nightResult.totalReward}`;
    const napRewardText = napReward > 0 ? `+${napReward}` : '0';
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'sleepSettlementModal';
    modal.innerHTML = `
        <div class="modal-content" style="text-align: center; max-width: 380px;">
            <div style="font-size: 3rem; margin-bottom: 8px;">${detectedType === 'night' ? '🌅' : '💤'}</div>
            <h3 style="margin-bottom: 4px;">睡眠结算</h3>
            <p style="color: var(--text-color-light); margin-bottom: 16px;">${startStr} ~ ${wakeStr}，共 ${durationText}</p>
            
            <div style="margin-bottom: 16px;">
                <p style="font-size: 0.85rem; color: var(--text-color-light); margin-bottom: 12px;">系统检测为<b>${detectedType === 'night' ? '夜间睡眠' : '日间小睡'}</b>，你也可以手动切换：</p>
                <div style="display: flex; gap: 8px; justify-content: center;">
                    <button id="settlementTypeNight" class="btn ${detectedType === 'night' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="switchSettlementType('night')" style="flex: 1; font-size: 0.85rem; padding: 8px 12px;">
                        🌙 夜间睡眠<br><span style="font-size: 0.75rem; opacity: 0.8;">${nightRewardText} 分钟</span>
                    </button>
                    <button id="settlementTypeNap" class="btn ${detectedType === 'nap' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="switchSettlementType('nap')" style="flex: 1; font-size: 0.85rem; padding: 8px 12px;">
                        💤 日间小睡<br><span style="font-size: 0.75rem; opacity: 0.8;">${napRewardText} 分钟</span>
                    </button>
                </div>
            </div>
            
            <div style="display: flex; gap: 12px;">
                <button class="btn btn-secondary" onclick="cancelSettlementAndResume()" style="flex: 1;">继续睡眠</button>
                <button class="btn btn-primary" onclick="confirmSleepSettlement()" style="flex: 1;">确认结算</button>
            </div>
        </div>
    `;
    
    // 存储结算数据到弹窗
    modal.dataset.startTime = startTime;
    modal.dataset.wakeTime = wakeTime;
    modal.dataset.durationMinutes = durationMinutes;
    modal.dataset.selectedType = detectedType;
    modal.dataset.nightReward = JSON.stringify(nightResult);
    modal.dataset.napReward = napReward;
    
    document.body.appendChild(modal);
}

// [v7.16.0] 切换结算类型
function switchSettlementType(type) {
    const modal = document.getElementById('sleepSettlementModal');
    if (!modal) return;
    modal.dataset.selectedType = type;
    const nightBtn = document.getElementById('settlementTypeNight');
    const napBtn = document.getElementById('settlementTypeNap');
    if (nightBtn) {
        nightBtn.className = type === 'night' ? 'btn btn-primary' : 'btn btn-secondary';
    }
    if (napBtn) {
        napBtn.className = type === 'nap' ? 'btn btn-primary' : 'btn btn-secondary';
    }
}

// [v7.16.0] 取消结算，恢复睡眠状态
function cancelSettlementAndResume() {
    const modal = document.getElementById('sleepSettlementModal');
    if (modal) modal.remove();
    // 恢复睡眠状态（重新启动定时器和监控）
    if (sleepState.isSleeping) {
        if (typeof Android !== 'undefined' && Android.startSleepMonitor) {
            try { Android.startSleepMonitor(); } catch (e) {}
        }
        sleepDurationTimer = setInterval(updateSleepDurationDisplay, 1000);
        updateSleepCard();
    }
}

// [v7.16.0] 确认睡眠结算（兼容弹窗调用）
async function confirmSleepSettlement() {
    const modal = document.getElementById('sleepSettlementModal');
    if (!modal) return;
    
    const startTime = Number(modal.dataset.startTime);
    const wakeTime = Number(modal.dataset.wakeTime);
    const durationMinutes = Number(modal.dataset.durationMinutes);
    const selectedType = modal.dataset.selectedType;
    
    modal.remove();
    await doSleepSettlement(startTime, wakeTime, durationMinutes, selectedType);
}

// [v7.16.1] 实际执行睡眠结算（直接调用或从弹窗确认调用）
async function doSleepSettlement(startTime, wakeTime, durationMinutes, selectedType) {
    
    // 重置状态
    sleepState.isSleeping = false;
    sleepState.sleepStartTime = null;
    
    if (selectedType === 'night') {
        // 夜间睡眠：使用完整奖惩计算
        const result = calculateSleepReward(startTime, wakeTime);
        const sleepCycleDate = getSleepCycleDate(startTime);
        
        const sleepRecord = {
            date: sleepCycleDate,
            sleepStartTime: startTime,
            wakeTime: wakeTime,
            durationMinutes: durationMinutes,
            reward: result.totalReward,
            details: result,
        };
        sleepState.lastSleepRecord = sleepRecord;
        saveSleepState();
        
        if (result.totalReward !== 0) {
            const txType = result.totalReward > 0 ? 'earn' : 'spend';
            const txAmount = Math.abs(result.totalReward) * 60;
            const sleepStartStr = formatSleepTimeHM(startTime);
            const wakeStr = formatSleepTimeHM(wakeTime);
            const durationStr = formatSleepDuration(durationMinutes);
            const txNote = `${sleepStartStr}~${wakeStr} ${durationStr}`;
            
            try {
                await addTransaction({
                    type: txType,
                    taskName: '睡眠时间管理',
                    amount: txAmount,
                    description: `😴 夜间睡眠: ${txNote}`,
                    note: txNote,
                    category: txType === 'earn' ? (sleepSettings.earnCategory || '系统') : (sleepSettings.spendCategory || '系统'),
                    isSystem: true,
                    sleepData: {
                        startTime: startTime,
                        wakeTime: wakeTime,
                        durationMinutes: durationMinutes,
                        sleepType: 'night' // [v7.16.0] 新增类型标识
                    }
                });
            } catch (err) {
                console.error('[endUnifiedSleep] 云端同步失败:', err);
            }
            currentBalance += txType === 'earn' ? txAmount : -txAmount;
            updateBalance();
        }
        
        updateSleepCard();
        updateAllUI();
        showSleepResultModal(result, durationMinutes);
        
    } else {
        // 日间小睡：简单达标判定
        saveSleepState();
        
        let reward = 0;
        if (durationMinutes >= sleepSettings.napDurationMinutes) {
            const multiplier = balanceMode.enabled ? getBalanceMultiplier() : 1;
            reward = Math.round(sleepSettings.napReward * multiplier);
        }
        
        if (reward > 0) {
            const txAmount = reward * 60;
            try {
                await addTransaction({
                    type: 'earn',
                    taskName: '睡眠时间管理',
                    amount: txAmount,
                    description: `💤 日间小睡: ${durationMinutes}分钟`,
                    note: `小睡 ${durationMinutes} 分钟`,
                    category: sleepSettings.earnCategory || '系统',
                    isSystem: true,
                    sleepData: {
                        startTime: startTime,
                        wakeTime: wakeTime,
                        durationMinutes: durationMinutes,
                        sleepType: 'nap' // [v7.16.0] 新增类型标识
                    }
                });
            } catch (err) {
                console.error('[endUnifiedSleep] 云端同步失败:', err);
            }
            currentBalance += txAmount;
            updateDailyChanges('earned', txAmount);
            showNotification('✨ 小睡完成', `小睡 ${durationMinutes} 分钟，获得 ${reward} 分钟奖励`, 'success');
        } else {
            const msg = durationMinutes < sleepSettings.napDurationMinutes 
                ? `小睡 ${durationMinutes} 分钟，未达到 ${sleepSettings.napDurationMinutes} 分钟目标`
                : `小睡 ${durationMinutes} 分钟`;
            showNotification('😴 小睡结束', msg, 'info');
        }
        
        updateSleepCard();
        updateAllUI();
    }
}

// [v7.7.0] 计算睡眠奖惩（移除解锁惩罚）
function calculateSleepReward(sleepStartTime, wakeTime) {
    const sleepStart = new Date(sleepStartTime);
    const wake = new Date(wakeTime);
    const sleepDurationMinutes = Math.floor((wakeTime - sleepStartTime) / 60000);
    
    // 解析计划时间
    const [plannedBedHour, plannedBedMin] = sleepSettings.plannedBedtime.split(':').map(Number);
    const [plannedWakeHour, plannedWakeMin] = sleepSettings.plannedWakeTime.split(':').map(Number);
    
    // 构建计划入睡时间（基于实际入睡日期）
    const plannedBedtime = new Date(sleepStart);
    plannedBedtime.setHours(plannedBedHour, plannedBedMin, 0, 0);
    // 如果计划时间在晚上而实际入睡是凌晨，调整日期
    if (sleepStart.getHours() < 6 && plannedBedHour >= 18) {
        plannedBedtime.setDate(plannedBedtime.getDate() - 1);
    }
    
    // 构建计划起床时间（基于实际起床日期）
    const plannedWakeTime = new Date(wake);
    plannedWakeTime.setHours(plannedWakeHour, plannedWakeMin, 0, 0);
    // 如果计划起床是早上而实际起床是晚上/深夜，调整日期
    if (plannedWakeHour < 12 && wake.getHours() >= 18) {
        plannedWakeTime.setDate(plannedWakeTime.getDate() + 1);
    }
    
    // 计算入睡偏差（分钟，负数=早睡，正数=晚睡）
    const bedtimeDiffMinutes = Math.floor((sleepStart - plannedBedtime) / 60000);
    
    // 计算起床偏差（分钟，负数=早起，正数=晚起）
    const wakeDiffMinutes = Math.floor((wake - plannedWakeTime) / 60000);
    
    // 计算时长偏差
    const durationDiffMinutes = sleepDurationMinutes - sleepSettings.targetDurationMinutes;
    const durationDeviationMinutes = Math.abs(durationDiffMinutes) - sleepSettings.durationTolerance;
    
    let result = {
        bedtimeDiff: bedtimeDiffMinutes,
        bedtimeReward: 0,
        wakeDiff: wakeDiffMinutes,
        wakeReward: 0,
        durationDiff: durationDiffMinutes,
        durationReward: 0,
        toleranceBonus: 0,
        totalReward: 0,
    };
    
    // 入睡奖惩
    if (bedtimeDiffMinutes < 0) {
        // 早睡：奖励
        result.bedtimeReward = Math.abs(bedtimeDiffMinutes) * sleepSettings.earlyBedtimeRate;
    } else if (bedtimeDiffMinutes > 0) {
        // 晚睡：惩罚
        result.bedtimeReward = -bedtimeDiffMinutes * sleepSettings.lateBedtimeRate;
    }
    
    // 起床奖惩
    if (wakeDiffMinutes < 0) {
        // 早起：奖励
        result.wakeReward = Math.abs(wakeDiffMinutes) * sleepSettings.earlyWakeRate;
    } else if (wakeDiffMinutes > 0) {
        // 晚起：惩罚
        result.wakeReward = -wakeDiffMinutes * sleepSettings.lateWakeRate;
    }
    
    // 时长奖惩
    if (durationDeviationMinutes <= 0) {
        // 在容差范围内：固定奖励
        result.toleranceBonus = sleepSettings.toleranceReward;
        result.durationReward = 0;
    } else {
        // 超出容差：惩罚
        result.durationReward = -durationDeviationMinutes * sleepSettings.durationDeviationRate;
    }
    
    // 计算总奖惩
    result.totalReward = Math.round(
        result.bedtimeReward + 
        result.wakeReward + 
        result.toleranceBonus + 
        result.durationReward
    );
    
    return result;
}

// 显示睡眠结果弹窗
function showSleepResultModal(result, durationMinutes) {
    const isPositive = result.totalReward >= 0;
    const emoji = isPositive ? '🌅' : '😓';
    const color = isPositive ? 'var(--color-success)' : 'var(--color-danger)';
    
    let detailsHtml = '<div style="text-align: left; font-size: 0.9rem; margin-top: 16px;">';
    
    // 入睡
    if (result.bedtimeDiff !== 0) {
        const bedIcon = result.bedtimeDiff < 0 ? '🌙' : '⚠️';
        const bedText = result.bedtimeDiff < 0 ? `早睡 ${Math.abs(result.bedtimeDiff)} 分钟` : `晚睡 ${result.bedtimeDiff} 分钟`;
        const bedReward = result.bedtimeReward >= 0 ? `+${result.bedtimeReward.toFixed(1)}` : result.bedtimeReward.toFixed(1);
        detailsHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>${bedIcon} ${bedText}</span><span style="color: ${result.bedtimeReward >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}">${bedReward} 分钟</span></div>`;
    }
    
    // 起床
    if (result.wakeDiff !== 0) {
        const wakeIcon = result.wakeDiff < 0 ? '🌅' : '⚠️';
        const wakeText = result.wakeDiff < 0 ? `早起 ${Math.abs(result.wakeDiff)} 分钟` : `晚起 ${result.wakeDiff} 分钟`;
        const wakeReward = result.wakeReward >= 0 ? `+${result.wakeReward.toFixed(1)}` : result.wakeReward.toFixed(1);
        detailsHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>${wakeIcon} ${wakeText}</span><span style="color: ${result.wakeReward >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}">${wakeReward} 分钟</span></div>`;
    }
    
    // 时长
    if (result.toleranceBonus > 0) {
        detailsHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>✅ 时长达标奖励</span><span style="color: var(--color-success)">+${result.toleranceBonus} 分钟</span></div>`;
    } else if (result.durationReward < 0) {
        const durText = result.durationDiff > 0 ? '睡眠过多' : '睡眠不足';
        detailsHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>❌ ${durText}</span><span style="color: var(--color-danger)">${result.durationReward.toFixed(1)} 分钟</span></div>`;
    }
    
    detailsHtml += '</div>';
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'sleepResultModal';
    modal.innerHTML = `
        <div class="modal-content" style="text-align: center; max-width: 360px;">
            <div style="font-size: 3rem; margin-bottom: 8px;">${emoji}</div>
            <h3 style="margin-bottom: 4px;">睡眠结算</h3>
            <p style="color: var(--text-color-light); margin-bottom: 16px;">睡眠时长: ${formatSleepDuration(durationMinutes)}</p>
            <div style="font-size: 2rem; font-weight: 700; color: ${color}; margin-bottom: 8px;">
                ${result.totalReward >= 0 ? '+' : ''}${result.totalReward} 分钟
            </div>
            ${detailsHtml}
            <button class="btn btn-primary" onclick="document.getElementById('sleepResultModal').remove()" style="width: 100%; margin-top: 16px;">知道了</button>
        </div>
    `;
    document.body.appendChild(modal);
}

// 格式化睡眠时长
function formatSleepDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h}小时${m}分钟`;
    if (h > 0) return `${h}小时`;
    return `${m}分钟`;
}

// [v7.4.1] 时间格式: HH:MM
function formatSleepTimeHM(timeMs) {
    const d = new Date(timeMs);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
}

// [v7.4.1] 时长格式: H:MM（纯数字）
function formatSleepDurationCompact(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${m.toString().padStart(2, '0')}`;
}

// [v7.16.0] 显示睡眠历史（统一显示所有睡眠记录）
function showSleepHistory() {
    showNightSleepDetailModal();
}

// [v7.8.3] 夜间睡眠详情弹窗（带条形图）
function showNightSleepDetailModal() {
    // 获取近期7天的睡眠记录用于图表
    const today = new Date();
    const recentRecords = [];
    
    // [v7.14.0] 调试：打印所有睡眠交易
    console.log('[showNightSleepDetailModal] 所有睡眠交易:');
    transactions.filter(t => t.sleepData).forEach(t => {
        const start = new Date(t.sleepData.startTime);
        console.log('  -', t.id, start.toLocaleString('zh-CN'), t.description || t.note);
    });
    
    for (let i = 1; i <= 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = getLocalDateString(d);
        const record = getSleepRecordForDate(dateStr);
        
        // [v7.14.0] 调试：打印每一天的查询结果
        if (record) {
            const start = new Date(record.sleepStartTime);
            console.log(`[showNightSleepDetailModal] ${dateStr}: 找到记录`, start.toLocaleString('zh-CN'));
        } else {
            console.log(`[showNightSleepDetailModal] ${dateStr}: 无记录`);
        }
        
        const dayLabels = ['昨天', '前天', '3天前', '4天前', '5天前', '6天前', '7天前'];
        recentRecords.push({ date: dateStr, dayLabel: dayLabels[i-1], record });
    }
    
    // 解析计划时间（HH:MM 格式）
    const parseTimeToHours = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h + m / 60;
    };
    
    const plannedBedHour = parseTimeToHours(sleepSettings.plannedBedtime);
    const plannedWakeHour = parseTimeToHours(sleepSettings.plannedWakeTime);
    
    // 计算坐标轴范围：计划入睡时间前1小时 到 计划起床时间后1小时
    const axisStartHour = plannedBedHour - 1;
    const axisEndHour = plannedWakeHour + 1;
    
    // 计算总跨度（处理跨午夜情况）
    let axisTotalHours;
    if (axisEndHour < axisStartHour || (axisEndHour < 12 && axisStartHour > 12)) {
        axisTotalHours = (24 - axisStartHour) + axisEndHour;
    } else {
        axisTotalHours = axisEndHour - axisStartHour;
    }
    
    // 计算计划时间在坐标轴上的位置百分比
    const bedtimePercent = (1 / axisTotalHours) * 100;
    const waketimePercent = ((axisTotalHours - 1) / axisTotalHours) * 100;
    
    // 将时间戳转换为坐标轴百分比
    // [v7.13.0] 修复：正确处理跨午夜和下午入睡的情况
    const timeToPercent = (timestamp, isWakeTime = false) => {
        const d = new Date(timestamp);
        let hour = d.getHours() + d.getMinutes() / 60;
        
        // 对于入睡时间：如果它在轴范围之后（如13:22，轴从21:30开始），
        // 说明是前一天的下午，应该减去24小时
        if (!isWakeTime && hour > axisEndHour && hour < axisStartHour) {
            hour -= 24;
        }
        
        // 对于起床时间：如果它在轴范围之前（如01:05，轴从21:30开始），
        // 需要加上24小时来正确计算
        if (isWakeTime && hour < axisStartHour && axisStartHour > 12) {
            hour += 24;
        }
        
        let relativeHour;
        if (hour >= axisStartHour) {
            relativeHour = hour - axisStartHour;
        } else {
            relativeHour = (24 - axisStartHour) + hour;
        }
        
        relativeHour = Math.max(0, Math.min(relativeHour, axisTotalHours));
        return (relativeHour / axisTotalHours) * 100;
    };
    
    // 格式化时间戳为 HH:MM
    const formatTimeHM = (timestamp) => {
        const d = new Date(timestamp);
        return d.getHours().toString().padStart(2, '0') + ':' + 
               d.getMinutes().toString().padStart(2, '0');
    };
    
    // 将分钟转换为小时显示
    const formatRewardHours = (minutes) => {
        const h = (Math.abs(minutes) / 60).toFixed(1);
        const sign = minutes >= 0 ? '+' : '-';
        return `${sign}${h}h`;
    };
    
    let chartHtml = '<div class="sleep-detail-section">';
    chartHtml += '<div class="sleep-detail-title">📊 近7天睡眠</div>';
    chartHtml += '<div class="sleep-bar-chart">';
    
    // [v7.13.0] 修复：将记录数据序列化后直接传递给弹窗函数，避免重复查询导致的问题
    recentRecords.slice(0, 7).forEach(({ dayLabel, record, date }) => {
        if (record && record.sleepStartTime && record.wakeTime) {
            const startPercent = timeToPercent(record.sleepStartTime, false);
            const endPercent = timeToPercent(record.wakeTime, true);
            const width = Math.max(endPercent - startPercent, 10);
            const durationMin = record.durationMinutes || 0;
            const h = Math.floor(durationMin / 60);
            const m = durationMin % 60;
            const durationStr = m > 0 ? `${h}h${m}m` : `${h}h`;
            const actualBedTime = formatTimeHM(record.sleepStartTime);
            const actualWakeTime = formatTimeHM(record.wakeTime);
            
            // [v7.14.0] 调试：打印渲染的时间
            console.log(`[条形图渲染] ${dayLabel}: ${actualBedTime} ~ ${actualWakeTime}, 时间戳: ${record.sleepStartTime}`);
            
            const reward = record.reward || 0;
            const rewardText = formatRewardHours(reward);
            const rewardClass = reward >= 0 ? 'positive' : 'negative';
            
            // [v7.18.0] 根据奖惩确定条形图颜色等级 (1h=60分钟为区间)
            let barLevelClass = '';
            const rewardMinutes = Math.abs(reward);
            if (reward >= 0 && rewardMinutes >= 60) {
                barLevelClass = 'level-1'; // 大奖励(≥1h)
            } else if (reward >= 0 && rewardMinutes > 0) {
                barLevelClass = 'level-2'; // 小奖励(<1h)
            } else if (reward < 0 && rewardMinutes < 60) {
                barLevelClass = 'level-3'; // 小惩罚(<1h)
            } else {
                barLevelClass = 'level-4'; // 大惩罚(≥1h)
            }
            
            // [v7.13.0] 关键修复：将记录数据直接编码到HTML属性中，点击时直接使用
            const recordData = encodeURIComponent(JSON.stringify(record));
            chartHtml += `
                <div class="sleep-bar-row" data-record="${recordData}" onclick="showSleepReportModalFromElement(this);">
                    <div class="sleep-bar-label">${dayLabel.substring(0, 2)}</div>
                    <div class="sleep-bar-container">
                        <div class="sleep-bar-marker bedtime" style="left: ${bedtimePercent}%;"></div>
                        <div class="sleep-bar-marker waketime" style="left: ${waketimePercent}%;"></div>
                        <div class="sleep-bar ${barLevelClass}" style="left: ${startPercent}%; width: ${width}%;">
                            <span class="sleep-bar-time">${actualBedTime}</span>
                            <span class="sleep-bar-text">${durationStr}</span>
                            <span class="sleep-bar-time">${actualWakeTime}</span>
                        </div>
                    </div>
                    <div class="sleep-bar-reward ${rewardClass} ${barLevelClass}">${rewardText}</div>
                </div>
            `;
        } else {
            // [v7.9.8] 点击无记录的条形图，进入对应日期的手动补录
            chartHtml += `
                <div class="sleep-bar-row" style="opacity: 0.7; cursor: pointer;" onclick="showManualSleepModalForDate('${date}');">
                    <div class="sleep-bar-label">${dayLabel.substring(0, 2)}</div>
                    <div class="sleep-bar-container">
                        <div class="sleep-bar-marker bedtime" style="left: ${bedtimePercent}%;"></div>
                        <div class="sleep-bar-marker waketime" style="left: ${waketimePercent}%;"></div>
                        <div class="sleep-bar-empty-text">点击补录</div>
                    </div>
                    <div class="sleep-bar-reward" style="font-size: 0.65rem;">+</div>
                </div>
            `;
        }
    });
    
    chartHtml += '</div>';
    // 时间轴标签在虚线正下方
    chartHtml += '<div class="sleep-bar-time-axis">';
    chartHtml += `<span class="axis-bedtime" style="left: calc(36px + (100% - 72px) * ${bedtimePercent / 100});">${sleepSettings.plannedBedtime}</span>`;
    chartHtml += `<span class="axis-waketime" style="left: calc(36px + (100% - 72px) * ${waketimePercent / 100});">${sleepSettings.plannedWakeTime}</span>`;
    chartHtml += '</div>';
    chartHtml += '</div>';
    
    // 计划设置
    const targetHours = Math.floor(sleepSettings.targetDurationMinutes / 60);
    const targetMins = sleepSettings.targetDurationMinutes % 60;
    const targetStr = targetMins > 0 ? `${targetHours}小时${targetMins}分` : `${targetHours}小时`;
    
    const settingsHtml = `
        <div class="sleep-detail-section">
            <div class="sleep-detail-title">⚙️ 夜间计划</div>
            <div class="sleep-detail-settings">
                <div class="setting-row"><span>计划入睡</span><span>${sleepSettings.plannedBedtime}</span></div>
                <div class="setting-row"><span>计划起床</span><span>${sleepSettings.plannedWakeTime}</span></div>
                <div class="setting-row"><span>目标时长</span><span>${targetStr} ± ${sleepSettings.durationTolerance}分</span></div>
                <div class="setting-row"><span>达标奖励</span><span>+${sleepSettings.toleranceReward} 分钟</span></div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="showSleepSettingsModal();" style="margin-top: 10px; width: 100%;">更改计划</button>
        </div>
    `;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'sleepDetailModal';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
        <div class="modal-content sleep-detail-modal modal-animate">
            <div class="modal-header">
                <h3 class="modal-title">😴 睡眠记录 <span class="help-icon" onclick="event.stopPropagation(); showSleepInfoModal();" title="使用说明">?</span></h3>
            </div>
            <div class="modal-body">
                ${chartHtml}
                ${settingsHtml}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// [v7.16.0] 小睡详情弹窗
function showNapDetailModal() {
    // 获取近期小睡记录
    const napTxs = transactions
        .filter(tx => tx.sleepData?.sleepType === 'nap' && tx.type === 'earn')
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 7);
    
    let recentHtml = '<div class="sleep-detail-section">';
    recentHtml += '<div class="sleep-detail-title">💤 近期小睡</div>';
    
    if (napTxs.length > 0) {
        recentHtml += '<div class="sleep-recent-list">';
        napTxs.forEach(tx => {
            const d = new Date(tx.timestamp);
            const dateStr = `${d.getMonth()+1}/${d.getDate()}`;
            const durationMins = tx.sleepData?.durationMinutes;
            const durationStr = durationMins ? `${durationMins}分钟` : '—';
            const reward = Math.round(tx.amount / 60);
            
            recentHtml += `
                <div class="sleep-recent-item" style="cursor: default;">
                    <div class="recent-day">${dateStr}</div>
                    <div class="recent-time">${durationStr}</div>
                    <div class="recent-reward" style="color: #4CAF50;">+${reward}</div>
                </div>
            `;
        });
        recentHtml += '</div>';
    } else {
        recentHtml += '<div class="sleep-detail-empty">暂无小睡记录</div>';
    }
    recentHtml += '</div>';
    
    // 小睡设置
    const settingsHtml = `
        <div class="sleep-detail-section">
            <div class="sleep-detail-title">⚙️ 小睡设置</div>
            <div class="sleep-detail-settings">
                <div class="setting-row"><span>达标时长</span><span>${sleepSettings.napDurationMinutes} 分钟</span></div>
                <div class="setting-row"><span>完成奖励</span><span>+${sleepSettings.napReward} 分钟</span></div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('sleepDetailModal')?.remove(); showNapSettingsModal();" style="margin-top: 10px; width: 100%;">更改设置</button>
        </div>
    `;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'sleepDetailModal';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
        <div class="modal-content sleep-detail-modal modal-animate">
            <div class="modal-header">
                <h3 class="modal-title">💤 小睡记录</h3>
            </div>
            <div class="modal-body">
                ${recentHtml}
                ${settingsHtml}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// [v7.5.3] 显示睡眠详情弹窗（保留兼容，转发到对应模式）
function showSleepDetailModal() {
    showSleepHistory();
}

// [v7.5.3] 显示睡眠设置弹窗
// [v7.9.8] 不再关闭上级弹窗，允许返回
function showSleepSettingsModal() {
    const targetHours = Math.floor(sleepSettings.targetDurationMinutes / 60);
    const targetMins = sleepSettings.targetDurationMinutes % 60;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'sleepSettingsModal';
    modal.onclick = function(e) { if (e.target === modal) closeSleepSettingsModal(); };
    modal.innerHTML = `
        <div class="modal-content modal-animate" style="max-width: 380px; max-height: 85vh; overflow-y: auto;">
            <div class="modal-header">
                <h3 class="modal-title">⚙️ 睡眠计划设置</h3>
                <button class="close-btn" onclick="closeSleepSettingsModal()">×</button>
            </div>
            <div class="modal-body">
                <div class="sleep-setting-group">
                    <div class="sleep-setting-item">
                        <span class="sleep-setting-label">🌙 计划入睡时间</span>
                        <input type="time" id="modalSleepBedtime" class="threshold-input" style="width: 100px;" value="${sleepSettings.plannedBedtime}">
                    </div>
                    <div class="sleep-setting-item">
                        <span class="sleep-setting-label">🌅 计划起床时间</span>
                        <input type="time" id="modalSleepWakeTime" class="threshold-input" style="width: 100px;" value="${sleepSettings.plannedWakeTime}">
                    </div>
                    <div class="sleep-setting-item">
                        <span class="sleep-setting-label">🎯 目标睡眠时长</span>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <input type="number" id="modalSleepTargetHours" class="threshold-input" value="${targetHours}" min="4" max="12" style="width: 40px; text-align: center;">
                            <span style="color: var(--text-color-light);">小时</span>
                            <input type="number" id="modalSleepTargetMins" class="threshold-input" value="${targetMins}" min="0" max="59" style="width: 40px; text-align: center;">
                            <span style="color: var(--text-color-light);">分</span>
                        </div>
                    </div>
                    <div class="sleep-setting-item">
                        <span class="sleep-setting-label">📏 达标范围</span>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <span id="modalSleepTargetDisplay" style="font-size: 0.85rem; color: var(--text-color-light);">${targetHours}时${targetMins > 0 ? targetMins + '分' : ''}</span>
                            <span style="color: var(--text-color-light);">±</span>
                            <input type="number" id="modalSleepTolerance" class="threshold-input" value="${sleepSettings.durationTolerance}" min="0" max="120" style="width: 50px; text-align: center;">
                            <span style="color: var(--text-color-light);">分</span>
                        </div>
                    </div>
                    <div class="sleep-setting-item">
                        <span class="sleep-setting-label">🏆 达标奖励</span>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <input type="number" id="modalSleepReward" class="threshold-input" value="${sleepSettings.toleranceReward}" min="0" max="180" style="width: 50px; text-align: center;">
                            <span style="color: var(--text-color-light);">分</span>
                        </div>
                    </div>
                    <div class="sleep-setting-item" style="flex-direction: column; align-items: stretch; gap: 8px;">
                        <span class="sleep-setting-label">⏰ 起床闹钟</span>
                        <div class="mode-switch" id="modalNightAlarmSwitch" style="width: 100%;">
                            <button type="button" data-value="none" class="${sleepSettings.nightAlarmMode === 'none' ? 'active' : ''}" onclick="document.querySelectorAll('#modalNightAlarmSwitch button').forEach(b=>b.classList.remove('active'));this.classList.add('active');">关闭</button>
                            <button type="button" data-value="duration" class="${sleepSettings.nightAlarmMode === 'duration' ? 'active' : ''}" onclick="document.querySelectorAll('#modalNightAlarmSwitch button').forEach(b=>b.classList.remove('active'));this.classList.add('active');" style="border-left: none; border-right: none;">按目标时长</button>
                            <button type="button" data-value="wakeTime" class="${sleepSettings.nightAlarmMode === 'wakeTime' ? 'active' : ''}" onclick="document.querySelectorAll('#modalNightAlarmSwitch button').forEach(b=>b.classList.remove('active'));this.classList.add('active');">按起床时间</button>
                        </div>
                    </div>
                </div>
                
                <div class="sleep-setting-group" style="margin-top: 16px;">
                    <div class="sleep-setting-subtitle" style="color: var(--text-color);">奖惩倍率 <span style="font-weight: 400; font-size: 0.75rem; color: var(--text-color-light);">（偏离分钟×倍率）</span></div>
                    <div class="sleep-rates-compact modal-rates">
                        <div class="rate-row reward">
                            <span class="rate-label">🌙 早睡</span>
                            <span class="rate-mult">×</span><input type="number" id="modalEarlyBedRate" class="threshold-input rate-input" placeholder="1" value="${sleepSettings.earlyBedtimeRate !== 1 ? sleepSettings.earlyBedtimeRate : ''}" min="0" max="5" step="0.1">
                            <div style="flex:1"></div>
                            <span class="rate-label">🌅 早起</span>
                            <span class="rate-mult">×</span><input type="number" id="modalEarlyWakeRate" class="threshold-input rate-input" placeholder="1" value="${sleepSettings.earlyWakeRate !== 1 ? sleepSettings.earlyWakeRate : ''}" min="0" max="5" step="0.1">
                        </div>
                        <div class="rate-row penalty">
                            <span class="rate-label">😴 晚睡</span>
                            <span class="rate-mult">×</span><input type="number" id="modalLateBedRate" class="threshold-input rate-input" placeholder="1" value="${sleepSettings.lateBedtimeRate !== 1 ? sleepSettings.lateBedtimeRate : ''}" min="0" max="5" step="0.1">
                            <div style="flex:1"></div>
                            <span class="rate-label">😪 晚起</span>
                            <span class="rate-mult">×</span><input type="number" id="modalLateWakeRate" class="threshold-input rate-input" placeholder="1" value="${sleepSettings.lateWakeRate !== 1 ? sleepSettings.lateWakeRate : ''}" min="0" max="5" step="0.1">
                        </div>
                        <div class="rate-row penalty">
                            <span class="rate-label">📏 总时长偏离</span>
                            <span class="rate-mult">×</span><input type="number" id="modalDurationDevRate" class="threshold-input rate-input" placeholder="1" value="${sleepSettings.durationDeviationRate !== 1 ? sleepSettings.durationDeviationRate : ''}" min="0" max="5" step="0.1">
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer" style="margin-top: 16px;">
                <button class="btn btn-primary" onclick="saveSleepSettingsFromModal();" style="width: 100%;">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// [v7.5.3] 关闭睡眠设置弹窗
function closeSleepSettingsModal() {
    const modal = document.getElementById('sleepSettingsModal');
    if (modal) modal.remove();
}

// [v7.5.3] 保存睡眠设置弹窗的设置
function saveSleepSettingsFromModal() {
    const bedtime = document.getElementById('modalSleepBedtime')?.value;
    const wakeTime = document.getElementById('modalSleepWakeTime')?.value;
    const targetHours = parseInt(document.getElementById('modalSleepTargetHours')?.value) || 8;
    const targetMins = parseInt(document.getElementById('modalSleepTargetMins')?.value) || 0;
    const tolerance = parseInt(document.getElementById('modalSleepTolerance')?.value) || 45;
    const reward = parseInt(document.getElementById('modalSleepReward')?.value) || 60;
    // [v7.16.0] 读取起床闹钟模式（从分段按钮）
    const nightAlarmActiveBtn = document.querySelector('#modalNightAlarmSwitch button.active');
    const nightAlarmMode = nightAlarmActiveBtn?.dataset.value || 'none';
    // 空值时默认为1
    const earlyBedVal = document.getElementById('modalEarlyBedRate')?.value;
    const lateBedVal = document.getElementById('modalLateBedRate')?.value;
    const earlyWakeVal = document.getElementById('modalEarlyWakeRate')?.value;
    const lateWakeVal = document.getElementById('modalLateWakeRate')?.value;
    const durationDevVal = document.getElementById('modalDurationDevRate')?.value;
    const earlyBedRate = earlyBedVal === '' ? 1 : (parseFloat(earlyBedVal) || 1);
    const lateBedRate = lateBedVal === '' ? 1 : (parseFloat(lateBedVal) || 1);
    const earlyWakeRate = earlyWakeVal === '' ? 1 : (parseFloat(earlyWakeVal) || 1);
    const lateWakeRate = lateWakeVal === '' ? 1 : (parseFloat(lateWakeVal) || 1);
    const durationDevRate = durationDevVal === '' ? 1 : (parseFloat(durationDevVal) || 1);
    
    if (bedtime) sleepSettings.plannedBedtime = bedtime;
    if (wakeTime) sleepSettings.plannedWakeTime = wakeTime;
    sleepSettings.targetDurationMinutes = targetHours * 60 + targetMins;
    sleepSettings.durationTolerance = tolerance;
    sleepSettings.toleranceReward = reward;
    sleepSettings.nightAlarmMode = nightAlarmMode;  // [v7.16.0]
    sleepSettings.earlyBedtimeRate = earlyBedRate;
    sleepSettings.lateBedtimeRate = lateBedRate;
    sleepSettings.earlyWakeRate = earlyWakeRate;
    sleepSettings.lateWakeRate = lateWakeRate;
    sleepSettings.durationDeviationRate = durationDevRate;
    
    // [v7.9.8] 调用统一的保存函数（同时保存到本地和云端）
    saveSleepSettings();
    
    // 更新设置页摘要
    updateSleepSettingsSummary();
    
    // 关闭设置弹窗
    closeSleepSettingsModal();
    
    // 更新首页卡片
    updateSleepCard();
    
    showNotification('✅ 已保存', '睡眠设置已更新并同步到云端', 'info');
}

// 显示睡眠时间管理说明弹窗
function showSleepInfoModal() {
    showInfoModal('😴 睡眠时间管理说明', `
        <div style="text-align: left; font-size: 0.875rem; color: var(--text-color);">
            <p style="font-size: 0.78rem; color: var(--text-color-light); margin-bottom: 10px;">
                以下示例计划：
                入睡<b>22:30</b> · 起床<b>6:30</b> · 目标 <b>8h</b><b>±45分</b> · 达标奖励 <b>+60分</b>
            </p>

            <div style="display:flex; gap:14px; font-size:0.72rem; color:var(--text-color-light); margin-bottom:8px; align-items:center; flex-wrap:wrap;">
                <span style="display:flex;align-items:center;gap:4px;">
                    <span style="display:inline-block;width:2px;height:15px;border-left:1.5px dashed #1a5276;"></span>计划入睡
                </span>
                <span style="display:flex;align-items:center;gap:4px;">
                    <span style="display:inline-block;width:2px;height:15px;border-left:1.5px dashed #27ae60;"></span>计划起床
                </span>
                <span>彩色条 = 实际睡眠时段</span>
            </div>

            <div class="sleep-bar-chart">
                <div class="sleep-bar-row" style="cursor:default;">
                    <div class="sleep-bar-label">昨天</div>
                    <div class="sleep-bar-container">
                        <div class="sleep-bar-marker bedtime" style="left:10%;"></div>
                        <div class="sleep-bar-marker waketime" style="left:90%;"></div>
                        <div class="sleep-bar level-1" style="left:5%;width:85%;">
                            <span class="sleep-bar-time">22:00</span>
                            <span class="sleep-bar-text">8h30m</span>
                            <span class="sleep-bar-time">6:30</span>
                        </div>
                    </div>
                    <div class="sleep-bar-reward level-1" style="min-width:38px;">+66分</div>
                </div>
                <div class="sleep-bar-row" style="cursor:default;">
                    <div class="sleep-bar-label">前天</div>
                    <div class="sleep-bar-container">
                        <div class="sleep-bar-marker bedtime" style="left:10%;"></div>
                        <div class="sleep-bar-marker waketime" style="left:90%;"></div>
                        <div class="sleep-bar level-3" style="left:15%;width:70%;">
                            <span class="sleep-bar-time">23:00</span>
                            <span class="sleep-bar-text">7h00m</span>
                            <span class="sleep-bar-time">6:00</span>
                        </div>
                    </div>
                    <div class="sleep-bar-reward level-3" style="min-width:38px;">−24分</div>
                </div>
                <div class="sleep-bar-time-axis">
                    <span class="axis-bedtime" style="left:calc(36px + (100% - 72px) * 0.10);">22:30</span>
                    <span class="axis-waketime" style="left:calc(36px + (100% - 72px) * 0.90);">6:30</span>
                </div>
            </div>

            <div style="border-left:3px solid #27ae60; padding:6px 10px; margin:10px 0 6px; background:rgba(39,174,96,0.06); border-radius:0 6px 6px 0; font-size:0.8rem; line-height:1.9;">
                <b>昨天 +66分</b>：早睡30分 ×0.2 = <span style="color:var(--color-earn);">+6</span>
                &nbsp;|&nbsp; 准时起床 = 0
                &nbsp;|&nbsp; 偏差30分 ≤ 容差45分 → <span style="color:var(--color-earn);">+60</span>
            </div>
            <div style="border-left:3px solid #f39c12; padding:6px 10px; margin:0 0 12px; background:rgba(243,156,18,0.06); border-radius:0 6px 6px 0; font-size:0.8rem; line-height:1.9;">
                <b>前天 −24分</b>：晚睡30分 ×0.5 = <span style="color:var(--color-spend);">−15</span>
                &nbsp;|&nbsp; 早起30分 ×0.2 = <span style="color:var(--color-earn);">+6</span>
                &nbsp;|&nbsp; 偏差60分超容差15分 → <span style="color:var(--color-spend);">−15</span>
            </div>

            <div style="font-size:0.72rem; color:var(--text-color-light); display:flex; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
                <span><span style="color:#27ae60;font-weight:700;">■</span> 奖励≥60分</span>
                <span><span style="color:#3498db;font-weight:700;">■</span> 奖励&lt;60分</span>
                <span><span style="color:#f39c12;font-weight:700;">■</span> 惩罚&lt;60分</span>
                <span><span style="color:#c0392b;font-weight:700;">■</span> 惩罚≥60分</span>
            </div>
            <p style="font-size:0.72rem; color:var(--text-color-light); margin:0;">⚙️ 各项倍率均可在睡眠设置中单独调整</p>
        </div>
    `);
}

// 记录解锁（由 Android 原生调用）
function onSleepUnlock() {
    if (!sleepState.isSleeping) return;
    sleepState.unlockCount++;
    saveSleepState();
    console.log('[Sleep] 解锁次数:', sleepState.unlockCount);
}

// 触发起床（由 Android 原生调用，或用户手动）
function onSleepWakeUp() {
    if (!sleepState.isSleeping) return;
    endSleep();
}

// ========== [v5.2.0] 屏幕时间管理 ==========

// [v7.2.1] 当前设备ID（用于多设备去重）
let currentDeviceId = null;
// [v7.2.1] 自动结算执行锁（防止并发）
let isAutoSettling = false;

let screenTimeSettings = {
    enabled: false,
    dailyLimitMinutes: 120,      // 默认 2 小时
    showCard: true,               // 是否显示首页卡片
    whitelistApps: [],            // 白名单应用包名
    lastSettleDate: null,         // 上次结算日期
    lastSettleTime: null,         // 上次结算时间戳
    enabledDate: null,            // 首次启用日期（用于判断是否需要补结算）
    settledDates: {},             // [v7.2.1] 已结算的日期列表，格式: { deviceId: [dates] }
    autoSettle: true,             // 自动结算（v5.10.0起固定开启）
    earnCategory: null,           // [v5.10.0] 节省时间归属分类（null时使用「系统」）
    spendCategory: null,          // [v5.10.0] 超出时间归属分类（null时使用「系统」）
    cardStyle: 'classic',         // [v5.10.0] 卡片样式：'classic' | 'glass'
    glassStrength: 100,           // [v6.4.x] 通透强度（百分比，影响透明度）
    glassBlurStrength: 100        // [v6.4.x] 模糊强度（百分比，影响 blur）
};

// [v7.2.3] 初始化设备ID（需要尽早调用，DAL.loadAll 之前）
