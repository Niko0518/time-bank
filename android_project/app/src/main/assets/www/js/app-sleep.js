// [v9.11.0] 睡眠云端写入退避：防止网络异常时 saveProfile 堆积阻塞队列
// 同一 key 5 秒内只允许一次云端写入，超出丢弃旧版本（latest-wins）
const __sleepCloudSaveDebounce = {};

// [v7.32.0] 保存睡眠设置 - 参考屏幕时间系统重构
function saveSleepSettings() {
    // [v7.11.2] 详细调试日志
    console.log('[saveSleepSettings] 开始保存, enabled:', sleepSettings.enabled);
    
    // [v7.9.6] 添加更新时间戳（用于云端恢复时的时间比较）
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
    
    // 同时保存到 localStorage（作为备份和网页端兼容）
    try {
        localStorage.setItem('sleepSettings', settingsJson);
        console.log('[saveSleepSettings] localStorage 保存成功');
    } catch (e) {
        console.error('[saveSleepSettings] localStorage 保存失败:', e);
    }
    
    // [v7.9.6] 调试日志：检查云端同步条件
    console.log('[saveSleepSettings] 条件检查:', {
        isLoggedIn: isLoggedIn(),
        profileId: DAL.profileId,
        currentDeviceId,
        enabled: sleepSettings.enabled
    });
    
    // [v7.32.0] 同步到云端 Profile，按设备ID区分配置
    // 结构: deviceSleepSettings: { deviceId1: {...}, deviceId2: {...} }
    if (isLoggedIn() && DAL.profileId && currentDeviceId) {
        const cloudSettings = {
            enabled: sleepSettings.enabled,
            plannedBedtime: sleepSettings.plannedBedtime,
            plannedWakeTime: sleepSettings.plannedWakeTime,
            napPlanStart: sleepSettings.napPlanStart || '12:00',   // [v9.36.5] 小睡计划时段跨设备同步
            napPlanEnd: sleepSettings.napPlanEnd || '14:00',       // [v9.36.5] 小睡计划时段跨设备同步
            targetDurationMinutes: sleepSettings.targetDurationMinutes,
            durationTolerance: sleepSettings.durationTolerance,
            toleranceReward: sleepSettings.toleranceReward,
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
            napMinDurationMinutes: sleepSettings.napMinDurationMinutes,
            napReward: sleepSettings.napReward,
            napAlarmEnabled: sleepSettings.napAlarmEnabled,
            napVibrateEnabled: sleepSettings.napVibrateEnabled,
            nightAlarmMode: sleepSettings.nightAlarmMode,
            sleepAlarmEnabled: sleepSettings.sleepAlarmEnabled,
            autoSyncSystemAlarm: sleepSettings.autoSyncSystemAlarm,
            earnCategory: sleepSettings.earnCategory,
            spendCategory: sleepSettings.spendCategory,
            countdownSeconds: sleepSettings.countdownSeconds,
            lastUpdated: sleepSettings.lastUpdated
        };
        
        console.log('[saveSleepSettings] 准备保存到云端:', cloudSettings);

        // [v9.8.0] 双写：deviceSleepSettings.${currentDeviceId}（向后兼容老版本）+ sleepSettingsShared（v9.8.0 跨设备权威，与任务系统一致）
        const updateKey = `deviceSleepSettings.${currentDeviceId}`;
        // [v9.11.0] 5s 退避 + latest-wins 保护：防止网络异常时 saveProfile 堆积阻塞队列
        const __sleepCK = 'sleepSettings';
        const __nowSS = Date.now();
        if (__nowSS - (__sleepCloudSaveDebounce[__sleepCK] || 0) < 5000) {
            console.log('[saveSleepSettings] 云端写入跳过：距上次写入不足 5s');
        } else {
            __sleepCloudSaveDebounce[__sleepCK] = __nowSS;
            DAL.saveProfile({ [updateKey]: _.set(cloudSettings), sleepSettingsShared: _.set(cloudSettings) })
                .then(() => console.log('[saveSleepSettings] 云端双写成功'))
                .catch(e => {
                    console.error('[saveSleepSettings] 云端同步失败:', e.message, e);
                    // 失败后清除退避标记，下次可立即重试（latest-wins 不依赖历史版本）
                    if (__sleepCloudSaveDebounce[__sleepCK] === __nowSS) {
                        delete __sleepCloudSaveDebounce[__sleepCK];
                    }
                });
        }
    } else {
        console.warn('[saveSleepSettings] 云端同步跳过 - 条件不满足');
    }
}

// [v7.32.0] 保存睡眠状态 - 参考屏幕时间系统重构
function saveSleepState() {
    // 更新本地时间戳
    sleepState.lastUpdated = Date.now();
    
    // [v7.11.2] 优先保存到 Android 原生存储
    if (window.Android?.saveSleepStateNative) {
        try {
            window.Android.saveSleepStateNative(JSON.stringify(sleepState));
            console.log('[saveSleepState] Android 原生保存成功');
        } catch (e) {
            console.error('[saveSleepState] Android 原生保存失败:', e);
        }
    }
    
    // 保存到 localStorage
    try {
        localStorage.setItem('sleepState', JSON.stringify(sleepState));
        console.log('[saveSleepState] localStorage 保存成功');
    } catch (e) {
        console.error('[saveSleepState] localStorage 保存失败:', e);
    }
    
    // [v9.8.0] 同步到云端 Profile，写 per-user 共享字段（与任务系统 tb_running 一致）
    // 旧：按设备ID分存 `deviceSleepState.${currentDeviceId}`（v7.32.0~v9.7.4 行为）
    // 新：写共享字段 `sleepStateShared`，所有端 watch 触发后能感知同一睡眠状态
    if (isLoggedIn() && DAL.profileId && currentDeviceId) {
        const sharedState = {
            isSleeping: sleepState.isSleeping,
            sleepStartTime: sleepState.sleepStartTime,
            lastUpdated: sleepState.lastUpdated,
            clientId: clientId  // [v9.8.0] 防本机回环（clientId 在 app-1.js L49 定义，与任务系统 tb_running 一致）
        };

        // [v9.11.0] 5s 退避 + latest-wins 保护
        const __sleepCK2 = 'sleepState';
        const __nowSS2 = Date.now();
        if (__nowSS2 - (__sleepCloudSaveDebounce[__sleepCK2] || 0) < 5000) {
            console.log('[saveSleepState] 云端写入跳过：距上次写入不足 5s');
        } else {
            __sleepCloudSaveDebounce[__sleepCK2] = __nowSS2;
            DAL.saveProfile({ sleepStateShared: _.set(sharedState) })
                .then(() => console.log('[saveSleepState] 云端同步成功:', sharedState.isSleeping ? '睡眠中' : '未睡眠'))
                .catch(e => {
                    console.error('[saveSleepState] 云端同步失败:', e.message);
                    // 失败后清除退避，下次可立即重试
                    if (__sleepCloudSaveDebounce[__sleepCK2] === __nowSS2) {
                        delete __sleepCloudSaveDebounce[__sleepCK2];
                    }
                });
        }
    } else {
        console.warn('[saveSleepState] 云端同步跳过 - 条件不满足');
    }
}

// [v10.0.0] 保存睡眠历史记录（纯云端化改造）
// 本地 sleepHistory 数组已废弃，权威源为 tb_transaction（通过 Transaction Watch 实时同步）
// 本函数仅保留：更新 sleepState.lastSleepRecord + 失效本地缓存
function saveSleepHistory(sleepRecord) {
    clearSleepHistoryCache();

    if (!sleepRecord || !sleepRecord.date) {
        console.warn('[saveSleepHistory] 无效的睡眠记录');
        return;
    }

    console.log('[saveSleepHistory] 已废弃本地/Profile写入，仅更新 lastSleepRecord:', sleepRecord.date, '类型:', sleepRecord.sleepType);
    sleepState.lastSleepRecord = sleepRecord;
}

// [v10.0.0] 加载睡眠历史记录（纯云端化：权威源为 tb_transaction，通过 Transaction Watch 同步）
function loadSleepHistory() {
    return getSleepHistory();
}

