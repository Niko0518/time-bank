/**
 * time-bot.js [v9.36.0]
 * Time Bot 桥接层：把 Grok 风格动画引擎挂载到首页悬浮球（#fabButton）
 * 同时承载任务反馈的 S/A 分级判定（onComplete/onStop，供核心 app-2.js 调用）
 *
 * 命名规约（全 Time Bot 体系唯一标准）：
 * - 全局入口：window.TimeBot（唯一业务全局变量；引擎的 GrokCharacter/GROK_META 属舶来导出，仅本文件消费）
 * - 公开 API：驼峰动词 —— mount/setState/react/writeOnce/say/hideSay/onComplete/onStop
 * - 内部成员：_ 前缀驼峰 —— _loadEngine/_dailyAvgEarnSeconds…
 * - 动作剧本键（react kind）：驼峰 —— completeHighlight/stopHighlight/stop…
 * - 引擎状态名：小写单词（引擎协议，不改）—— excited/humming/drowsy…
 * - CSS 类：kebab-case —— time-bot-fab/time-bot-svg/time-bot-bubble
 *
 * 设计要点：
 * - 懒加载：等 body.data-ready 后再注入 time-bot-engine.js（~190KB），不抢冷启动资源
 * - 目标驱动：所有状态切换只是改弹簧目标值，中途打断永远平滑（引擎特性）
 * - 持续状态（setState）：idle/listening/searching/thinking/suspicious/drowsy…
 * - 反馈动作（react）：播一段表情后定时自动回 idle，celebrate 附带形体切换大动作
 * - 性能守护：页面隐藏时 setPaused；引擎仅更新一个小 SVG 的属性，不触发布局
 */
