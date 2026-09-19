# TimeBank 商业版隔离方案文档

> **用途**：记录商业版「第二个 App」的隔离策略、已完成改动与待办，作为后续实施与跟踪的唯一依据。
> **状态**：进行中（包名/签名隔离已完成；**云端「新建环境」已放弃，移入"未来再考虑"**；**商业版 v1 已交付**——release 签名 APK + Pro 付费墙/激活码 + IAP 桥接 + 隐私政策 + 上架指南，详见 [commercial-v1.md](./commercial-v1.md) 与 [STORE-PUBLISHING.md](./STORE-PUBLISHING.md)）
> **提醒**：本文件仅记录方案与进度，**不参与官方版的版本号管理、双端同步、git 提交**，属完全隔离工作区。

---

## 1. 背景与目标

TimeBank 官方版是面向开发者的个人时间管理应用。为了在不影响官方版的前提下探索商业化（付费订阅 / AI 配额 / 生图限流等），在**完全隔离的工作区**复制出一套「商业版」，实现真正的"第二个 App"：

- 官方版与商业版**同时安装在同一台真机、互不覆盖**，官方版 4000+ 条本地数据不受影响
- 商业版可**自由改动**付费墙、AI 额度、生图限制等商业化逻辑，而不污染官方源码
- 商业版可独立构建、独立上架/分发

---

## 2. 副本位置与结构

```
D:\TimeBank\timebank-commercial\          ← 商业版隔离工作区（不进 git、不参与版本号）
├── android_project\                      ← 完整安卓工程副本（剔除 .gradle/build/.idea/日志）
│   ├── commercial-release.jks            ← 商业版专属签名 keystore（独立于官方 timebank.jks）
│   ├── keystore.properties               ← 签名证书参数（含口令，不进 git）
│   └── app\src\main\
│       ├── assets\www\                   ← 前端「权威源」副本（商业化改造主战场）
│       │   └── config\*.json             ← 前端云端配置（含环境 ID / 云函数端点）
│       ├── assets\config\*.json          ← 安卓原生层云端配置（CloudConfigManager 读取）
│       ├── java\...\timebank\            ← MainActivity/WebAppInterface 等原生代码
│       └── res\ + AndroidManifest.xml
└── cloudbase-functions\                  ← 4 个云函数源码副本（剔除 node_modules）
    ├── tbMutation / timebankSync / timebankAI / timebankTaskLock
    └── __checkDeviceMap
```

> 官方工程 `D:\TimeBank\android_project` 保持原样，所有改动物理隔离在副本内。

---

## 3. 已完成：包名 + 签名隔离 ✅

### 3.1 包名隔离
- **改法**：只改 `applicationId`，不改 `namespace`
  - `applicationId`（决定系统是否认作"另一个 App"）：`com.jianglicheng.timebank` → **`com.jianglicheng.timebank.commercial`**
  - `namespace`：保持 `com.jianglicheng.timebank`（对应 Java 源码包路径，改动会牵连所有文件，无收益）
- **好处**：两个 APK 可同时安装、数据各自独立，无需迁移任何 Java 文件

### 3.2 签名隔离
- 生成 **`commercial-release.jks`**（RSA 2048，有效期 36500 天），与官方 `timebank.jks` 完全独立
- 签名参数经 `keystore.properties` 读取，**未硬编码进 gradle**
- `app/build.gradle` 新增 `signingConfigs.release`，仅当 keystore 存在时启用（官方不共享）

### 3.3 产物校验
- `BUILD SUCCESSFUL`，产出 `app-debug.apk`（28.3MB）
- `aapt dump badging` 确认包名 = **`com.jianglicheng.timebank.commercial`**

### 3.4 改动文件清单（仅商业副本）
| 文件 | 改动 |
|------|------|
| `android_project/app/build.gradle` | 改 `applicationId`；新增签名加载逻辑 + `signingConfigs.release` |
| `android_project/commercial-release.jks` | 新增：商业版专属证书 |
| `android_project/keystore.properties` | 新增：证书参数（含口令，勿外泄） |

### 3.5 待验证（需真机）
> ⏸️ 当前无 USB 设备，连接设备后安装 `app-debug.apk`，验证与官方版共存、官方数据不丢。

