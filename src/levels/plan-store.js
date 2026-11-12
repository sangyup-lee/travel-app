import { randomUUID } from 'node:crypto';

const memory = new Map();
const ttl = 3600;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token && URL.canParse(url) && new URL(url).protocol === 'https:') return { url, token };
  if (!url && !token && process.env.VERCEL !== '1') return null;
  throw unavailable();
}

function unavailable() {
  return Object.assign(new Error('Shared storage unavailable'), { code: 'STORE_UNAVAILABLE' });
}

async function redis(config, command) {
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + config.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(command), redirect: 'error', signal: AbortSignal.timeout(4000),
    });
    const data = await response.json();
    if (!response.ok || data.error || !Object.hasOwn(data, 'result')) throw unavailable();
    return data.result;
  } catch {
    throw unavailable();
  }
}

const prefix = () => 'travel:' + (process.env.VERCEL_ENV || 'local') + ':';

export async function savePlan(trip, plan) {
  const planId = randomUUID();
  const config = redisConfig();
  const snapshot = { trip, plan, expires: Date.now() + ttl * 1000 };
  if (config) {
    const result = await redis(config, ['SET', prefix() + planId, JSON.stringify(snapshot), 'EX', ttl]);
    if (result !== 'OK') throw unavailable();
  } else {
    for (const [id, item] of memory) {
      if (item.expires <= Date.now() || memory.size >= 100) memory.delete(id);
    }
    memory.set(planId, snapshot);
  }
  return { ...plan, planId };
}

export async function loadPlan(planId) {
  if (typeof planId !== 'string' || !uuid.test(planId)) return null;
  const config = redisConfig();
  const value = config ? await redis(config, ['GET', prefix() + planId]) : null;
  const snapshot = config ? (value === null ? null : JSON.parse(value)) : memory.get(planId);
  return snapshot?.expires > Date.now() ? snapshot : null;
}

const incrementWindow = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],120) end; return n";

export async function limitPublicApi(req, res, next) {
  if (process.env.VERCEL !== '1') return next();
  try {
    const expensive = req.path.toLowerCase().split('/')[1] === 'plan';
    const max = expensive ? 12 : 60;
    const bucket = Math.floor(Date.now() / 60_000);
    const key = prefix() + 'rate:' + (expensive ? 'plan:' : 'places:') + bucket;
    const count = await redis(redisConfig(), ['EVAL', incrementWindow, 1, key]);
    if (count > max) {
      res.set('Retry-After', String(60 - Math.floor(Date.now() / 1000) % 60));
      return res.status(429).json({ error: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' });
    }
    return next();
  } catch {
    return next(unavailable());
  }
}
