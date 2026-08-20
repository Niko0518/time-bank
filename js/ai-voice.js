/**
 * ai-voice.js [v9.35.0]
 * 语音指令模块：用户用语音表达"开始/完成/结束/删除某个任务"
 * 流程：Android 原生 SpeechRecognizer → 文字 → 本地精确解析（零 AI 消耗）
 *       → 未命中时 AI 意图解析（云函数 hy3）→ 任务模糊匹配 → 执行（删除强制确认）
 */

// [v9.36.0] Time Bot 状态钩子：引擎未加载/未就绪时静默跳过（TimeBot 内部另有守卫）
function tbSet(name, leaseId) { if (window.TimeBot) window.TimeBot.setState(name, leaseId); }
function tbReact(kind) { if (window.TimeBot) window.TimeBot.react(kind); }
// [v9.36.0] 气泡钩子：语音流程的全部文案由 Time Bot 气泡承担（不再用浮层/Toast）
// 对话窗打开时同步写入窗口（指令执行反馈在窗内可见）
function tbSay(text, ms) {
    if (!window.TimeBot) return;
    window.TimeBot.say(text, ms);
    if (window.TimeBot.isChatOpen()) window.TimeBot.chatSay(text);
}

// [v9.36.0] 任务反馈分级钩子（onComplete/onStop）与数据查询已收编至 time-bot.js，核心 app-2.js 直接调 window.TimeBot

