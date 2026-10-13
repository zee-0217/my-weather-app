// Vercel 백엔드 진입점: 포트를 열지 않고 요청마다 공유 핸들러를 실행합니다.
const { createHandler } = require('../server');

module.exports = createHandler();
