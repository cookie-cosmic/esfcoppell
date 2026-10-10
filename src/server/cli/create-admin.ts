/**
 * Secure administrator bootstrap (run on the server host, never commits credentials):
 *   npm run create-admin -- --email you@example.org --name "Your Name" --role owner --password-from-stdin
 * or interactively prompted. Passwords are hashed with scrypt before storage.
 */
import readline from 'node:readline';
import { db, nowIso, newId, audit } from '../db.js';
import { hashPassword } from '../lib/passwords.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function prompt(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (hidden) {
      process.stdout.write(question);
      const stdin = process.stdin;
      stdin.setRawMode?.(true);
      stdin.resume();
      let buf = '';
      const onData = (ch: Buffer) => {
        const c = ch.toString();
        if (c === '\n' || c === '\r') {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(buf);
        } else if (c === '\u007f' || c === '\b') {
          buf = buf.slice(0, -1);
        } else {
          buf += c;
        }
      };
      stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

async function main() {
  const email = (arg('email') ?? (await prompt('Admin email: '))).trim().toLowerCase();
  const name = arg('name') ?? (await prompt('Display name: '));
  const role = arg('role') ?? 'owner';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Invalid email.');
  if (!['owner', 'admin', 'reviewer'].includes(role)) throw new Error('Role must be owner, admin, or reviewer.');
  let password = arg('password');
  if (process.argv.includes('--password-from-stdin')) {
    password = (await new Promise<string>((res) => {
      let data = '';
      process.stdin.on('data', (c) => (data += c));
      process.stdin.on('end', () => res(data.trim()));
    }));
  }
  if (!password) password = await prompt('Password (min 12 chars): ', true);
  if (password.length < 12) throw new Error('Password must be at least 12 characters.');
  const exists = db.prepare('SELECT id FROM admin_users WHERE email = ?').get(email);
  if (exists) throw new Error('An administrator with that email already exists.');
  const id = newId('adm');
  db.prepare('INSERT INTO admin_users (id, email, name, password_hash, role, active, created_at) VALUES (?,?,?,?,?,1,?)').run(
    id,
    email,
    name || email.split('@')[0],
    hashPassword(password),
    role,
    nowIso()
  );
  audit(id, email, 'admin.create_cli', 'admin_user', id, { role });
  console.log(`Created ${role} administrator: ${email} (${id})`);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
