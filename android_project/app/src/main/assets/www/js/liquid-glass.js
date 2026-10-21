/* ============================================================================
   [v9.42.0] 液态玻璃（Liquid Glass）· 真折射引擎
   ----------------------------------------------------------------------------
   定位：作为「第四个卡片风格」的**光学层**，与 CSS 材质（main.css 的
        body.liquid-glass 一族）配合工作：
          · CSS 负责材质外观（玻璃体透明度 / 方向性边缘亮环 / 厚度感）
          · 本文件只负责**真折射**：把玻璃背后的画面在边缘向内压缩

   原理（对齐 Apple 光学模型 / WWDC25 Liquid Glass）：
     1) backdrop-filter 引用 SVG 位移滤镜，位移图由「圆角矩形 SDF + 逆幂剖面」逐像素算出；
     2) 位移方向 = 内法线（向内采样）→ 边缘出现**压缩镜像环**（不是放大镜式的向外膨胀）；
     3) 位移量大于该点到边界的距离时自然「折返」→ 贴边一圈细密镜像，这是真玻璃的标志。

   ★ 本引擎【不做调色】：
     不含 saturate 增艳、brightness 明暗、自适应色调与三通道色散（彩虹边）。
     原因：这些都会改变颜色，在不同壁纸上表现不一致，观感上「颜色偏怪」。
     现在玻璃的颜色 100% 来自背后被折射的画面。

   ★★ [v9.42.0 重做] 两条真机实测结论（本项目平板 / Chromium WebView）
     ────────────────────────────────────────────────────────────────
     ① `backdrop-filter: url(#disp)` 单独使用 → 边缘折射清晰可见（背景被真实弯折）。
        本机 WebView 实测 `CSS.supports('backdrop-filter','url(#x)') === true`，
        位移图构建约 21ms、PNG 约 17KB，性能完全可用。
     ② `url(#disp)` 与 `blur()` **串联会互相抵消** → 位移被 blur 彻底抹平，
        画面只剩一团「脏糊」，边缘完全看不出弯折。
        ★ 这就是此前「液态玻璃效果极差」的直接根因 —— 不是折射强度不够，
          而是代码在同一个 backdrop-filter 里亲手叠了 blur()，把折射吃掉了。
        ★ 另外 url() 会**整条替换** backdrop-filter，会把元素原有的玻璃模糊一并清掉。

     据此重构为**分层**：折射挂在独立图层 .lg-refract（只写 url()），
     元素本体继续用 CSS 的玻璃体（模糊/透明度/亮环）—— 外层弯折、内层通透，互不干扰。

   性能红线（真机实测，务必遵守）：
     · 只有「固定不滚动」的悬浮元素才挂真折射（底栏胶囊 / FAB / 首页三张主卡）。
       滚动中的列表卡片若挂真折射，每帧都要重采样 backdrop，实测会掉到 15fps 以下。

   降级：不支持 backdrop-filter: url() 时静默跳过（保留 CSS 侧的毛玻璃质感）。
   ============================================================================ */
