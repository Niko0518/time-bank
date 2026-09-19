if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        // [v8.2.4] 添加 updateViaCache: 'none'，确保浏览器始终从服务器检查 sw.js 更新
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
          .then(reg => console.log('✅ PWA 已启用'))
          .catch(err => console.log('❌ 错误:', err));
      });
    }

// [v8.2.18] PWA 安装提示：捕获 beforeinstallprompt 事件，提供自定义安装入口
(function() {
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches
                    || window.navigator.standalone === true;
    if (isStandalone) return;

    var deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        deferredPrompt = e;
        console.log('✅ PWA 可安装');
        showPWAInstallBanner();
    });

    function showPWAInstallBanner() {
        if (document.getElementById('pwa-install-banner')) return;
        var banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:12px 20px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:99999;display:flex;align-items:center;gap:12px;font-size:14px;font-family:system-ui,sans-serif;max-width:90vw;white-space:nowrap;';
        banner.innerHTML = '<span>📱 安装时间银行到桌面</span>'
            + '<button id="pwa-install-btn" style="background:#fff;color:#667eea;border:none;padding:6px 16px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:14px;">安装</button>'
            + '<button id="pwa-dismiss-btn" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.5);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:14px;">稍后</button>';
        document.body.appendChild(banner);
        document.getElementById('pwa-install-btn').addEventListener('click', function() {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(function(result) {
                    console.log('PWA 安装结果:', result.outcome);
                    deferredPrompt = null;
                    dismissBanner();
                });
            }
        });
        document.getElementById('pwa-dismiss-btn').addEventListener('click', function() {
            dismissBanner();
        });
    }

    function dismissBanner() {
        var banner = document.getElementById('pwa-install-banner');
        if (banner) banner.remove();
    }

    window.addEventListener('appinstalled', function() {
        console.log('✅ PWA 已安装');
        dismissBanner();
    });
})();