// ==================== 全局语音指令管理器 ====================
const VoiceCommand = {
    listening: false,
    activeCallbackId: null,
    pendingTimeout: null,
    floatBtnEl: null,

    // 是否具备语音能力（安卓端桥 + 语音引擎）
    isAvailable() {
        return !!(window.Android && window.Android.startVoiceRecognition);
    },

    // [v9.36.0] 初始化：接管原创建任务按钮（#fabButton）
    // 点击 = 打开 Time Bot 对话窗；长按 = 按住说话（PTT）语音指令快通道
    // 创建任务按钮已移至分类任务标题行（.create-task-inline-btn）
    init() {
        if (this.floatBtnEl) return;
        if (!this.isAvailable()) {
            // PWA 端无桥：隐藏 fabButton（创建任务走标题行内联按钮）
            const fab = document.getElementById('fabButton');
            if (fab) fab.style.display = 'none';
            return;
        }
        try {
            const btn = document.getElementById('fabButton');
            if (!btn) return;
            btn.title = 'Time Bot（点击聊天，长按说语音指令）';
            // [v9.36.0] 渲染交给 Time Bot：引擎懒加载后挂载；按钮初始为空，不再显示麦克风占位
            if (window.TimeBot) TimeBot.mount(btn);
            btn.onclick = (e) => {
                e.stopPropagation();
                if (this._pttGuard) return;          // 吞掉长按说话抬起后的那次 click
                if (!window.TimeBot) return;
                if (TimeBot.isChatOpen()) TimeBot.closeChat();
                else TimeBot.openChat();
            };
            // [v9.36.0] 长按 = 按住说话（PTT）：250ms 阈值对齐报告页悬浮窗；抬起完成识别，滑出按钮后抬起取消
            // 原长按本地引擎诊断（v9.35.0-fix5）已移除
            let pressTimer = null;
            let ptt = false;      // 本次按压是否为"按住说话"
            let pttLeft = false;  // 按住说话中手指是否滑出按钮（抬起即取消）
            btn.onpointerdown = () => {
                pttLeft = false;
                pressTimer = setTimeout(() => {
                    pressTimer = null;
                    if (this.listening) return;  // 点按已在录音：不重复启动
                    ptt = true;
                    if (window.Android && window.Android.vibrate) window.Android.vibrate(30);
                    this.startListening();
                }, 250);
            };
            btn.onpointerleave = () => {
                if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
                if (ptt) pttLeft = true;   // 滑出：抬起时取消（微信语音同款习惯）
            };
            btn.onpointerup = () => {
                if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
                if (!ptt) return;
                ptt = false;
                this._pttGuard = true;     // 吞掉紧随的 click，防止 toggle() 再次开录
                setTimeout(() => { this._pttGuard = false; }, 800);
                if (this.listening) {
                    if (pttLeft) {
                        this.cancel();
                        tbSay('好的，已取消', 2200);
                    } else {
                        this.finish();     // 抬起 → 识别 → 执行
                    }
                }
                pttLeft = false;
            };
            this.floatBtnEl = btn;
        } catch (e) {
            console.error('[VoiceCommand] init 失败:', e);
        }
    },

    // [v9.35.0-fix3] 开始自录音（设备原生识别服务在荣耀等设备上不可绑定，统一走自录+云ASR）
    startListening() {
        if (this.listening) return false;
        if (!window.Android || !window.Android.startVoiceRecording) {
            tbSay('此版本暂不支持语音', 3000);
            return false;
        }
        const callbackId = 'voice_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        this.activeCallbackId = callbackId;
        this.listening = true;
        this.recognizing = false;
        // [v9.36.0] 获取状态租约：语音流持有期间 bot 状态受保护，_cleanup 时自动释放
        if (window.TimeBot) {
            if (this._voiceLease) window.TimeBot.releaseLease(this._voiceLease);
            this._voiceLease = window.TimeBot.acquireLease();
        }
        tbSet('listening', this._voiceLease); // [v9.36.0] Time Bot 进入聆听态（前倾+点头）
        this._sayListening();
        // 15s 录音上限：自动停止并进入识别
        this.pendingTimeout = setTimeout(() => {
            if (this.listening && !this.recognizing) this.finish();
        }, 15000);
        try {
            const ok = window.Android.startVoiceRecording(callbackId);
            if (!ok) {
                this._cleanup();
                return false;
            }
            if (window.Android.vibrate) window.Android.vibrate(30);
        } catch (e) {
            console.error('[VoiceCommand] startVoiceRecording 失败:', e);
            this._cleanup();
            tbSay('录音启动失败', 3000);
            // [v9.36.0] 录音启动失败：_cleanup 已释放 lease，此处无需额外 setState
            return false;
        }
        return true;
    },

    // [v9.36.0] 录音开始气泡文案：首次附 VAD 教学，之后只显示短句
    _sayListening() {
        let taught = false;
        try { taught = !!localStorage.getItem('tb_voice_bubble_taught'); } catch (e) { /* 忽略 */ }
        if (!taught) {
            tbSay('我在听，请说出指令（说完停顿会自动识别）');
            try { localStorage.setItem('tb_voice_bubble_taught', '1'); } catch (e) { /* 忽略 */ }
        } else {
            tbSay('我在听，请说出指令');
        }
    },

    // [v9.35.0-fix3] 结束录音并送云端识别
    finish() {
        if (!this.listening || this.recognizing) return;
        if (this.pendingTimeout) {
            clearTimeout(this.pendingTimeout);
            this.pendingTimeout = null;
        }
        this.recognizing = true;
        tbSet('thinking', this._voiceLease); // [v9.36.0] 云端 ASR 听写阶段统一为“思考中”
        tbSay('正在思考中…');
        // 识别兜底超时（录音停止→base64→上传→ASR→返回）
        this.pendingTimeout = setTimeout(() => {
            if (this.listening) {
                this.cancel();
                tbSay('识别超时，再试一次', 3000);
            }
        }, 45000);
        try {
            window.Android.stopVoiceRecording();
        } catch (e) {
            console.error('[VoiceCommand] stopVoiceRecording 失败:', e);
            this.cancel();
            tbSay('录音停止失败', 3000);
        }
    },

    // 取消本次识别
    cancel() {
        if (window.Android && window.Android.cancelVoiceRecording) {
            try { window.Android.cancelVoiceRecording(); } catch (e) { /* 忽略 */ }
        } else if (window.Android && window.Android.cancelVoiceRecognition) {
            try { window.Android.cancelVoiceRecognition(); } catch (e) { /* 忽略 */ }
        }
        this.recognizing = false;
        this._cleanup();
        tbReact('cancel'); // [v9.36.0] 取消：一激灵后回 idle
    },

    _cleanup() {
        this.listening = false;
        this.activeCallbackId = null;
        if (this.pendingTimeout) {
            clearTimeout(this.pendingTimeout);
            this.pendingTimeout = null;
        }
        // [v9.36.0] 释放状态租约：无论正常完成/取消/报错，bot 自动回 idle
        if (window.TimeBot && this._voiceLease) {
            window.TimeBot.releaseLease(this._voiceLease);
            this._voiceLease = 0;
        }
        if (window.TimeBot) window.TimeBot.hideSay(); // [v9.36.0] 收尾隐藏气泡（反馈气泡在调用方 cancel 之后再展示）
    },

    // 处理识别出的文本：customHandler（聊天界面分流）→ 本地解析 → AI 解析 → 执行
    async _handleText(text) {
        if (!text || !text.trim()) return;
        const raw = text.trim();
        console.log('[VoiceCommand] 识别文本:', raw);

        // 场景自定义处理（如聊天界面：指令则执行，否则填入输入框）
        if (typeof this.customHandler === 'function') {
            const handler = this.customHandler;
            this.customHandler = null; // 一次性
            try {
                await handler(raw);
            } catch (e) {
                console.error('[VoiceCommand] customHandler 执行失败:', e);
            }
            return;
        }

        let cmd = parseLocalVoiceCommand(raw);
        if (!cmd) {
            // 本地未命中 → AI 意图解析（消耗少量资源点）
            if (typeof AI_ASSISTANT_SERVICE !== 'undefined' && AI_ASSISTANT_SERVICE.parseVoiceIntent) {
                try {
                    tbSet('thinking'); // [v9.36.0] AI 理解中：视线飘左上+头顶点点
                    tbSay('正在思考中…');
                    cmd = await AI_ASSISTANT_SERVICE.parseVoiceIntent(raw);
                } catch (e) {
                    console.error('[VoiceCommand] AI 意图解析失败:', e);
                    cmd = null;
                }
            }
        }

        // [v9.36.0] 指令与对话融合：是任务指令 → 执行；不是指令 → 长按气泡对话（不弹窗，仅主页气泡闲聊）
        const isCmd = cmd && cmd.action && cmd.action !== 'unknown' && cmd.taskName;
        if (isCmd) {
            await executeVoiceCommand(cmd, raw);
        } else if (window.TimeBot) {
            tbReact('chat'); // 非指令转对话：俏皮表情
            TimeBot.bubbleChat(raw);
        } else {
            await executeVoiceCommand(cmd, raw); // 对话入口缺失时兜底提示
        }
    }
};