const TimeBot = {
    fabEl: null,
    bot: null,            // GrokCharacter 实例
    engineLoaded: false,
    engineLoading: false,
    pendingStage: null,   // 引擎未就绪期间积压的状态
    returnTimer: null,
    shapeHome: 'blob',    // 庆祝变身后要回归的身形

    // ---------- [v9.36.0] 常态待机轮换：4 个精选态，慢节奏（4000ms 节拍，idle 交替） ----------
    rotTimer: null,
    rotN: 0,
    // 筛选标准：有人格、不误导、小尺寸下看得清；humming 是 A 级完成反馈专属不入轮换；waking 仅首次亮相
    ROT_STATES: ['happy', 'curious', 'drowsy', 'playful'],

    _startRotation() {
        if (this.rotTimer || !this.bot) return;
        this.rotTimer = setInterval(() => this._rotationBeat(), 4000);
    },

    _stopRotation() {
        if (this.rotTimer) { clearInterval(this.rotTimer); this.rotTimer = null; }
    },

    // 原版 pjn 节拍：偶数拍 idle，奇数拍依次轮换情绪
    _rotationBeat() {
        if (!this.bot || document.hidden) return;
        this.rotN++;
        if (this.rotN % 2 === 0) {
            this.bot.setState('idle');
        } else {
            const s = this.ROT_STATES[Math.floor((this.rotN - 1) / 2) % this.ROT_STATES.length];
            this.bot.setState(s);
        }
    },

    // 由 VoiceCommand.init() 调用，接管 FAB 渲染（按钮初始为空，引擎加载完成后 Time Bot 直接登场）
    mount(fabEl) {
        if (this.fabEl) return;
        this.fabEl = fabEl;
        fabEl.classList.add('time-bot-fab');
        this._waitReady(() => this._loadEngine());
    },

    // 等首页数据就绪（app-1.js 的 initApp 会加 data-ready）再拉引擎
    _waitReady(cb) {
        const go = () => setTimeout(cb, 600);
        if (document.body && document.body.classList.contains('data-ready')) { go(); return; }
        let tries = 0;
        const timer = setInterval(() => {
            tries++;
            if ((document.body && document.body.classList.contains('data-ready')) || tries > 40) {
                clearInterval(timer);
                go(); // 超时也尝试加载（引擎与业务数据无关）
            }
        }, 500);
    },

    _loadEngine() {
        if (this.engineLoaded || this.engineLoading) return;
        this.engineLoading = true;
        const sc = document.createElement('script');
        sc.src = './js/time-bot-engine.js';
        sc.onload = () => { this.engineLoaded = true; this._initBot(); };
        sc.onerror = () => {
            this.engineLoading = false;
            console.warn('[TimeBot] 引擎加载失败，保留原麦克风按钮');
        };
        document.head.appendChild(sc);
    },

    _initBot() {
        try {
            const fab = this.fabEl;
            fab.innerHTML = '';
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.classList.add('time-bot-svg');
            svg.setAttribute('role', 'img');
            svg.setAttribute('aria-label', 'Time Bot');
            fab.appendChild(svg);
            this.bot = new GrokCharacter(svg, {
                mode: 'hold',          // 不做登录页情绪轮换，状态完全由语音流驱动
                shape: 'blob',
                color: 'black',
                loginWrap: true,       // [v9.36.0] 原版登录页 3D 斜视包装：POSE/FACE_TUNE/球面眼睛投影
                reduceMotion: false,   // [v9.36.0] 强制开启动画：防系统"减少动态效果"把所有动作归零
                followPointer: false,  // 移动端无悬停指针，关掉省计算
            });
            this._applyScheme();
            // [v9.36.0] 跟随主题切换（data-theme）改 Time Bot 墨色/眼色：亮页黑团、暗页白团防隐身
            this._themeObs = new MutationObserver(() => this._applyScheme());
            this._themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
            // 页面隐藏即暂停（引擎 rAF 空转保护）
            document.addEventListener('visibilitychange', () => {
                if (this.bot) this.bot.setPaused(document.hidden);
            });
            this.setState(this.pendingStage || 'idle');
            this.pendingStage = null;
            // [v9.36.0] 首次亮相：睁眼苏醒一次性演出，随后进入常态轮换
            try { this.bot.setState('waking'); } catch (e) { /* 忽略 */ }
            this._startRotation();   // 待机轮换开演（语音流一来自动暂停）
        } catch (e) {
            console.error('[TimeBot] 初始化失败:', e);
            // 失败时保持空按钮，不再回退麦克风图标
        }
    },

    // ---------- [v9.36.0] 状态作用域令牌（lease） ----------
    // 解决异步操作“忘记收回状态”导致 bot 卡在 thinking/listening 的结构性问题。
    // 任何需要临时占用 bot 状态的异步操作获取一个 lease；lease 释放时自动回 idle。
    // 不同 lease 之间互不干扰：旧 lease 释放不会影响新 lease 持有的状态。
    _leaseCounter: 0,
    _activeLease: 0,       // 当前活跃的 lease id（0 = 无租约）

    // 获取一个新的状态租约。返回的 id 传给 setState 即可锁定状态。
    acquireLease() {
        return ++this._leaseCounter;
    },

    // 释放租约。仅当 id 是当前活跃 lease 时才回退到 idle（防止旧 lease 覆盖新 lease）。
    releaseLease(id) {
        if (id && id === this._activeLease) {
            this._activeLease = 0;
            this.setState('idle');
        }
    },

    // ---------- 对外 API（ai-voice.js 调用，全部带未就绪守卫） ----------

    // 持续状态：语音流程阶段直接映射引擎状态
    // leaseId 可选：传入时仅当该 lease 仍活跃才生效（防旧异步回调污染新状态）
    // 不传 leaseId 的调用视为“所有者自身操作”（如 react/writeOnce 定时回 idle），始终生效
    setState(name, leaseId) {
        if (!this.bot) { this.pendingStage = name; return; }
        // lease 守卫：有活跃租约时，只有匹配的 leaseId 或无 leaseId（内部释放）才能改状态
        if (leaseId && leaseId !== this._activeLease) return;
        if (!leaseId && this._activeLease) {
            // 无 leaseId 的外部调用在有活跃租约时被忽略（防止意外打断）
            // 但 idle 例外——react/writeOnce 的定时回 idle 必须生效
            if (name !== 'idle') return;
        }
        if (this.returnTimer) { clearTimeout(this.returnTimer); this.returnTimer = null; }
        this._morphHome();                       // [v9.36.0] 任意状态接管先回收残形：A级卵石若被后续动作打断，不再残留
        this._stopRotation();                    // [v9.36.0] 语音流接管：暂停待机轮换
        this.bot.setState(name);
        if (name === 'idle') this._startRotation(); // 回到待机：恢复轮换
    },

    /**
     * 反馈动作：播一段表情，ms 后自动回 idle
     * [v9.36.0] 完成分级（onComplete 驱动，点按/语音通用）：
     *   completeHighlight（S级）= 兴奋+转一圈+彩色粒子
     *   completeNormal（A级）= 变身卵石+轻鸣，结束回 blob
     * 开始任务不走 react：核心 startTask 调 writeOnce()（书写播一遍后自动回归待机）
     * [v9.36.0] 结束分级（onStop 驱动，点按/语音通用）：
     *   stopHighlight（S级 圆满收工）= 兴奋+转圈+粒子；stop（A级）= 轻鸣
     */
    react(kind) {
        if (!this.bot) return;
        const PLAN = {
            completeHighlight: { state: 'excited',    ms: 3200, burst: true, spin: true },
            completeNormal:    { state: 'humming',    ms: 3400, morphTo: 'pebble' },
            stopHighlight:     { state: 'excited',    ms: 3200, burst: true, spin: true },
            stop:               { state: 'humming',    ms: 2600 },
            resume:             { state: 'excited',    ms: 2600 },
            pause:              { state: 'drowsy',     ms: 3200 },
            undo:               { state: 'proud',      ms: 3000 },
            delete:             { state: 'suspicious', ms: 3500 },
            chat:               { state: 'playful',    ms: 3000 },
            confused:           { state: 'confused',   ms: 3000 },
            error:              { state: 'scared',     ms: 2600 },
            cancel:             { state: 'surprised',  ms: 1600 },
        };
        const p = PLAN[kind];
        if (!p) { this.setState('idle'); return; }
        this._stopRotation();                    // [v9.36.0] 反馈期间暂停轮换（回 idle 后自动恢复）
        if (this.returnTimer) { clearTimeout(this.returnTimer); this.returnTimer = null; }
        if (p.morphTo) {                          // A 级：定向变身（引擎自动配一记特技）
            try { if (this.bot.shapeName !== p.morphTo) this.bot.setShape(p.morphTo); } catch (e) { /* 忽略 */ }
        }
        this.bot.setState(p.state);
        if (p.spin) this.bot.spinOnce(1);         // S 级：转一圈（spinTurn 弹簧驱动）
        if (p.burst) this.bot.burstOnce();        // 粒子爆花
        this.returnTimer = setTimeout(() => {
            this.returnTimer = null;
            this._morphHome();                    // 庆祝结束回归 blob（若已变身会再触发一次变形特技）
            this.setState('idle');
        }, p.ms);
    },

    // [v9.36.0] 开始任务书写场景：铅笔写一笔（引擎 PENCIL_MS=2500ms 一个完整循环）后自动回归待机
    // 不用 setState('writing')（那是持续状态，会一直停驻）；回归时引擎 overlay 弹簧淡出 + 墨水收回，过渡天然连贯
    writeOnce() {
        if (!this.bot) return;                   // 引擎未就绪不播（任务功能不受影响）
        if (this.returnTimer) { clearTimeout(this.returnTimer); this.returnTimer = null; }
        this._morphHome();                       // [v9.36.0] 书写前先回收残形（完成反馈变身卵石后立刻开始任务，先回 blob 再写）
        this._stopRotation();                    // 书写期间暂停待机轮换
        this.bot.setState('writing');
        this.returnTimer = setTimeout(() => {
            this.returnTimer = null;
            this.setState('idle');               // 写毕回归待机（内部恢复轮换），overlay 淡出由引擎弹簧接管
        }, 2500);
    },

    // [v9.36.2] 明暗适配：夜间保持原样（深色身体+米色眼睛）。此前暗色主题下反成白身黑眼，
    // 与整体深色界面违和，用户确认夜间维持原素材质感；用 setInk 平涂色绕开引擎默认 light-dark()
    _applyScheme() {
        if (!this.bot) return;
        this.bot.setInk('#161513');
        this.bot.setEyeColor('#f6f1e6');
    },

    _morphHome() {
        try { if (this.bot.shapeName !== this.shapeHome) this.bot.setShape(this.shapeHome); } catch (e) { /* 忽略 */ }
    },

    // ---------- [v9.36.0] 气泡系统：Time Bot 开口说话，替代原录音浮层与 Toast ----------
    bubbleEl: null,
    sayTimer: null,

    // 展示气泡；ms 省略 = 常驻直到下一次 say/hideSay
    say(text, ms) {
        try {
            const b = this._ensureBubble();
            b.textContent = text;
            b.classList.add('show');
            if (this.sayTimer) { clearTimeout(this.sayTimer); this.sayTimer = null; }
            if (ms) this.sayTimer = setTimeout(() => this.hideSay(), ms);
        } catch (e) { /* 气泡失败不阻断语音流程 */ }
    },

    hideSay() {
        if (this.sayTimer) { clearTimeout(this.sayTimer); this.sayTimer = null; }
        if (this.bubbleEl) this.bubbleEl.classList.remove('show');
    },

    _ensureBubble() {
        if (!this.bubbleEl) {
            const b = document.createElement('div');
            b.className = 'time-bot-bubble';
            b.setAttribute('aria-live', 'polite');
            document.body.appendChild(b);
            this.bubbleEl = b;
        }
        return this.bubbleEl;
    },

    // ---------- [v9.36.0] S/A 分级数据查询（纯内存计算，4000+ 条毫秒级） ----------
    // 统一的 timestamp 取值（兼容 number 与字符串两种存储）
    _txTs(t) {
        return typeof t.timestamp === 'number' ? t.timestamp : new Date(t.timestamp).getTime();
    },

    // 该任务最近一条完成交易（earn）的时长，用作 S 级奖励判定
    _lastCompleteSeconds(taskId) {
        if (typeof transactions === 'undefined' || !Array.isArray(transactions)) return 0;
        let latest = null;
        for (const t of transactions) {
            if (t.taskId !== taskId || t.undone || t.type !== 'earn') continue;
            if (!latest || this._txTs(t) > this._txTs(latest)) latest = t;
        }
        return latest ? Math.abs(latest.amount || 0) : 0;
    },

    // 近 7 日日均 earn 总时长（完成 S 级基线，无数据返 0）
    _dailyAvgEarnSeconds() {
        if (typeof transactions === 'undefined' || !Array.isArray(transactions)) return 0;
        const cutoff = Date.now() - 7 * 86400000;
        let sum = 0;
        for (const t of transactions) {
            if (t.undone || t.type !== 'earn') continue;
            if (this._txTs(t) >= cutoff) sum += Math.abs(t.amount || 0);
        }
        return sum / 7;
    },

    // 该任务今日完成次数（含刚入账这条，钩子在完成入账后调用，=== 1 即今日首次）
    _todayCompletions(taskId) {
        if (typeof transactions === 'undefined' || !Array.isArray(transactions)) return 0;
        const d = new Date();
        const dayStr = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
        let n = 0;
        for (const t of transactions) {
            if (t.taskId !== taskId || t.undone || t.type !== 'earn') continue;
            const td = new Date(this._txTs(t));
            if ((td.getFullYear() + '-' + (td.getMonth() + 1) + '-' + td.getDate()) === dayStr) n++;
        }
        return n;
    },

    // 近 7 日日均投入总时长（秒，earn+spend 合并），用作结束「圆满收工」基线
    _dailyAvgUsageSeconds() {
        if (typeof transactions === 'undefined' || !Array.isArray(transactions)) return 0;
        if (typeof getRawUsageSecondsFromTransaction !== 'function') return 0;
        const cutoff = Date.now() - 7 * 86400000;
        let sum = 0;
        for (const t of transactions) {
            if (t.undone) continue;
            if (this._txTs(t) >= cutoff) sum += getRawUsageSecondsFromTransaction(t);
        }
        return sum / 7;
    },

    // ---------- [v9.36.0] 任务反馈钩子（核心 app-2.js 调用，点按/语音通用） ----------

    // 完成任务统一入口：S 级（今日首次 / 习惯连胜≥7 / 单笔≥日均2倍）= 兴奋+转圈+粒子；A 级 = 变身卵石
    onComplete(task) {
        if (!task) return;
        try {
            const isFirstToday = this._todayCompletions(task.id) === 1;
            const amount = this._lastCompleteSeconds(task.id);
            const dailyAvg = this._dailyAvgEarnSeconds();
            const streakOk = !!(task.isHabit && task.habitDetails && task.habitDetails.streak >= 7);
            const isHighlight = isFirstToday || streakOk || (dailyAvg > 0 && amount >= dailyAvg * 2);
            if (isHighlight) {
                this.say('太棒了！完成「' + task.name + '」', 3200);
                this.react('completeHighlight');
            } else {
                this.say('已完成「' + task.name + '」', 3000);
                this.react('completeNormal');
            }
        } catch (e) { /* Time Bot 失败不阻断任务流程 */ }
    },

    // 结束任务统一入口：S 级（圆满收工）= 达计划时长 80% 或 ≥ 近7日日均投入 → 兴奋+转圈+粒子；A 级 = 轻鸣
    // [v9.36.2] fromVoice：语音结束=true 弹气泡确认执行；手动按钮结束=false 仅保留视觉反馈（界面已有直接反馈，气泡冗余）
    onStop(task, totalSeconds, fromVoice) {
        if (!task) return;
        try {
            const planSeconds = (task.type === 'continuous_target' && task.targetTime > 0) ? task.targetTime : 0;
            const dailyAvg = this._dailyAvgUsageSeconds();
            const isHighlight = (planSeconds > 0 && totalSeconds >= planSeconds * 0.8)
                || (dailyAvg > 0 && totalSeconds >= dailyAvg);
            this.react(isHighlight ? 'stopHighlight' : 'stop');   // 视觉反馈点按/语音一致
            if (!fromVoice) return;                               // [v9.36.2] 手动结束不弹气泡
            if (isHighlight) {
                this.say('圆满收工！坚持了' + (typeof formatTime === 'function' ? formatTime(totalSeconds) : totalSeconds + '秒'), 3200);
            } else {
                this.say('已结束「' + task.name + '」', 2600);
            }
        } catch (e) { /* Time Bot 失败不阻断任务流程 */ }
    },

    // ---------- [v9.36.0] 对话窗：Time Bot 气泡同源风格的浮动卡片 ----------
    // 点击 FAB 打开；记录双方对话（云端历史）；窗内 🎙 分流（指令执行/闲聊）
    chatEl: null,
    chatBodyEl: null,
    chatBusy: false,
    _bubbleMode: false,    // [v9.36.0] 长按气泡对话：指令逻辑同窗内，但闲聊展示走外层气泡而非弹窗
    _chatLease: 0,         // 当前对话窗持有的状态租约 id

    isChatOpen() {
        return !!(this.chatEl && this.chatEl.classList.contains('show'));
    },

    // 打开对话窗；pendingText 非空时自动作为聊天发送（长按 PTT 非指令分流）
    // [v9.36.2] 每次打开都刷新云端历史：长按气泡对话的记录（AI_ASSISTANT_SERVICE.chat 已持久化到
    // tb_ai_messages）会在此时同步进窗，保证「同一对话、不同呈现」——气泡聊过的话打开弹窗都看得到
    async openChat(pendingText) {
        this._chatEnsure();
        if (pendingText) {
            await this._chatLoadHistory();   // 待发送时先等历史渲染完，避免 chatSend 追加被覆盖
            this.chatEl.classList.add('show');
            this.chatSend(pendingText);
        } else {
            this._chatLoadHistory();         // 常规打开：后台刷新历史
            // [v9.36.0] 弹窗打开：主页 Time Bot 进入持续性 orbit（环绕待命），弹窗关闭后恢复待机轮换
            this._stopRotation(); this.setState('orbit');
            this.chatEl.classList.add('show');
        }
    },

    closeChat() {
        // 释放对话窗持有的状态租约：无论 chatSend 进行到哪一步，bot 立即回 idle
        if (this._chatLease) { this.releaseLease(this._chatLease); this._chatLease = 0; }
        this.chatBusy = false;
        if (this.chatEl) this.chatEl.classList.remove('show');
        // [v9.36.0] 弹窗关闭：主页 Time Bot 从 orbit 恢复待机（强制回 idle 进入常态轮换）
        this.setState('idle');
    },

    // [v9.36.0] 长按 PTT 非指令时的气泡对话：复用 chatSend 的指令优先管线，
    // 但全程不打开弹窗——闲聊展示以主页气泡 say 呈现（区别于单击打开的窗内聊天）
    async bubbleChat(text) {
        this._bubbleMode = true;
        try {
            await this.chatSend(text);
        } finally {
            this._bubbleMode = false;
        }
    },

    // tbSay 同步入口：语音流程/指令反馈在窗内以系统消息可见
    chatSay(text) {
        if (!this.isChatOpen() || !text) return;
        this._chatAppend('sys', (typeof escapeHtml === 'function' ? escapeHtml(text) : String(text)));
    },

    _chatEnsure() {
        if (this.chatEl) return;
        const card = document.createElement('div');
        card.className = 'time-bot-chat-card';
        card.innerHTML =
            '<div class="time-bot-chat-header">' +
                '<div class="time-bot-chat-avatar"><div class="tbav-eye l"></div><div class="tbav-eye r"></div></div>' +
                '<div class="time-bot-chat-titles">' +
                    '<div class="time-bot-chat-name">Time Bot</div>' +
                    '<div class="time-bot-chat-status" id="timeBotChatStatus">在线 · 说指令或聊聊天</div>' +
                '</div>' +
                '<button class="time-bot-chat-iconbtn" onclick="TimeBot.chatOpenSettings()" title="AI 设置">⚙</button>' +
                '<button class="time-bot-chat-iconbtn" onclick="TimeBot.closeChat()" aria-label="关闭">✕</button>' +
            '</div>' +
            '<div class="time-bot-chat-body" id="timeBotChatBody"></div>' +
            '<div class="time-bot-chat-footer">' +
                '<button class="time-bot-chat-mic" id="timeBotChatMic" onclick="TimeBot.chatVoice()" title="语音" aria-label="语音输入">🎙</button>' +
                '<input type="text" class="time-bot-chat-input" id="timeBotChatInput" placeholder="和 Time Bot 说点什么…" onkeydown="if(event.key===\'Enter\')TimeBot.chatSendInput()">' +
                '<button class="time-bot-chat-send" onclick="TimeBot.chatSendInput()">发送</button>' +
            '</div>';
        document.body.appendChild(card);
        this.chatEl = card;
        this.chatBodyEl = card.querySelector('#timeBotChatBody');
        this._chatLoadHistory();
    },

    // 云端历史：双方对话记录持久化（AI_ASSISTANT_SERVICE 内部负责存取）
    // [v9.36.2] 防重入 + 防重开重建频闪：
    //  - _histLoading：并发触发只执行一次
    //  - _histLoaded：弹窗关闭后再次打开时复用现有渲染，不再清空重建（旧的"清默认问候→填历史"在每次重开都会闪）
    //  - 默认问候改为 history 为空时才补，body 首次为空则直接 append，免除一次"清空→填充"的可见闪烁
    async _chatLoadHistory() {
        if (this._histLoading || this._histLoaded) return;
        if (!window.AI_ASSISTANT_SERVICE || !AI_ASSISTANT_SERVICE.getChatHistory) return;
        this._histLoading = true;
        try {
            const messages = await AI_ASSISTANT_SERVICE.getChatHistory(50);
            if (!this.chatBodyEl) return;
            if (!messages || !messages.length) {
                this._chatAppend('ai', '嗨～想聊点什么？也可以直接说「开始阅读」「取消运动」这样的指令。');
            } else {
                // 仅当 body 已非空才清空（首次为空则直接填充，避免清空→填充闪白）
                if (this.chatBodyEl.childElementCount) this.chatBodyEl.innerHTML = '';
                // [v9.36.2] \n → <br> 与流式渲染一致：气泡对话/多行回复进窗后正常换行
                messages.forEach(m => this._chatAppend(m.role === 'user' ? 'user' : 'ai', escapeHtml(m.content || '').replace(/\n/g, '<br>')));
            }
            this._histLoaded = true;
        } catch (e) { /* 历史加载失败不阻断聊天 */ }
        finally { this._histLoading = false; }
    },

    // role: user / ai / sys（系统消息：指令执行反馈、状态提示）
    _chatAppend(role, html, id) {
        if (!this.chatBodyEl) return;
        const el = document.createElement('div');
        el.className = 'time-bot-chat-msg ' + role;
        if (id) el.id = id;
        el.innerHTML = html;
        this.chatBodyEl.appendChild(el);
        this.chatBodyEl.scrollTop = this.chatBodyEl.scrollHeight;
    },

    _chatStatus(text) {
        const el = this.chatEl ? this.chatEl.querySelector('#timeBotChatStatus') : null;
        if (el) el.textContent = text;
    },

    chatOpenSettings() {
        if (typeof showAIAssistantSettings === 'function') showAIAssistantSettings();
    },

    chatSendInput() {
        const input = this.chatEl ? this.chatEl.querySelector('#timeBotChatInput') : null;
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        this.chatSend(text);
    },

    // [v9.36.0] 一句话为任务生成背景图：解析指令
    // 支持：生成背景图 「任务名」描述 / 给「晨跑」生成背景图，海边日出 / 背景图 读书 森林 / 为 冥想 生成背景图 星空
    _parseBackgroundCommand(text) {
        if (!text || typeof text !== 'string') return null;
        const t = text.replace(/\s+/g, ' ').trim();
        if (!/背景图/.test(t)) return null;

        let taskName = '';
        let quotedName = null;
        // 优先取「」/''/""/『』 包裹的任务名
        const m = t.match(/[「『“"'']([^」『”"'']+)[」『”"'']/);
        if (m) {
            quotedName = m[1].trim();
            taskName = quotedName;
        } else {
            // 否则在“背景图”后紧邻取首个中英文/数字词作为任务名
            const after = t.slice(t.indexOf('背景图') + 3);
            const m2 = after.match(/^\s*([A-Za-z0-9\u4e00-\u9fa5]+)/);
            taskName = m2 ? m2[1].trim() : '';
        }
        if (!taskName) return null;

        // 描述：剔除任务名与意图词，剩下作为图片描述
        let desc = t;
        if (quotedName) {
            desc = t.replace(/[「『“"'']([^」『”"'']+)[」『”"'']/, ' ').replace(/背景图/g, ' ');
        } else {
            desc = t
                .slice(0, t.indexOf('背景图')) + ' ' + t.slice(t.indexOf('背景图') + 3)
                .replace(taskName, ' ')
                .replace(/背景图/g, ' ');
        }
        desc = desc.replace(/^[给为帮把生成任务背景图]+/, ' ')
            .replace(/[,，。.;；?？!！]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return { taskName, prompt: desc };
    },

    // [v9.36.0] 执行一句话生图：查同名任务 → 云端生图 → 云存储持久化 → 应用到任务 → 对话展示预览
    async _runBackgroundCommand(bgCmd) {
        this.chatBusy = true;
        this._chatStatus('正在查找任务并生成背景图…');
        this.setState('thinking');
        const loadingId = 'tb-bg-loading-' + Date.now();
        this._chatAppend('ai', '<span class="time-bot-chat-typing"><span></span><span></span><span></span></span>', loadingId);

        try {
            // 1. 查同名任务（本地 tasks 全局数组）
            const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
            const target = norm(bgCmd.taskName);
            let task = null;
            if (typeof tasks !== 'undefined' && Array.isArray(tasks)) {
                task = tasks.find(t => t && norm(t.name) === target);
                if (!task) task = tasks.find(t => t && norm(t.name) && (norm(t.name).includes(target) || target.includes(norm(t.name))));
            }
            const taskName = task ? task.name : bgCmd.taskName;
            const taskId = task ? task.id : null;

            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.remove();

            // 2. 云端生图（CloudBase 资源点 hunyuan-image）
            const onProgress = (stage) => this._chatStatus(stage);
            const result = await AI_ASSISTANT_SERVICE.generateTaskBackgroundImage(
                {
                    name: taskName,
                    note: task ? (task.note || '') : '',
                    category: task ? (task.category || '') : '',
                    colorHex: task ? (task.color || task.colorHex || '') : ''
                },
                { aspectRatio: '3:2', prompt: bgCmd.prompt || '', onProgress }
            );
            // [v9.36.0] 云函数已在上游完成生成+上传云存储，直接用返回的 downloadUrl，无需二次上传
            const url = result.downloadUrl;

            // 3. 应用到任务（仅登录时）
            let applied = false;
            const isLogged = typeof isLoggedIn === 'function' ? isLoggedIn() : false;
            try {
                if (isLogged && task) {
                    const clone = { ...task, backgroundImage: url };
                    if (typeof DAL !== 'undefined' && DAL.saveTask) {
                        await DAL.saveTask(clone);
                    }
                    // 本地同步并刷新界面
                    if (typeof tasks !== 'undefined' && Array.isArray(tasks)) {
                        const idx = tasks.findIndex(t => t === task);
                        if (idx !== -1) tasks[idx].backgroundImage = url;
                    }
                    applied = true;
                    if (typeof updateAllUI === 'function') updateAllUI();
                    else if (typeof renderTaskCards === 'function') renderTaskCards(tasks);
                } else if (!isLogged) {
                    // 未登录：仅本地缓存
                    if (typeof updateAllUI === 'function') updateAllUI();
                }
            } catch (saveErr) {
                console.error('[TimeBot] 背景图保存失败（保留预览）:', saveErr);
            }

            const previewHtml =
                '<div style="margin-bottom:6px">已为「' + escapeHtml(taskName) + '」生成背景图：</div>' +
                '<img src="' + url + '" style="width:100%;border-radius:10px;display:block;max-height:180px;object-fit:cover" onerror="this.style.display=\'none\'"/>' +
                (applied
                    ? '<div style="margin-top:6px;opacity:.72">✅ 已应用到任务（多端同步）</div>'
                    : '<div style="margin-top:6px;opacity:.72">ℹ️ 已生成预览（未找到同名任务，可在编辑里应用）</div>');
            this._chatAppend('ai', previewHtml);
        } catch (e) {
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.remove();
            console.error('[TimeBot] 生成任务背景图失败:', e);
            this._chatAppend('ai', '生成背景图失败：' + (e && e.message ? e.message : '未知错误'));
        }
        this.chatBusy = false;
        this._chatStatus('在线 · 说指令或聊聊天');
        if (this.isChatOpen()) { this._stopRotation(); this.setState('orbit'); }
    },

    // 发送聊天（流式渲染；chat() 内部已持久化双方消息）
    // [v9.36.0] 通过 lease 绑定状态生命周期：closeChat/新请求会自动释放旧 lease → bot 回 idle
    async chatSend(text) {
        if (!text || this.chatBusy) return;
        if (!window.AI_ASSISTANT_SERVICE || !AI_ASSISTANT_SERVICE.chat) {
            this._chatAppend('sys', 'AI 服务未加载');
            return;
        }

        // [v9.36.0] 指令优先管线：背景图 → 通用指令（本地正则）→ AI 意图判别 → LLM 闲聊兜底

        // [v9.36.0] 气泡模式（长按）：指令分支照常执行（反馈经 tbSay 为气泡），但从不强制打开弹窗
        const ensureVisible = () => {
            if (this._bubbleMode) return;
            this._chatEnsure();
            if (!this.isChatOpen()) this.chatEl.classList.add('show');
        };

        // ① 一句话为任务生成背景图：命中则直接走生图流程，不进入 LLM 闲聊
        const bgCmd = this._parseBackgroundCommand(text);
        if (bgCmd) {
            ensureVisible();
            if (!this._bubbleMode) this._chatAppend('user', escapeHtml(text));
            await this._runBackgroundCommand(bgCmd);
            return;
        }

        // ② 通用指令（开始/完成/结束/删除/暂停/继续/撤回）：本地正则零成本命中即执行
        let cmd = (typeof parseLocalVoiceCommand === 'function') ? parseLocalVoiceCommand(text) : null;
        if (cmd && cmd.action && cmd.action !== 'unknown' && cmd.taskName) {
            ensureVisible();
            if (!this._bubbleMode) this._chatAppend('user', escapeHtml(text));
            try { await executeVoiceCommand(cmd, text); } catch (e) { /* 执行失败不阻断窗口，tbSay 已反馈 */ }
            return;
        }

        // ③ AI 意图判别兜底：本地正则未命中但有口语化指令（成本敏感，仅真正疑似指令时兜底）
        if (window.AI_ASSISTANT_SERVICE && typeof AI_ASSISTANT_SERVICE.parseVoiceIntent === 'function') {
            try {
                const intent = await AI_ASSISTANT_SERVICE.parseVoiceIntent(text);
                if (!intent) {
                    // fallthrough
                } else if (intent.action === 'background' && intent.taskName) {
                    // [v9.36.0] AI 判为背景图指令：走生图流程（复用本地 _runBackgroundCommand）
                    ensureVisible();
                    if (!this._bubbleMode) this._chatAppend('user', escapeHtml(text));
                    await this._runBackgroundCommand({ taskName: intent.taskName, prompt: intent.backgroundPrompt || '' });
                    return;
                } else if (intent.action && intent.action !== 'unknown' && intent.taskName) {
                    ensureVisible();
                    if (!this._bubbleMode) this._chatAppend('user', escapeHtml(text));
                    try { await executeVoiceCommand(intent, text); } catch (e) { /* 同上 */ }
                    return;
                }
            } catch (e) {
                // AI 意图判别失败不阻断闲聊，静默降级
                console.warn('[TimeBot] AI 意图判别失败，降级为闲聊:', e);
            }
        }

        // ④ LLM 闲聊（最后兜底）

        if (this._bubbleMode) {
            // [v9.36.0] 长按气泡对话：不弹窗，AI 回复以主页气泡 say 呈现
            // [v9.36.2] 气泡 = 弹窗同一回复的轻量预览：AI_ASSISTANT_SERVICE.chat 已把双方消息写入
            // tb_ai_messages（打开弹窗即见）；此处做长文截断 + 按字数自适应显示时长
            try {
                this.setState('thinking');
                this.say('正在思考中…', 0);
                const reply = await AI_ASSISTANT_SERVICE.chat(text, {});
                const replyText = reply ? String(reply) : '抱歉，我没听懂。';
                const MAX = 160;
                const display = replyText.length > MAX
                    ? replyText.slice(0, MAX).replace(/\n+/g, ' ') + '…（完整内容见对话窗）'
                    : replyText;
                const ms = Math.min(3000 + display.length * 45, 12000);
                this.say(display, ms);
                // 窗开着（边缘场景）时同步进窗，与弹窗聊天保持同一对话流
                if (this.isChatOpen()) {
                    this._chatAppend('user', escapeHtml(text));
                    this._chatAppend('ai', escapeHtml(replyText).replace(/\n/g, '<br>'));
                }
                if (this.returnTimer) clearTimeout(this.returnTimer);
            } catch (e) {
                this.say('抱歉，我刚才走神了，能再说一遍吗？', 4000);
            } finally {
                this.setState('idle');
            }
            return;
        }

        // 释放上一次可能残留的 lease（防御性），获取新 lease
        if (this._chatLease) this.releaseLease(this._chatLease);
        this._chatLease = this.acquireLease();
        this.chatBusy = true;
        this._chatEnsure();
        if (!this.isChatOpen()) this.chatEl.classList.add('show');
        this._chatAppend('user', escapeHtml(text));
        const loadingId = 'tb-chat-loading-' + Date.now();
        this._chatAppend('ai', '<span class="time-bot-chat-typing"><span></span><span></span><span></span></span>', loadingId);
        this._chatStatus('思考中…');
        // 通过 lease 设置 thinking：如果窗口在 await 期间被关闭，lease 已失效，setState 被忽略
        this.setState('thinking', this._chatLease);

        let streamId = null;
        let streamText = '';
        const onStreamChunk = (delta, full) => {
            streamText = full || streamText + delta;
            if (!streamId) {
                const loadingEl = document.getElementById(loadingId);
                if (loadingEl) loadingEl.remove();
                streamId = 'tb-chat-stream-' + Date.now();
                this._chatAppend('ai', escapeHtml(streamText).replace(/\n/g, '<br>') + '<span class="ai-stream-cursor"></span>', streamId);
            } else {
                const el = document.getElementById(streamId);
                if (el) {
                    el.innerHTML = escapeHtml(streamText).replace(/\n/g, '<br>') + '<span class="ai-stream-cursor"></span>';
                    if (this.chatBodyEl) this.chatBodyEl.scrollTop = this.chatBodyEl.scrollHeight;
                }
            }
        };

        try {
            const reply = await AI_ASSISTANT_SERVICE.chat(text, { onStreamChunk });
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.remove();
            if (streamId) {
                const el = document.getElementById(streamId);
                if (el) el.innerHTML = reply ? String(reply).replace(/\n/g, '<br>') : '抱歉，我没听懂。';
            } else {
                this._chatAppend('ai', reply ? String(reply).replace(/\n/g, '<br>') : '抱歉，我没听懂。');
            }
        } catch (e) {
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.remove();
            if (streamId && streamText) {
                const el = document.getElementById(streamId);
                if (el) el.innerHTML = escapeHtml(streamText).replace(/\n/g, '<br>') + '<br><span class="time-bot-chat-broken">（回复中断）</span>';
            } else {
                this._chatAppend('ai', '抱歉，我刚才走神了，能再说一遍吗？');
            }
        }
        this.chatBusy = false;
        this._chatStatus('在线 · 说指令或聊聊天');
        // 正常完成：释放 lease，bot 回 idle；若弹窗仍开着，则回到持续性 orbit 待命（而非进入待机轮换）
        this.releaseLease(this._chatLease);
        this._chatLease = 0;
        if (this.isChatOpen()) { this._stopRotation(); this.setState('orbit'); }
    },

    // 窗内 🎙：分流模式——先本地指令解析，是指令就执行（反馈经 tbSay 自动进窗），否则当聊天发送
    chatVoice() {
        if (!window.VoiceCommand) {
            this._chatAppend('sys', '语音模块未加载');
            return;
        }
        if (VoiceCommand.listening) {
            VoiceCommand.cancel();
            this._chatAppend('sys', '已取消录音');
            return;
        }
        const mic = this.chatEl ? this.chatEl.querySelector('#timeBotChatMic') : null;
        if (mic) mic.classList.add('recording');
        this._chatStatus('在听…');
        VoiceCommand.customHandler = async (raw) => {
            if (mic) mic.classList.remove('recording');
            this._chatStatus('在线 · 说指令或聊聊天');
            const cmd = (typeof parseLocalVoiceCommand === 'function') ? parseLocalVoiceCommand(raw) : null;
            const isCmd = cmd && cmd.action && cmd.action !== 'unknown' && cmd.taskName;
            if (isCmd) {
                this._chatAppend('user', escapeHtml(raw));
                try { await executeVoiceCommand(cmd, raw); } catch (e) { /* 指令失败不阻断窗口 */ }
                // 执行反馈已由 executeVoiceCommand 内的 tbSay 写入窗口
            } else {
                this.chatSend(raw);
            }
        };
        const started = VoiceCommand.startListening();
        // [v9.36.2] 浏览器录音为异步启动：失败时同样移除 recording 态
        if (started && typeof started.then === 'function') {
            started.then(ok => { if (!ok && mic) mic.classList.remove('recording'); });
        } else if (!started && mic) {
            mic.classList.remove('recording');
        }
    },
};

// const 声明不挂 window，外部模块统一走 window.TimeBot（与 VoiceCommand 同款约定）
window.TimeBot = TimeBot;
