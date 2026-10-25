#!/usr/bin/env node
// Prints DASHBOARD_ADMIN_PASSWORD_HASH for the dashboard's local admin sign-in (apps/dashboard/lib/server/localAdmin.ts).
// Usage: pnpm dashboard:admin-password <password>   (or pipe the password on stdin to keep it out of shell history)
const crypto = require('crypto');

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_BYTES = 16;

function hashPassword(password) {
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt:${salt.toString('base64url')}:${hash.toString('base64url')}`;
}

function readStdin() {
  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data.replace(/\r?\n$/, '')));
  });
}

async function main() {
  const password = process.argv[2] ?? (process.stdin.isTTY ? '' : await readStdin());
  if (!password || password.length < 12) {
    console.error('Usage: pnpm dashboard:admin-password <password>  (at least 12 characters)');
    process.exitCode = 1;
    return;
  }

  console.log(`DASHBOARD_ADMIN_PASSWORD_HASH=${hashPassword(password)}`);
}

if (require.main === module) {
  main();
}

module.exports = { hashPassword };