// ==================== Android 原生回调入口 ====================
// [v9.35.0-fix3] 旧原生识别通道回调：本地引擎测试结果 + 迟到调用兜底
window.__onVoiceRecognitionResult = function (callbackId, text, error) {
    if (!VoiceCommand.listening) return;

    // [v9.35.0-fix5] 测试模式：只显示结果不执行指令
    if (VoiceCommand._testMode) {
        VoiceCommand._testMode = false;
        VoiceCommand._cleanup();
        tbSet('idle');
        if (error) {
            console.warn('[VoiceCommand] 本地引擎测试失败:', error);
            if (typeof showToast === 'function') showToast('❌ 本地引擎失败：' + error, 5000);
        } else if (text) {
            console.log('[VoiceCommand] 本地引擎测试成功:', text);
            if (typeof showToast === 'function') showToast('✅ 本地引擎可用！识别到：「' + text + '」（告诉我结果，我把主通道切回本地）', 6000);
        } else {
            if (typeof showToast === 'function') showToast('⚠️ 本地引擎响应但无识别内容', 4000);
        }
        return;
    }

    VoiceCommand._cleanup();
    if (error) {
        tbReact('error'); // [v9.36.0] 识别出错：受惊表情
        tbSay('识别出错了', 3000);
        return;
    }
    if (text) VoiceCommand._handleText(text);
};

