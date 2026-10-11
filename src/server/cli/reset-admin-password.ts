/**
 * Reset an existing administrator password on the server host.
 *
 * Usage:
 *   npm run reset-admin-password -- --email you@example.org --password-from-stdin
 */
import { db, audit } from '../db.js';
import { hashPassword } from '../lib/passwords.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readPassword(): Promise<string> {
  if (process.argv.includes('--password-from-stdin')) {
    let data = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) data += chunk;
    return data.trim();
  }
  throw new Error('Use --password-from-stdin so the password is not exposed in shell history.');
}

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  if (!email) throw new Error('--email is required.');
  const password = await readPassword();
  if (password.length < 12) throw new Error('Password must be at least 12 characters.');

  const admin = db.prepare('SELECT id, name, active FROM admin_users WHERE email = ?').get(email) as
    | { id: string; name: string; active: number }
    | undefined;
  if (!admin) throw new Error('No administrator exists with that email.');
  if (!admin.active) throw new Error('That administrator is inactive; activate the account before signing in.');

  const update = db.transaction(() => {
    db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hashPassword(password), admin.id);
    db.prepare('DELETE FROM sessions WHERE admin_id = ?').run(admin.id);
    audit(admin.id, admin.name, 'admin.reset_password_cli', 'admin_user', admin.id, {});
  });
  update();
  console.log(`Reset password for ${email}. Existing sessions were signed out.`);
}

main().catch((error) => {
  console.error('ERROR:', error instanceof Error ? error.message : 'Password reset failed.');
  process.exit(1);
});
