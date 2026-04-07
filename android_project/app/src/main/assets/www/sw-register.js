if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js') // [v4.5.4] 修复: 移除绝对路径并使用相对路径
          .then(reg => console.log('✅ PWA 已启用'))
          .catch(err => console.log('❌ 错误:', err));
      });
    }
