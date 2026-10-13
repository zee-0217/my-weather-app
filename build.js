// 공개할 화면 파일만 빌드 폴더에 복사합니다.
const fs = require('node:fs');
const path = require('node:path');

const output = path.join(__dirname, 'public');
fs.mkdirSync(output, { recursive: true });
for (const file of ['index.html', 'style.css', 'script.js']) {
  fs.copyFileSync(path.join(__dirname, file), path.join(output, file));
}
console.log('Static files prepared in public/');
