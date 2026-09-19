// Hermes 记忆持久化桥（容器内运行，防容器盘回收清空记忆）
// 用法: node memory.mjs backup | restore
// 原理：
//   backup  : tar 打包 ~/.hermes 的记忆部分(memories/state.db/sessions/skills/SOUL.md)
//             → 上传云存储 hermes-memory/<ts>.tar.gz → 把 fileID 写入 tb_ai_hermes meta 文档
//   restore : 读 meta 文档最新 fileID → 下载 → 解压回 ~/.hermes
// 凭据从环境变量读取。
import cloudbase from '@cloudbase/node-sdk';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const E = process.env;
const HOME_DIR = E.HERMES_HOME || path.join(process.env.HOME || '/root', '.hermes');
const TMP = '/tmp/hermes-mem.tar.gz';
const META_DOC_ID = 'hermes-memory-meta'; // tb_ai_hermes 固定文档 _id

const app = cloudbase.init({
  env: E.CLOUDBASE_ENV_ID,
  secretId: E.TC_SECRET_ID,
  secretKey: E.TC_SECRET_KEY,
});
const db = app.database();

// 只备份记忆相关（排除 config.yaml[含密钥]/.env/logs）
const MEM_PARTS = ['memories', 'state.db', 'sessions', 'skills', 'SOUL.md'];

async function backup() {
  const exists = MEM_PARTS.filter(p => fs.existsSync(path.join(HOME_DIR, p)));
  if (!exists.length) { console.log('[mem] nothing to backup'); return; }
  execSync(`tar czf ${TMP} -C ${HOME_DIR} ${exists.join(' ')}`);
  const buf = fs.readFileSync(TMP);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const cloudPath = `hermes-memory/${stamp}.tar.gz`;
  const up = await app.uploadFile({ cloudPath, fileContent: buf });
  // meta 文档固定 _id，upsert 最新 fileID（保留最近 N 个云文件由平台生命周期管理）
  try {
    await db.collection('tb_ai_hermes').doc(META_DOC_ID).set({
      _id: META_DOC_ID,
      latestFileID: up.fileID,
      latestCloudPath: cloudPath,
      size: buf.length,
      updatedAt: Date.now(),
    });
  } catch {
    await db.collection('tb_ai_hermes').add({
      _id: META_DOC_ID, latestFileID: up.fileID, latestCloudPath: cloudPath,
      size: buf.length, updatedAt: Date.now(),
    });
  }
  console.log(`[mem] backup ok ${cloudPath} ${(buf.length / 1024).toFixed(1)}KB`);
}

async function restore() {
  let meta;
  try {
    const r = await db.collection('tb_ai_hermes').doc(META_DOC_ID).get();
    meta = r.data && r.data[0];
  } catch { /* doc 不存在 */ }
  if (!meta || !meta.latestFileID) { console.log('[mem] no backup to restore'); return; }
  const dl = await app.downloadFile({ fileID: meta.latestFileID });
  fs.writeFileSync(TMP, dl.fileContent);
  fs.mkdirSync(HOME_DIR, { recursive: true });
  execSync(`tar xzf ${TMP} -C ${HOME_DIR}`);
  console.log(`[mem] restored from ${meta.latestCloudPath}`);
}

const act = process.argv[2] || 'restore';
(act === 'backup' ? backup() : restore()).catch(e => {
  console.error('[mem] FAIL', e.message || e);
  process.exit(1);
});