// [v10.0.0] 获取睡眠历史记录（从 transactions 数组实时过滤，带缓存）
let _sleepHistoryCache = null;
function getSleepHistory() {
    if (_sleepHistoryCache) return _sleepHistoryCache;
    if (!Array.isArray(transactions)) {
        _sleepHistoryCache = [];
        return _sleepHistoryCache;
    }
    _sleepHistoryCache = transactions
        .filter(t => t && t.sleepData && t.sleepData.sleepType)
        .map(t => {
            const startTime = Number(t.sleepData.startTime);
            const wakeTime = Number(t.sleepData.wakeTime);
            const durationMinutes = Number(t.sleepData.durationMinutes) || 0;
            const reward = (t.type === 'earn' ? 1 : -1) * Math.round((t.amount || 0) / 60);
            return {
                date: getSleepCycleDate(startTime),
                sleepStartTime: startTime,
                wakeTime: wakeTime,
                durationMinutes: durationMinutes,
                duration: durationMinutes * 60, // 【兼容 ai-service】秒为单位
                reward: reward,
                sleepType: t.sleepData.sleepType,
                details: t.sleepData.details || null,
                quality: t.sleepData.details ? (t.sleepData.details.quality || t.sleepData.details.score || 0) : 0,
                timestamp: Number(t.timestamp) || 0,
                txId: t.id
            };
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    return _sleepHistoryCache;
}

// [v7.32.0] 清除睡眠历史缓存
function clearSleepHistoryCache() {
    _sleepHistoryCache = null;
}

// [v7.11.3] 保存睡眠设置到云端共享字段
function saveSleepSettingsShared(reason = 'save') {
    if (!isLoggedIn() || !DAL.profileId) return;
    // [v9.11.0] 5s 退避
    const __ck3 = 'sleepSettingsShared';
    const __n3 = Date.now();
    if (__n3 - (__sleepCloudSaveDebounce[__ck3] || 0) < 5000) return;
    __sleepCloudSaveDebounce[__ck3] = __n3;
    const sharedSettings = { ...sleepSettings };
    if (!sharedSettings.lastUpdated) {
        sharedSettings.lastUpdated = new Date().toISOString();
        sleepSettings.lastUpdated = sharedSettings.lastUpdated;
    }
    DAL.saveProfile({ sleepSettingsShared: _.set(sharedSettings) })
        .then(() => console.log('[SleepSettingsShared] 云端同步成功, reason:', reason))
        .catch(e => {
            console.error('[SleepSettingsShared] 云端同步失败:', e.message);
            if (__sleepCloudSaveDebounce[__ck3] === __n3) delete __sleepCloudSaveDebounce[__ck3];
        });
}

// [v7.11.3] 保存睡眠状态到云端共享字段
// [v7.16.0] 统一睡眠状态，不再区分午睡/夜间
function saveSleepStateShared(reason = 'save') {
    if (!isLoggedIn() || !DAL.profileId) return;
    // [v9.11.0] 5s 退避
    const __ck4 = 'sleepStateShared';
    const __n4 = Date.now();
    if (__n4 - (__sleepCloudSaveDebounce[__ck4] || 0) < 5000) return;
    __sleepCloudSaveDebounce[__ck4] = __n4;
    const sharedState = {
        isSleeping: sleepState.isSleeping,
        sleepStartTime: sleepState.sleepStartTime,
        lastUpdated: sleepState.lastUpdated || Date.now()
    };
    DAL.saveProfile({ sleepStateShared: _.set(sharedState) })
        .then(() => console.log('[SleepStateShared] 云端同步成功, reason:', reason))
        .catch(e => {
            console.error('[SleepStateShared] 云端同步失败:', e.message);
            if (__sleepCloudSaveDebounce[__ck4] === __n4) delete __sleepCloudSaveDebounce[__ck4];
        });
}

// [v7.11.3] 从云端共享设置应用到本地
// [v7.33.8] 修复：全新安装时（localUpdated=0），旧格式云端数据不应覆盖代码默认值
function applySleepSettingsFromCloud(cloudSettings, source = 'cloud', force = false) {
    if (!cloudSettings) return false;
    const cloudUpdated = Date.parse(cloudSettings.lastUpdated || '') || 0;
    const localUpdated = Date.parse(sleepSettings.lastUpdated || '') || 0;
    
    // [v7.33.8] 全新安装保护：本地无时间戳时，不使用云端旧格式数据
    // 原因：云端 sleepSettingsShared 可能存有旧默认值，会覆盖代码新默认值
    if (localUpdated === 0 && cloudUpdated > 0 && !force) {
        console.log('[Sleep] 跳过云端设置（全新安装，保持代码默认值）, source:', source);
        return false;
    }
    
    if (force || cloudUpdated >= localUpdated) {
        sleepSettings = { ...sleepSettings, ...cloudSettings };
        // [v7.33.8] 应用云端值后立即写入本地，建立有效时间戳
        sleepSettings.lastUpdated = cloudSettings.lastUpdated || new Date().toISOString();
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
// [v9.8.0] 新增：clientId 防本机回环 + 检测"被其他端结束"自动触发 doSleepSettlement
function applySleepStateFromCloud(cloudState, source = 'cloud') {
    if (!cloudState) return false;

    // [v9.8.0] 防本机回环（参考 tb_running L4107-L4119，null-safe：旧数据无 clientId 字段时跳过判断）
    if (source === 'watch' && cloudState.clientId && clientId && cloudState.clientId === clientId) {
        console.log('[applySleepStateFromCloud] 跳过本机回环, clientId=', clientId);
        return false;
    }

    const cloudUpdated = cloudState.lastUpdated || 0;
    const localUpdated = sleepState.lastUpdated || 0;
    if (cloudUpdated > localUpdated) {
        // [v9.8.0] 捕获本地变更前状态，用于判断"被其他端结束"以触发自动结算
        const wasSleeping = sleepState.isSleeping === true;

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

        // [v9.8.0] 检测"被其他端结束睡眠"：watch/init 触发时，本地原本在睡眠中，云端变为未睡眠 → 触发 doSleepSettlement
        // 与 B 端 endSleep 行为一致，确保 A 端离网被结束后能正确结算入账
        if (wasSleeping && cloudState.isSleeping === false && sleepState.sleepStartTime) {
            console.log('[applySleepStateFromCloud] 检测到被其他端结束睡眠，触发自动结算');
            const startTime = sleepState.sleepStartTime;
            const wakeTime = Date.now();
            const durationMinutes = Math.floor((wakeTime - startTime) / 60000);
            const detectedType = (typeof detectSleepType === 'function')
                ? detectSleepType(startTime, wakeTime)
                : 'night';
            if (typeof doSleepSettlement === 'function') {
                doSleepSettlement(startTime, wakeTime, durationMinutes, detectedType);
            }
        }

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
    
    // [v9.8.0] 与云端同步：读 sleepSettingsShared / sleepStateShared 优先，回退 per-device
    if (isLoggedIn() && currentDeviceId) {
        // [v9.7.5-fix] 用 try/catch 包住整个云端同步块，防止局部异常导致 initSleepSettings 中断
        // 历史 bug：v9.8.0 改造时遗漏 localUpdated 变量声明，第 517 行抛 ReferenceError
        //   使整个 init 异常退出 → UI 未刷新（toggle 显示 false）→ 用户看到"开关被关闭"
        // 修复后：云端同步块异常时降级到"仅使用本地值"，不影响后续 UI 更新
        try {
        // [v9.8.0] 升级迁移 1：deviceSleepState[*] → sleepStateShared（取 lastUpdated 最大者，一次性）
        if (DAL.profileData?.deviceSleepState && !DAL.profileData?.sleepStateShared) {
            const latest = getLatestDeviceState(DAL.profileData.deviceSleepState);
            if (latest && latest.state) {
                console.log('[initSleepSettings] 升级迁移: deviceSleepState[' + latest.deviceId + '] → sleepStateShared');
                const migrated = {
                    isSleeping: latest.state.isSleeping,
                    sleepStartTime: latest.state.sleepStartTime,
                    lastUpdated: latest.state.lastUpdated || Date.now(),
                    clientId: 'migrated-from-device-' + latest.deviceId
                };
                DAL.saveProfile({ sleepStateShared: _.set(migrated) })
                    .catch(e => console.error('[initSleepSettings] 状态迁移失败:', e.message));
            }
        }

        // [v9.8.0] 升级迁移 2：deviceSleepSettings[*] → sleepSettingsShared（取 lastUpdated 最大者，一次性）
        if (DAL.profileData?.deviceSleepSettings && !DAL.profileData?.sleepSettingsShared) {
            const latest = getLatestDeviceSettings(DAL.profileData.deviceSleepSettings);
            if (latest && latest.settings) {
                console.log('[initSleepSettings] 升级迁移: deviceSleepSettings[' + latest.deviceId + '] → sleepSettingsShared');
                const migratedSettings = { ...latest.settings };
                if (!migratedSettings.lastUpdated) migratedSettings.lastUpdated = new Date().toISOString();
                DAL.saveProfile({ sleepSettingsShared: _.set(migratedSettings) })
                    .catch(e => console.error('[initSleepSettings] 设置迁移失败:', e.message));
                // 本地也应用
                sleepSettings = { ...sleepSettings, ...migratedSettings };
                sleepSettings.lastUpdated = migratedSettings.lastUpdated;
                localStorage.setItem('sleepSettings', JSON.stringify(sleepSettings));
                if (window.Android?.saveSleepSettingsNative) {
                    window.Android.saveSleepSettingsNative(JSON.stringify(sleepSettings));
                }
            }
        }

        // [v9.8.0] 读 sleepSettingsShared（v9.8.0 权威），回退 per-device
        const sharedSettings = DAL.profileData?.sleepSettingsShared;
        const deviceSettingsMap = DAL.profileData?.deviceSleepSettings || {};
        let cloudSleep = sharedSettings;
        let cloudFormat = sharedSettings ? 'shared' : null;
        if (!cloudSleep && deviceSettingsMap[currentDeviceId]) {
            cloudSleep = deviceSettingsMap[currentDeviceId];
            cloudFormat = 'deviceSpecific';
        }

        const cloudUpdated = cloudSleep ? (Date.parse(cloudSleep.lastUpdated || '') || 0) : 0;
        // [v9.7.5-fix] 补 v9.8.0 改造时遗漏的变量声明。原 v9.8.0 误用未声明变量，第 517 行 console.log 抛 ReferenceError
        const localUpdated = Date.parse(sleepSettings.lastUpdated || '') || 0;

        console.log('[initSleepSettings] 云端设备数: ' + Object.keys(deviceSettingsMap).length);
        console.log('[initSleepSettings] 云端配置: ' + (cloudSleep ? 'exists(format=' + cloudFormat + '),enabled=' + cloudSleep.enabled : 'null'));
        console.log('[initSleepSettings] 时间比较: local=' + localUpdated + ', cloud=' + cloudUpdated);

        // [v7.33.8] 全新安装保护：localUpdated=0 且云端格式为 deviceSpecific 时，不覆盖代码默认值
        if (!cloudSleep) {
            console.log('[initSleepSettings] 云端无此设备配置，使用代码默认值');
        } else if (localUpdated === 0 && cloudUpdated > 0) {
            if (cloudFormat === 'deviceSpecific') {
                // [Fix] 原 v7.33.8 行为是「保持代码默认值，等待升级迁移」，但实际上：
                //   1) v9.8.0 之前的迁移代码 [L535-552] 是 fire-and-forget 异步执行，用户在迁移完成前打开 UI 会看到默认值
                //   2) 新设备用户期望「继承同一账户已配置参数」，而不是看到默认值
                // 新行为：直接采用 deviceSpecific 云端值（与 shared 同等对待），并立即触发 shared 迁移
                console.log('[initSleepSettings] 全新安装 + per-device 格式，采用云端 deviceSleepSettings 并触发 shared 迁移');
                sleepSettings = { ...sleepSettings, ...cloudSleep };
                sleepSettings.lastUpdated = cloudSleep.lastUpdated || new Date().toISOString();
                localStorage.setItem('sleepSettings', JSON.stringify(sleepSettings));
                if (window.Android?.saveSleepSettingsNative) {
                    window.Android.saveSleepSettingsNative(JSON.stringify(sleepSettings));
                }
                // 立即触发 deviceSpecific → sleepSettingsShared 迁移（与 [L535-552] 等价，但同步执行避免竞争）
                try {
                    const migratedSettings = { ...cloudSleep };
                    if (!migratedSettings.lastUpdated) migratedSettings.lastUpdated = new Date().toISOString();
                    DAL.saveProfile({ sleepSettingsShared: _.set(migratedSettings) })
                        .then(() => console.log('[initSleepSettings] per-device → sleepSettingsShared 迁移完成（fix）'))
                        .catch(e => console.error('[initSleepSettings] per-device 迁移失败:', e.message));
                } catch (e) {
                    console.error('[initSleepSettings] per-device 迁移异常:', e.message);
                }
            } else {
                // [v9.8.0] 全新安装 + 云端是 shared 格式：升级用户场景，采用云端
                console.log('[initSleepSettings] 升级用户，采用云端 sleepSettingsShared');
                sleepSettings = { ...sleepSettings, ...cloudSleep };
                sleepSettings.lastUpdated = cloudSleep.lastUpdated || new Date().toISOString();
                localStorage.setItem('sleepSettings', JSON.stringify(sleepSettings));
                if (window.Android?.saveSleepSettingsNative) {
                    window.Android.saveSleepSettingsNative(JSON.stringify(sleepSettings));
                }
            }
        } else if (localUpdated > 0) {
            // [v7.33.8] 本地有有效设置
            console.log('[initSleepSettings] 本地有有效设置，保持本地配置');
            if (localUpdated > cloudUpdated + 1000) {
                console.log('[initSleepSettings] 本地明显较新，同步到云端');
                saveSleepSettings();
            }
        }

        // [v9.8.0] 读 sleepStateShared（v9.8.0 权威），回退 per-device
        const sharedState = DAL.profileData?.sleepStateShared;
        const deviceStateMap = DAL.profileData?.deviceSleepState || {};
        let cloudSleepState = sharedState;
        if (!cloudSleepState && deviceStateMap[currentDeviceId]) {
            cloudSleepState = deviceStateMap[currentDeviceId];
        }
        if (cloudSleepState) {
            console.log('[initSleepSettings] 从云端恢复睡眠状态 format=' + (sharedState ? 'shared' : 'deviceSpecific'));
            // [v9.8.0] 走统一入口 applySleepStateFromCloud（带 clientId 防回环 + 自动结算）
            applySleepStateFromCloud(cloudSleepState, 'init-' + (sharedState ? 'shared' : 'device'));
        }
        } catch (e) {
            // [v9.7.5-fix] 云端同步块异常时降级：本地 sleepSettings 已被原生/localStorage 加载，保留本地值即可
            console.error('[initSleepSettings] 云端同步块异常，已降级使用本地值:', e && (e.message || e));
        }
    } else {
        console.log('[initSleepSettings] 未登录或无profileData，使用本地');
    }

    // [v9.36.5] 一次性数据修复：夜间计划时间被小睡计划污染（本地 + 云端）
    // 根因：用户在睡眠计划设置弹窗手动误输小睡计划时间（12:00），plannedBedtime/WakeTime 被污染并同步云端
    // 修复：本地或云端（sleepSettingsShared）的计划时间与默认小睡计划（12:00/14:00）相同时视为污染，
    //       重置回夜间默认值 23:00/08:00 并强制写云端（清除退避，防止污染值残留云端被其他设备拉取）
    // 注：12:00 中午入睡不在夜间判定时段（20:00-06:00），不可能为真实的夜间计划，重置安全
    // _v2：初版修复的云端写入曾被 5s 退避跳过导致云端残留，此版同时检测云端并强制覆盖
    if (!localStorage.getItem('nightPlanDepolluted_v2')) {
        const __napStart = sleepSettings.napPlanStart || '12:00';
        const __napEnd = sleepSettings.napPlanEnd || '14:00';
        let __localFixed = false;
        if (sleepSettings.plannedBedtime === __napStart) {
            sleepSettings.plannedBedtime = '23:00';
            __localFixed = true;
        }
        if (sleepSettings.plannedWakeTime === __napEnd) {
            sleepSettings.plannedWakeTime = '08:00';
            __localFixed = true;
        }
        // 云端残留检测（v9.8.0 起 sleepSettingsShared 为权威格式）
        const __cloudShared = DAL.profileData?.sleepSettingsShared;
        const __cloudPolluted = !!(__cloudShared && (__cloudShared.plannedBedtime === __napStart || __cloudShared.plannedWakeTime === __napEnd));
        if (__localFixed || __cloudPolluted) {
            console.log('[initSleepSettings] 夜间计划时间污染修复: localFixed=' + __localFixed + ', cloudPolluted=' + __cloudPolluted + ' → 重置为 23:00/08:00 并覆盖云端');
            delete __sleepCloudSaveDebounce['sleepSettings']; // 清除 5s 退避，确保云端立即覆盖
            saveSleepSettings(); // 本地 + 云端全量覆盖，清除污染数据
        }
        localStorage.setItem('nightPlanDepolluted_v2', '1');
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
    
    // [v7.33.8] 全新安装保护：若本地无有效时间戳且已登录，立即用代码默认值写入云端新格式
    // 目的：抢占旧格式 sleepSettingsShared 的位置，防止后续 Watch 用旧格式覆盖
    if (isLoggedIn() && currentDeviceId) {
        const localTs = Date.parse(sleepSettings.lastUpdated || '') || 0;
        const deviceMap = DAL.profileData?.deviceSleepSettings || {};
        if (localTs === 0 && !deviceMap[currentDeviceId]) {
            console.log('[initSleepSettings] 全新安装，立即用代码默认值写入云端新格式');
            sleepSettings.lastUpdated = new Date().toISOString();
            saveSleepSettings(); // 写入 deviceSleepSettings.${deviceId}
        }
    }
    
    // [v7.32.0] 加载睡眠历史记录
    loadSleepHistory();
    
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
    // [v9.36.5] 午睡计划时段（仅条形图展示用）
    if (document.getElementById('napPlanStartInput')) document.getElementById('napPlanStartInput').value = sleepSettings.napPlanStart || '12:00';
    if (document.getElementById('napPlanEndInput')) document.getElementById('napPlanEndInput').value = sleepSettings.napPlanEnd || '14:00';
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
    // [v9.36.5] 午睡计划时段（仅条形图展示用，不影响收益）
    if (document.getElementById('napPlanStartInput')) {
        sleepSettings.napPlanStart = document.getElementById('napPlanStartInput').value || '12:00';
    }
    if (document.getElementById('napPlanEndInput')) {
        sleepSettings.napPlanEnd = document.getElementById('napPlanEndInput').value || '14:00';
    }
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
    
    // 添加实时计算事件
    ['manualSleepDate', 'manualSleepTime', 'manualWakeDate', 'manualWakeTime'].forEach(id => {
        document.getElementById(id).onchange = calculateManualSleepPreview;
    });
    
    // 初始计算（并重置为夜间睡眠类型）
    setManualSleepType('night');
    
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
    
    // 添加实时计算事件
    ['manualSleepDate', 'manualSleepTime', 'manualWakeDate', 'manualWakeTime'].forEach(id => {
        document.getElementById(id).onchange = calculateManualSleepPreview;
    });
    
    // 初始计算（并重置为夜间睡眠类型）
    setManualSleepType('night');
    
    modal.classList.remove('hidden');
}

function closeManualSleepModal() {
    document.getElementById('manualSleepModal').classList.add('hidden');
}

// [睡眠补录] 当前选择类型：night=夜间睡眠 / nap=小睡（默认夜间）
let manualSleepType = 'night';
// 切换补录类型并刷新预览（[v9.36.5] 悬浮滑块滑动指示）
function setManualSleepType(type) {
    manualSleepType = type;
    const switcher = document.getElementById('manualSleepTypeSwitcher');
    if (switcher) {
        switcher.querySelectorAll('.style-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.type === type);
        });
        const indicator = document.getElementById('manualSleepTypeIndicator');
        if (indicator) {
            const idx = type === 'nap' ? 1 : 0;
            indicator.style.transform = idx === 0 ? 'translateX(0)' : 'translateX(100%)';
        }
    }
    calculateManualSleepPreview();
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
    if (manualSleepType === 'nap') {
        // 小睡：仅达标判定（到时长达标时长即给奖励，否则无奖惩）
        const reached = durationMinutes >= sleepSettings.napDurationMinutes;
        let mult = 1;
        try { mult = (typeof getEarnMultiplier === 'function') ? getEarnMultiplier() : 1; } catch (e) {}
        const reward = reached ? Math.round(sleepSettings.napReward * mult) : 0;
        rewardEl.textContent = `${reached ? '+' : ''}${reward} 分钟`;
        rewardEl.style.color = reached ? '#4CAF50' : 'var(--text-color)';
    } else {
        const result = calculateSleepReward(sleepStartTime, wakeTimeMs);
        const isPositive = result.totalReward >= 0;
        rewardEl.textContent = `${isPositive ? '+' : ''}${result.totalReward} 分钟`;
        rewardEl.style.color = isPositive ? '#4CAF50' : '#F44336';
    }
}

// [v7.9.7] 提交手动睡眠记录
async function submitManualSleep() {
    // [v7.32.0-debug] Android 原生日志
    if (window.Android?.nativeLog) {
        window.Android.nativeLog('ManualSleep', 'submitManualSleep 开始');
    }
    console.log('[submitManualSleep] 开始手动添加睡眠记录');
    
    const sleepDate = document.getElementById('manualSleepDate').value;
    const sleepTime = document.getElementById('manualSleepTime').value;
    const wakeDate = document.getElementById('manualWakeDate').value;
    const wakeTime = document.getElementById('manualWakeTime').value;
    
    if (!sleepDate || !sleepTime || !wakeDate || !wakeTime) {
        showNotification('⚠️ 请填写完整时间', '', 'warning');
        if (window.Android?.nativeLog) {
            window.Android.nativeLog('ManualSleep', '时间填写不完整');
        }
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
    
    // [睡眠补录] 计算奖惩：按所选类型区分（夜间=完整奖惩；小睡=达标判定）
    const useNap = manualSleepType === 'nap';
    let result, isPositive, sleepType;
    if (useNap) {
        let mult = 1;
        try { mult = (typeof getEarnMultiplier === 'function') ? getEarnMultiplier() : 1; } catch (e) {}
        const napRewardTotal = durationMinutes >= sleepSettings.napDurationMinutes
            ? Math.round(sleepSettings.napReward * mult) : 0;
        result = { totalReward: napRewardTotal, napTargetMinutes: sleepSettings.napDurationMinutes };
        isPositive = true;
        sleepType = 'nap';
    } else {
        result = calculateSleepReward(sleepStartTime, wakeTimeMs);
        isPositive = result.totalReward >= 0;
        sleepType = 'night';
    }
    
    // [v7.32.0] 创建睡眠记录
    const sleepRecord = {
        date: cycleDate,
        sleepStartTime: sleepStartTime,
        wakeTime: wakeTimeMs,
        durationMinutes: durationMinutes,
        reward: result.totalReward,
        details: result,
        sleepType: sleepType,
        timestamp: Date.now(),
        manualEntry: true,
        note: note
    };
    
    // [v10.0.0] 更新 lastSleepRecord（本地快速引用，权威数据走 transaction）
    sleepState.lastSleepRecord = sleepRecord;
    clearSleepHistoryCache();

    console.log('[submitManualSleep] 调用 saveSleepState');
    if (window.Android?.nativeLog) {
        window.Android.nativeLog('ManualSleep', '调用 saveSleepState');
    }
    saveSleepState();
    
    // 创建交易记录
    const transaction = {
        id: generateId(),
        type: isPositive ? 'earn' : 'spend',
        taskName: '睡眠时间管理',
        amount: Math.abs(result.totalReward) * 60, // 转换为秒
        timestamp: wakeTimeMs, // 使用起床时间作为记录时间
        description: '📝 手动记录',
        note: `手动记录: ${new Date(sleepStartTime).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})} ~ ${new Date(wakeTimeMs).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})}`,
        category: isPositive ? (sleepSettings.earnCategory || '系统') : (sleepSettings.spendCategory || '系统'),
        isSystem: true,
        sleepData: {
            startTime: sleepStartTime,
            wakeTime: wakeTimeMs,
            durationMinutes: durationMinutes,
            sleepType: useNap ? 'nap' : 'night',
            details: result,
            manualEntry: true
        }
    };
    
    // [v7.32.0-fix] 关键修复：等待交易写入完成，确保数据持久化
    try {
        console.log('[submitManualSleep] 等待交易写入...');
        await addTransaction(transaction);
        console.log('[submitManualSleep] ✅ 交易写入成功');
    } catch (err) {
        console.error('[submitManualSleep] ❌ 交易写入失败:', err);
        if (window.Android?.nativeLog) {
            window.Android.nativeLog('ManualSleep', '交易写入失败: ' + err.message);
        }
        // 即使云端写入失败，本地数据已经添加，继续执行
    }

    // [v9.9.0] 余额由 addTransaction 内部更新，此处不再重复
    // [v7.9.8] 旧逻辑：手动补录后显式更新余额（v9.9.0 由 addTransaction 统一处理）

    // [v9.1.0] dailyChanges 由云端 tb_daily 权威管理，提交睡眠时云端已自动更新
    // 不再需要本地 recalculateDailyStats
    
    // [v8.2.9] 关键修复：try/finally 确保弹窗一定关闭
    // saveLocalCache() 失败时（网络异常、数据库超时等）弹窗也必须关闭
    try {
        // [v7.32.0-fix] 强制保存数据到本地和云端
        await saveLocalCache();
    } catch (e) {
        console.error('[submitManualSleep] 保存失败:', e);
    } finally {
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
    }
    
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
// [v7.33.9] 已废弃，卡片可见性由 enabled 直接控制
function toggleSleepCard() {
}

// 更新睡眠卡片可见性
// [v7.18.0] 修复：更新堆叠容器可见性
function updateSleepCardVisibility() {
    const sleepWrapper = document.getElementById('sleepCardWrapper');
    // [v7.33.9] 卡片可见性仅由系统开关控制
    const isWeb = !window.Android;
    const sleepVisible = isWeb ? true : sleepSettings.enabled;
    
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
    if (!sleepSettings.enabled) return;
    
    const wrapper = document.getElementById('sleepCardWrapper');
    const statusEl = document.getElementById('sleepCardStatus');
    const startBtn = document.getElementById('sleepStartBtn');
    const cancelBtn = document.getElementById('sleepCancelBtn');
    const addBtn = document.getElementById('sleepAddBtn');
    const durationRow = document.getElementById('sleepDurationRow');
    const chartEl = document.getElementById('sleepCardChart');
    
    if (!wrapper) return;
    
    // [v7.18.0] 经典模式：使用CSS变量设置动态渐变颜色
    // [v9.36.5] 小睡优先视图：按小睡收益配色，否则按夜间
    if (!document.body.classList.contains('glass-mode')) {
        // [v9.36.5] 与条形图同一选择器：小睡才用小睡配色，否则夜间配色（保证卡片背景与条形一致）
        const _sel = getSleepCardSelection();
        const colors = _sel.mode === 'nap'
            ? getSleepGradientColorsFromNap()
            : getSleepGradientColorsFromLastRecord();
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

// [v10.0.0] 获取指定日期的睡眠记录（纯云端化：权威源为 tb_transaction）
// [v7.9.0] 使用睡眠周期日期匹配（凌晨入睡算前一天）
function getSleepRecordForDate(dateStr) {
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

    const startTime = Number(tx.sleepData.startTime);
    const wakeTime = Number(tx.sleepData.wakeTime);
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
        details: tx.sleepData.details || null
    };
}

// 从云端同步睡眠状态，确保 isSleeping/sleepStartTime 为最新值
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
// [v9.36.5] 睡眠展示归属改为"结束时间"：今天结束的大小睡眠均显示为今天（仅影响展示，不动记账/记录逻辑）
function getSleepEndDateStr(tx) {
    let end = Number(tx.sleepData?.wakeTime);
    if (!end) {
        const st = Number(tx.sleepData?.startTime || tx.timestamp);
        end = st + (Number(tx.sleepData?.durationMinutes) || 0) * 60000;
    }
    return getLocalDateString(new Date(end));
}

// 按"结束日期"查询夜间睡眠记录（展示用）
function getSleepRecordByEndDate(dateStr) {
    if (typeof transactions === 'undefined' || !Array.isArray(transactions)) return null;
    const tx = [...transactions].reverse().find(t =>
        t && t.sleepData && t.sleepData.sleepType !== 'nap' && t.sleepData.startTime &&
        getSleepEndDateStr(t) === dateStr
    );
    if (!tx) return null;
    const startTime = Number(tx.sleepData.startTime);
    const wakeTime = Number(tx.sleepData.wakeTime);
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
        details: tx.sleepData.details || null
    };
}

// [v7.4.2] 获取最近一次已结束的夜间睡眠：优先"今天结束"，其次"昨天结束"
function getYesterdaySleepRecord() {
    const today = getSleepRecordByEndDate(getLocalDateString(new Date()));
    if (today) return today;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return getSleepRecordByEndDate(getLocalDateString(y));
}

// [v9.36.5] 睡眠卡片统一选择器：背景配色与条形图共用同一判定，保证二者永远一致
// 判定优先级：今天小睡 > 今天夜间(含补录) > 昨天小睡 > 昨天夜间 > 空
function getSleepCardSelection() {
    const now = new Date();
    const todayStr = getLocalDateString(now);
    const yesterdayStr = getLocalDateString(new Date(now.getTime() - 86400000));
    const napOf = (s) => transactions.filter(tx =>
        tx.sleepData?.sleepType === 'nap' && tx.type === 'earn' && getSleepEndDateStr(tx) === s
    );
    const todayNaps = napOf(todayStr);
    if (todayNaps.length) return { mode: 'nap', records: todayNaps };
    const todayNight = getSleepRecordByEndDate(todayStr);
    if (todayNight) return { mode: 'night', record: todayNight };
    const yesterdayNaps = napOf(yesterdayStr);
    if (yesterdayNaps.length) return { mode: 'nap', records: yesterdayNaps };
    const yesterdayNight = getSleepRecordByEndDate(yesterdayStr);
    if (yesterdayNight) return { mode: 'night', record: yesterdayNight };
    return { mode: 'empty' };
}

// [v9.36.5] 小睡优先：优先"今天结束"的小睡，其次"昨天结束"（仅达标结算 earn；不达标已废弃）
function getYesterdayNapRecords() {
    const todayStr = getLocalDateString(new Date());
    const byEnd = (s) => transactions.filter(tx =>
        tx.sleepData?.sleepType === 'nap' && tx.type === 'earn' &&
        getSleepEndDateStr(tx) === s
    );
    const todayNaps = byEnd(todayStr);
    if (todayNaps.length) return todayNaps;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return byEnd(getLocalDateString(y));
}

// [v9.36.5] 小睡优先：卡片背景配色按"最近小睡"收益套用夜间奖惩色系（与 getSleepGradientColorsFromLastRecord 同阈值）
function getSleepGradientColorsFromNap() {
    const isFlat = typeof getGradientStyle === 'function' && getGradientStyle() === 'flat';
    const naps = getYesterdayNapRecords();
    if (!naps.length) return getSleepGradientColorsFromLastRecord();
    let rewardMinutes = 0, isPenalty = false;
    naps.forEach(tx => {
        const raw = tx.amount != null ? Number(tx.amount) / 60 : Math.abs(Number(tx.reward) || 0);
        const v = Number.isFinite(raw) ? raw : 0;   // [v9.36.5] 防护 NaN
        rewardMinutes += v;
        if (tx.type === 'spend') isPenalty = true;
    });
    if (!isPenalty && rewardMinutes >= 60) return { start: '#27ae60', end: isFlat ? '#27ae60' : '#16a085', level: 1 };
    if (!isPenalty && rewardMinutes > 0) return { start: '#3498db', end: isFlat ? '#3498db' : '#1a6dad', level: 2 };
    if (isPenalty && rewardMinutes < 60) return { start: '#f39c12', end: isFlat ? '#f39c12' : '#d35400', level: 3 };
    return { start: '#e74c3c', end: isFlat ? '#e74c3c' : '#922b21', level: 4 };
}

// [v9.36.5] 小睡优先：卡片条形图仅展示昨日各次小睡（0~24h 时间轴，主蓝色）
function renderSleepCardNapBars(napRecords) {
    const fmt = (ts) => { const d = new Date(ts); return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0'); };

    // [v9.36.5] 标签改为类型（睡眠/小睡），不再显示日期归属
    let napDateLabel = '小睡';

    // [v9.36.5] 计划轴：用午睡计划时段(默认12:00~14:00)建轴，实际小睡条按真实钟点映射（与夜间23:00/08:00完全同款）
    const parseTimeToHours = (t) => { const p = (t || '12:00').split(':').map(Number); return (p[0] || 12) + (p[1] || 0) / 60; };
    const napPlanStartStr = sleepSettings.napPlanStart || '12:00';
    const napPlanEndStr = sleepSettings.napPlanEnd || '14:00';
    const planStartH = parseTimeToHours(napPlanStartStr);
    const planEndH = parseTimeToHours(napPlanEndStr);

    // 坐标轴范围：计划开始/结束各外扩15min（小睡时段短，用紧凑缓冲让计划虚线贴近两端、与夜间观感一致）
    const napAxisBufferH = 0.25;
    const axisStartHour = planStartH - napAxisBufferH;
    const axisEndHour = planEndH + napAxisBufferH;
    let axisTotalHours;
    if (axisEndHour < axisStartHour || (axisEndHour < 12 && axisStartHour > 12)) {
        axisTotalHours = (24 - axisStartHour) + axisEndHour;
    } else {
        axisTotalHours = axisEndHour - axisStartHour;
    }
    // 计划开始 / 结束（虚线）在轴内位置：与夜间完全同款公式，缓冲小时数从 napAxisBufferH 取
    // （夜间是 (1h/轴时长)，小睡缓冲 0.25h → 0.25/2.5=10%、2.25/2.5=90%，与夜间 9%/91% 观感一致）
    const planStartPct = (napAxisBufferH / axisTotalHours) * 100;
    const planEndPct = ((axisTotalHours - napAxisBufferH) / axisTotalHours) * 100;

    const timeToPercent = (timestamp) => {
        const d = new Date(timestamp);
        let hour = d.getHours() + d.getMinutes() / 60;
        if (hour < axisStartHour) hour += 24;
        let rel = hour - axisStartHour;
        rel = Math.max(0, Math.min(rel, axisTotalHours));
        return (rel / axisTotalHours) * 100;
    };

    // 汇总展示信息（仅展示，不影响收益）
    let totalMin = 0, rewardMin = 0;
    let isPenalty = false;
    napRecords.forEach(tx => {
        totalMin += tx.sleepData?.durationMinutes || 0;
        const raw = tx.amount != null ? Number(tx.amount) / 60 : (Number(tx.reward) || 0);
        const v = Number.isFinite(raw) ? raw : 0;   // [v9.36.5] 防护 NaN
        rewardMin += v;
        if (tx.type === 'spend') isPenalty = true;
    });
    const durStr = totalMin >= 60
        ? Math.floor(totalMin / 60) + 'h' + (totalMin % 60 ? totalMin % 60 + 'm' : '')
        : totalMin + 'm';
    const rewardStr = (rewardMin >= 0 ? '+' : '-') + (Math.abs(rewardMin) / 60).toFixed(1) + 'h';
    let barLevelClass;
    if (!isPenalty && rewardMin >= 60) barLevelClass = 'level-1';
    else if (!isPenalty && rewardMin > 0) barLevelClass = 'level-2';
    else barLevelClass = (rewardMin >= 60) ? 'level-4' : 'level-3';

    // 实际小睡条：按真实钟点映射到计划轴（左边会有未睡空余，右边可略微超出计划结束）
    let inner = '';
    napRecords.forEach(tx => {
        const stMs = new Date(tx.sleepData?.startTime || tx.timestamp).getTime();
        const dMin = tx.sleepData?.durationMinutes || 0;
        const wtMs = tx.sleepData?.wakeTime ? new Date(tx.sleepData.wakeTime).getTime() : (stMs + dMin * 60000);
        const s = timeToPercent(stMs), e = timeToPercent(wtMs);
        const w = Math.max(e - s, 4);
        const durTxt = dMin >= 60 ? Math.floor(dMin / 60) + 'h' + (dMin % 60 ? dMin % 60 + 'm' : '') : dMin + 'm';
        // [v9.36.5] 条过窄(实际小睡短)时省略中间时长文本，只留两端时间防拥挤；宽条才显示时长（同夜间）
        const midSpan = w >= 35 ? `<span class="sleep-card-bar-text">${durTxt}</span>` : '';
        inner += `<div class="sleep-card-bar ${barLevelClass}" style="left:${s}%;width:${w}%;">
            <span class="sleep-card-bar-time">${fmt(stMs)}</span>
            ${midSpan}
            <span class="sleep-card-bar-time">${fmt(wtMs)}</span>
        </div>`;
    });

    return `<div class="sleep-card-bar-row">
        <div class="sleep-card-bar-label">${napDateLabel}</div>
        <div class="sleep-card-bar-container">
            <div class="sleep-card-bar-marker bedtime" style="left:${planStartPct}%"></div>
            <div class="sleep-card-bar-marker waketime" style="left:${planEndPct}%"></div>
            ${inner}
        </div>
        <div class="sleep-card-bar-reward">${rewardStr}</div>
    </div>
    <div class="sleep-card-axis">
        <span style="left:calc(28px + (100% - 60px) * ${planStartPct / 100})">${napPlanStartStr}</span>
        <span style="left:calc(28px + (100% - 60px) * ${planEndPct / 100})">${napPlanEndStr}</span>
    </div>`;
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

    // [v9.36.5] 统一选择器：背景与条形图同一判定。小睡→小睡条形图；夜间→夜间条形图；空→空态
    const _sel = getSleepCardSelection();
    if (_sel.mode === 'nap') {
        chartEl.innerHTML = renderSleepCardNapBars(_sel.records);
        return;
    }
    const record = _sel.mode === 'night' ? _sel.record : null;

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
        // [v9.36.5] 标签改为类型「睡眠」，不再显示日期归属
        const sleepDateLabel = '睡眠';

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
        html += `<div class="sleep-card-bar-label">${sleepDateLabel}</div>`;
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
        html += `<div class="sleep-card-empty">最近无睡眠记录</div>`;
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
// footerMode='known'：默认，仅"知道了"（7日条形图点行等场景）
// footerMode='custom'：睡眠卡片进入的"昨日睡眠"视图 —— 底部"查看最近7日/更改睡眠计划"，顶部带关闭按钮
// 该函数始终复用原报告弹窗的居中排版（大😴 +「睡眠报告(日期)」标题），仅底部按钮与关闭按钮因场景不同
function showSleepReportModal(record, footerMode = 'known') {
    // 防御性检查：确保记录数据完整
    if (!record || !record.sleepStartTime || !record.wakeTime) {
        // 自定义模式无记录时展示空态（含关闭+两操作按钮），其余场景维持原行为（静默跳过）
        if (footerMode === 'custom') { showEmptySleepOverview(); return; }
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

    // [v7.13.0] 顶部：原报告弹窗的居中排版（大😴 + 标题），右上角按场景加关闭按钮
    // custom（睡眠卡片进入）带右上角关闭按钮；known（条形图点行）维持原样
    const closeBtnHtml = footerMode === 'custom'
        ? `<button class="close-btn" style="position:absolute; top:10px; right:10px;" onclick="document.getElementById('sleepReportModal').remove()">×</button>`
        : '';
    // 底部按钮：custom 为查看7日/改计划两操作按钮；known 维持"知道了"
    const footerHtml = footerMode === 'custom'
        ? `<div style="display:flex; gap:8px; margin-top:16px;">
                <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('sleepReportModal').remove(); showNightSleepDetailModal();">查看最近7日</button>
                <button class="btn btn-primary" style="flex:1;" onclick="document.getElementById('sleepReportModal').remove(); showSleepSettingsModal();">更改睡眠计划</button>
            </div>`
        : `<button class="btn btn-primary" onclick="document.getElementById('sleepReportModal').remove()" style="width: 100%; margin-top: 16px;">知道了</button>`;

    const r = result || {};

    // 数值格式化工具（局部）
    // 总分：中文时分形式（如 +1小时15分 / -30分）
    function fmtHzm(m) {
        const neg = m < 0, a = Math.abs(m);
        const h = Math.floor(a / 60), mi = a % 60;
        let s = h > 0 ? (h + '小时') : '';
        if (mi > 0 || h === 0) s += mi + '分';
        if (s === '') s = '0分';
        return (neg ? '-' : (m > 0 ? '+' : '')) + s;
    }
    // 时长格式：HhMm（如 7h55m / 8h / 30m）
    function fmtDurCompact(m) {
        const h = Math.floor(m / 60), mi = m % 60;
        let s = h > 0 ? h + 'h' : '';
        if (mi > 0) s += mi + 'm';
        else if (h === 0) s = mi + 'm';
        return s;
    }
    // 分项结果（分钟尾缀，取整显示，保证不出现小数）
    function resText(v) { const rv = Math.round(v); return rv > 0 ? '+' + rv + 'm' : (rv < 0 ? rv + 'm' : '0m'); }
    function resCls(v) { return v > 0 ? 'good' : (v < 0 ? 'bad' : 'ok'); }

    // 基础总分 = 各分项【四舍五入后】之和，与结果列逐项取整严格一致（不出现小数、不溢出误差）
    const baseTotal = Math.round(r.bedtimeReward || 0) + Math.round(r.wakeReward || 0) + Math.round(r.toleranceBonus || 0) + Math.round(r.durationReward || 0);
    const totalClr = baseTotal >= 0 ? '#4CAF50' : '#F44336';

    // 倍率徽标【颜色接口】：颜色由 main.css 变量 --mult-turbo / --mult-balance 统一控制
    // 奖励取获取倍率、惩罚取消费倍率；未来均衡消费倍率启用后会自动生效
    let multHtml = '';
    try {
        const tbOn = (typeof turboMode !== 'undefined' && turboMode.enabled);
        const blOn = (typeof balanceMode !== 'undefined' && balanceMode.enabled);
        const isReward = baseTotal >= 0;
        const getter = isReward ? getEarnMultiplier : getSpendMultiplier;
        // 首选对应倍率函数；缺失时按模式回退取倍率值
        let mv = (typeof getter === 'function') ? getter() : null;
        if (mv == null) mv = tbOn ? 1.5 : (blOn ? getBalanceMultiplier() : 1.0);
        const badgeColor = tbOn ? 'var(--mult-turbo)' : 'var(--mult-balance)';
        const badgeCss = 'display:inline-block;background:' + badgeColor + ';color:#fff;font-size:0.8rem;font-weight:600;padding:2px 12px;border-radius:999px;';
        // 不乘入数值，仅色彩+数值提示；turbo 恒显示，均衡仅在确有倍率效果时显示
        if (tbOn) {
            multHtml = `<span style="${badgeCss}">×${mv}</span>`;
        } else if (blOn && mv !== 1) {
            multHtml = `<span style="${badgeCss}">×${mv}</span>`;
        }
    } catch (e) {}

    // 时长行：计划(含容差写进计划列) 与 实际
    const planDur = fmtDurCompact(sleepSettings.targetDurationMinutes) || '8h';
    const planTol = '±' + (sleepSettings.durationTolerance || 0) + 'm';
    const actualDur = fmtDurCompact(durationMinutes) || '0m';

    function rowHtml(name, plan, actual, val, tolText) {
        const color = val > 0 ? '#4CAF50' : (val < 0 ? '#F44336' : 'var(--text-color-light)');
        const nowrap = 'white-space:nowrap;';
        const tolSpan = tolText ? `<span style="color:var(--text-color-light)">${tolText}</span>` : '';
        return `<tr>
            <td style="text-align:center;padding:12px 4px;font-weight:600;font-size:0.9rem;${nowrap}">${name}</td>
            <td style="text-align:center;padding:12px 4px;font-size:0.9rem;${nowrap}">${plan}${tolSpan}</td>
            <td style="text-align:center;padding:12px 4px;font-weight:600;font-size:0.9rem;${nowrap}">${actual}</td>
            <td style="text-align:center;padding:12px 4px;font-weight:700;font-size:0.9rem;${nowrap}color:${color};">${resText(val)}</td>
        </tr>`;
    }

    // 项目列去除 emoji，节省空间拓宽内容列；时长容差并入计划列且不换行
    const rowsHtml =
        rowHtml('入睡', sleepSettings.plannedBedtime, startStr, r.bedtimeReward || 0) +
        rowHtml('起床', sleepSettings.plannedWakeTime, wakeStr, r.wakeReward || 0) +
        rowHtml('时长', planDur, actualDur, (r.toleranceBonus > 0 ? r.toleranceBonus : (r.durationReward || 0)), planTol);

    const tableHtml = `
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;margin-top:4px;">
            <thead><tr>
                <th style="text-align:center;color:var(--text-color-light);padding:8px;border-bottom:1px solid var(--text-color-light);white-space:nowrap;">项目</th>
                <th style="text-align:center;color:var(--text-color-light);padding:8px;border-bottom:1px solid var(--text-color-light);white-space:nowrap;">计划</th>
                <th style="text-align:center;color:var(--text-color-light);padding:8px;border-bottom:1px solid var(--text-color-light);white-space:nowrap;">实际</th>
                <th style="text-align:center;color:var(--text-color-light);padding:8px;border-bottom:1px solid var(--text-color-light);white-space:nowrap;">结果</th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
        </table>`;

    const totalHtml = `<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin:14px 0 4px;">
        <span style="font-size:2rem;font-weight:700;color:${totalClr};">${fmtHzm(baseTotal)}</span>
        ${multHtml}
    </div>`;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'sleepReportModal';
    modal.innerHTML = `
        <div class="modal-content" style="text-align: center; max-width: 380px; position: relative;">
            ${closeBtnHtml}
            <div style="font-size: 2.4rem; margin-bottom: 6px;">😴</div>
            <h3 style="margin-bottom: 6px;">睡眠报告（${dateLabel}）</h3>
            <p class="text-muted" style="margin-bottom: 10px;">${startStr} ~ ${wakeStr} · ${durationStr}</p>
            ${totalHtml}
            ${tableHtml}
            ${footerHtml}
        </div>
    `;
    document.body.appendChild(modal);
}

// ==================== [v9.36.5] 睡眠卡片弹窗：小睡优先 + 夜间/小睡报告左右切换 ====================
// 与夜间报告弹窗样式完全一致；标题右侧 ‹ › 切换（复用近7日切换按钮样式）
let _sleepCardReportCtx = { hasNight: false, hasNap: false, napRecords: [], nightRecord: null };

function showSleepCardReportModal() {
    const napRecords = getYesterdayNapRecords();
    const nightRecord = getYesterdaySleepRecord();
    _sleepCardReportCtx = {
        hasNight: !!nightRecord,
        hasNap: napRecords.length > 0,
        napRecords: napRecords,
        nightRecord: nightRecord
    };
    // 跟随卡片小睡优先：昨日白天有小睡 → 初始小睡报告；否则夜间报告
    renderSleepCardReportModal(_sleepCardReportCtx.hasNap ? 'nap' : 'night');
}

function renderSleepCardReportModal(mode) {
    document.getElementById('sleepReportModal')?.remove();
    const ctx = _sleepCardReportCtx;
    ctx.currentMode = mode;

    let bodyHtml;
    if (mode === 'nap') {
        bodyHtml = ctx.hasNap ? buildSleepCardNapReportHtml() : buildSleepCardEmptyHtml('💤', '小睡', 'nap');
    } else {
        bodyHtml = ctx.hasNight ? buildSleepCardNightReportHtml() : buildSleepCardEmptyHtml('🌙', '夜间睡眠', 'night');
    }

    // [v9.36.5] 打开逻辑对齐：小睡报告 → 打开近7天小睡视图；夜间报告 → 近7天夜间视图
    const initWeekMode = mode === 'nap' ? 'nap' : 'night';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'sleepReportModal';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
        <div class="modal-content" style="text-align: center; max-width: 380px; position: relative;">
            <button class="close-btn" style="position:absolute; top:10px; right:10px;" onclick="document.getElementById('sleepReportModal').remove()">×</button>
            ${bodyHtml}
            <div style="display:flex; gap:8px; margin-top:16px;">
                <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('sleepReportModal').remove(); showNightSleepDetailModal('${initWeekMode}');">查看最近7日</button>
                <button class="btn btn-primary" style="flex:1;" onclick="document.getElementById('sleepReportModal').remove(); showSleepSettingsModal();">更改睡眠计划</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

function switchSleepCardReport() {
    const ctx = _sleepCardReportCtx;
    renderSleepCardReportModal(_sleepCardReportCtx.currentMode === 'nap' ? 'night' : 'nap');
}

// 标题右侧 ⇄ 双箭头切换按钮（与"最近任务右侧/报告页每日详情"同款 ⇄ 样式，点击切换）
// 另一侧无数据时禁用
function sleepReportSwitchBtn(mode) {
    const targetMode = mode === 'nap' ? 'night' : 'nap';
    const disabled = targetMode === 'night' ? !_sleepCardReportCtx.hasNight : !_sleepCardReportCtx.hasNap;
    const style = disabled ? 'opacity:.35;pointer-events:none;' : '';
    const title = targetMode === 'night' ? '切换到夜间睡眠报告' : '切换到小睡报告';
    return `<button class="view-switch-btn" onclick="switchSleepCardReport()" title="${title}" style="${style}">⇄</button>`;
}

// 标题行（大图标 + 标题，右侧 ⇄ 切换按钮，与旧报告同款排版）
function sleepReportTitleHtml(icon, text, mode) {
    return `
        <div style="font-size: 2.4rem; margin-bottom: 6px;">${icon}</div>
        <div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:6px;">
            <h3 style="margin:0;">${text}</h3>
            ${sleepReportSwitchBtn(mode)}
        </div>`;
}

// 结算数值工具（与 showSleepReportModal 内同款）
function sleepCardFmtHzm(m) {
    const neg = m < 0, a = Math.abs(m);
    const h = Math.floor(a / 60), mi = a % 60;
    let s = h > 0 ? (h + '小时') : '';
    if (mi > 0 || h === 0) s += mi + '分';
    if (s === '') s = '0分';
    return (neg ? '-' : (m > 0 ? '+' : '')) + s;
}
function sleepCardFmtDurCompact(m) {
    const h = Math.floor(m / 60), mi = m % 60;
    let s = h > 0 ? h + 'h' : '';
    if (mi > 0) s += mi + 'm';
    else if (h === 0) s = mi + 'm';
    return s;
}
function sleepCardResText(v) { const rv = Math.round(v); return rv > 0 ? '+' + rv + 'm' : (rv < 0 ? rv + 'm' : '0m'); }

function sleepCardRowHtml(name, plan, actual, val) {
    const color = val > 0 ? '#4CAF50' : (val < 0 ? '#F44336' : 'var(--text-color-light)');
    const nowrap = 'white-space:nowrap;';
    return `<tr>
        <td style="text-align:center;padding:12px 4px;font-weight:600;font-size:0.9rem;${nowrap}">${name}</td>
        <td style="text-align:center;padding:12px 4px;font-size:0.9rem;${nowrap}">${plan}</td>
        <td style="text-align:center;padding:12px 4px;font-weight:600;font-size:0.9rem;${nowrap}">${actual}</td>
        <td style="text-align:center;padding:12px 4px;font-weight:700;font-size:0.9rem;${nowrap}color:${color};">${sleepCardResText(val)}</td>
    </tr>`;
}

// 倍率徽标（与夜间弹窗一致：turbo/均衡）
function sleepCardMultHtml(isReward) {
    let multHtml = '';
    try {
        const tbOn = (typeof turboMode !== 'undefined' && turboMode.enabled);
        const blOn = (typeof balanceMode !== 'undefined' && balanceMode.enabled);
        const getter = isReward ? getEarnMultiplier : getSpendMultiplier;
        let mv = (typeof getter === 'function') ? getter() : null;
        if (mv == null) mv = tbOn ? 1.5 : (blOn ? getBalanceMultiplier() : 1.0);
        const badgeColor = tbOn ? 'var(--mult-turbo)' : 'var(--mult-balance)';
        const badgeCss = 'display:inline-block;background:' + badgeColor + ';color:#fff;font-size:0.8rem;font-weight:600;padding:2px 12px;border-radius:999px;';
        if (tbOn) multHtml = `<span style="${badgeCss}">×${mv}</span>`;
        else if (blOn && mv !== 1) multHtml = `<span style="${badgeCss}">×${mv}</span>`;
    } catch (e) {}
    return multHtml;
}

// 日期标签（今日/昨日/M月D日 + 周几），与夜间报告一致
function sleepCardDateLabel(dateStr, ts) {
    const today = getLocalDateString(new Date());
    const yesterday = getLocalDateString(new Date(Date.now() - 86400000));
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekDay = weekDays[new Date(ts).getDay()];
    if (dateStr === today) return `今日 · ${weekDay}`;
    if (dateStr === yesterday) return `昨日 · ${weekDay}`;
    const [, m, d] = dateStr.split('-');
    return `${parseInt(m)}月${parseInt(d)}日 · ${weekDay}`;
}

// [v9.36.5] 小睡报告正文（聚合当日各次小睡，表格沿用夜间三行结构）
function buildSleepCardNapReportHtml() {
    const naps = _sleepCardReportCtx.napRecords;
    const metTarget = Math.max(5, Math.min(240, Number(sleepSettings.napDurationMinutes) || 30));
    const rewardPer = Number(sleepSettings.napReward) || 15;

    let totalMin = 0, metCount = 0, baseRewardMin = 0;
    let earliestStartMs = Infinity, latestWakeMs = 0;
    naps.forEach(tx => {
        const dMin = tx.sleepData?.durationMinutes || 0;
        totalMin += dMin;
        const st = Number(tx.sleepData?.startTime || tx.timestamp);
        const wt = Number(tx.sleepData?.wakeTime) || (st + dMin * 60000);
        earliestStartMs = Math.min(earliestStartMs, st);
        latestWakeMs = Math.max(latestWakeMs, wt);
        if (dMin >= metTarget) { metCount++; baseRewardMin += Math.round(rewardPer); }
    });

    // 倍率（奖励侧）
    const multHtml = sleepCardMultHtml(true);
    let mult = 1;
    try {
        const getter = (typeof getEarnMultiplier === 'function') ? getEarnMultiplier() : null;
        if (getter != null) mult = getter;
        else {
            const tbOn = (typeof turboMode !== 'undefined' && turboMode.enabled);
            mult = tbOn ? 1.5 : 1.0;
        }
    } catch (e) {}
    baseRewardMin = _applySleepCardMult(baseRewardMin, mult);

    const startStr = formatSleepTimeHM(earliestStartMs);
    const wakeStr = formatSleepTimeHM(latestWakeMs);
    const dateStr = getLocalDateString(new Date(latestWakeMs));
    const dateLabel = sleepCardDateLabel(dateStr, latestWakeMs);
    const actualDur = sleepCardFmtDurCompact(totalMin) || '0m';
    const planDur = sleepCardFmtDurCompact(metTarget) || '30m';

    const rowsHtml =
        sleepCardRowHtml('入睡', sleepSettings.napPlanStart || '12:00', startStr, 0) +
        sleepCardRowHtml('起床', sleepSettings.napPlanEnd || '14:00', wakeStr, 0) +
        sleepCardRowHtml('时长', planDur, actualDur, baseRewardMin);

    const tableHtml = `
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;margin-top:4px;">
            <thead><tr>
                <th style="text-align:center;color:var(--text-color-light);padding:8px;border-bottom:1px solid var(--text-color-light);white-space:nowrap;">项目</th>
                <th style="text-align:center;color:var(--text-color-light);padding:8px;border-bottom:1px solid var(--text-color-light);white-space:nowrap;">计划</th>
                <th style="text-align:center;color:var(--text-color-light);padding:8px;border-bottom:1px solid var(--text-color-light);white-space:nowrap;">实际</th>
                <th style="text-align:center;color:var(--text-color-light);padding:8px;border-bottom:1px solid var(--text-color-light);white-space:nowrap;">结果</th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
        </table>`;

    const totalClr = baseRewardMin > 0 ? '#4CAF50' : 'var(--text-color-light)';
    const totalHtml = `<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin:14px 0 4px;">
        <span style="font-size:2rem;font-weight:700;color:${totalClr};">${sleepCardFmtHzm(baseRewardMin)}</span>
        ${multHtml}
    </div>`;

    return sleepReportTitleHtml('💤', `小睡报告（${dateLabel}）`, 'nap') +
        `<p class="text-muted" style="margin-bottom:10px;">${startStr} ~ ${wakeStr} · ${sleepCardFmtDurCompact(totalMin) || '0m'}</p>` +
        totalHtml + tableHtml;
}

// 倍率应用到奖励（round 到分钟）
function _applySleepCardMult(minutes, mult) {
    if (mult == null || mult === 1) return minutes;
    return Math.round(minutes * mult);
}

// [v9.36.5] 夜间报告正文（与旧 showSleepReportModal 生成逻辑完全一致）
function buildSleepCardNightReportHtml() {
    const record = _sleepCardReportCtx.nightRecord;
    const result = rebuildSleepResultFromRecord(record);
    const durationMinutes = record.durationMinutes ||
        Math.floor((record.wakeTime - record.sleepStartTime) / 60000);

    const startStr = formatSleepTimeHM(record.sleepStartTime);
    const wakeStr = formatSleepTimeHM(record.wakeTime);

    const sleepDate = record.date || getSleepCycleDate(record.sleepStartTime);
    const dateLabel = sleepCardDateLabel(sleepDate, record.sleepStartTime);

    const r = result || {};
    const baseTotal = Math.round(r.bedtimeReward || 0) + Math.round(r.wakeReward || 0) + Math.round(r.toleranceBonus || 0) + Math.round(r.durationReward || 0);
    const totalClr = baseTotal >= 0 ? '#4CAF50' : '#F44336';
    const multHtml = sleepCardMultHtml(baseTotal >= 0);

    const planDur = sleepCardFmtDurCompact(sleepSettings.targetDurationMinutes) || '8h';
    const planTol = '±' + (sleepSettings.durationTolerance || 0) + 'm';
    const actualDur = sleepCardFmtDurCompact(durationMinutes) || '0m';

    const rowsHtml =
        sleepCardRowHtml('入睡', sleepSettings.plannedBedtime, startStr, r.bedtimeReward || 0) +
        sleepCardRowHtml('起床', sleepSettings.plannedWakeTime, wakeStr, r.wakeReward || 0) +
        sleepCardRowHtml('时长', planDur, actualDur, (r.toleranceBonus > 0 ? r.toleranceBonus : (r.durationReward || 0)));

    const tableHtml = `
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;margin-top:4px;">
            <thead><tr>
                <th style="text-align:center;color:var(--text-color-light);padding:8px;border-bottom:1px solid var(--text-color-light);white-space:nowrap;">项目</th>
                <th style="text-align:center;color:var(--text-color-light);padding:8px;border-bottom:1px solid var(--text-color-light);white-space:nowrap;">计划</th>
                <th style="text-align:center;color:var(--text-color-light);padding:8px;border-bottom:1px solid var(--text-color-light);white-space:nowrap;">实际</th>
                <th style="text-align:center;color:var(--text-color-light);padding:8px;border-bottom:1px solid var(--text-color-light);white-space:nowrap;">结果</th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
        </table>`;

    const totalHtml = `<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin:14px 0 4px;">
        <span style="font-size:2rem;font-weight:700;color:${totalClr};">${sleepCardFmtHzm(baseTotal)}</span>
        ${multHtml}
    </div>`;

    return sleepReportTitleHtml('😴', `睡眠报告（${dateLabel}）`, 'night') +
        `<p class="text-muted" style="margin-bottom:10px;">${startStr} ~ ${wakeStr} · ${sleepCardFmtDurCompact(durationMinutes) || '0m'}</p>` +
        totalHtml + tableHtml;
}

// 空态（如切换到的类别无记录）
function buildSleepCardEmptyHtml(icon, name, mode) {
    return sleepReportTitleHtml(icon, `${name}`, mode) +
        `<p class="text-muted" style="margin-bottom:8px;">${name}暂无记录</p>`;
}

// [睡眠卡片] 昨日无记录时的空态概览弹窗（复用 report 弹窗 id，含关闭 + 两操作按钮）
function showEmptySleepOverview() {
    document.getElementById('sleepReportModal')?.remove();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'sleepReportModal';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
        <div class="modal-content" style="text-align: center; max-width: 380px;">
            <div class="modal-header">
                <h3 class="modal-title">🌙 昨日睡眠</h3>
                <button class="close-btn" onclick="document.getElementById('sleepReportModal')?.remove()">×</button>
            </div>
            <div style="font-size:2rem; margin:8px 0;">😴</div>
            <p class="text-muted" style="margin-bottom: 8px;">昨日暂无睡眠记录</p>
            <div style="display:flex; gap:8px; margin-top:16px;">
                <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('sleepReportModal')?.remove(); showNightSleepDetailModal();">查看最近7日</button>
                <button class="btn btn-primary" style="flex:1;" onclick="document.getElementById('sleepReportModal')?.remove(); showSleepSettingsModal();">更改睡眠计划</button>
            </div>
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
        // [v9.36.5] 展开状态，点击 body 显示睡眠报告（小睡优先 + 夜间/小睡左右切换）
        showSleepCardReportModal();
        return;
    }

    // [v9.7.4] 修复：睡眠卡片展开/收起后，同步堆叠容器的 st-expanded
    // 避免"无屏幕时间 + 收起"场景下容器残留 12px 上 margin 造成视觉间隙。
    // updateStackedContainerVisibility 定义在 app-systems.js（加载顺序在 app-sleep.js 之后），
    // 但用户点击时所有脚本已加载完毕；typeof 守卫以防未来加载顺序变化。
    if (typeof updateStackedContainerVisibility === 'function') {
        updateStackedContainerVisibility();
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
    
    // [v9.36.4] 行为工坊：用户自定义「开始睡眠」时触发剧本（默认无动作，不打扰现有逻辑）
    if (window.TimeBot && typeof window.TimeBot.fireScene === 'function') {
        try { window.TimeBot.fireScene('onSleep'); } catch (e) { /* 忽略 */ }
    }
    
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
    // [v9.34.0] 与结算保持一致的统一倍率：净奖励走获取倍率，净惩罚走消费倍率
    if (nightResult.totalReward !== 0) {
        const mult = nightResult.totalReward > 0 ? getEarnMultiplier() : getSpendMultiplier();
        if (mult !== 1.0) nightResult.totalReward = Math.round(nightResult.totalReward * mult);
    }
    const napRewardBase = durationMinutes >= sleepSettings.napDurationMinutes ? sleepSettings.napReward : 0;
    const napMultiplier = getEarnMultiplier();
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
// [v7.32.0] 重构：添加睡眠历史记录保存
async function doSleepSettlement(startTime, wakeTime, durationMinutes, selectedType) {
    // [v7.32.0-debug] Android 原生日志
    if (window.Android?.nativeLog) {
        window.Android.nativeLog('SleepSettlement', 'doSleepSettlement 开始, 类型: ' + selectedType);
        window.Android.nativeLog('SleepSettlement', 'startTime: ' + startTime + ', wakeTime: ' + wakeTime);
    }
    console.log('[doSleepSettlement] 开始结算, 类型:', selectedType, '时长:', durationMinutes, '分钟');
    
    // 重置状态
    sleepState.isSleeping = false;
    sleepState.sleepStartTime = null;
    
    // [v9.36.4] 行为工坊：用户自定义「苏醒」时触发剧本（默认无动作，不打扰现有逻辑）
    if (window.TimeBot && typeof window.TimeBot.fireScene === 'function') {
        try { window.TimeBot.fireScene('onWake'); } catch (e) { /* 忽略 */ }
    }
    
    if (selectedType === 'night') {
        console.log('[doSleepSettlement] 处理夜间睡眠结算');
        if (window.Android?.nativeLog) {
            window.Android.nativeLog('SleepSettlement', '处理夜间睡眠结算');
        }
        // 夜间睡眠：使用完整奖惩计算
        const result = calculateSleepReward(startTime, wakeTime);
        // [v9.34.0] 统一倍率：净奖励走获取倍率（均衡/turbo），净惩罚走消费倍率（turbo），与普通任务一致
        let sleepAdjustInfo = null;
        if (result.totalReward !== 0) {
            const mult = result.totalReward > 0 ? getEarnMultiplier() : getSpendMultiplier();
            if (mult !== 1.0) {
                sleepAdjustInfo = { multiplier: mult, originalAmount: result.totalReward };
                result.totalReward = Math.round(result.totalReward * mult);
            }
        }
        const sleepCycleDate = getSleepCycleDate(startTime);
        
        // [v10.0.0] 创建完整的睡眠记录（仅用于 lastSleepRecord，权威数据走 transaction）
        const sleepRecord = {
            date: sleepCycleDate,
            sleepStartTime: startTime,
            wakeTime: wakeTime,
            durationMinutes: durationMinutes,
            reward: result.totalReward,
            details: result,
            sleepType: 'night',
            timestamp: Date.now()
        };

        // [v10.0.0] 更新 lastSleepRecord（本地快速引用，非权威）
        sleepState.lastSleepRecord = sleepRecord;
        clearSleepHistoryCache();

        // [v7.32.0] 保存睡眠状态
        console.log('[doSleepSettlement] 调用 saveSleepState');
        if (window.Android?.nativeLog) {
            window.Android.nativeLog('SleepSettlement', '调用 saveSleepState');
        }
        saveSleepState();

        // [v10.0.0] 创建交易记录并等待完成（权威源：tb_transaction）
        if (result.totalReward !== 0) {
            const txType = result.totalReward > 0 ? 'earn' : 'spend';
            const txAmount = Math.abs(result.totalReward) * 60;
            const sleepStartStr = formatSleepTimeHM(startTime);
            const wakeStr = formatSleepTimeHM(wakeTime);
            const durationStr = formatSleepDuration(durationMinutes);
            const txNote = `${sleepStartStr}~${wakeStr} ${durationStr}`;

            const transaction = {
                id: generateId(),
                type: txType,
                taskName: '睡眠时间管理',
                amount: txAmount,
                timestamp: wakeTime,
                description: `😴 夜间睡眠: ${txNote}${sleepAdjustInfo ? ` ×${sleepAdjustInfo.multiplier} (${typeof turboMode !== 'undefined' && turboMode.enabled ? 'Turbo' : '均衡调整'})` : ''}`,
                note: txNote,
                category: txType === 'earn' ? (sleepSettings.earnCategory || '系统') : (sleepSettings.spendCategory || '系统'),
                isSystem: true,
                sleepData: {
                    startTime: startTime,
                    wakeTime: wakeTime,
                    durationMinutes: durationMinutes,
                    sleepType: 'night',
                    details: result,
                    plannedBedtime: sleepSettings.plannedBedtime,
                    plannedWakeTime: sleepSettings.plannedWakeTime,
                    targetDurationMinutes: sleepSettings.targetDurationMinutes
                }
            };
            
            // [v7.32.0-fix] 等待交易写入完成，确保数据持久化
            try {
                console.log('[doSleepSettlement] 等待交易写入...');
                await addTransaction(transaction);
                console.log('[doSleepSettlement] ✅ 交易写入成功');
            } catch (err) {
                console.error('[doSleepSettlement] ❌ 交易写入失败:', err);
                if (window.Android?.nativeLog) {
                    window.Android.nativeLog('SleepSettlement', '交易写入失败: ' + err.message);
                }
            }
            
            // [v9.9.0] 余额由 addTransaction 内部更新，此处不再重复
            // [v9.1.0] dailyChanges 由云端 tb_daily 权威管理，提交睡眠时云端已自动更新
            // 不再需要本地 recalculateDailyStats
        }
        
        // [v7.32.0-fix] 强制保存数据
        await saveLocalCache();
        
        updateSleepCard();
        updateAllUI();
        showSleepResultModal(result, durationMinutes);
        
    } else {
        // 日间小睡：简单达标判定
        const sleepCycleDate = getSleepCycleDate(startTime);
        
        let reward = 0;
        let napAdjustInfo = null;
        if (durationMinutes >= sleepSettings.napDurationMinutes) {
            const multiplier = getEarnMultiplier();
            if (multiplier !== 1.0) napAdjustInfo = { multiplier };
            reward = Math.round(sleepSettings.napReward * multiplier);
        }
        
        // [v10.0.0] 创建小睡记录（仅用于 lastSleepRecord，权威数据走 transaction）
        const sleepRecord = {
            date: sleepCycleDate,
            sleepStartTime: startTime,
            wakeTime: wakeTime,
            durationMinutes: durationMinutes,
            reward: reward,
            sleepType: 'nap',
            timestamp: Date.now()
        };

        sleepState.lastSleepRecord = sleepRecord;
        clearSleepHistoryCache();
        saveSleepState();

        if (reward > 0) {
            const txAmount = reward * 60;
            const transaction = {
                id: generateId(),
                type: 'earn',
                taskName: '睡眠时间管理',
                amount: txAmount,
                timestamp: wakeTime,
                description: `💤 日间小睡: ${durationMinutes}分钟${napAdjustInfo ? ` ×${napAdjustInfo.multiplier} (${typeof turboMode !== 'undefined' && turboMode.enabled ? 'Turbo' : '均衡调整'})` : ''}`,
                note: `小睡 ${durationMinutes} 分钟`,
                category: sleepSettings.earnCategory || '系统',
                isSystem: true,
                sleepData: {
                    startTime: startTime,
                    wakeTime: wakeTime,
                    durationMinutes: durationMinutes,
                    sleepType: 'nap',
                    details: {
                        totalReward: reward,
                        napTargetMinutes: sleepSettings.napDurationMinutes
                    }
                }
            };
            
            // [v7.32.0-fix] 等待交易写入完成
            try {
                console.log('[doSleepSettlement] 等待小睡交易写入...');
                await addTransaction(transaction);
                console.log('[doSleepSettlement] ✅ 小睡交易写入成功');
            } catch (err) {
                console.error('[doSleepSettlement] ❌ 小睡交易写入失败:', err);
                if (window.Android?.nativeLog) {
                    window.Android.nativeLog('SleepSettlement', '小睡交易写入失败: ' + err.message);
                }
            }
            // [v9.9.0] 余额由 addTransaction 内部更新，此处不再重复
            // [v9.1.0] dailyChanges 由云端 tb_daily 推送，删除本地写入
            showNotification('✨ 小睡完成', `小睡 ${durationMinutes} 分钟，获得 ${reward} 分钟奖励`, 'success');
        } else {
            const msg = durationMinutes < sleepSettings.napDurationMinutes 
                ? `小睡 ${durationMinutes} 分钟，未达到 ${sleepSettings.napDurationMinutes} 分钟目标`
                : `小睡 ${durationMinutes} 分钟`;
            showNotification('😴 小睡结束', msg, 'info');
        }
        
        // [v7.32.0-fix] 强制保存数据
        await saveLocalCache();
        
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
// [v9.36.5] 近7日图表模式：night=近7天夜间睡眠 / nap=近7天小睡（左右切换按钮）
let sleepWeekChartMode = 'night';

// [v9.36.5] 近7日图表：夜间/小睡标题右侧左右切换（复用 .view-switch-btn 样式）
function switchSleepWeekChart() {
    sleepWeekChartMode = (sleepWeekChartMode === 'nap') ? 'night' : 'nap';
    const c = document.getElementById('sleepWeekChartContainer');
    if (c) c.innerHTML = sleepWeekChartSection();
}

// [v9.36.5] 构建近7日图表区（夜间 = 原近7天睡眠逻辑；小睡 = 当天小睡，样式与夜间一致）
function sleepWeekChartSection() {
    const isNap = sleepWeekChartMode === 'nap';
    const today = new Date();
    const recentRecords = [];
    // [v9.36.5] 近7日含今天（今天~6天前），与"按结束日归属"口径一致（今天结束的睡眠/小睡显示在今天行）
    const dayLabels = ['今天', '昨天', '前天', '3天前', '4天前', '5天前', '6天前'];

    const parseTimeToHours = (timeStr) => { const [h, m] = timeStr.split(':').map(Number); return h + m / 60; };
    const plannedBedHour = parseTimeToHours(sleepSettings.plannedBedtime);
    const plannedWakeHour = parseTimeToHours(sleepSettings.plannedWakeTime);
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

    // [v9.36.5] 小睡计划轴（与卡片小睡条形图一致：计划时段 ±15min）
    const napPlanStartH = parseTimeToHours(sleepSettings.napPlanStart || '12:00');
    const napPlanEndH = parseTimeToHours(sleepSettings.napPlanEnd || '14:00');
    const napAxisStartHour = napPlanStartH - 0.25;
    const napAxisEndHour = napPlanEndH + 0.25;
    let napAxisTotalHours;
    if (napAxisEndHour < napAxisStartHour || (napAxisEndHour < 12 && napAxisStartHour > 12)) {
        napAxisTotalHours = (24 - napAxisStartHour) + napAxisEndHour;
    } else {
        napAxisTotalHours = napAxisEndHour - napAxisStartHour;
    }
    const napStartPct = (0.25 / napAxisTotalHours) * 100;
    const napEndPct = ((napAxisTotalHours - 0.25) / napAxisTotalHours) * 100;
    const napTimeToPercent = (timestamp) => {
        const d = new Date(timestamp);
        let hour = d.getHours() + d.getMinutes() / 60;
        if (hour < napAxisStartHour) hour += 24;
        let rel = hour - napAxisStartHour;
        rel = Math.max(0, Math.min(rel, napAxisTotalHours));
        return (rel / napAxisTotalHours) * 100;
    };

    // 夜间时间轴换算（跨午夜）
    const timeToPercent = (timestamp, isWakeTime = false) => {
        const d = new Date(timestamp);
        let hour = d.getHours() + d.getMinutes() / 60;
        if (!isWakeTime && hour > axisEndHour && hour < axisStartHour) hour -= 24;
        if (isWakeTime && hour < axisStartHour && axisStartHour > 12) hour += 24;
        let relativeHour;
        if (hour >= axisStartHour) relativeHour = hour - axisStartHour;
        else relativeHour = (24 - axisStartHour) + hour;
        relativeHour = Math.max(0, Math.min(relativeHour, axisTotalHours));
        return (relativeHour / axisTotalHours) * 100;
    };
    // 小睡时间轴换算已由上方 napTimeToPercent（计划轴）替代
    const formatTimeHM = (timestamp) => { const d = new Date(timestamp); return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0'); };
    const formatRewardHours = (minutes) => { const h = (Math.abs(minutes) / 60).toFixed(1); return `${minutes >= 0 ? '+' : '-'}${h}h`; };

    for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = getLocalDateString(d);
        // [v9.36.5] 夜间记录按"结束日"匹配（今日/昨日/M月D日，与卡片口径一致）
        const record = getSleepRecordByEndDate(dateStr);
        recentRecords.push({ date: dateStr, dayLabel: dayLabels[i], record });
    }

    // 当天小睡聚合：仅达标结算的 earn 记录（不达标已废弃，不进入统计）
    // [v9.36.5] 按"结束日"匹配（与卡片 getYesterdayNapRecords 口径一致）
    const getNapForDate = (dateStr) => {
        const hits = transactions.filter(tx =>
            tx.sleepData?.sleepType === 'nap' && tx.type === 'earn' &&
            getSleepEndDateStr(tx) === dateStr
        );
        let totalReward = 0;
        hits.forEach(tx => {
            // [v9.36.5] 修复：amount/reward 缺失或异常时累加出 NaN，导致显示 -NaNh
            const raw = tx.amount != null ? Number(tx.amount) / 60 : (Number(tx.reward) || 0);
            const amt = Number.isFinite(raw) ? raw : 0;
            totalReward += amt;
        });
        return { count: hits.length, totalMin: hits.reduce((s, tx) => s + (tx.sleepData?.durationMinutes || 0), 0), hits };
    };

    // [v9.36.5] 对侧7天内是否有记录：无数据则禁用 ⇄ 切换按钮
    const hasNightInWeek = recentRecords.some(r => r.record && r.record.sleepStartTime);
    const hasNapInWeek = recentRecords.some(r => getNapForDate(r.date).count > 0);
    const switchDisabled = isNap ? !hasNightInWeek : !hasNapInWeek;

    let chartHtml = '<div class="sleep-detail-section">';
    // [v9.36.5] 标题 + ⇄ 切换按钮紧贴排列（不再左右两端分布）
    chartHtml += '<div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">';
    chartHtml += `<div class="sleep-detail-title" style="margin-bottom:0; flex:none;">${isNap ? '📊 近7天日间小睡' : '📊 近7天夜间睡眠'}</div>`;
    chartHtml += `<button class="view-switch-btn sleep-week-toggle" onclick="switchSleepWeekChart()" title="${isNap ? '切换到近7天夜间睡眠' : '切换到近7天日间小睡'}" style="flex:none;${switchDisabled ? 'opacity:.35;pointer-events:none;' : ''}">⇄</button>`;
    chartHtml += '</div>';
    chartHtml += '<div class="sleep-bar-chart">';

    recentRecords.slice(0, 7).forEach(({ dayLabel, record, date }) => {
        if (isNap) {
            const nap = getNapForDate(date);
            if (nap.count === 0) {
                chartHtml += `
                    <div class="sleep-bar-row" style="opacity: 0.7; cursor: pointer;" onclick="showManualSleepModalForDate('${date}');">
                        <div class="sleep-bar-label">${dayLabel.substring(0, 2)}</div>
                        <div class="sleep-bar-container">
                            <div class="sleep-bar-marker bedtime" style="left: ${napStartPct}%;"></div>
                            <div class="sleep-bar-marker waketime" style="left: ${napEndPct}%;"></div>
                            <div class="sleep-bar-empty-text">点击补录</div>
                        </div>
                        <div class="sleep-bar-reward" style="font-size: 0.65rem;">+</div>
                    </div>`;
                return;
            }
            // [v9.36.5] 颜色等级：按当日小睡聚合收益套用奖惩色系（与夜间一致）
            let napBarLevel = 'level-2';
            if (nap.totalReward >= 60) napBarLevel = 'level-1';
            else if (nap.totalReward > 0) napBarLevel = 'level-2';
            else if (nap.totalReward < -60) napBarLevel = 'level-4';
            else if (nap.totalReward < 0) napBarLevel = 'level-3';
            const napRewardClass = nap.totalReward >= 0 ? 'positive' : 'negative';

            let inner = '';
            nap.hits.forEach(tx => {
                const stMs = new Date(tx.sleepData?.startTime || tx.timestamp).getTime();
                const dur = tx.sleepData?.durationMinutes || 0;
                const wtMs = tx.sleepData?.wakeTime ? new Date(tx.sleepData.wakeTime).getTime() : (stMs + dur * 60000);
                const s = napTimeToPercent(stMs), e = napTimeToPercent(wtMs);
                const w = Math.max(e - s, 4);
                const h = Math.floor(dur / 60), m = dur % 60;
                const durStr = m > 0 ? h + 'h' + m + 'm' : h + 'h';
                // [v9.36.5] 窄条去中间时长，防拥挤（与卡片小睡条形图一致）
                const midSpan = w >= 35 ? `<span class="sleep-bar-text">${durStr}</span>` : '';
                inner += `<div class="sleep-bar ${napBarLevel}" style="left: ${s}%; width: ${w}%;">
                            <span class="sleep-bar-time">${formatTimeHM(stMs)}</span>
                            ${midSpan}
                            <span class="sleep-bar-time">${formatTimeHM(wtMs)}</span>
                        </div>`;
            });
            const napRewardText = formatRewardHours(nap.totalReward);
            chartHtml += `
                <div class="sleep-bar-row" style="cursor: pointer;" onclick="showNapDetailModal();">
                    <div class="sleep-bar-label">${dayLabel.substring(0, 2)}</div>
                    <div class="sleep-bar-container">
                        <div class="sleep-bar-marker bedtime" style="left: ${napStartPct}%;"></div>
                        <div class="sleep-bar-marker waketime" style="left: ${napEndPct}%;"></div>
                        ${inner}
                    </div>
                    <div class="sleep-bar-reward ${napRewardClass} ${napBarLevel}">${napRewardText}</div>
                </div>`;
            return;
        }

        // —— 夜间视图（原"近7天睡眠"逻辑不变）——
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
            const reward = record.reward || 0;
            const rewardText = formatRewardHours(reward);
            const rewardClass = reward >= 0 ? 'positive' : 'negative';
            let barLevelClass = '';
            const rewardMinutes = Math.abs(reward);
            if (reward >= 0 && rewardMinutes >= 60) barLevelClass = 'level-1';
            else if (reward >= 0 && rewardMinutes > 0) barLevelClass = 'level-2';
            else if (reward < 0 && rewardMinutes < 60) barLevelClass = 'level-3';
            else barLevelClass = 'level-4';

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
    if (!isNap) {
        chartHtml += '<div class="sleep-bar-time-axis">';
        chartHtml += `<span class="axis-bedtime" style="left: calc(36px + (100% - 72px) * ${bedtimePercent / 100});">${sleepSettings.plannedBedtime}</span>`;
        chartHtml += `<span class="axis-waketime" style="left: calc(36px + (100% - 72px) * ${waketimePercent / 100});">${sleepSettings.plannedWakeTime}</span>`;
        chartHtml += '</div>';
    } else {
        chartHtml += '<div class="sleep-bar-time-axis">';
        chartHtml += `<span class="axis-bedtime" style="left: calc(36px + (100% - 72px) * ${napStartPct / 100});">${sleepSettings.napPlanStart || '12:00'}</span>`;
        chartHtml += `<span class="axis-waketime" style="left: calc(36px + (100% - 72px) * ${napEndPct / 100});">${sleepSettings.napPlanEnd || '14:00'}</span>`;
        chartHtml += '</div>';
    }
    chartHtml += '</div>';
    return chartHtml;
}

// [v9.36.5] 近7日弹窗：initialMode='nap' 时打开即显示近7天小睡视图（弹窗标题/计划区随模式）
function showNightSleepDetailModal(initialMode) {
    sleepWeekChartMode = (initialMode === 'nap') ? 'nap' : 'night';
    const isNapView = sleepWeekChartMode === 'nap';
    const chartHtml = '<div id="sleepWeekChartContainer">' + sleepWeekChartSection() + '</div>';
    
    // 计划设置（[v9.36.5] 小睡视图展示小睡计划：达标时长/奖励 + 更改小睡设置）
    const targetHours = Math.floor(sleepSettings.targetDurationMinutes / 60);
    const targetMins = sleepSettings.targetDurationMinutes % 60;
    const targetStr = targetMins > 0 ? `${targetHours}小时${targetMins}分` : `${targetHours}小时`;
    const settingsHtml = isNapView
        ? `<div class="sleep-detail-section">
            <div class="sleep-detail-title">💤 小睡计划</div>
            <div class="sleep-detail-settings">
                <div class="setting-row"><span>计划时段</span><span>${sleepSettings.napPlanStart || '12:00'} ~ ${sleepSettings.napPlanEnd || '14:00'}</span></div>
                <div class="setting-row"><span>达标时长</span><span>${sleepSettings.napDurationMinutes} 分钟</span></div>
                <div class="setting-row"><span>完成奖励</span><span>+${sleepSettings.napReward} 分钟</span></div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="showNapSettingsModal();" style="margin-top: 10px; width: 100%;">更改设置</button>
        </div>`
        : `<div class="sleep-detail-section">
            <div class="sleep-detail-title">⚙️ 夜间计划</div>
            <div class="sleep-detail-settings">
                <div class="setting-row"><span>计划入睡</span><span>${sleepSettings.plannedBedtime}</span></div>
                <div class="setting-row"><span>计划起床</span><span>${sleepSettings.plannedWakeTime}</span></div>
                <div class="setting-row"><span>目标时长</span><span>${targetStr} ± ${sleepSettings.durationTolerance}分</span></div>
                <div class="setting-row"><span>达标奖励</span><span>+${sleepSettings.toleranceReward} 分钟</span></div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="showSleepSettingsModal();" style="margin-top: 10px; width: 100%;">更改计划</button>
        </div>`;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'sleepDetailModal';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
        <div class="modal-content sleep-detail-modal modal-animate">
            <div class="modal-header">
                <h3 class="modal-title">${isNapView ? '💤 小睡记录' : '😴 睡眠记录'} <span class="help-icon" onclick="event.stopPropagation(); showSleepInfoModal();" title="使用说明">?</span></h3>
                <button class="close-btn" onclick="document.getElementById('sleepDetailModal')?.remove()">×</button>
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
// [v9.36.5] 增强为统一入口：今日统计条 + 起止时间 + 开始小睡入口
function showNapDetailModal() {
    // 全部小睡记录（权威源为 tb_transaction）
    const allNapTxs = transactions
        .filter(tx => tx.sleepData?.sleepType === 'nap' && tx.type === 'earn')
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // 今日统计
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayTxs = allNapTxs.filter(tx => (tx.timestamp || 0) >= todayStart.getTime());
    const todayCount = todayTxs.length;
    const todayMinutes = todayTxs.reduce((s, tx) => s + (tx.sleepData?.durationMinutes || 0), 0);
    const metCount = todayTxs.filter(tx => (tx.sleepData?.durationMinutes || 0) >= sleepSettings.napDurationMinutes).length;
    
    const minutesToText = (m) => {
        if (!m) return '0';
        const h = Math.floor(m / 60), rest = m % 60;
        return h > 0 ? `${h}小时${rest > 0 ? rest + '分' : ''}` : `${rest}分`;
    };
    
    const napTxs = allNapTxs.slice(0, 7);
    
    let recentHtml = '<div class="sleep-detail-section">';
    recentHtml += '<div class="sleep-detail-title">📊 今日小睡</div>';
    recentHtml += '<div class="sleep-detail-stats" style="display:flex; gap:8px; margin-bottom:14px;">';
    recentHtml += `<div style="flex:1; text-align:center; background:var(--card-bg,#fff); border-radius:12px; padding:10px 6px;"><div style="font-size:1.25rem; font-weight:700; color:var(--color-primary);">${todayCount}</div><div style="opacity:.6; font-size:.8rem;">今日小睡(次)</div></div>`;
    recentHtml += `<div style="flex:1; text-align:center; background:var(--card-bg,#fff); border-radius:12px; padding:10px 6px;"><div style="font-size:1.0rem; font-weight:700; color:var(--color-primary);">${minutesToText(todayMinutes)}</div><div style="opacity:.6; font-size:.8rem;">累计时长</div></div>`;
    recentHtml += `<div style="flex:1; text-align:center; background:var(--card-bg,#fff); border-radius:12px; padding:10px 6px;"><div style="font-size:1.25rem; font-weight:700; color:#4CAF50;">${metCount}</div><div style="opacity:.6; font-size:.8rem;">达标(次)</div></div>`;
    recentHtml += '</div>';
    
    recentHtml += '<div class="sleep-detail-title">💤 近期小睡</div>';
    
    if (napTxs.length > 0) {
        recentHtml += '<div class="sleep-recent-list">';
        napTxs.forEach(tx => {
            const d = new Date(tx.timestamp);
            const startTs = tx.sleepData?.startTime;
            const timeStr = startTs ? ` ${new Date(startTs).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})}` : '';
            const durationMins = tx.sleepData?.durationMinutes;
            const durationStr = durationMins ? `${durationMins}分钟` : '—';
            const rewardRaw = Number(tx.amount) / 60;
            const reward = Number.isFinite(rewardRaw) ? Math.round(rewardRaw) : 0;   // [v9.36.5] 防护 NaN
            
            recentHtml += `
                <div class="sleep-recent-item" style="cursor: default;">
                    <div class="recent-day">${d.getMonth()+1}/${d.getDate()}${timeStr}</div>
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
                <button class="btn btn-primary" style="width:100%; margin-bottom:10px;" onclick="document.getElementById('sleepDetailModal')?.remove(); startUnifiedSleep();">💤 开始小睡</button>
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
    whitelistApps: [],            // 白名单应用包名
    enabledDate: null,            // 首次启用日期（用于判断是否需要补结算）
    settledDates: {},             // [v7.2.1] 已结算的日期列表，格式: { deviceId: [dates] }
    // [v9.15.2] 删除 lastSettleDate / lastSettleTime 死字段（v5.2.0 提前结算功能下线后无任何代码再读写）
    autoSettle: true,             // 自动结算（v5.10.0起固定开启）
    earnCategory: null,           // [v5.10.0] 节省时间归属分类（null时使用「系统」）
    spendCategory: null,          // [v5.10.0] 超出时间归属分类（null时使用「系统」）
    cardStyle: 'classic',         // [v5.10.0] 卡片样式：'classic' | 'glass'
    glassStrength: 90,            // [v9.28.1] 通透强度（5档：0/30/60/90/120）
    glassBlurStrength: 90         // [v9.28.1] 模糊强度（5档：0/30/60/90/120）
};

// [v7.2.3] 初始化设备ID（需要尽早调用，DAL.loadAll 之前）
