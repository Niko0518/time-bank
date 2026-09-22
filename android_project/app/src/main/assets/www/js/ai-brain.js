/**
 * ai-brain.js [v9.37.0]
 * AI 认知层：双层画像（稳定层 core / 状态层 state）+ 语言证据 + 本地数据问答 + 主动建议
 *
 * 设计要点（与 v9.37.0 方案一致）：
 * - 确定性优先：能本地算准的一律不调模型 —— AI_BRAIN.answerLocally() 覆盖 10 类高频问法
 * - 双层画像：core（变化慢，需多次证据）与 state（随时更新，7 天过期）分离，替换"一张死照片"
 * - 语言证据：从用户自己的发言中抽取目标/承诺/偏好/抱怨，作为"看得出你是什么人"的原料
 * - 可解释/可纠正/可沉默：每条结论带依据；支持删除单条与整体重置；主动建议可关、可降频
 * - 失败即静默：所有能力包在 try/catch 中，任何异常都不影响主流程（对话/任务/记账）
 *
 * 对外入口：window.AI_BRAIN
 *   generate(force)       生成/刷新画像（前端构建输入 → 模型提炼）
 *   promptFragment()      给对话 Prompt 注入的简短片段
 *   answerLocally(text)   本地问答，命中返回字符串，未命中返回 null
 *   onAppOpen()           打开 App 时调用：按需刷新画像 + 主动建议
 *   renderPortraitHtml()  画像页 HTML（供 AI 设置弹窗渲染）
 *   removeItem(path)      删除画像中的单条结论
 *   reset(keepState)      重置画像
 */