// [v9.35.0-fix3] 自录音回调：收到 base64 WAV → 云函数 ASR → 文字 → 指令处理
window.__onVoiceRecorded = async function (callbackId, audioBase64, error) {
    if (!VoiceCommand.listening || VoiceCommand.activeCallbackId !== callbackId) return;
    if (error) {
        console.warn('[VoiceCommand] 录音错误:', error);
        VoiceCommand._cleanup();
        tbSay('录音出错了', 3000);
        tbSet('idle'); // [v9.36.0] 纯提示分支：说完回待机（防卡在 listening/thinking）
        return;
    }
    if (!audioBase64) {
        VoiceCommand._cleanup();
        tbSay('没有录到声音', 3000);
        tbSet('idle'); // [v9.36.0] 纯提示分支：说完回待机（防卡在 listening/thinking）
        return;
    }
    // [v9.35.0-fix7] VAD 自动停止场景：录音结束即切气泡到"识别中"（手动点完成时 finish 已切过，重复无害）
    VoiceCommand.recognizing = true;
    tbSet('thinking', VoiceCommand._voiceLease); // [v9.36.0] VAD 自动停止路径同样统一为“思考中”
    tbSay('正在思考中…');
    try {
        if (typeof AI_ASSISTANT_SERVICE === 'undefined' || !AI_ASSISTANT_SERVICE.transcribeAudio) {
            throw new Error('语音识别服务不可用');
        }
        const text = await AI_ASSISTANT_SERVICE.transcribeAudio(audioBase64);
        VoiceCommand._cleanup();
        if (text && text.trim()) {
            VoiceCommand._handleText(text);
        } else {
            tbReact('confused'); // [v9.36.0] 没识别到内容：困惑
            tbSay('没有识别到内容', 3000);
        }
    } catch (e) {
        console.error('[VoiceCommand] 云端识别失败:', e);
        VoiceCommand._cleanup();
        tbReact('error'); // [v9.36.0] 云端识别失败：受惊表情
        tbSay('语音识别失败', 4000);
    }
};

// ==================== 本地精确解析（零 AI 消耗） ====================
// 返回 { action, taskName } 或 null（无法解析）
// [v9.35.1] 新增 undo 撤回句式（优先解析）："撤回最近一次XX" / "撤回今天的XX记录" 等
function parseLocalVoiceCommand(text) {
    if (!text) return null;
    let t = text.trim()
        .replace(/[，。！？,.!?、\s]+/g, '')
        .replace(/(请|帮我|帮忙|我要|我想|给我|一下|赶紧|快点)/g, '');

    // 撤回指令（在通用动作之前解析，避免"撤回"被误切进任务名）
    const undoCmd = parseLocalUndoCommand(t);
    if (undoCmd) return undoCmd;

    // 动作词表（顺序重要：长词优先避免误切）
    const ACTIONS = [
        { words: ['完成了', '做完', '搞定', '完成'], action: 'complete' },
        { words: ['结束了', '结束'], action: 'stop' },
        { words: ['取消了', '取消', '作废', '不要了'], action: 'cancel' },
        { words: ['开始计时', '启动', '开始'], action: 'start' },
        { words: ['暂停', '停一下', '停止', '停下'], action: 'pause' },
        { words: ['继续', '恢复'], action: 'resume' },
        { words: ['删掉', '删除', '移除'], action: 'delete' }
    ];

    // 模式 1：动作在前 —— "开始阅读" "删除游戏任务"
    for (const a of ACTIONS) {
        for (const w of a.words) {
            if (t.startsWith(w)) {
                let name = t.slice(w.length);
                name = cleanTaskName(name);
                if (name) return { action: a.action, taskName: name };
            }
        }
    }

    // 模式 2：动作在后 —— "阅读完成了" "锻炼结束"
    const TAIL = [
        { re: /^(.+?)(完成了|做完|搞定)$/, action: 'complete' },
        { re: /^(.+?)(结束了)$/, action: 'stop' },
        { re: /^(.+?)(停止了|停下了|暂停了)$/, action: 'pause' },
        { re: /^(.+?)(取消了|作废了|不要了)$/, action: 'cancel' }
    ];
    for (const item of TAIL) {
        const m = t.match(item.re);
        if (m) {
            const name = cleanTaskName(m[1]);
            if (name) return { action: item.action, taskName: name };
        }
    }

    return null;
}

