// 抠 deploy 命令里 UpdateCloudRunServer 的完整调用参数
const fs = require('fs');
const s = fs.readFileSync('C:/Users/15700/AppData/Roaming/npm/node_modules/@cloudbase/cli/dist/standalone/cli.js', 'utf8');
let idx = 0;
while ((idx = s.indexOf('UpdateCloudRunServer', idx + 1)) > 0) {
  const ctx = s.slice(idx - 2500, idx + 400);
  if (/Items|DeployInfo|EnvId/.test(ctx)) {
    console.log('=== call site @', idx, '===');
    console.log(ctx.split('\n').slice(-60).join('\n'));
    break;
  }
}