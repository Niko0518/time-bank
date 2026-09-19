// 本机验证 bridge/report.mjs（从 hermes/.env 读 env 后调用）
import { execFileSync } from 'child_process';
import fs from 'fs';

const env = {};
for (const line of fs.readFileSync('d:/TimeBank/hermes/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
try {
  const out = execFileSync('node', ['report.mjs', 'daily'], {
    cwd: 'd:/TimeBank/hermes/bridge',
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 120000,
  });
  console.log(out);
} catch (e) {
  console.error('FAIL:', e.stdout || e.message);
  process.exit(1);
}