// 抓包代理：本地 8899 → 云开发网关，打印 Hermes 实际发出的请求（方法/路径/头/体截断）
const http = require('http');
const https = require('https');

const TARGET_HOST = 'cloud1-8gvjsmyd7860b4a3.api.tcloudbasegateway.com';

http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const safeHeaders = { ...req.headers };
    if (safeHeaders.authorization) {
      const a = safeHeaders.authorization;
      safeHeaders.authorization = a.slice(0, 30) + `...(len=${a.length})`;
    }
    console.log('\n=== REQUEST ===');
    console.log(req.method, req.url);
    console.log('headers:', JSON.stringify(safeHeaders, null, 1));
    console.log('body:', body.slice(0, 500));

    const options = {
      hostname: TARGET_HOST,
      port: 443,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: TARGET_HOST },
    };
    const upstream = https.request(options, ur => {
      let ub = '';
      ur.on('data', c => ub += c);
      ur.on('end', () => {
        console.log('=== UPSTREAM', ur.statusCode, '===');
        console.log(ub.slice(0, 300));
        res.writeHead(ur.statusCode, ur.headers);
        res.end(ub);
      });
    });
    upstream.on('error', e => {
      console.log('upstream error:', e.message);
      res.writeHead(502); res.end('proxy error');
    });
    upstream.end(body);
  });
}).listen(8899, () => console.log('[proxy] listening :8899'));