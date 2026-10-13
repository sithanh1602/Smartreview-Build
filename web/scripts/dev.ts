import '../server/env.ts';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const children: ChildProcess[] = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
function start(command: string, args: string[]) {
  const child = spawn(command, args, { cwd, stdio: 'inherit' });
  children.push(child);
  child.on('error', (error) => {
    console.error(`Không khởi động được ${command}: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) {
      if (command === 'ssh')
        console.error('SSH tunnel đã đóng. Dừng dev để tránh dùng kết nối bị ngắt.');
      stop(code || 1);
    }
  });
  return child;
}
function listening(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ready: boolean) => {
      socket.destroy();
      resolve(ready);
    };
    socket.setTimeout(500);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}
function port(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535)
    throw new Error('Cổng SSH/MySQL phải từ 1 đến 65535.');
  return parsed;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
try {
  if (process.env.DEV_SSH_TUNNEL === 'true') {
    const host = process.env.DB_HOST || '127.0.0.1';
    if (host !== '127.0.0.1') throw new Error('Khi dùng tunnel, đặt DB_HOST=127.0.0.1.');
    const localPort = port(process.env.DB_PORT, 13306);
    const sshHost = process.env.DEV_SSH_HOST;
    const sshUser = process.env.DEV_SSH_USER;
    if (
      !sshHost ||
      !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(sshHost) ||
      !sshUser ||
      !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(sshUser)
    )
      throw new Error('Thiếu hoặc sai DEV_SSH_HOST / DEV_SSH_USER.');
    if (await listening(host, localPort)) {
      console.log(`Cổng ${localPort} đã mở; kiểm tra kết nối MySQL hiện có.`);
    } else {
      console.log('Đang mở SSH tunnel. Nhập mật khẩu SSH nếu được hỏi (hoặc dùng SSH key/agent).');
      start('ssh', [
        '-N',
        '-p',
        String(port(process.env.DEV_SSH_PORT, 22)),
        '-o',
        'ExitOnForwardFailure=yes',
        '-o',
        'ServerAliveInterval=30',
        '-o',
        'ServerAliveCountMax=3',
        '-o',
        'ConnectTimeout=15',
        '-L',
        `127.0.0.1:${localPort}:127.0.0.1:${port(process.env.DEV_SSH_DB_PORT, 3306)}`,
        `${sshUser}@${sshHost}`,
      ]);
      const deadline = Date.now() + 120_000;
      while (!stopping && !(await listening(host, localPort))) {
        if (Date.now() > deadline)
          throw new Error('Hết thời gian chờ tunnel (120 giây). Chạy lại npm run dev.');
        await delay(250);
      }
    }
    if (!stopping) {
      const { createPool } = await import('../server/db/pool.ts');
      const pool = createPool();
      try {
        await pool.query('SELECT 1');
      } finally {
        await pool.end();
      }
      console.log('MySQL sẵn sàng qua tunnel. Đang khởi động SmartReview…');
    }
  }
  if (!stopping) {
    start(process.execPath, ['--watch', 'server/index.ts']);
    start(process.execPath, ['node_modules/vite/bin/vite.js']);
  }
} catch (error) {
  console.error('Không thể chạy dev:', error instanceof Error ? error.message : 'Lỗi kết nối');
  stop(1);
}
