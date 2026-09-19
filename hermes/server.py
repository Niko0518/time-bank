"""TimeBank Hermes 管家 · HTTP 壳（云托管 9000 端口）

零依赖（纯标准库）。端点：
  GET  /health            存活探针
  POST /chat              {"text"} → 立即返回 {"jobId"}（异步，hermes 冷启动可能>60s）
  GET  /chat/result?id=   → {"status":"running|done|error", "reply", "log"}
  POST /report            {"type":"daily|weekly|monthly"} → 报告写 tb_ai_messages（同步，~5s）
  POST /memory/backup     手动记忆备份
  POST /memory/restore    手动记忆恢复
后台：每 10 分钟自动备份记忆（防容器回收）。
"""
import json
import os
import subprocess
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get('PORT', '9000'))
CHAT_TIMEOUT = 600        # hermes 单次对话上限（秒）
REPORT_TIMEOUT = 120      # 报告生成上限
JOB_TTL = 1800            # 任务结果保留（秒）

JOBS = {}                 # jobId -> {status, reply, log, ts}
_lock = threading.Lock()


def run(cmd, timeout):
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return p.returncode, (p.stdout or '').strip(), (p.stderr or '').strip()


def chat_worker(job_id, text):
    try:
        JOBS[job_id]['status'] = 'running'
        rc, out, err = run(['hermes', '-z', text], CHAT_TIMEOUT)
        job = JOBS[job_id]
        job['log'] = f'rc={rc}\nstdout_tail={out[-300:]}\nstderr_tail={err[-300:]}'
        if rc == 0 and out:
            job['status'] = 'done'
            job['reply'] = out
        else:
            job['status'] = 'error'
            job['reply'] = ''
    except subprocess.TimeoutExpired:
        JOBS[job_id].update(status='error', log='timeout')
    except Exception as e:  # noqa: BLE001
        JOBS[job_id].update(status='error', log=str(e))


def node_bridge(script, arg):
    rc, out, err = run(['node', f'/srv/bridge/{script}', arg], REPORT_TIMEOUT)
    if rc != 0:
        raise RuntimeError(err or f'{script} exit {rc}')
    return out


def memory_backup_loop():
    while True:
        time.sleep(600)
        try:
            node_bridge('memory.mjs', 'backup')
        except Exception as e:  # noqa: BLE001
            print('[memory-loop] backup failed:', e, flush=True)


def job_gc_loop():
    while True:
        time.sleep(300)
        now = time.time()
        with _lock:
            stale = [k for k, v in JOBS.items() if now - v['ts'] > JOB_TTL]
            for k in stale:
                JOBS.pop(k, None)


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        # [v9.37.0] App(WebView timebank.local) / PWA 跨域调用所需；服务当前无入站鉴权，
        # 上 * 前提是仅个人使用（与既有无鉴权现状一致，操控层鉴权待下版）
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()

    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(n) if n else b'{}'
        return json.loads(raw or b'{}')

    def do_GET(self):
        if self.path == '/health':
            return self._json(200, {'status': 'ok', 'service': 'timebank-hermes'})
        if self.path.startswith('/chat/result'):
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            jid = (q.get('id') or [''])[0]
            job = JOBS.get(jid)
            if not job:
                return self._json(404, {'error': 'no such job'})
            return self._json(200, job)
        self._json(404, {'error': 'not found'})

    def do_POST(self):
        try:
            if self.path == '/chat':
                text = str(self._body().get('text') or '').strip()
                if not text:
                    return self._json(400, {'error': 'missing text'})
                jid = uuid.uuid4().hex[:12]
                JOBS[jid] = {'status': 'running', 'reply': '', 'log': '', 'ts': time.time()}
                threading.Thread(target=chat_worker, args=(jid, text), daemon=True).start()
                return self._json(202, {'jobId': jid, 'poll': f'/chat/result?id={jid}'})
            if self.path == '/report':
                t = str(self._body().get('type') or 'daily')
                if t not in ('daily', 'weekly', 'monthly'):
                    return self._json(400, {'error': 'bad type'})
                out = node_bridge('report.mjs', t)
                return self._json(200, {'ok': True, 'detail': out[-500:]})
            if self.path == '/memory/backup':
                return self._json(200, {'ok': True, 'detail': node_bridge('memory.mjs', 'backup')[-300:]})
            if self.path == '/memory/restore':
                return self._json(200, {'ok': True, 'detail': node_bridge('memory.mjs', 'restore')[-300:]})
            self._json(404, {'error': 'not found'})
        except subprocess.TimeoutExpired:
            self._json(504, {'error': 'timeout'})
        except Exception as e:  # noqa: BLE001
            self._json(500, {'error': str(e)})

    def log_message(self, fmt, *args):
        print('[http]', fmt % args, flush=True)


if __name__ == '__main__':
    threading.Thread(target=memory_backup_loop, daemon=True).start()
    threading.Thread(target=job_gc_loop, daemon=True).start()
    print(f'[server] listening :{PORT}', flush=True)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()