// 清理任务名中的口语残留
function cleanTaskName(name) {
    if (!name) return '';
    return name
        .replace(/(任务|这个|那个|它|了|吧|哈)+$/g, '')
        .trim();
}

// [v9.35.1] 本地撤回指令解析（零 AI 消耗，覆盖高频固定句式）
// 支持："撤回最近一次XX" "撤回上一条XX的记录" "撤回今天的XX" "撤回昨天的XX记录"
// 复杂日期句式（"撤回8月2号XX第一条"）留给 AI 通道
function parseLocalUndoCommand(t) {
    if (!/^(撤回|撤销)/.test(t)) return null;
    let body = t.replace(/^(撤回|撤销)/, '');

    // 去掉尾部"的记录/记录/的交易/交易"
    body = body.replace(/(的)?(记录|交易)$/, '');

    // 中文序数词转换（供"第一条"句式，本地通道仅处理一/二/三，更复杂交 AI）
    const CN_ORD = { '一': 1, '二': 2, '两': 2, '三': 3 };

    // 时间限定词（长词优先）
    const TIME_PREFIX = [
        { re: /^(最近一次|最近一条|上一条|上一次|上次|最近的)/, scope: 'last' },
        { re: /^(今天|今日)/, scope: 'today' },
        { re: /^(昨天|昨日)/, scope: 'yesterday' }
    ];
    for (const tp of TIME_PREFIX) {
        const m = body.match(tp.re);
        if (m) {
            let name = body.slice(m[0].length).replace(/^的/, '');
            // 尝试提取序数："第一条" / "第2条"
            let ordinal = null;
            const om = name.match(/^第([一二两三]|\d+)条/);
            if (om) {
                ordinal = CN_ORD[om[1]] || parseInt(om[1], 10);
                name = name.slice(om[0].length).replace(/^的/, '');
            }
            name = cleanTaskName(name);
            if (name) {
                const cmd = { action: 'undo', taskName: name, undoScope: tp.scope };
                if (ordinal) cmd.undoOrdinal = ordinal;
                return cmd;
            }
        }
    }

    // 无时间限定："撤回XX" → 默认最近一次
    const name = cleanTaskName(body.replace(/^的/, ''));
    if (name) return { action: 'undo', taskName: name, undoScope: 'last' };
    return null;
}

// ==================== 任务模糊匹配 ====================
// 复用悬浮窗事件的匹配思路：精确 → 互相包含 → 首字符匹配
function matchTaskByName(spoken) {
    if (!spoken || typeof tasks === 'undefined' || !tasks || tasks.length === 0) return null;

    const normalize = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');

    // 1) 精确匹配
    let found = tasks.find(t => normalize(t.name) === normalize(spoken));
    if (found) return { task: found, exact: true };

    // 2) 互相包含
    const nSpoken = normalize(spoken);
    found = tasks.find(t => {
        const n = normalize(t.name);
        return n.includes(nSpoken) || nSpoken.includes(n);
    });
    if (found) return { task: found, exact: false };

    // 3) 逐字命中（识别误差容错：说的每个字都出现在任务名中且首字相同）
    const first = nSpoken[0];
    const candidates = tasks.filter(t => {
        const n = normalize(t.name);
        return n[0] === first && nSpoken.split('').every(ch => n.includes(ch));
    });
    if (candidates.length === 1) return { task: candidates[0], exact: false };
    if (candidates.length > 1) {
        // 多候选：取名字最短的（通常是最贴近的）
        candidates.sort((a, b) => a.name.length - b.name.length);
        return { task: candidates[0], exact: false };
    }

    return null;
}

