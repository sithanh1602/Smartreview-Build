import { parseArgs } from 'node:util';
import { createPool } from '../server/db/pool.ts';
import { AuthService } from '../server/auth/service.ts';
import { hashPassword, usernameValue } from '../server/auth/password.ts';
import type { Role, Rows } from '../server/types.ts';

const { values } = parseArgs({
  options: {
    username: { type: 'string' },
    role: { type: 'string' },
    update: { type: 'boolean' },
    'reset-password': { type: 'boolean' },
    disable: { type: 'boolean' },
    enable: { type: 'boolean' },
  },
});
async function secret(prompt: string) {
  if (!process.stdin.isTTY)
    throw new Error('Chạy lệnh trong terminal tương tác để nhập mật khẩu ẩn.');
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise<string>((resolve, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      process.stdin.off('data', read);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      error ? reject(error) : resolve(value);
    };
    const read = (chunk: string) => {
      for (const c of chunk) {
        if (c === '\u0003') return finish(new Error('Đã hủy.'));
        if (c === '\r' || c === '\n') return finish();
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else if (c >= ' ') value += c;
      }
    };
    process.stdin.on('data', read);
  });
}
const pool = createPool();
try {
  const username = usernameValue(values.username);
  if (values.role && !['reviewer', 'annotator'].includes(values.role))
    throw new Error('Role phải là reviewer hoặc annotator.');
  if (values.enable && values.disable) throw new Error('Chỉ chọn --enable hoặc --disable.');
  if (
    !values.update &&
    (!values.role || values.disable || values.enable || values['reset-password'])
  )
    throw new Error(
      'Tạo mới: --username NAME --role reviewer|annotator. Sửa tài khoản: thêm --update.',
    );
  const [[existing]] = await pool.execute<Rows>('SELECT id FROM users WHERE username=?', [
    username,
  ]);
  if (Boolean(existing) !== Boolean(values.update))
    throw new Error(
      existing ? 'Tài khoản đã có. Dùng --update để sửa.' : 'Không tìm thấy tài khoản.',
    );
  let password;
  if (!values.update || values['reset-password']) {
    password = await secret('Mật khẩu mới (12–128 ký tự, không hiển thị): ');
    if (password !== (await secret('Nhập lại mật khẩu: ')))
      throw new Error('Mật khẩu nhập lại không khớp.');
  }
  if (!values.update) {
    await new AuthService(pool).createUser({ username, password, role: values.role as Role });
    console.log(`Đã tạo ${username} (${values.role}).`);
  } else {
    if (!values.role && !values.enable && !values.disable && !values['reset-password'])
      throw new Error('Chọn --role, --reset-password, --disable hoặc --enable.');
    const passwordHash = values['reset-password'] ? await hashPassword(password) : null;
    const c = await pool.getConnection();
    try {
      await c.beginTransaction();
      const [[u]] = await c.execute<Rows>('SELECT id FROM users WHERE username=? FOR UPDATE', [
        username,
      ]);
      if (!u) throw new Error('Không tìm thấy tài khoản.');
      if (values.role)
        await c.execute<Rows>('UPDATE users SET role=? WHERE id=?', [values.role, u.id]);
      if (passwordHash)
        await c.execute<Rows>('UPDATE users SET password_hash=? WHERE id=?', [passwordHash, u.id]);
      if (values.enable || values.disable)
        await c.execute<Rows>('UPDATE users SET enabled=? WHERE id=?', [
          values.enable ? 1 : 0,
          u.id,
        ]);
      await c.execute<Rows>('DELETE FROM auth_sessions WHERE user_id=?', [u.id]);
      await c.commit();
      console.log(`Đã cập nhật ${username} và thu hồi các phiên đăng nhập.`);
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }
} catch (e) {
  const { code, message } = e as Error & { code?: string };
  console.error(code === 'ER_DUP_ENTRY' ? 'Tên đăng nhập đã tồn tại.' : message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
