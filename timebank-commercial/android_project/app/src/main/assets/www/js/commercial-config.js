// [Commercial v1] 商业化配置：专业版商品/激活码种子/演示开关
// ⚠️ 本文件是商业版独立配置，不影响官方版。
// 上架前务必：将 allowDevUnlock 置为 false；如接入商店 IAP，填入真实 productId。
window.TimeBankCommercial = {
    version: '1.0.0',
    pro: {
        // 商店内购商品 ID（Google Play / 华为 等接入后填入真实值；未接入时为占位）
        productId: 'timebank_pro_v1',
        // 付费墙上展示的价格文案（满买断一次性）
        priceText: '¥18 买断',
        // 激活码校验种子：改它会令此前发出的激活码全部失效（上架前后请固定）
        seed: 'TimeBank-commercial-v1-8k3m9q',
        // 演示开关：true 时在付费墙上连点「PRO」徽标 5 次可解锁（仅供开发验收）
        // ⚠️ 发布 / 上架 / 提交审核 必须为 false（验收可用激活码列表正常解锁）
        allowDevUnlock: false,
        // Pro 锁定的功能清单（用于付费墙展示）
        features: [
            { key: 'task-bg-ai', label: 'AI 任务背景生图' },
            { key: 'premium-theme', label: '专属主题与装扮' },
            { key: 'full', label: '全部高级功能无限制' }
        ]
    }
};