// ==================== 指令执行 ====================
async function executeVoiceCommand(cmd, rawText) {
    // 无有效指令：提示 + 引导
    if (!cmd || !cmd.action || cmd.action === 'unknown' || !cmd.taskName) {
        tbReact('confused'); // [v9.36.0] 没听懂：歪头困惑
        tbSay('没听懂，试试说"开始XX"', 3500);
        return;
    }

    const matched = matchTaskByName(cmd.taskName);
    if (!matched) {
        tbReact('confused'); // [v9.36.0] 找不到任务：困惑
        tbSay('没找到任务「' + cmd.taskName + '」', 3000);
        return;
    }

    const task = matched.task;
    const isRunning = (typeof runningTasks !== 'undefined') && runningTasks && runningTasks.has(task.id);

    try {
        switch (cmd.action) {
            case 'start':
                if (isRunning) {
                    // 已在计时：检查暂停态则恢复
                    const running = runningTasks.get(task.id);
                    if (running && running.isPaused && typeof resumeTask === 'function') {
                        resumeTask(task.id);
                        tbSay('已恢复「' + task.name + '」', 2600);
                        tbReact('resume'); // [v9.36.0] 恢复：兴奋+粒子
                    } else {
                        tbSay('「' + task.name + '」已在计时中', 2600);
                        tbSet('idle'); // [v9.36.0] 纯提示分支：说完回待机（防卡在 thinking）
                    }
                } else {
                    startTask(null, task.id);
                    tbSay('已开始「' + task.name + '」', 2600);
                    // 动画由核心 startTask 钩子统一驱动（书写场景），此处不再重复触发
                }
                break;

            case 'complete':
                // 分级动画+气泡由核心 completeTask 钩子统一驱动（TimeBot.onComplete），点按/语音同一套
                await completeTask(task.id);
                break;

            case 'stop':
                if (!isRunning) {
                    tbSay('当前没有在计时', 2600);
                    tbSet('idle'); // [v9.36.0] 纯提示分支：说完回待机（防卡在 thinking）
                } else {
                    await stopTask(task.id);
                    // 分级动画+气泡由核心 stopTask 钩子统一驱动（TimeBot.onStop），点按/语音同一套，此处不再重复触发
                }
                break;

            case 'pause':
                if (isRunning && typeof pauseTask === 'function') {
                    pauseTask(task.id);
                    tbSay('已暂停「' + task.name + '」', 2600);
                    tbReact('pause'); // [v9.36.0] 暂停：打盹耷拉
                } else {
                    tbSay('当前没有在计时', 2600);
                    tbSet('idle'); // [v9.36.0] 纯提示分支：说完回待机（防卡在 thinking）
                }
                break;

            case 'resume':
                if (isRunning && typeof resumeTask === 'function') {
                    resumeTask(task.id);
                    tbSay('已恢复「' + task.name + '」', 2600);
                    tbReact('resume'); // [v9.36.0] 恢复：兴奋+粒子
                } else {
                    tbSay('没有处于暂停状态', 2600);
                    tbSet('idle'); // [v9.36.0] 纯提示分支：说完回待机（防卡在 thinking）
                }
                break;

            case 'delete':
                // 安全设计：语音删除永远走确认框（deleteTask 自带确认 + 删除模式选择）
                tbReact('delete'); // [v9.36.0] 删除确认前：侧目斜视（你确定？）
                currentEditingTask = task;
                await deleteTask();
                break;

            case 'cancel':
                if (!isRunning) {
                    tbSay('当前没有在计时', 2600);
                    tbSet('idle');
                } else {
                    await cancelTask(task.id);
                    tbSay('已取消「' + task.name + '」', 2600);
                    tbReact('cancel');
                }
                break;

            case 'undo':
                // [v9.35.1] 撤回交易记录：查找 → undoTransaction 自带确认框（安全设计）
                tbReact('undo'); // [v9.36.0] 撤回：得意挺胸
                await executeUndoCommand(cmd, task);
                break;

            default:
                tbSay('暂不支持该操作', 2600);
                tbSet('idle'); // [v9.36.0] 纯提示分支：说完回待机（防卡在 thinking）
        }
    } catch (e) {
        console.error('[VoiceCommand] 执行失败:', cmd, e);
        tbReact('error'); // [v9.36.0] 执行出错：受惊表情
        tbSay('指令执行出错', 3000);
    }
}

