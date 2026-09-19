// =====================================================================
// [Commercial v1] 商业化主模块：专业版 Pro 锁定 / 付费墙 / 激活码解锁 / IAP 桥接
// 依赖：commercial-config.js（先加载）
// 本文件为商业版独立模块，官方版不包含。所有逻辑增量式、防御式，出错自动放行不影响核心。
// 对外接口（供其它 JS 调用）：
//   TimeBankCommercial.isPro()                 -> true/false
//   TimeBankCommercial.guardPro(opts)           -> true=应拦截(已弹墙) | false=放行
//   TimeBankCommercial.openProPaywall(reason)   -> 打开付费墙
//   TimeBankCommercial.grantPro(reason)         -> 直接解锁（激活码/演示）
//   TimeBankCommercial.unlockByCode(code)       -> {ok, message}
// =====================================================================
(function (global) {
    'use strict';
    var CFG = (global.TimeBankCommercial && global.TimeBankCommercial) || { pro: {} };
    var PRO = CFG.pro || {};
    var SEED = PRO.seed || 'TimeBank-seed';
    var LS_PRO_KEY = 'tb_pro_status';
    var LS_CODE_KEY = 'tb_pro_code';

    // ---------- 激活码：基于 seed 的确定性伪随机（简化版，面向基础变现） ----------
    var _chars = 'ABCDEFGHKMNPQRSTUVWXYZ23456789'; // 去掉易混淆的 I O 0 1
    function _hash(str) {
        var h = 0;
        for (var i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
        return h >>> 0;
    }
    function _lcg(x) { // 线性同余，确定性扩展
        return ((x * 1103515245 + 12345) >>> 0);
    }
    function _deriveCode(index) {
        var x = _hash(SEED + '#' + index);
        var out = '';
        for (var i = 0; i < 16; i++) {
            x = _lcg(x);
            out += _chars[x % _chars.length];
        }
        return out;
    }
    function _normalize(code) {
        return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    function _format(code) {
        var c = _normalize(code);
        return c.length >= 16 ? c.substr(0, 4) + '-' + c.substr(4, 4) + '-' + c.substr(8, 4) + '-' + c.substr(12, 4) : c;
    }
    // 校验：命中 seed 派生出来的前 MAX_INDEX* ... 个码即合法
    var _validIndices = [];
    (function () {
        for (var i = 0; i < 50; i++) _validIndices.push(_deriveCode(i));
    })();

    // ---------- 状态 ----------
    function isPro() {
        try {
            var local = localStorage.getItem(LS_PRO_KEY) === 'pro';
            var cloud = !!(global.DAL && global.DAL.profileData && global.DAL.profileData.proTier === 'pro');
            var native = false;
            try { if (global.Android && typeof global.Android.isPro === 'function') native = !!global.Android.isPro(); } catch (e) {}
            return !!local || !!cloud || !!native;
        } catch (e) { return false; }
    }

    function grantPro(reason) {
        try {
            localStorage.setItem(LS_PRO_KEY, 'pro');
            localStorage.setItem(LS_CODE_KEY, reason || 'grant');
            if (global.DAL && typeof global.DAL.saveProfile === 'function') {
                try { global.DAL.saveProfile({ proTier: 'pro' }); } catch (e) {}
            }
            closePaywall();
            refreshProUI();
            return true;
        } catch (e) { return false; }
    }

    function unlockByCode(code) {
        var n = _normalize(code);
        if (n.length < 16) return { ok: false, message: '激活码格式不正确（应形如 XXXX-XXXX-XXXX-XXXX）' };
        if (_validIndices.indexOf(n) >= 0) {
            grantPro('code:' + _format(code));
            return { ok: true, message: '✅ 专业版已解锁，感谢支持！' };
        }
        return { ok: false, message: '激活码无效，请检查后重试' };
    }

    // ---------- 付费墙 DOM ----------（惰性创建，避免加载期 DOM 依赖）
    var _overlay = null;
    function ensurePaywallDom() {
        if (_overlay && document.body && document.body.contains(_overlay)) return _overlay;
        var body = document.body;
        if (!body) return null;
        var ov = document.createElement('div');
        ov.id = 'proOverlay';
        ov.style.display = 'none';
        ov.innerHTML =
            '<div class="pro-modal" role="dialog" aria-label="专业版">' +
            '<div class="pro-close" id="proCloseBtn" aria-label="关闭">✕</div>' +
            '<div class="pro-badge" id="proBadge">PRO</div>' +
            '<div class="pro-title">解锁「专业版」</div>' +
            '<div class="pro-sub">一次买断，永久拥有全部高级功能</div>' +
            '<div class="pro-feature-list" id="proFeatureList"></div>' +
            '<div class="pro-price" id="proPrice"></div>' +
            '<button class="pro-buy-btn" id="proBuyBtn">立即解锁</button>' +
            '<button class="pro-restore-btn" id="proRestoreBtn">恢复购买</button>' +
            '<div class="pro-code-wrap">' +
            '<input class="pro-code-input" id="proCodeInput" placeholder="输入专业版激活码（可选）" autocomplete="off" autocapitalize="off">' +
            '<button class="pro-code-btn" id="proCodeBtn">激活</button>' +
            '</div>' +
            '<div class="pro-status" id="proStatus"></div>' +
            '</div>';
        body.appendChild(ov);
        var closeBtn = ov.querySelector('#proCloseBtn');
        if (closeBtn) closeBtn.onclick = closePaywall;
        var buyBtn = ov.querySelector('#proBuyBtn');
        if (buyBtn) buyBtn.onclick = handlePurchase;
        var restoreBtn = ov.querySelector('#proRestoreBtn');
        if (restoreBtn) restoreBtn.onclick = handleRestore;
        var codeBtn = ov.querySelector('#proCodeBtn');
        if (codeBtn) codeBtn.onclick = handleCodeSubmit;
        var codeInput = ov.querySelector('#proCodeInput');
        if (codeInput) codeInput.onkeydown = function (ev) { if (ev.key === 'Enter') handleCodeSubmit(); };
        var badge = ov.querySelector('#proBadge');
        if (badge && PRO.allowDevUnlock) { badge._clicks = 0; badge.onclick = devUnlockTap; }
        // 点击遮罩空白处关闭
        ov.addEventListener('click', function (e) { if (e.target === ov) closePaywall(); });
        _overlay = ov;
        renderFeaturesAndPrice(ov);
        return ov;
    }

    function renderFeaturesAndPrice(ov) {
        var fl = ov.querySelector('#proFeatureList');
        if (fl) {
            var feats = (PRO.features || []).map(function (f) {
                return '<div class="pro-feature">✨ ' + (f.label || f.key) + '</div>';
            }).join('');
            fl.innerHTML = feats;
        }
        var price = ov.querySelector('#proPrice');
        if (price) price.textContent = '¥ ' + (PRO.priceText || '18 买断');
    }

    function openProPaywall(reason) {
        var ov = ensurePaywallDom();
        if (!ov) return;
        ov.style.display = 'flex';
        var st = ov.querySelector('#proStatus');
        if (st) st.textContent = reason ? ('此功能为专业版专属' + (reason ? '：' + reason : '')) : '';
    }

    function closePaywall() {
        if (_overlay) _overlay.style.display = 'none';
    }

    // 演示解锁：连点 PRO 徽标 5 次
    function devUnlockTap() {
        var badge = document.getElementById('proBadge');
        if (!badge) return;
        badge._clicks = (badge._clicks || 0) + 1;
        if (badge._clicks >= 5) {
            badge._clicks = 0;
            grantPro('dev-demo');
            var st = document.getElementById('proStatus');
            if (st) st.textContent = '✅（演示）专业版已解锁';
        }
    }

    // ---------- IAP / 购买 ----------
    function handlePurchase() {
        if (isPro()) { setStatus('✅ 你已是专业版用户'); return; }
        // 优先走原生 IAP 桥接（商店支付由原生接入后生效）
        if (global.Android && typeof global.Android.purchasePro === 'function') {
            setStatus('正在拉起支付...');
            try {
                var ok = global.Android.purchasePro(PRO.productId || '', 'pro_purchase');
                if (ok === false || ok === 'unavailable') {
                    setStatus('⚠️ 商店支付尚未在该设备开通，可用下方激活码解锁。');
                }
                return;
            } catch (e) {
                setStatus('⚠️ 支付通道暂不可用，可用下方激活码解锁。');
                return;
            }
        }
        setStatus('⚠️ 商店支付尚未配置，请使用下方激活码解锁专业版。');
    }

    function handleRestore() {
        if (isPro()) { setStatus('✅ 你已是专业版用户'); return; }
        if (global.Android && typeof global.Android.restorePro === 'function') {
            try {
                var r = global.Android.restorePro('pro_restore');
                if (r === true) grantPro('restore');
                else setStatus('没有找到可恢复的购买记录。');
                return;
            } catch (e) { }
        }
        grantPro('restore-local');
    }

    function handleCodeSubmit() {
        var inp = document.getElementById('proCodeInput');
        if (!inp) return;
        var code = inp.value.trim();
        if (!code) { setStatus('请输入激活码', 'warn'); return; }
        var r = unlockByCode(code);
        setStatus(r.message, r.ok ? 'ok' : 'err');
        if (r.ok) { inp.value = ''; }
    }

    function setStatus(txt, kind) {
        var st = document.getElementById('proStatus');
        if (st) st.textContent = txt;
    }

    // ---------- Pro 门禁 ----------
    // 返回 true = 已拦截（弹付费墙）；false = 放行
    function guardPro(opts) {
        opts = opts || {};
        if (isPro()) return false;
        if (!opts.required) return false;
        openProPaywall(opts.label || opts.feature || '高级功能');
        return true;
    }

    // ---------- 设置页 Pro 卡片注入 ----------
    function injectSettingsCard() {
        var tab = document.getElementById('settingsTab');
        if (!tab) return;
        if (document.getElementById('proSettingsCard')) return;
        var card = document.createElement('div');
        card.className = 'settings-section pro-card';
        card.id = 'proSettingsCard';
        card.innerHTML =
            '<div class="settings-title" id="proCardTitle">💎 专业版</div>' +
            '<div class="setting-item" id="proCardEntry">' +
            '<div class="setting-info"><div class="setting-name" id="proCardName">查看专业版功能</div>' +
            '<div class="setting-desc" id="proCardDesc">AI 生图 / 专属主题等高级能力</div></div>' +
            '<div class="setting-controls"><span id="proCardStatus">›</span></div>' +
            '</div>';
        tab.insertBefore(card, tab.firstChild);
        var entry = card.querySelector('#proCardEntry');
        if (entry) entry.onclick = function () {
            if (isPro()) { setStatus && grantPro('tap'); openProPaywall('专业版'); }
            else openProPaywall();
        };
        refreshProUI();
    }

    // 在任务弹窗的 AI 生图按钮旁加"PRO"角标（非 Pro 时）、并让点击走付费墙
    function markPremiumUi() {
        if (isPro()) return;
        var aiBtn = document.getElementById('taskBgAiBtn');
        if (!aiBtn) return;
        if (aiBtn.getAttribute('data-pro-marked')) return;
        aiBtn.setAttribute('data-pro-marked', '1');
        var label = '✨ 生成 AI 背景图 · PRO';
        // 保留语义：不直接禁用，改由 generateTaskBackgroundImage 内的 guardPro 拦截
    }

    // 设置页追加「隐私政策」入口（商业版合规）
    function injectPrivacyEntry() {
        var tab = document.getElementById('settingsTab');
        if (!tab) return;
        if (document.getElementById('privacySettingsSection')) return;
        var sec = document.createElement('div');
        sec.className = 'settings-section';
        sec.id = 'privacySettingsSection';
        sec.innerHTML =
            '<div class="settings-title">隐私与合规</div>' +
            '<div class="setting-item" id="privacyEntry">' +
            '<div class="setting-info"><div class="setting-name">📄 隐私政策</div>' +
            '<div class="setting-desc">查看本应用对数据的收集与保护说明</div></div>' +
            '<div class="setting-controls"><span>›</span></div>' +
            '</div>';
        // 插入到专业版卡片之后
        var proCard = document.getElementById('proSettingsCard');
        if (proCard && proCard.nextSibling) { tab.insertBefore(sec, proCard.nextSibling); }
        else { tab.appendChild(sec); }
        var entry = sec.querySelector('#privacyEntry');
        if (entry) entry.onclick = function () {
            try { window.location.href = './privacy-policy.html'; } catch (e) {}
        };
    }

    function refreshProUI() {
        var pro = isPro();
        var name = document.getElementById('proCardName');
        var desc = document.getElementById('proCardDesc');
        var status = document.getElementById('proCardStatus');
        var title = document.getElementById('proCardTitle');
        if (title) title.textContent = pro ? '💎 专业版 · 已解锁' : '💎 专业版';
        if (name) name.textContent = pro ? '专业版功能已全部解锁' : '查看专业版功能';
        if (desc) desc.textContent = pro ? '感谢你的支持 💙' : 'AI 生图 / 专属主题等高级能力';
        if (status) status.textContent = pro ? '✓' : '›';
        markPremiumUi();
    }

    // ---------- 初始化 ----------
    function init() {
        try {
            var run = function () {
                injectSettingsCard();
                injectPrivacyEntry();
                refreshProUI();
                // 全局兜底：确保外部 JS 可用
                global.TimeBankCommercial.isPro = isPro;
                global.TimeBankCommercial.guardPro = guardPro;
                global.TimeBankCommercial.openProPaywall = openProPaywall;
                global.TimeBankCommercial.grantPro = grantPro;
                global.TimeBankCommercial.unlockByCode = unlockByCode;
            };
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', run);
            } else {
                // 延迟一拍，确保 app-1 的 DOM/UI 渲染完成（设置页存在）
                setTimeout(run, 300);
            }
        } catch (e) {
            // 商业模块初始化失败不阻断主应用
        }
    }

    // ---------- 导出 ----------
    global.TimeBankCommercial = global.TimeBankCommercial || {};
    global.TimeBankCommercial.isPro = isPro;
    global.TimeBankCommercial.guardPro = guardPro;
    global.TimeBankCommercial.openProPaywall = openProPaywall;
    global.TimeBankCommercial.closePaywall = closePaywall;
    global.TimeBankCommercial.grantPro = grantPro;
    global.TimeBankCommercial.unlockByCode = unlockByCode;
    global.TimeBankCommercial._deriveCode = _deriveCode; // 供外部生成激活码，上架可移除

    if (document.readyState !== 'loading') setTimeout(init, 100);
    else document.addEventListener('DOMContentLoaded', init);

})(window);