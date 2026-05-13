if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        // [v8.2.4] 添加 updateViaCache: 'none'，确保浏览器始终从服务器检查 sw.js 更新
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
          .then(reg => console.log('✅ PWA 已启用'))
          .catch(err => console.log('❌ 错误:', err));
      });
    }