// [v9.35.1] 撤回指令执行：按 scope/日期/序号定位交易 → 复用 undoTransaction（含确认框+全套一致性回滚）
// 语义约定："第N条" = 当天最早起的第 N 条（正序）；未说序号 = 当天/全局最近一条
async function executeUndoCommand(cmd, task) {
    if (typeof transactions === 'undefined' || !Array.isArray(transactions) || typeof undoTransaction !== 'function') {
        tbSay('撤回功能暂不可用', 3000);
        tbSet('idle'); // [v9.36.0] 纯提示分支：说完回待机（防卡在 thinking）
        return;
    }

    // 该任务的全部有效交易（任务名兜底：AI 可能给出已改名的旧名）
    const ts = (t) => typeof t.timestamp === 'number' ? t.timestamp : new Date(t.timestamp).getTime();
    let pool = transactions.filter(t => t.taskId === task.id && !t.undone);
    if (pool.length === 0) {
        pool = transactions.filter(t => !t.undone && t.taskName &&
            task.name && t.taskName.toLowerCase() === task.name.toLowerCase());
    }
    if (pool.length === 0) {
        tbSay('「' + task.name + '」没有可撤回的记录', 3000);
        return;
    }

    const scope = cmd.undoScope || 'last';
    let target = null;
    let scopeLabel = '最近一次';

    if (scope === 'last') {
        target = pool.reduce((a, b) => ts(a) > ts(b) ? a : b);
    } else {
        // 日期限定（today / yesterday / date）
        let dayStr = null;
        if (scope === 'today' || scope === 'yesterday') {
            const d = new Date();
            if (scope === 'yesterday') d.setDate(d.getDate() - 1);
            dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            scopeLabel = scope === 'today' ? '今天' : '昨天';
        } else if (scope === 'date' && cmd.undoDate) {
            dayStr = cmd.undoDate;
            scopeLabel = cmd.undoDate;
        }
        const localDay = (timestamp) => {
            const d = new Date(ts(timestamp));
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const dayTx = dayStr ? pool.filter(t => localDay(t) === dayStr) : [];
        if (dayTx.length === 0) {
            tbSay('「' + task.name + '」在' + scopeLabel + '没有记录', 3000);
            return;
        }
        if (cmd.undoOrdinal) {
            // 第 N 条 = 当天最早起的第 N 条（正序）
            dayTx.sort((a, b) => ts(a) - ts(b));
            const idx = Math.min(cmd.undoOrdinal, dayTx.length) - 1;
            target = dayTx[idx];
            scopeLabel += '第' + cmd.undoOrdinal + '条';
        } else {
            target = dayTx.reduce((a, b) => ts(a) > ts(b) ? a : b);
            scopeLabel += '最近一条';
        }
    }

    if (!target) return;
    console.log('[VoiceCommand] 撤回定位:', scopeLabel, target.id, target.taskName);

    // undoTransaction 自带确认框（显示描述/金额），用户确认后才真正撤回
    await undoTransaction(target.id);
}

// [v9.35.0-fix] 关键：const 声明不会挂到 window 上，app-reports.js 等外部模块
// 检查 window.VoiceCommand 会失败（"语音模块未加载"根因）。必须显式导出。
window.VoiceCommand = VoiceCommand;

// ==================== 自初始化 ====================
// Android 桥在 WebView onCreate 时注入（早于页面 JS），DOMContentLoaded 即可创建入口。
// [v9.35.0-fix] 修复：init 此前无调用方，导致悬浮麦克风按钮不显示。
(function bootstrapVoiceCommand() {
    // [v9.35.0-fix3] 旧降级策略残留清理
    try { localStorage.removeItem('tb_voice_prefer_dialog'); } catch (e) { /* 忽略 */ }

    let attempts = 0;
    const tryInit = () => {
        attempts++;
        if (VoiceCommand.isAvailable()) {
            VoiceCommand.init();
        } else if (attempts < 3) {
            // 桥极少数滞后场景：延时重试（PWA 端无桥，重试后放弃，不显示入口）
            setTimeout(tryInit, attempts * 1000);
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryInit);
    } else {
        tryInit();
    }
})();