window.LiquidGlass = (function () {
    'use strict';

    /* [v9.42.0] 诊断输出：经 Android 桥写入 logcat（tag = TimeBankJS）。
       只用于确认「滤镜是否真的挂上、SVG 引用是否有效」，不影响任何功能表现。 */
    function diag(msg) {
        try { if (window.Android && window.Android.log) window.Android.log('[LG] ' + msg); } catch (e) { }
        try { console.log('[LG] ' + msg); } catch (e) { }
    }
    window.addEventListener('error', function (e) {
        diag('JS ERROR: ' + e.message + ' @' + (e.filename || '') + ':' + (e.lineno || 0));
    });

    var NS = 'http://www.w3.org/2000/svg';
    var XLINK = 'http://www.w3.org/1999/xlink';

    // 位移图分辨率上限：移动端不用 3x 屏算 9 倍像素
    var MAX_DPR = 1.5;
    /* ---------------- 挂载范围 ----------------
       [v9.42.0 重做] 此前这里注释写「只有固定不滚动的悬浮元素才挂真折射」，
       实际代码却把 .task-card / .settings-section / .modal-content 等全部列表元素也挂了
       —— 注释与代码互相矛盾，且违背本文件顶部的性能红线（滚动中每帧重采样 backdrop
       会掉到 15fps 以下）。现已按红线收敛：
         · 焦点元素（常驻、数量固定、不随列表滚动）→ 全程挂载
         · 列表 / 浮层（数量不可控）→ 不挂真折射，仅保留 CSS 玻璃体 + 亮环
       二者的光学差异由 CSS 补齐，视觉上仍是玻璃，只是不做逐像素位移。 */

    // 常驻焦点：底栏胶囊、FAB（index.html 用 data-liquid-glass 显式标记）
    var SEL_FIXED = '[data-liquid-glass]';
    // 首页三张主卡：常驻、数量固定、不随列表滚动
    var SEL_MAIN = '.balance-card-wrapper-finance, .screen-time-wrapper, .sleep-card-wrapper';
    var SEL = SEL_FIXED + ', ' + SEL_MAIN;

    var CFG = {
        /* [v9.42.0 本轮] 按反馈大幅加强折射：之前 0.10/0.10 太弱，
           在静止画面下几乎看不出来，玻璃显得"只是个普通卡片"。
           现在把折射带加宽、位移加大、衰减放缓，让压缩镜像环清晰可见。
           上限仍受"扁卡片堆叠时不出现发光缝"约束，故取 0.18 而非更激进的 0.24。 */
        bevel: 0.18,      // 折射带宽度 = 短边 × 该比例
        p: 2.2,           // 逆幂衰减指数：越大「压缩环」越细、越贴边
        dispersion: 0,    // [v9.42.0] 三通道色散已关闭 —— 彩虹边属于"改颜色"，按需求删除
        strength: 1.0     // 折射强度倍率，由「通透强度」档位驱动（0 ~ 1.2）
    };

    var SUPPORT = (function () {
        try {
            return !!(CSS.supports && (CSS.supports('backdrop-filter', 'url(#x)') ||
                CSS.supports('-webkit-backdrop-filter', 'url(#x)')));
        } catch (e) { return false; }
    })();

    var svgRoot = null;
    var defs = null;
    var seq = 0;
    var enabled = false;
    var nodes = [];          // 已挂载的元素
    var resizeObs = null;
    var buildTimer = null;

    /* ---------------- 表面高度函数（形状来源） ---------------- */
    function hSquircle(x) {
        return Math.pow(Math.max(0, 1 - Math.pow(1 - x, 4)), 0.25);
    }

    /* 归一化位移剖面：x = 0 贴边 → 1 折射带末端
       主项为逆幂衰减（贴边折得最狠），微调项为表面高度形状，避免双重衰减把折射压成一条缝 */
    function makeProfile(p) {
        var N = 96, raw = new Float64Array(N + 1);
        var XMIN = 0.05, d = 0.006;
        var g0 = Math.abs((hSquircle(Math.min(1, XMIN + d)) - hSquircle(XMIN - d)) / (2 * d)) || 1;
        var k = 0.3;
        var E = Math.pow(1 + 1 / k, -p);
        for (var i = 0; i <= N; i++) {
            var x = i / N;
            var xc = x < XMIN ? XMIN : x;
            var hi = Math.min(1, xc + d), lo = Math.max(0, xc - d);
            var gx = Math.abs((hSquircle(hi) - hSquircle(lo)) / (hi - lo));
            var shapeF = Math.min(1, gx / g0);
            var f = (Math.pow(1 + x / k, -p) - E) / (1 - E);
            if (f < 0) f = 0;
            raw[i] = f * 0.78 + shapeF * 0.22;
        }
        return raw;
    }
    var PROFILE = makeProfile(CFG.p);

    /* ---------------- 圆角矩形 SDF ---------------- */
    function sdf(x, y, hw, hh, r) {
        var qx = Math.abs(x) - hw + r, qy = Math.abs(y) - hh + r;
        return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
    }

    /* ---------------- 生成位移图（canvas → dataURL） ---------------- */
    /* 位移图缓存：滚动停稳后要重新挂载卡片，尺寸未变时直接复用，
       避免重复跑「几十万像素的 SDF 计算」造成停稳后的卡顿 */
    var mapCache = {};
    var mapCacheKeys = [];

    function buildMap(w, h, radius) {
        var key = w + 'x' + h + 'x' + Math.round(radius) + 'x' + CFG.strength.toFixed(2);
        if (mapCache[key]) return mapCache[key];
        var short = Math.min(w, h);
        var bevel = Math.max(3, short * CFG.bevel);
        // [v9.42.0] 位移量由短边的 10% 提到 18%：这是「像不像玻璃」的决定性量。
        //   太小 → 折射带几乎不弯，只剩一圈描边，那就是"普通卡片"。
        var maxDisp = Math.max(1.2, short * 0.18 * CFG.strength);
        var pad = Math.ceil(maxDisp + 16);
        var fw = w + pad * 2, fh = h + pad * 2;
        var dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
        var cw = Math.max(1, Math.round(fw * dpr));
        var ch = Math.max(1, Math.round(fh * dpr));

        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = 'rgb(128,128,128)';          // 128 = 零位移（含四周 padding）
        ctx.fillRect(0, 0, cw, ch);
        var img = ctx.getImageData(0, 0, cw, ch);
        var data = img.data;

        var hw = w / 2, hh = h / 2;
        var rr = Math.min(radius, Math.min(hw, hh));
        var NW = PROFILE.length - 1;

        for (var j = 0; j < ch; j++) {
            for (var i = 0; i < cw; i++) {
                var ex = i / dpr - pad - w / 2;
                var ey = j / dpr - pad - h / 2;
                var dist = -sdf(ex, ey, hw, hh, rr);   // 内部为正
                if (dist <= 0 || dist >= bevel) continue;   // 元素外 / 中心中和区：零位移

                var t = dist / bevel;
                var fi = t * NW;
                var i0 = fi | 0, fr = fi - i0;
                var g = PROFILE[i0] * (1 - fr) + PROFILE[i0 + 1 < NW ? i0 + 1 : NW] * fr;

                // 内法线 = -∇SDF
                var e = 0.6;
                var gx = sdf(ex + e, ey, hw, hh, rr) - sdf(ex - e, ey, hw, hh, rr);
                var gy = sdf(ex, ey + e, hw, hh, rr) - sdf(ex, ey - e, hw, hh, rr);
                var gl = Math.hypot(gx, gy) || 1;

                var mag = g * maxDisp;
                var dx = (-gx / gl) * mag;
                var dy = (-gy / gl) * mag;

                var p4 = (j * cw + i) * 4;
                var rv = 128 + (dx / maxDisp) * 127;
                var gv = 128 + (dy / maxDisp) * 127;
                data[p4] = rv < 0 ? 0 : (rv > 255 ? 255 : rv);
                data[p4 + 1] = gv < 0 ? 0 : (gv > 255 ? 255 : gv);
                data[p4 + 2] = 128;
                data[p4 + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        var out = { url: cv.toDataURL('image/png'), scale: maxDisp, pad: pad, fw: fw, fh: fh, bevel: bevel };
        if (mapCacheKeys.length > 40) { mapCache = {}; mapCacheKeys = []; }
        mapCache[key] = out;
        mapCacheKeys.push(key);
        return out;
    }

    /* ---------------- 组装滤镜（含三通道色散） ---------------- */
    function chanNodes(filter, sel, scale, res) {
        var d = document.createElementNS(NS, 'feDisplacementMap');
        d.setAttribute('in', 'SourceGraphic');
        d.setAttribute('in2', 'dmap');
        d.setAttribute('scale', String(scale));
        d.setAttribute('xChannelSelector', 'R');
        d.setAttribute('yChannelSelector', 'G');
        d.setAttribute('result', res + '_d');
        var cm = document.createElementNS(NS, 'feColorMatrix');
        cm.setAttribute('in', res + '_d');
        cm.setAttribute('type', 'matrix');
        cm.setAttribute('values', sel);
        cm.setAttribute('result', res);
        filter.appendChild(d);
        filter.appendChild(cm);
    }

    /* ---------------- 折射图层 ----------------
       [v9.42.0 重做] 真机实测（本项目平板 / Chromium WebView）得到两条硬结论：
         ① `backdrop-filter: url(#disp)` 单独使用 → 边缘折射清晰可见（背景被真实弯折）；
         ② `url(#disp)` 与 `blur()` 串联 → **位移被 blur 彻底抹平**，只剩一团「脏糊」。
       ② 正是此前「效果极差」的根因：不是折射不够强，而是折射被自己叠的模糊吃掉了。
       另外 `url()` 会**整条替换** backdrop-filter，把元素原有的玻璃模糊一并清掉。
       解法：把折射放到一层**独立图层**，元素本体继续用 CSS 的玻璃体，
       两者分层共存 —— 外层负责「弯折」，内层负责「通透」。 */
    var REFRACT_LAYER = 'lg-refract';

    function applyFilterChain(el, id) {
        var layer = el.__lgLayer;
        if (!layer) {
            layer = document.createElement('div');
            layer.className = REFRACT_LAYER;
            el.__lgLayer = layer;
        }
        if (layer.parentNode !== el) el.appendChild(layer);
        // 折射层单独使用 url()，**绝不**与 blur() 串联（见上方实测结论）
        layer.style.setProperty('backdrop-filter', 'url(#' + id + ')');
        layer.style.setProperty('-webkit-backdrop-filter', 'url(#' + id + ')');
        el.classList.add('lg-refract-host');
        diag('refract layer -> url(#' + id + ')');
    }

    function mount(el) {
        if (!enabled || !SUPPORT) return;
        try {
        var t0 = performance.now();
        var r = el.getBoundingClientRect();
        var w = Math.round(r.width), h = Math.round(r.height);
        if (w < 8 || h < 8) return;

        var cs = window.getComputedStyle(el);
        var radius = parseFloat(cs.borderTopLeftRadius) || 0;
        var m = buildMap(w, h, radius);

        var id = 'lgF' + (seq++);
        var f = document.createElementNS(NS, 'filter');
        f.setAttribute('id', id);
        f.setAttribute('filterUnits', 'userSpaceOnUse');
        f.setAttribute('color-interpolation-filters', 'sRGB');
        f.setAttribute('x', String(-m.pad));
        f.setAttribute('y', String(-m.pad));
        f.setAttribute('width', String(m.fw));
        f.setAttribute('height', String(m.fh));

        var feImg = document.createElementNS(NS, 'feImage');
        feImg.setAttribute('href', m.url);
        feImg.setAttributeNS(XLINK, 'xlink:href', m.url);
        feImg.setAttribute('x', String(-m.pad));
        feImg.setAttribute('y', String(-m.pad));
        feImg.setAttribute('width', String(m.fw));
        feImg.setAttribute('height', String(m.fh));
        feImg.setAttribute('preserveAspectRatio', 'none');
        feImg.setAttribute('result', 'dmap');
        f.appendChild(feImg);

        // [v9.42.0 性能] 色散（三通道位移）成本约为单通道的 3 倍，
        //   只留给「固定不滚动」的底栏与 FAB（它们不随滚动重采样，是视觉焦点）；
        //   滚动中的卡片一律走单通道，观感几乎无差别，却能省下 2/3 滤镜开销。
        var isFixedEl = el.classList.contains('bottom-tabs') || el.classList.contains('fab');
        var base = m.scale, ab = isFixedEl ? CFG.dispersion : 0;
        if (ab > 0) {
            chanNodes(f, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', base, 'chR');
            chanNodes(f, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', base + ab, 'chG');
            chanNodes(f, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', base + ab * 2, 'chB');
            var b1 = document.createElementNS(NS, 'feBlend');
            b1.setAttribute('in', 'chR'); b1.setAttribute('in2', 'chG');
            b1.setAttribute('mode', 'screen'); b1.setAttribute('result', 'rg');
            f.appendChild(b1);
            var b2 = document.createElementNS(NS, 'feBlend');
            b2.setAttribute('in', 'rg'); b2.setAttribute('in2', 'chB');
            b2.setAttribute('mode', 'screen');
            f.appendChild(b2);
        } else {
            var d0 = document.createElementNS(NS, 'feDisplacementMap');
            d0.setAttribute('in', 'SourceGraphic');
            d0.setAttribute('in2', 'dmap');
            d0.setAttribute('scale', String(base));
            d0.setAttribute('xChannelSelector', 'R');
            d0.setAttribute('yChannelSelector', 'G');
            f.appendChild(d0);
        }

        if (el.__lgFilter && el.__lgFilter.parentNode) el.__lgFilter.parentNode.removeChild(el.__lgFilter);
        defs.appendChild(f);
        el.__lgFilter = f;
        el.__lgId = id;
        applyFilterChain(el, id);
        diag('mounted <' + (el.className || el.tagName) + '> ' + w + 'x' + h + ' r=' + radius +
            ' bevel=' + m.bevel.toFixed(1) + ' maxDisp=' + m.scale.toFixed(1) +
            ' filters=' + defs.childNodes.length + ' t=' + Math.round(performance.now() - t0) + 'ms');
        } catch (err) {
            diag('mount FAILED <' + (el.className || el.tagName) + '>: ' + err.message);
        }
    }

    function unmount(el) {
        if (el.__lgFilter && el.__lgFilter.parentNode) el.__lgFilter.parentNode.removeChild(el.__lgFilter);
        el.__lgFilter = null;
        el.__lgId = null;
        // [v9.42.0 重做] 折射改为独立图层，卸载时移除该层并还原 host 标记
        var layer = el.__lgLayer;
        if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
        el.__lgLayer = null;
        el.classList.remove('lg-refract-host');
        el.style.removeProperty('backdrop-filter');
        el.style.removeProperty('-webkit-backdrop-filter');
    }

    function collect() {
        nodes = [];
        var list = document.querySelectorAll(SEL);
        for (var i = 0; i < list.length; i++) nodes.push(list[i]);
        return nodes;
    }

    /* 立即重建（元素尺寸/强度变化时） */
    function refresh() {
        if (!SUPPORT) return;
        if (!enabled) { unmountAll(); return; }
        if (!svgRoot) ensureSvg();
        collect();
        diag('refresh: targets=' + nodes.length);
        for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
    }

    function unmountAll() {
        var all = document.querySelectorAll(SEL);
        for (var i = 0; i < all.length; i++) unmount(all[i]);
        nodes = [];
    }

    function scheduleBuild() {
        if (buildTimer) clearTimeout(buildTimer);
        buildTimer = setTimeout(refresh, 80);
    }

    /* [v9.42.0 重做] 已删除 IntersectionObserver 视口挂载机制（observeList / io）。
       它是为「列表类元素也要挂真折射」服务的；既然挂载范围已按性能红线收敛到
       常驻焦点元素（全都在视口内、尺寸固定），该机制连同 SEL_LIST 一并移除。
       附带修掉一个真实缺陷：原实现在元素滑出视口时 unmount，
       会让卡片在滑动过程中「折射当场消失」，观感等同功能失效。 */

    function ensureSvg() {
        if (svgRoot && svgRoot.parentNode) return;
        svgRoot = document.getElementById('liquidGlassDefs');
        if (!svgRoot) {
            svgRoot = document.createElementNS(NS, 'svg');
            svgRoot.setAttribute('id', 'liquidGlassDefs');
            svgRoot.setAttribute('width', '0');
            svgRoot.setAttribute('height', '0');
            svgRoot.setAttribute('aria-hidden', 'true');
            svgRoot.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none';
            document.body.appendChild(svgRoot);
        }
        defs = svgRoot.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS(NS, 'defs');
            svgRoot.appendChild(defs);
        }
    }

    function observeResize() {
        if (resizeObs || typeof ResizeObserver !== 'function') return;
        resizeObs = new ResizeObserver(function () { scheduleBuild(); });
        observeTargets();
    }
    function observeTargets() {
        if (!resizeObs) return;
        var list = document.querySelectorAll(SEL);
        for (var i = 0; i < list.length; i++) {
            if (!list[i].__lgObs) { resizeObs.observe(list[i]); list[i].__lgObs = true; }
        }
    }

    /* ---------------- 对外 API ---------------- */
    function setEnabled(on) {
        enabled = !!on && SUPPORT;
        diag('setEnabled(' + on + ') support=' + SUPPORT + ' -> enabled=' + enabled);
        if (!enabled) {
            unmountAll();
            return;
        }
        ensureSvg();
        diag('svgRoot=' + (svgRoot ? svgRoot.id : 'NULL') + ' defs=' + (defs ? 'ok' : 'NULL'));
        refresh();
        observeResize();
        observeTargets();
        // [v9.42.0] 原先此处调用 bindLight()（陀螺仪光照）与 applyAdaptiveFromStorage()（自适应色调），
        //   二者均已删除 —— 前者让高光乱转、后者改变颜色。
        bindMorph();
        // 底栏/FAB 是 fixed 元素，尺寸只在横竖屏切换时变化
        window.addEventListener('orientationchange', scheduleBuild);
        window.addEventListener('resize', scheduleBuild);
    }

    function setStrength(scale) {
        var s = Number(scale);
        if (!isFinite(s)) s = 1;
        CFG.strength = Math.max(0, Math.min(1.2, s));
        if (!enabled) return;
        if (CFG.strength <= 0.01) { unmountAll(); return; }
        scheduleBuild();
    }

    /* [v9.42.0 本轮] 已删除以下三块代码（按需求「删除所有滤镜和影响颜色的效果」）：
         ① 自适应色调 adaptToLuminance() —— 按壁纸明暗给玻璃提亮/压暗。
            这是「颜色偏怪」的最大来源：同一套玻璃在不同壁纸上颜色完全不同，
            而且提亮会让白字糊掉、压暗会让玻璃发灰，两头都不讨好。
            现在的做法是**完全交给折射**：玻璃不改颜色，背景什么颜色就显什么颜色。
         ② measureCustomBackground() —— 为 ① 服务的背景亮度采样。
         ③ applyAdaptiveFromStorage() —— 冷启动时补算一次 ①。
         ④ 动态光源（陀螺仪 deviceorientation / 滚动驱动 --spec-angle 的环形高光，
            以及随之移动的内部柔光落点 --lg-hx/--lg-hy）—— 视觉上像"有盏灯在跟着转"，
            非常出戏。边缘高光现已在 CSS 里改为固定朝向的静态亮环。

       对外仍保留 adaptToLuminance / measureCustomBackground 两个空实现，
       避免 app-reports.js / app-systems.js 里的既有调用点抛错。 */

    /* ── 选中胶囊的流体形变触发 ──────────────────────────────────────────
       iOS 切换 tab 时选中玻璃块会「被拉长再回弹」，是 Liquid Glass 最有辨识度的动画。
       这里不去改项目现有的 tab 切换逻辑（避免侵入），而是监视指示器的
       style 变化 —— JS 定位写入 transform 时即触发一次形变动画。
       动画作用在伪元素上，不会与 translateX 定位冲突。 */
    function bindMorph() {
        if (window.__lgMorphBound) return;
        var iv = setInterval(function () {
            var ind = document.querySelector('.tab-indicator');
            if (ind) { window.__lgMorphBound = true; clearInterval(iv); watchIndicator(ind); }
        }, 600);
        // 兜底：30 秒后放弃，避免定时器永久驻留
        setTimeout(function () { clearInterval(iv); }, 30000);
    }

    function watchIndicator(ind) {
        var last = '';
        function check() {
            if (!document.body.classList.contains('liquid-glass')) return;
            var cur = ind.style.transform || '';
            if (cur && cur !== last) {
                last = cur;
                ind.classList.remove('lg-morph');
                void ind.offsetWidth;          // 强制重排，让动画能重新播放
                ind.classList.add('lg-morph');
            }
        }
        if (typeof MutationObserver === 'function') {
            new MutationObserver(check).observe(ind, { attributes: true, attributeFilter: ['style'] });
        }
        setInterval(check, 400);                 // 兜底：某些路径不触发 mutation
    }

    /* [v9.42.0 重做] 已删除 adaptToLuminance / measureCustomBackground。
       全库检索确认：这两个函数**没有任何调用点**（app-reports.js 的 setCardStyle 与
       app-systems.js 的主题/背景切换处都已是注释说明，不再调用），
       原注释所称「避免既有调用点抛错」已不成立 —— 属于纯遗留空壳。
       本引擎只做光学，不做任何调色：玻璃颜色 100% 来自背后被折射的画面。 */

    return {
        isSupported: function () { return SUPPORT; },
        isEnabled: function () { return enabled; },
        setEnabled: setEnabled,
        setStrength: setStrength,
        refresh: refresh,
        _cfg: CFG
    };
})();