---

## 4. 云端隔离：已定策略（调整为"未来再考虑"）

> **决策（2026-09-10）**：**放弃新建 CloudBase 环境**。原因：创建被腾讯云账户余额 0 阻断、需充值；且当前最紧急需求是"快速产出可上架商业版 v1"，不依赖新环境。
> **商业版 v1 实际走「同环境」**：暂时与官方共用现有云端 `cloud1-8gvjsmyd7860b4a3`（数据/函数同环境，作为 v1 过渡）。
> **真正双环境完全隔离已移入「未来再考虑」**，见下方计划块。

### 4.1 云端隔离待办清单（尚未执行）
| # | 事项 | 说明 | 执行方 |
|---|------|------|--------|
| 1 | 新建商业版 CloudBase 环境 | 账号级操作。CLI 已可自动建（`tcb env create`），但**腾讯云账户余额为 0，创建被阻断**，需先充值 | 充值后重试（CLI 已验证可用） |
| 2 | 部署 4 个云函数 | tbMutation / timebankSync / timebankAI / timebankTaskLock | 复制代码 → `tcb fn deploy` |
| 3 | 迁移 7 个集合 | tb_profile / tb_task / tb_transaction / tb_running / tb_daily / tb_ai_brain / tb_ai_messages | 新建并复制安全规则 |
| 4 | 重建**自定义安全规则** | `tb_transaction` / `tb_daily` 规则需手工配置 | 高点风险，需逐条核对 |
| 5 | 配置环境变量 | AI 服务密钥、ASR 的 `TENCENT_SECRET_ID/KEY` | 控制台 |
| 6 | 开通 AI 资源点 | hy3 文本 + hunyuan-image 生图（**新增月成本**） | 控制台购买 |
| 7 | 切换副本云端配置 | 原生层 + www 层两份 `config.production.json` 的 `envId`/端点 → 新环境 | 副本内改动，官方不变 |
| 8 | 双端隔离验证 | 官方 / 商业各自登录，数据完全不互通 | 真机 |

### 4.2 商业版云端配置双入口（都要改）
- **安卓原生层**：`assets/config/config.production.json`（`CloudConfigManager` 读取，含 `envId` + 云函数 HTTP 端点）
- **前端 www 层**：`assets/www/config/config.production.json`（前端 SDK 使用，含 `envId` + 端点）

> ⚠️ 新环境必须在 `config.development.json`/`config.testing.json` 之外的 `production` 配置中同步 `envId` 与云函数端点，否则原生层与前端层会各自连到不同环境。

---

## 5. 商业化成本参考（背景决策依据）

> 用于衡量商业版「新增云成本」是否可被营收覆盖，详细估算见对话记录。

| 成本项 | 单价 | 每活跃用户/月 |
|--------|------|--------------|
| 文本模型 hy3（对话/报告/AI大脑） | 输入 ¥1/百万 token、输出 ¥4/百万 token | ≈ ¥0.6 |
| 语音识别（一句话识别） | ¥3.2/千次 | ≈ ¥0.1 |
| 任务背景生图（hunyuan-image） | ~¥0.4–0.5/张（**最大单项**，需限流） | ≈ ¥2.25 |
| 云资源（数据库/云函数/存储/CDN） | 按量 | ≈ ¥0.3 |
| **合计** | | **≈ ¥3 / 活跃用户 / 月** |

**结论**：若订阅定价 ¥128/年，单个付费用户年成本约 ¥36（毛利率健康）；免费版需限制生图次数，防止成本被免费用户放大。

---

## 6. 关键风险与约定

- **cloud 环境成本新增**：新建商业环境会产生独立云资源 + AI 资源点账单，需在确认跑商业化后才执行
- **安全规则不可复制粘贴**：`tb_transaction` / `tb_daily` 的自定义规则需逐条在新环境重建，禁止直接整体导入（易出错）
- **keystore 口令保密**：`keystore.properties` 不在 git，妥善保管；商业上架前建议按正式规范重签
- **商业副本不参与官方流程**：不跑 `bump-version.ps1`、不 `git push`、双端同步一律不做，避免污染官方版