const AI_BRAIN = {
    VERSION: 2,
    MEM_KEY: 'timebankAIBrainV2',          // 本地缓存（离线可读、秒开）
    PROACTIVE_KEY: 'timebankAIBrainProactive',

    DAY_MS: 86400000,
    HOUR_MS: 3600000,
    REFRESH_GAP_MS: 12 * 3600000,          // 距上次更新超过 12 小时才后台刷新
    STATE_TTL_MS: 7 * 86400000,            // 状态层 7 天过期

    _cache: null,
    _generating: false,
    _lastError: '',

    // ============================================================
    // 全局数据访问（全部带兜底，避免加载顺序/未登录导致异常）
    // ============================================================
    _txs() {
        return (typeof transactions !== 'undefined' && Array.isArray(transactions)) ? transactions : [];
    },
    _tasks() {
        return (typeof tasks !== 'undefined' && Array.isArray(tasks)) ? tasks : [];
    },
    _balance() {
        try {
            if (typeof state !== 'undefined' && state && typeof state.balance === 'number') return state.balance;
        } catch (e) { /* 忽略 */ }
        return null;
    },
    _ts(t) {
        if (!t) return 0;
        const v = t.timestamp;
        if (typeof v === 'number') return v;
        const parsed = new Date(v).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
    },
    _dayStart(ts) {
        const d = new Date(ts);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    },
    _dayKey(ts) {
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },
    _fmtDate(ts) {
        const d = new Date(ts);
        return `${d.getMonth() + 1}月${d.getDate()}日`;
    },
    // 时长展示：口语化中文口径（本地问答面向"说话"，比 hh:mm:ss 更自然；数字与首页同源）
    _dur(sec) {
        const s = Math.abs(Math.round(sec || 0));
        const h = Math.floor(s / 3600);
        const m = Math.round((s % 3600) / 60);
        if (h > 0 && m > 0) return `${h} 小时 ${m} 分`;
        if (h > 0) return `${h} 小时`;
        return `${m} 分钟`;
    },

    // ============================================================
    // 输入构建：六类原料
    // ============================================================
    buildBehaviorTrace() {
        const txs = this._txs();
        if (!txs.length) return null;
        const hourBuckets = new Array(24).fill(0);
        const weekBuckets = new Array(7).fill(0);
        const daySet = new Set();
        let longestGap = 0;
        const sortedDays = [];

        txs.forEach(t => {
            const ts = this._ts(t);
            if (!ts) return;
            const d = new Date(ts);
            hourBuckets[d.getHours()]++;
            weekBuckets[d.getDay()]++;
            daySet.add(this._dayStart(ts));
        });

        const days = [...daySet].sort((a, b) => a - b);
        days.forEach(d => sortedDays.push(d));
        // 中断点与恢复速度：相邻活跃日间隔 > 1 天视为中断
        const gaps = [];
        for (let i = 1; i < days.length; i++) {
            const gapDays = Math.round((days[i] - days[i - 1]) / this.DAY_MS) - 1;
            if (gapDays > 0) gaps.push({ gapDays, start: days[i - 1], end: days[i] });
        }
        gaps.forEach(g => { if (g.gapDays > longestGap) longestGap = g.gapDays; });
        const avgGap = gaps.length ? +(gaps.reduce((a, g) => a + g.gapDays, 0) / gaps.length).toFixed(1) : 0;

        // 连续记录天数（当前 streak）
        let currentStreak = 0;
        if (days.length) {
            let cursor = this._dayStart(Date.now());
            const set = new Set(days);
            const todayHit = set.has(cursor) || set.has(cursor - this.DAY_MS);
            if (todayHit) {
                if (!set.has(cursor)) cursor -= this.DAY_MS;
                while (set.has(cursor)) { currentStreak++; cursor -= this.DAY_MS; }
            }
        }

        const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
        const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const busiestWeek = weekNames[weekBuckets.indexOf(Math.max(...weekBuckets))];
        const nightCount = hourBuckets.slice(0, 4).reduce((a, b) => a + b, 0);
        const nightRatio = Math.round(nightCount / txs.length * 100);

        return { total: txs.length, hourBuckets, weekBuckets, peakHour, busiestWeek, nightRatio,
            longestGap, avgGap, currentStreak, gapCount: gaps.length, dayCount: days.length };
    },

    buildTaskMeta() {
        const list = this._tasks().filter(t => t && !t.hidden);
        return list.slice(0, 25).map(t => ({
            name: t.name,
            type: t.type,
            category: t.category || '未分类',
            targetMin: Math.round((t.targetTime || 0) / 60),
            isHabit: !!t.isHabit,
            habitType: t.habitDetails?.type || null,
            streak: t.habitDetails?.currentStreak ?? t.currentStreak ?? 0,
            note: (t.note || '').slice(0, 40)
        }));
    },

    buildCrossDim() {
        const out = {};
        try {
            if (typeof getSleepHistory === 'function') {
                const sh = getSleepHistory();
                const arr = Array.isArray(sh) ? sh.slice(-7) : [];
                if (arr.length) {
                    const durations = arr.map(r => r.duration || r.totalMinutes ? (r.duration || r.totalMinutes) : 0).filter(Boolean);
                    out.sleepDays = arr.length;
                    out.sleepAvgHours = durations.length ? +(durations.reduce((a, b) => a + b, 0) / durations.length / 60).toFixed(1) : null;
                    const last = arr[arr.length - 1];
                    out.lastSleepAt = last?.endTime || last?.startTime || null;
                }
            }
        } catch (e) { /* 睡眠模块不可用则跳过 */ }
        out.balance = this._balance();
        return out;
    },

    // 时间尺度变化：近 30 天 / 前 30 天 / 全期
    buildTrend() {
        const txs = this._txs();
        const today = this._dayStart(Date.now());
        const sum = (from, to) => {
            let e = 0, s = 0, n = 0;
            txs.forEach(t => {
                const ts = this._ts(t);
                if (ts < from || ts >= to) return;
                n++;
                if (t.type === 'earn') e += t.amount || 0; else s += Math.abs(t.amount || 0);
            });
            return { e, s, n };
        };
        const cur = sum(today - 30 * this.DAY_MS, today + this.DAY_MS);
        const prev = sum(today - 60 * this.DAY_MS, today - 30 * this.DAY_MS);
        const all = sum(0, today + this.DAY_MS);
        const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
        return { cur30: cur, prev30: prev, all, earnChange: pct(cur.e, prev.e), spendChange: pct(cur.s, prev.s), txChange: pct(cur.n, prev.n) };
    },

    /**
     * 语言证据：用户自己说过的话（目标/承诺/偏好/抱怨/情绪）
     * 数据源：tb_ai_messages 中的 user 发言（由 generate 时异步拉取）
     */
    extractLanguageEvidence(messages) {
        const rules = [
            { kind: 'goal', re: /(我想|我要|想要|希望|打算|计划|决定|目标是)([^。！？\n]{2,24})/ },
            { kind: 'commitment', re: /(以后|从明天|从今天|再也不|一定要|保证|必须)([^。！？\n]{2,24})/ },
            { kind: 'preference', re: /(喜欢|最爱|讨厌|受不了|不喜欢|宁愿)([^。！？\n]{2,24})/ },
            { kind: 'struggle', re: /(坚持不了|做不到|又没|总是失败|太累|没时间|好难|拖延)([^。！？\n]{0,24})/ },
            { kind: 'mood', re: /(焦虑|压力大|烦|低落|开心|很爽|满足)([^。！？\n]{0,20})/ }
        ];
        const out = [];
        (messages || []).forEach((m, idx) => {
            if (!m || m.role !== 'user') return;
            const text = String(m.content || '').trim();
            if (!text || text.length > 120) return;
            const ts = m.createdAt ? (typeof m.createdAt === 'number' ? m.createdAt : new Date(m.createdAt).getTime()) : 0;
            const dateStr = ts ? this._fmtDate(ts) : `第${idx + 1}条`;
            rules.forEach(r => {
                const hit = text.match(r.re);
                if (hit) out.push({ kind: r.kind, text: hit[0].slice(0, 40), quote: text.slice(0, 60), date: dateStr });
            });
        });
        // 去重 + 限流
        const seen = new Set();
        return out.filter(e => {
            const k = e.kind + '|' + e.text;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        }).slice(0, 18);
    },

    // ============================================================
    // 画像生成
    // ============================================================
    buildInputsText(evidence) {
        const lines = [];
        const tr = this.buildBehaviorTrace();
        const meta = this.buildTaskMeta();
        const cross = this.buildCrossDim();
        const trend = this.buildTrend();
        const txs = this._txs();
        const today = this._dayStart(Date.now());

        lines.push('## 一、行为轨迹（全部历史）');
        if (tr) {
            lines.push(`- 记录跨度：${tr.dayCount} 天，共 ${tr.total} 笔交易，当前连续记录 ${tr.currentStreak} 天`);
            lines.push(`- 最活跃时段：${tr.peakHour} 点前后；最活跃星期：${tr.busiestWeek}`);
            lines.push(`- 深夜（0-3 点）交易占比：${tr.nightRatio}%`);
            lines.push(`- 中断次数：${tr.gapCount} 次，最长中断 ${tr.longestGap} 天，平均中断 ${tr.avgGap} 天（中断后恢复速度隐含在平均中断里）`);
            const hours = tr.hourBuckets.map((v, i) => v > 0 ? `${i}点${v}` : null).filter(Boolean).slice(0, 12);
            lines.push(`- 小时分布样本：${hours.join('，')}`);
        } else {
            lines.push('- 暂无交易数据');
        }

        lines.push('');
        lines.push('## 二、任务与命名（命名与备注常带人格线索）');
        if (meta.length) {
            meta.slice(0, 18).forEach(t => {
                lines.push(`- ${t.name}（${t.category}/${t.type}${t.isHabit ? '/习惯' + (t.habitType === 'abstinence' ? '戒除' : '养成') + ' 连胜' + t.streak : ''}${t.targetMin ? ' 目标' + t.targetMin + '分' : ''}${t.note ? ' 备注:' + t.note : ''}）`);
            });
        } else {
            lines.push('- 暂无任务');
        }

        lines.push('');
        lines.push('## 三、跨维度');
        lines.push(`- 当前余额：${cross.balance !== null ? (cross.balance / 3600).toFixed(1) + ' 小时' : '未知'}`);
        if (cross.sleepAvgHours) lines.push(`- 近 ${cross.sleepDays} 天平均睡眠：${cross.sleepAvgHours} 小时`);

        lines.push('');
        lines.push('## 四、时间尺度变化');
        lines.push(`- 近 30 天：获取 ${Math.round(trend.cur30.e / 3600)} 小时 / 消费 ${Math.round(trend.cur30.s / 3600)} 小时 / ${trend.cur30.n} 笔`);
        lines.push(`- 前 30 天：获取 ${Math.round(trend.prev30.e / 3600)} 小时 / 消费 ${Math.round(trend.prev30.s / 3600)} 小时 / ${trend.prev30.n} 笔`);
        lines.push(`- 环比（近30 vs 前30）：获取 ${trend.earnChange === null ? '无对比' : trend.earnChange + '%'}，消费 ${trend.spendChange === null ? '无对比' : trend.spendChange + '%'}，笔数 ${trend.txChange === null ? '无对比' : trend.txChange + '%'}`);

        lines.push('');
        lines.push('## 五、语言证据（用户自己说过的话，最能体现"他是什么人"）');
        if (evidence && evidence.length) {
            evidence.forEach(e => lines.push(`- [${e.kind}] ${e.date}：「${e.quote}」`));
        } else {
            lines.push('- 暂无（用户很少与 AI 对话）');
        }

        lines.push('');
        lines.push('## 六、最近 7 天逐日净收支（秒，正=盈余）');
        for (let i = 6; i >= 0; i--) {
            const from = today - i * this.DAY_MS, to = from + this.DAY_MS;
            let e = 0, s = 0;
            txs.forEach(t => {
                const ts = this._ts(t);
                if (ts < from || ts >= to) return;
                if (t.type === 'earn') e += t.amount || 0; else s += Math.abs(t.amount || 0);
            });
            lines.push(`- ${this._fmtDate(from)}：+${Math.round(e / 60)}分 / -${Math.round(s / 60)}分`);
        }
        return lines.join('\n');
    },

    buildPortraitPrompt(inputsText) {
        return `你是用户行为分析师。下面是一位 TimeBank（时间银行，earn=产出、spend=消耗、单位分钟）用户的真实数据。
请输出**双层用户画像**，目标是"让 AI 看起来像认识他很久的朋友"，而不是复读统计数字。

${inputsText}

输出要求（严格 JSON，不要任何解释文字、不要 markdown 代码块）：
{
  "core": {
    "identity": "一句话画像，20-40字，例如：夜型人，靠截止日期驱动，健身是情绪出口而非任务",
    "patterns": [{"text": "稳定行为模式（12-30字）", "evidence": "依据：具体日期/数字/原话"}],
    "goals": [{"text": "长期目标", "evidence": "依据"}],
    "commitments": [{"text": "用户做出的承诺/约定", "date": "日期或『近期』", "evidence": "原话"}],
    "preferences": [{"text": "偏好或厌恶", "evidence": "依据"}],
    "triggers": [{"text": "什么情况会让他爆发/崩掉，什么情况能激励他", "evidence": "依据"}]
  },
  "state": {
    "rhythm": "近期节奏一句话（作息、专注、波动）",
    "risks": [{"text": "当前失衡风险", "evidence": "依据"}],
    "highlights": [{"text": "最近亮点", "evidence": "依据"}],
    "pendingCommitments": [{"text": "尚未兑现的承诺", "evidence": "依据"}]
  }
}

硬性规则：
1. patterns/goals/preferences/triggers 各 2-4 条；commitments 最多 3 条；state.risks 最多 3 条。
2. **每个结论必须带 evidence**，evidence 里要出现具体日期、数字或用户原话——没有依据就不要写这条。
3. 必须尝试指出**矛盾**（例如"说想早睡但深夜记录占比高"、"目标健身但中断次数多"），写进 patterns 或 risks。
4. core 只写**长期稳定**的判断（至少出现 2 次以上的迹象）；state 写当前状态。
5. 语气平实、具体，禁止空洞形容词（如"非常努力""很有潜力"）。`;
    },

    parsePortrait(text) {
        if (!text) return null;
        let raw = String(text).trim();
        raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
        const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
        if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
        try {
            const obj = JSON.parse(raw);
            if (obj && obj.core && obj.state) return obj;
        } catch (e) {
            console.warn('[AI_BRAIN] 画像 JSON 解析失败:', e && e.message);
        }
        return null;
    },

    async _fetchUserMessages(limit = 60) {
        try {
            const svc = window.AI_ASSISTANT_SERVICE;
            if (svc && typeof svc.getChatHistory === 'function') {
                const msgs = await svc.getChatHistory(limit);
                return Array.isArray(msgs) ? msgs : [];
            }
        } catch (e) { /* 忽略 */ }
        return [];
    },

    async generate(force = false, opts = {}) {
        if (this._generating) return { skipped: true, reason: 'generating' };
        const svc = window.AI_ASSISTANT_SERVICE;
        if (!svc || typeof svc.callAI !== 'function') return { skipped: true, reason: 'service-missing' };
        if (!this._txs().length) return { skipped: true, reason: 'no-data' };

        this._generating = true;
        try {
            const messages = await this._fetchUserMessages(60);
            const evidence = this.extractLanguageEvidence(messages);
            const inputsText = this.buildInputsText(evidence);
            const prompt = this.buildPortraitPrompt(inputsText);
            const pref = (typeof svc.getModelPreference === 'function') ? svc.getModelPreference() : { provider: 'cloudbase', model: 'hy3' };

            console.log('[AI_BRAIN] 开始生成画像（输入 %d 字符，证据 %d 条）', inputsText.length, evidence.length);
            if (typeof showToast === 'function' && opts.toast !== false) showToast('正在重新认识你…', 4000);

            const text = await svc.callAI(prompt, {
                provider: pref.provider,
                model: pref.model,
                maxTokens: 1800,
                timeoutMs: 180000,
                action: 'brainV2',
                data: { prompt }
            });

            const portrait = this.parsePortrait(text);
            if (!portrait) throw new Error('画像解析失败');

            portrait.evidenceCount = evidence.length;
            portrait.generatedAt = Date.now();
            portrait.inputsText = inputsText.slice(0, 20000);

            const brainDoc = {
                brainV2: portrait,
                summary: (portrait.core && portrait.core.identity) || '',
                cognitionVersion: 2,
                lastAnalysisMethod: 'v2_two_layer',
                lastAnalyzedAt: new Date()
            };
            if (typeof svc.saveBrain === 'function') {
                await svc.saveBrain(brainDoc);
            }
            this._cache = portrait;
            try {
                localStorage.setItem(this.MEM_KEY, JSON.stringify({ v: 2, portrait }));
            } catch (e) { /* 忽略 */ }
            if (typeof svc.saveSettings === 'function') svc.saveSettings({ initStatus: true, lastSyncAt: Date.now() });
            if (typeof showToast === 'function' && opts.toast !== false) showToast('画像已更新', 2500);
            return { ok: true, portrait };
        } catch (error) {
            this._lastError = error && error.message ? error.message : String(error);
            console.warn('[AI_BRAIN] 画像生成失败:', this._lastError);
            if (typeof showToast === 'function' && opts.toast !== false) showToast('画像生成失败：' + this._lastError, 4000);
            return { ok: false, error: this._lastError };
        } finally {
            this._generating = false;
        }
    },

    _readCache() {
        if (this._cache) return this._cache;
        try {
            const raw = localStorage.getItem(this.MEM_KEY);
            if (raw) { const o = JSON.parse(raw); if (o && o.portrait) { this._cache = o.portrait; return this._cache; } }
        } catch (e) { /* 忽略 */ }
        return null;
    },

    async getPortrait(useCloud = true) {
        const local = this._readCache();
        if (local) return local;
        if (!useCloud) return null;
        try {
            const svc = window.AI_ASSISTANT_SERVICE;
            if (svc && typeof svc.getBrain === 'function') {
                const brain = await svc.getBrain();
                if (brain && brain.brainV2) {
                    this._cache = brain.brainV2;
                    try { localStorage.setItem(this.MEM_KEY, JSON.stringify({ v: 2, portrait: brain.brainV2 })); } catch (e) { /* 忽略 */ }
                    return this._cache;
                }
            }
        } catch (e) { /* 忽略 */ }
        return null;
    },

    // 供对话注入的简短片段（控制在 600 字以内）
    promptFragment(portrait) {
        const p = portrait || this._readCache();
        if (!p) return '';
        const lines = [];
        const pick = arr => (Array.isArray(arr) ? arr.filter(Boolean) : []);
        const txt = items => pick(items).map(i => (typeof i === 'string' ? i : i && i.text)).filter(Boolean);

        if (p.core) {
            if (p.core.identity) lines.push(`【画像·稳定】${p.core.identity}`);
            const patterns = txt(p.core.patterns).slice(0, 3);
            if (patterns.length) lines.push(`- 稳定模式：${patterns.join('；')}`);
            const goals = txt(p.core.goals).slice(0, 3);
            if (goals.length) lines.push(`- 长期目标：${goals.join('；')}`);
            const prefs = txt(p.core.preferences).slice(0, 3);
            if (prefs.length) lines.push(`- 偏好：${prefs.join('；')}`);
            const trig = txt(p.core.triggers).slice(0, 2);
            if (trig.length) lines.push(`- 激励/易崩点：${trig.join('；')}`);
            const commits = pick(p.core.commitments).slice(0, 3).map(c => {
                const t = typeof c === 'string' ? c : (c && c.text) || '';
                const d = (c && c.date) ? `（${c.date}）` : '';
                return t ? t + d : '';
            }).filter(Boolean);
            if (commits.length) lines.push(`- 他做过的承诺：${commits.join('；')}`);
        }
        if (p.state) {
            const s = p.state;
            const parts = [];
            if (s.rhythm) parts.push(s.rhythm);
            const risks = txt(s.risks).slice(0, 2);
            if (risks.length) parts.push('近期风险：' + risks.join('；'));
            const hi = txt(s.highlights).slice(0, 2);
            if (hi.length) parts.push('近期亮点：' + hi.join('；'));
            const pend = txt(s.pendingCommitments).slice(0, 2);
            if (pend.length) parts.push('待兑现：' + pend.join('；'));
            if (parts.length) lines.push(`【画像·当前】${parts.join('。')}`);
        }
        return lines.join('\n');
    },

    /**
     * 按问题类型检索注入（约 1-1.5k token）：替代"每次都塞全量统计"
     * 返回 null 表示未识别类型，调用方可回退全量上下文
     */
    focusedContext(question) {
        const q = String(question || '');
        const today = this._dayStart(Date.now());
        const txs = this._txs();
        if (!txs.length) return null;
        const trend = this.buildTrend();
        const cross = this.buildCrossDim();
        const lines = [];

        const type = /(习惯|连胜|坚持|养成|戒)/.test(q) ? 'habit'
            : /(睡眠|睡|作息|熬夜|几点睡|起床)/.test(q) ? 'sleep'
            : /(趋势|变化|进步|退步|对比|这个月|上周|环比|怎么样|状态|最近)/.test(q) ? 'trend'
            : /(几点|时段|什么时候|效率最高|一天|作息规律)/.test(q) ? 'rhythm'
            : /(任务|项目|都在做|做什么|忙什么|投入)/.test(q) ? 'task'
            : /(余额|总量|累计|总共|一共|赚了|花了)/.test(q) ? 'total'
            : null;
        if (!type) return null;

        if (type === 'total') {
            lines.push('【总量（内部参考）】');
            lines.push(`- 余额：${cross.balance !== null ? (cross.balance / 3600).toFixed(1) + ' 小时' : '未知'}`);
            lines.push(`- 全期：获取 ${Math.round(trend.all.e / 3600)} 小时 / 消费 ${Math.round(trend.all.s / 3600)} 小时 / ${trend.all.n} 笔`);
            lines.push(`- 近 30 天：获取 ${Math.round(trend.cur30.e / 3600)} 小时 / 消费 ${Math.round(trend.cur30.s / 3600)} 小时`);
            const t7 = this._sumRange(today - 6 * this.DAY_MS, today + this.DAY_MS);
            lines.push(`- 近 7 天：获取 ${Math.round(t7.e / 3600)} 小时 / 消费 ${Math.round(t7.s / 3600)} 小时 / ${t7.n} 笔`);
        } else if (type === 'trend') {
            lines.push('【近期趋势（内部参考）】');
            lines.push(`- 近 30 天 vs 前 30 天：获取 ${trend.earnChange === null ? '无对比' : trend.earnChange + '%'}，消费 ${trend.spendChange === null ? '无对比' : trend.spendChange + '%'}，笔数 ${trend.txChange === null ? '无对比' : trend.txChange + '%'}`);
            for (let i = 6; i >= 0; i--) {
                const from = today - i * this.DAY_MS;
                const s = this._sumRange(from, from + this.DAY_MS);
                if (s.n === 0) continue;
                lines.push(`- ${this._fmtDate(from)}：+${Math.round(s.e / 60)}分 / -${Math.round(s.s / 60)}分（${s.n}笔）`);
            }
        } else if (type === 'habit') {
            const habits = this._tasks().filter(t => t.isHabit);
            lines.push('【习惯情况（内部参考）】');
            if (!habits.length) lines.push('- 用户尚未设置习惯任务');
            habits.slice(0, 8).forEach(h => {
                const st = this._taskStats(h);
                lines.push(`- ${h.name}：连胜 ${h.habitDetails?.currentStreak || 0} 天，近 30 天 ${st.d30} 次，累计 ${Math.round(st.total / 3600)} 小时`);
            });
        } else if (type === 'rhythm') {
            const tr = this.buildBehaviorTrace();
            lines.push('【作息/时段（内部参考）】');
            if (tr) {
                lines.push(`- 最活跃时段：${tr.peakHour} 点前后；最活跃星期：${tr.busiestWeek}`);
                lines.push(`- 深夜（0-3 点）记录占比：${tr.nightRatio}%`);
                lines.push(`- 中断：${tr.gapCount} 次，最长 ${tr.longestGap} 天，当前连续记录 ${tr.currentStreak} 天`);
            }
            if (cross.sleepAvgHours) lines.push(`- 近 ${cross.sleepDays} 天平均睡眠：${cross.sleepAvgHours} 小时`);
        } else if (type === 'sleep') {
            lines.push('【睡眠（内部参考）】');
            if (cross.sleepAvgHours) lines.push(`- 近 ${cross.sleepDays} 天平均睡眠：${cross.sleepAvgHours} 小时`);
            else lines.push('- 暂无睡眠记录数据');
            const lateRatio = (() => {
                const tr = this.buildBehaviorTrace();
                return tr ? tr.nightRatio : null;
            })();
            if (lateRatio !== null) lines.push(`- 深夜 0-3 点交易占比：${lateRatio}%（可作为熬夜的间接线索）`);
        } else if (type === 'task') {
            const map = new Map();
            txs.forEach(t => {
                const ts = this._ts(t);
                if (ts < today - 30 * this.DAY_MS || !t.taskName) return;
                const cur = map.get(t.taskName) || { n: 0, sec: 0 };
                cur.n++;
                cur.sec += Math.abs(t.amount || 0);
                map.set(t.taskName, cur);
            });
            const top = [...map.entries()].sort((a, b) => b[1].sec - a[1].sec).slice(0, 6);
            lines.push('【近 30 天任务投入（内部参考）】');
            top.forEach(([name, v]) => lines.push(`- ${name}：${v.n} 次 / ${Math.round(v.sec / 3600)} 小时`));
        }
        lines.push('- 以上为程序计算的真实数字，可直接引用，不要改动或夸大');
        return lines.join('\n');
    },

    isStateExpired(p) {
        if (!p || !p.generatedAt) return true;
        return (Date.now() - p.generatedAt) > this.STATE_TTL_MS;
    },

    // ============================================================
    // L1 本地数据问答（确定性、零成本、秒回）
    // ============================================================
    _sumRange(from, to) {
        let e = 0, s = 0, n = 0;
        this._txs().forEach(t => {
            const ts = this._ts(t);
            if (ts < from || ts >= to) return;
            n++;
            if (t.type === 'earn') e += t.amount || 0; else s += Math.abs(t.amount || 0);
        });
        return { e, s, n };
    },

    _findTaskByName(name) {
        if (!name) return null;
        const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
        const target = norm(name);
        const list = this._tasks();
        return list.find(t => norm(t.name) === target)
            || list.find(t => norm(t.name).includes(target) || target.includes(norm(t.name)))
            || null;
    },

    _taskStats(task) {
        const today = this._dayStart(Date.now());
        let e = 0, n = 0, lastTs = 0, d30 = 0;
        this._txs().forEach(t => {
            if (!task || t.taskId !== task.id || t.type !== 'earn') return;
            const ts = this._ts(t);
            e += t.amount || 0; n++;
            if (ts > lastTs) lastTs = ts;
            if (ts >= today - 30 * this.DAY_MS) d30++;
        });
        return { total: e, count: n, lastTs, d30 };
    },

    /**
     * 本地问答：命中返回回答文本，未命中返回 null
     */
    answerLocally(text) {
        const q = String(text || '').trim();
        if (!q || q.length > 40) return null;
        // 建议/分析类问题交给模型（本地只回答"事实类"提问，避免把"我该怎么办"降级成数字复读）
        if (/(怎么办|该不该|要不要|建议|怎么调整|如何|为什么|原因|帮我|分析|开导|聊聊|陪)/.test(q)) return null;
        const today = this._dayStart(Date.now());
        const txs = this._txs();
        if (!txs.length) return null;

        // 余额
        if (/(还剩|剩多少|余额|结余)/.test(q)) {
            const bal = this._balance();
            if (bal === null) return null;
            return `你现在的时间余额是 ${this._dur(bal)}${bal >= 0 ? '，是盈余状态' : '，处于透支状态'}。`;
        }
        // 今日汇总（注意：不含"干了/做了/什么"，那些属于下方"今日清单"，要的是明细而非数字）
        if (/(今天|今日)/.test(q) && /(赚|获|消耗|花|收支|净)/.test(q)) {
            const s = this._sumRange(today, today + this.DAY_MS);
            const done = txs.filter(t => this._ts(t) >= today && this._ts(t) < today + this.DAY_MS && t.type === 'earn');
            const names = [...new Set(done.map(t => t.taskName).filter(Boolean))].slice(0, 6);
            return `今天你记录了 ${s.n} 笔：获取 ${this._dur(s.e)}，消费 ${this._dur(s.s)}，净${s.e - s.s >= 0 ? '盈余 ' : '透支 '}${this._dur(Math.abs(s.e - s.s))}。`
                + (names.length ? `完成的包括：${names.join('、')}。` : '');
        }
        // 本周
        if (/这周|本周|一周|最近一周/.test(q)) {
            const dow = (new Date().getDay() + 6) % 7;         // 周一为 0
            const from = today - dow * this.DAY_MS;
            const s = this._sumRange(from, today + this.DAY_MS);
            const prev = this._sumRange(from - 7 * this.DAY_MS, from);
            const cmp = prev.e > 0 ? `，比上周同期获取${s.e >= prev.e ? '多' : '少'} ${this._dur(Math.abs(s.e - prev.e))}` : '';
            return `本周（周一起）获取 ${this._dur(s.e)}，消费 ${this._dur(s.s)}，共 ${s.n} 笔${cmp}。`;
        }
        // 本月
        if (/这个月|本月|当月|上月|最近一月|30天|近一月/.test(q)) {
            const d = new Date(today);
            const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
            const s = this._sumRange(monthStart, today + this.DAY_MS);
            const prevFrom = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
            const prev = this._sumRange(prevFrom, monthStart);
            const cmp = prev.e > 0 ? `，上月同期是 ${this._dur(prev.e)}` : '';
            return `本月获取 ${this._dur(s.e)}，消费 ${this._dur(s.s)}，共 ${s.n} 笔${cmp}。`;
        }
        // 连胜 / 坚持最久
        if (/(连胜|坚持最久|连续最久|坚持得最|streak)/i.test(q)) {
            const habits = this._tasks().filter(t => t.isHabit);
            if (!habits.length) return '你还没有设置习惯任务，设置一个习惯后我就能帮你盯连续性了。';
            const sorted = habits.slice().sort((a, b) => (b.habitDetails?.currentStreak || 0) - (a.habitDetails?.currentStreak || 0));
            const top = sorted[0];
            const st = top.habitDetails?.currentStreak || 0;
            const others = sorted.slice(1, 3).filter(h => (h.habitDetails?.currentStreak || 0) > 0)
                .map(h => `${h.name} ${h.habitDetails.currentStreak} 天`).join('、');
            return `目前连续最久的是「${top.name}」，已经 ${st} 天${others ? `；其次是 ${others}` : ''}。`;
        }
        // 最近睡眠
        if (/(睡|睡眠|几点睡|入睡)/.test(q)) {
            try {
                if (typeof getSleepHistory === 'function') {
                    const arr = getSleepHistory();
                    const last = Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null;
                    if (last) {
                        const dur = last.duration || last.totalMinutes || 0;
                        const durText = dur ? (dur > 100 ? `${(dur / 60).toFixed(1)} 小时` : `${Math.round(dur)} 分钟`) : '未知时长';
                        const startTxt = last.startTime ? new Date(last.startTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
                        const endTxt = last.endTime ? new Date(last.endTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
                        return `最近一次睡眠记录：${startTxt ? startTxt + ' 入睡' : ''}${endTxt ? '，' + endTxt + ' 起床' : ''}，共 ${durText}。`;
                    }
                }
            } catch (e) { /* 落兜底 */ }
            return null;
        }
        // 单任务统计
        const mTask = q.match(/(?:我在|我练|我学|关于)?[「"'']?([\u4e00-\u9fa5A-Za-z0-9]{1,12})[」"'']?(?:一共|总共|累计|花了|用了|投入|练了|学了|坚持|完成多少次|多少次|多久)/);
        if (mTask) {
            const task = this._findTaskByName(mTask[1]);
            if (task) {
                const st = this._taskStats(task);
                if (st.count) {
                    return `「${task.name}」你累计记录 ${st.count} 次、共 ${this._dur(st.total)}，近 30 天 ${st.d30} 次${st.lastTs ? `，最近一次是 ${this._fmtDate(st.lastTs)}` : ''}。`;
                }
            }
        }
        // 趋势对比
        if (/(比|对比|变化).*(上个月|上周|之前)|好还是差|进步|退步|趋势/.test(q)) {
            const cur = this._sumRange(today - 7 * this.DAY_MS, today + this.DAY_MS);
            const prev = this._sumRange(today - 14 * this.DAY_MS, today - 7 * this.DAY_MS);
            if (prev.e > 0 || cur.e > 0) {
                const diff = cur.e - prev.e;
                const rate = prev.e > 0 ? Math.round(Math.abs(diff) / prev.e * 100) : null;
                return `近 7 天获取 ${this._dur(cur.e)}、消费 ${this._dur(cur.s)}；前 7 天是获取 ${this._dur(prev.e)}、消费 ${this._dur(prev.s)}。`
                    + (rate === null ? '' : `获取量${diff >= 0 ? '上升' : '下降'}约 ${rate}%。`);
            }
        }
        // 今日完成清单
        if (/(今天|今日).*(干了|做了|完成|记录)|清单/.test(q)) {
            const done = txs.filter(t => this._ts(t) >= today && this._ts(t) < today + this.DAY_MS);
            if (!done.length) return '今天还没有任何记录，从一件小事开始吧。';
            const lines = done.slice(-8).map(t => {
                const hhmm = new Date(this._ts(t)).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                return `${hhmm} ${t.type === 'earn' ? '获取' : '消费'} ${t.taskName || '未命名'} ${this._dur(t.amount || 0)}`;
            });
            return `今天已记录 ${done.length} 笔：\n` + lines.join('\n');
        }
        return null;
    },

    // ============================================================
    // L3 主动建议（打开 App 时最多一条）
    // ============================================================
    _proactiveCfg() {
        const def = { level: 'low', lastShownDate: '', shownToday: 0, ignoredStreak: 0, usefulCount: 0 };
        try {
            const raw = localStorage.getItem(this.PROACTIVE_KEY);
            if (raw) return Object.assign(def, JSON.parse(raw));
        } catch (e) { /* 忽略 */ }
        return def;
    },
    _saveProactiveCfg(cfg) {
        try { localStorage.setItem(this.PROACTIVE_KEY, JSON.stringify(cfg)); } catch (e) { /* 忽略 */ }
    },
    setProactiveLevel(level) {
        const cfg = this._proactiveCfg();
        cfg.level = level;
        if (level !== 'off') cfg.ignoredStreak = 0;
        this._saveProactiveCfg(cfg);
    },
    getProactiveLevel() { return this._proactiveCfg().level || 'low'; },

    // 候选洞察：必须有"价值门槛"，否则不说话
    buildCandidates() {
        const out = [];
        const today = this._dayStart(Date.now());
        const txs = this._txs();
        const todayStat = this._sumRange(today, today + this.DAY_MS);

        // 1) 破纪录：今日获取超过历史单日最高
        if (todayStat.e > 0) {
            const byDay = new Map();
            txs.forEach(t => {
                if (t.type !== 'earn') return;
                const k = this._dayStart(this._ts(t));
                byDay.set(k, (byDay.get(k) || 0) + (t.amount || 0));
            });
            let best = 0, bestDay = 0;
            byDay.forEach((v, k) => { if (k !== today && v > best) { best = v; bestDay = k; } });
            if (best > 0 && todayStat.e > best) {
                out.push({ key: 'record', text: `今天你已经获取 ${this._dur(todayStat.e)}，超过此前最好的一天（${this._fmtDate(bestDay)} ${this._dur(best)}）。`,
                    evidence: `对比依据：今日 ${this._dur(todayStat.e)} vs 历史最高 ${this._dur(best)}（${this._fmtDate(bestDay)}）` });
            }
        }

        // 2) 习惯里程碑（7/30/100 天）
        this._tasks().filter(t => t.isHabit).forEach(h => {
            const st = h.habitDetails?.currentStreak || 0;
            if ([7, 14, 30, 60, 100].includes(st)) {
                out.push({ key: 'streak', text: `「${h.name}」已经连续 ${st} 天，这是个能站住的节奏。`,
                    evidence: `依据：习惯「${h.name}」当前连胜 ${st} 天` });
            }
        });

        // 3) 失衡：近 3 天连续净透支
        const last3 = [0, 1, 2].map(i => this._sumRange(today - i * this.DAY_MS, today - i * this.DAY_MS + this.DAY_MS));
        if (last3.length === 3 && last3.every(s => s.n > 0 && s.e < s.s)) {
            out.push({ key: 'overspend', text: '最近三天都是净透支，先别急着加新任务，把节奏收一收。',
                evidence: '依据：' + last3.slice().reverse().map((s, i) => `${this._fmtDate(today - (2 - i) * this.DAY_MS)} 净 ${Math.round((s.e - s.s) / 60)} 分`).join('，') });
        }

        // 4) 深夜模式：近 3 天有 0-3 点记录
        const nightDays = new Set();
        txs.forEach(t => {
            const ts = this._ts(t);
            if (ts < today - 3 * this.DAY_MS) return;
            const h = new Date(ts).getHours();
            if (h >= 0 && h < 4) nightDays.add(this._dayStart(ts));
        });
        if (nightDays.size >= 2) {
            out.push({ key: 'late', text: `最近 ${nightDays.size} 天都有凌晨记录，作息在往后漂。`,
                evidence: `依据：近 3 天内 ${nightDays.size} 天的 0-4 点有交易记录` });
        }

        // 5) 待兑现承诺（画像 state）
        const p = this._readCache();
        const pend = p && p.state && Array.isArray(p.state.pendingCommitments) ? p.state.pendingCommitments : [];
        pend.slice(0, 1).forEach(item => {
            const t = typeof item === 'string' ? item : item && item.text;
            if (t) out.push({ key: 'commitment', text: `你之前提过：${t}。现在方便看看进展吗？`,
                evidence: (item && item.evidence) ? String(item.evidence) : '依据：来自你自己在对话里说过的话' });
        });

        // 6) 模式打破：近 7 天获取较前 7 天下降 > 40%
        const cur = this._sumRange(today - 7 * this.DAY_MS, today + this.DAY_MS);
        const prev = this._sumRange(today - 14 * this.DAY_MS, today - 7 * this.DAY_MS);
        if (prev.e > 0 && cur.e < prev.e * 0.6) {
            out.push({ key: 'drop', text: `这周比上周同期少获取了 ${this._dur(prev.e - cur.e)}，是忙，还是节奏断了？`,
                evidence: `依据：近 7 天 ${this._dur(cur.e)} vs 前 7 天 ${this._dur(prev.e)}` });
        }
        return out;
    },

    async maybeProactive() {
        try {
            const cfg = this._proactiveCfg();
            if (cfg.level === 'off') return null;
            const todayKey = this._dayKey(Date.now());
            // [v9.37.2] 四档频率：关 / 低 1 条 / 中 3 条 / 高 5 条（每天）
            const PROACTIVE_LIMITS = { off: 0, low: 1, mid: 3, high: 5 };
            const limit = PROACTIVE_LIMITS[cfg.level] || 1;
            if (cfg.lastShownDate === todayKey && cfg.shownToday >= limit) return null;
            const candidates = this.buildCandidates();
            if (!candidates.length) return null;
            // 每天优先展示不同类型，避免重复同一条
            const sameDay = cfg.lastShownDate === todayKey;
            const idx = (sameDay ? (cfg.shownToday || 0) : 0) % candidates.length;
            const pick = candidates[idx];
            this.showInsightCard(pick);
            cfg.shownToday = (sameDay ? (cfg.shownToday || 0) : 0) + 1;
            cfg.lastShownDate = todayKey;
            this._saveProactiveCfg(cfg);
            return pick;
        } catch (e) {
            console.warn('[AI_BRAIN] 主动建议失败:', e && e.message);
            return null;
        }
    },

    showInsightCard(insight) {
        try {
            if (!insight || !insight.text) return;
            const old = document.getElementById('tbInsightCard');
            if (old) old.remove();
            const card = document.createElement('div');
            card.id = 'tbInsightCard';
            card.className = 'tb-insight-card';
            card.innerHTML =
                '<div class="tb-insight-title">Time Bot 说</div>' +
                '<div class="tb-insight-text">' + this._esc(insight.text) + '</div>' +
                '<div class="tb-insight-evidence" hidden>' + this._esc(insight.evidence || '暂无依据') + '</div>' +
                '<div class="tb-insight-actions">' +
                    '<button class="tb-insight-btn" data-act="evidence">看依据</button>' +
                    '<button class="tb-insight-btn" data-act="useful">有用</button>' +
                    '<button class="tb-insight-btn" data-act="useless">没用</button>' +
                    '<button class="tb-insight-btn tb-insight-close" data-act="close">✕</button>' +
                '</div>';
            document.body.appendChild(card);
            requestAnimationFrame(() => card.classList.add('show'));

            const close = () => { card.classList.remove('show'); setTimeout(() => card.remove(), 260); };
            card.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-act]');
                if (!btn) return;
                const act = btn.dataset.act;
                if (act === 'evidence') {
                    const ev = card.querySelector('.tb-insight-evidence');
                    if (ev) ev.hidden = !ev.hidden;
                } else if (act === 'useful') {
                    this._proactiveFeedback(true);
                    if (typeof showToast === 'function') showToast('已记录：这类建议有用', 2000);
                    close();
                } else if (act === 'useless') {
                    this._proactiveFeedback(false);
                    if (typeof showToast === 'function') showToast('收到，我会少说这类', 2000);
                    close();
                } else {
                    close();
                }
            });
            // 20 秒无操作自动收起（不打扰）
            setTimeout(() => { if (document.body.contains(card)) close(); }, 20000);
        } catch (e) {
            console.warn('[AI_BRAIN] 建议卡片展示失败:', e && e.message);
        }
    },

    _proactiveFeedback(useful) {
        const cfg = this._proactiveCfg();
        if (useful) {
            cfg.usefulCount = (cfg.usefulCount || 0) + 1;
            cfg.ignoredStreak = 0;
        } else {
            cfg.ignoredStreak = (cfg.ignoredStreak || 0) + 1;
            // 连续 3 次"没用" → 自动降频（可沉默原则）
            if (cfg.ignoredStreak >= 3 && cfg.level !== 'off') {
                cfg.level = 'off';
                if (typeof showToast === 'function') showToast('主动建议已自动关闭，可在 AI 设置里重新打开', 4000);
            }
        }
        this._saveProactiveCfg(cfg);
    },

    // ============================================================
    // 打开 App：按需刷新画像 + 主动建议
    // ============================================================
    onAppOpen() {
        setTimeout(async () => {
            try {
                const svc = window.AI_ASSISTANT_SERVICE;
                const settings = svc && typeof svc.getSettings === 'function' ? svc.getSettings() : {};
                const portrait = await this.getPortrait(true);
                const lastAt = (portrait && portrait.generatedAt) || 0;
                const needRefresh = settings.initStatus && (Date.now() - lastAt > this.REFRESH_GAP_MS);
                if (needRefresh) {
                    // 静默刷新：不弹 toast，失败也不打扰
                    this.generate(true, { toast: false });
                }
                await this.maybeProactive();
            } catch (e) {
                console.warn('[AI_BRAIN] onAppOpen 失败:', e && e.message);
            }
        }, 3000);
    },

    // ============================================================
    // 画像 UI（供 AI 设置弹窗渲染）
    // ============================================================
    _esc(s) {
        return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s);
    },

    renderPortraitHtml(portrait) {
        const p = portrait || this._readCache();
        if (!p) {
            return '<div class="brain-empty">还没有画像。点下方「重新认识我」让我完整看一遍你的数据。</div>';
        }
        const core = p.core || {}, st = p.state || {};
        const badge = this.isStateExpired(p) ? '<span class="brain-stale">状态已过期，下次打开会自动更新</span>' : '';
        const list = (items, path) => {
            const arr = Array.isArray(items) ? items : [];
            if (!arr.length) return '<div class="brain-empty">暂无</div>';
            return arr.map((it, i) => {
                const text = typeof it === 'string' ? it : (it && it.text) || '';
                const ev = (it && it.evidence) ? String(it.evidence) : '';
                const date = (it && it.date) ? String(it.date) : '';
                return `<div class="brain-item">
                    <div class="brain-item-text">${this._esc(text)}${date ? `<span class="brain-item-date">${this._esc(date)}</span>` : ''}</div>
                    ${ev ? `<div class="brain-item-ev">${this._esc(ev)}</div>` : ''}
                    <button class="brain-item-del" data-brain-del="${path}.${i}" title="删除这条">删除</button>
                </div>`;
            }).join('');
        };
        return `
            <div class="ai-settings-section">
                <div class="ai-settings-section-title">一句话认识你</div>
                <div class="brain-summary">${this._esc(core.identity || '（待生成）')} ${badge}</div>
            </div>
            <div class="ai-settings-section">
                <div class="ai-settings-section-title">稳定模式（长期）</div>
                ${list(core.patterns, 'patterns')}
            </div>
            <div class="ai-settings-section">
                <div class="ai-settings-section-title">你的目标与承诺</div>
                ${list(core.goals, 'goals')}
                ${list(core.commitments, 'commitments')}
            </div>
            <div class="ai-settings-section">
                <div class="ai-settings-section-title">偏好与激励点</div>
                ${list(core.preferences, 'preferences')}
                ${list(core.triggers, 'triggers')}
            </div>
            <div class="ai-settings-section">
                <div class="ai-settings-section-title">当前状态</div>
                <div class="brain-summary">${this._esc(st.rhythm || '暂无')}</div>
                ${list(st.highlights, 'highlights')}
                ${list(st.risks, 'risks')}
                ${list(st.pendingCommitments, 'pendingCommitments')}
            </div>
            <div class="ai-memory-hint">每条结论都带依据，可逐条删除；删除后我会重新学习。</div>
        `;
    },

    // 删除单条结论（path 形如 patterns.1）
    async removeItem(path) {
        try {
            const p = this._readCache();
            if (!p || !path) return false;
            const [key, idxStr] = String(path).split('.');
            const idx = parseInt(idxStr, 10);
            if (!p.core || !Array.isArray(p.core[key]) || !Number.isFinite(idx)) return false;
            p.core[key].splice(idx, 1);
            this._cache = p;
            try { localStorage.setItem(this.MEM_KEY, JSON.stringify({ v: 2, portrait: p })); } catch (e) { /* 忽略 */ }
            const svc = window.AI_ASSISTANT_SERVICE;
            if (svc && typeof svc.saveBrain === 'function') {
                await svc.saveBrain({ brainV2: p, lastAnalysisMethod: 'v2_two_layer_user_edited' });
            }
            if (typeof showToast === 'function') showToast('已删除这条结论', 2000);
            return true;
        } catch (e) {
            console.warn('[AI_BRAIN] 删除结论失败:', e && e.message);
            return false;
        }
    },

    async reset() {
        try {
            this._cache = null;
            try { localStorage.removeItem(this.MEM_KEY); } catch (e) { /* 忽略 */ }
            const svc = window.AI_ASSISTANT_SERVICE;
            if (svc && typeof svc.saveBrain === 'function') {
                await svc.saveBrain({ brainV2: null, summary: '', cognitionVersion: 2, lastAnalysisMethod: 'v2_reset' });
            }
            if (typeof showToast === 'function') showToast('画像已重置', 2500);
            return true;
        } catch (e) {
            console.warn('[AI_BRAIN] 重置失败:', e && e.message);
            return false;
        }
    }
};

window.AI_BRAIN = AI_BRAIN;
