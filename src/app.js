import express from 'express';
import { fileURLToPath } from 'node:url';

import { planRouter } from './levels/plan.js';
import { limitPublicApi } from './levels/plan-store.js';
import { getPlaces } from './levels/places.js';

export const app = express();
app.disable('x-powered-by');
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', (req, res, next) => {
  const path = req.path.toLowerCase().replace(/\/+$/, '');
  if (path === '/places' || path === '/plan' || path.startsWith('/plan/')) return limitPublicApi(req, res, next);
  return next();
});
app.use('/api/plan', planRouter);
app.get('/api/places', getPlaces);
app.get('/api/map-config', (_req, res) => res.json({ clientId: process.env.NAVER_MAPS_CLIENT_ID?.trim() || null }));
app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url)), {
  dotfiles: 'deny',
}));




app.use('/api', (_req, res) => res.status(404).json({ error: 'API 경로를 찾을 수 없습니다.' }));
app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.code === 'STORE_UNAVAILABLE') {
    return res.status(503).json({ error: '일정 저장소에 연결하지 못했습니다.' });
  }
  console.error('Unhandled application error:', error.name);
  return res.status(500).json({ error: '서버 요청을 처리하지 못했습니다.' });
});

export default app;
