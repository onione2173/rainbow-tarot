const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.error('SUPABASE_URL 또는 SUPABASE_ANON_KEY 환경변수가 없습니다.');
  process.exit(1);
}

const authPath = path.join(__dirname, '..', 'assets', 'auth.js');
let content = fs.readFileSync(authPath, 'utf8');
content = content
  .replace(/__SUPABASE_URL__/g, url)
  .replace(/__SUPABASE_ANON_KEY__/g, key);
fs.writeFileSync(authPath, content);

console.log('auth.js 환경변수 주입 완료');
