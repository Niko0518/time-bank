# TimeBank 商业版 v1（时间银行 Pro）交付说明

> **状态**：✅ 已交付（release 签名 APK + Pro 商业化层 + IAP 桥接 + 激活码 + 隐私政策）
> **位置**：`D:\TimeBank\timebank-commercial\`
> **性质**：商业版本 v1，官方版与商业版完全隔离；官方版不受任何影响。

---

## 1. 商业版 v1 定位

- **变现方式（最基础）**：一次买断「专业版 Pro」，解锁高级功能。双通道：
  1. **应用商店内购（IAP）**——代码桥接已就绪，商店支付接入后生效（需开发者持有商店账号后操作）。
  2. **激活码（离线上架友好）**——无需任何商店账号，即可先卖码变现，当日可用。
- **上架能力**：已产出**签名 release APK**（用商业专属 keystore 签名），含独立包名、独立应用名、隐私政策页，具备提交应用商店的物质前提。

---

## 2. 交付产物清单

| 产物 | 位置 | 说明 |
|------|------|------|
| **签名 release APK** | 根目录 `时间银行-Pro-v9.36.6-release.apk`（26.8MB；源在 `android_project/app/build/outputs/apk/release/app-release.apk`） | 包名 `com.jianglicheng.timebank.commercial`，应用名「时间银行 Pro」，版本 v9.36.6(136)，签名 CN=TimeBank Commercial |
| 商业 keystore | `android_project/commercial-release.jks` | 签名证书 CN=TimeBank Commercial |
| 签名参数 | `android_project/keystore.properties` | 含口令，防盗先（未进 git） |
| 前端商业化层 | `android_project/app/src/main/assets/www/js/commercial.js` + `commercial-config.js` | 付费墙/Pro 锁定/激活码/IAP 调用 |
| 付费墙样式 | `.../www/css/commercial.css` | 增量样式，不影响主样式 |
| Pro 锁定点 | `.../www/js/app-2.js`（`generateTaskBackgroundImage` 开头） | AI 背景生图=专业版功能 |
| 原生 IAP 桥接 | `.../java/.../WebAppInterface.java` | `isPro/purchasePro/restorePro` 契约 |
| 隐私政策页 | `.../www/privacy-policy.html` | 上架用（需托管到公网 URL） |
| **激活码（50 个）** | `D:\TimeBank\timebank-commercial\pro-activation-codes.txt` | 算法与前端一致，可售卖/分发 |
| 隔离方案文档 | `commercial-isolation-plan.md` | 隔离策略与进展 |

---

## 3. 专业版锁定与解锁

### 3.1 锁定的高级功能（免费版不可用）
- **AI 任务背景生图**（`generateTaskBackgroundImage`）：非 Pro 用户点「AI 生成背景图」会弹专业版付费墙并拦截。免费用户仍可用相册上传背景图（不锁）。
- 付费墙展示的 Pro 特权清单：AI 任务背景生图 / 专属主题与装扮 / 全部高级功能无限制。

### 3.2 Pro 如何解锁（三选一）
1. **激活码**：在付费墙输入 `pro-activation-codes.txt` 中的任一码 → 立即解锁，状态存 `localStorage` 并同步云端 `profile.proTier'pro'`。
2. **商店 IAP**：`购买` 按钮调用 `Android.purchasePro()`（原生支付未接入时返回"不可用"并提示用激活码）。
3. **开发者演示**：`commercial-config.js` 中 `allowDevUnlock:true` 时，付费墙上连点「PRO」徽标 5 次可解锁（仅验收，**上架必须置 false**）。
   > ✅ 当前仓库状态：`allowDevUnlock` 已置 **false**（2026-09-10 收尾）。开发/验收如需演示解锁，可临时改回 true，提审前记得置回 false。

### 3.3 已内置的 Pro 状态来源（任一为真即视为 Pro）
- `localStorage['tb_pro_status']=='pro'`
- 云端 `profile.proTier=='pro'`
- 原生 `Android.isPro()==true`（商店支付成功后由原生置位）

---

## 4. 关键文件改动明细

| 文件 | 改动 |
|------|------|
| `www/index.html` | 引入 `commercial.css`；末尾加载 `commercial-config.js`、`commercial.js`（在 sw-register 之前） |
| `www/css/commercial.css` | 新增：付费墙 + 专业版卡片样式 |
| `www/js/commercial-config.js` | 新增：商品 ID、价格、激活码种子、演示开关 |
| `www/js/commercial.js` | 新增：付费墙、Pro 判定/门禁/解锁、设置页卡片与隐私入口 |
| `www/js/app-2.js` | `generateTaskBackgroundImage` 开头加 Pro 门禁 |
| `www/privacy-policy.html` | 新增：隐私政策页 |
| `java/.../WebAppInterface.java` | 新增：`isPro / purchasePro / restorePro` |
| `AndroidManifest.xml` | 应用名改「时间银行 Pro」 |

---

## 5. 待开发者完成（上架真正生效前）

> 以下必须由你持有对应商店账号后操作，无法由 AI 代劳。

1. **选择上架商店**（Google Play / 华为 / 小米 / OPPO/vivo 等），注册开发者账号。
2. **接入商店支付 SDK**：在 `WebAppInterface.purchasePro` 的 TODO 处接对应商店 Billing，并在支付成功回调里 `setProPurchased(true)`（真实收款路径）。
3. **托管隐私政策**：把 `privacy-policy.html` 发到公网 URL，填入商店"隐私政策"字段。
4. **上架前置检查**：`commercial-config.js` 把 `allowDevUnlock` 置 `false`；确认无测试/演示开关。 ✅ **已置 false（本次收尾完成）**。
5. **可选的正式激活码体系**：当前激活码为客户端本地校验（seed 写在 JS 内，防盗强度有限）。若追求强安全，建议日后改为服务端发码/下单系统（见「未来规划」）。
6. 重新打包 release 并签名后提审。

---

## 6. 未来规划（移入此清单）

- **双环境完全隔离**：为商业版单独建 CloudBase 环境（需充值），彻底分离数据与 AI 配额。
- **真实 IAP**：按商店接入 Billing SDK 实现真收款（当前是代码契约 + 激活码）。
- **服务端激活平台**：线上卖码/支付免码自动下发，替代客户端本地校验。
- **更多 Pro 功能**：AI 对话无限额度、专属主题、去水印、多端同步扩展等，按需逐步解锁。

---

## 7. 验收建议（睡醒后）

1. 看 `pro-activation-codes.txt` 中的 CODE-1，在付费墙输入，确认解锁成功 + 设置页专业版卡片变"已解锁"。
2. 点「AI 生成背景图」，确认非 Pro 时弹付费墙。
3. 连接手机安装 `app-release.apk`（或 debug），确认可与官方版共存、官方数据不丢。
4. 按需把 `allowDevUnlock` 置 false、接入真实商店后提审。