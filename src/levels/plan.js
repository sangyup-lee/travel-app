import { calculate_budget } from './budget.js';
import { recommendLodging, researchLodging } from './lodging.js';
import { loadPlan, savePlan } from './plan-store.js';
import express from 'express';
import { generatePlan } from '../integrations/openai.js';

const regions = ['제주', '부산', '강릉', '경주'];
const transports = ['자동차', '대중교통', '도보 위주'];
const preferences = ['맛집', '관광', '자연', '휴식', '쇼핑'];
const inRange = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

function parseOpeningHours(value, days) {
  if (typeof value !== 'string' || value.length > 1500) return null;
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result = [];
  for (const line of lines) {
    const match = /^(\d+)\s*\|\s*([^|]+?)\s*\|\s*((?:[01]\d|2[0-3]):[0-5]\d)\s*-\s*((?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.exec(line);
    if (!match) return null;
    const [, day, name, open, close] = match;
    if (!inRange(Number(day), 1, days) || open >= close) return null;
    result.push({ day: Number(day), name, open, close });
  }
  return result;
}

function parseTrip(body) {
  const { region, departure, days, people, budget, transport, tastes, notes, stopsPerDay = 3, maxDriveMinutes = null, weatherAware = false, confirmedHours = '' } = body ?? {};
  const date = new Date(departure + 'T00:00:00Z');
  if (!regions.includes(region) || typeof departure !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(departure) || !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== departure ||
      !inRange(days, 1, 3) || !inRange(people, 1, 20) || !inRange(budget, 0, 100_000_000) ||
      !inRange(stopsPerDay, 1, 6) || (maxDriveMinutes !== null && !inRange(maxDriveMinutes, 1, 300)) || typeof weatherAware !== 'boolean' ||
      !transports.includes(transport) || !Array.isArray(tastes) || tastes.length > preferences.length ||
      !tastes.every((taste) => preferences.includes(taste)) || typeof notes !== 'string' || notes.length > 500) {
    return null;
  }
  const openingHours = parseOpeningHours(confirmedHours, days);
  if (!openingHours) return null;
  return { region, departure, days, people, budget, transport, tastes, stopsPerDay, maxDriveMinutes, weatherAware, openingHours, notes: notes.trim() };
}

export const planRouter = express.Router();
planRouter.use(express.json({ limit: '48kb' }));

async function respondWithPlan(res, trip, revision) {
  try {
    const plan = await generatePlan(trip, revision);
    return res.json(await savePlan(trip, plan));
  } catch (error) {
    return respondWithError(res, error);
  }
}

planRouter.post('/', async (req, res) => {
  const trip = parseTrip(req.body);
  if (!trip) {
    return res.status(400).json({ error: '여행 조건을 확인하고 다시 시도해 주세요.' });
  }
  return respondWithPlan(res, trip);
});

planRouter.post('/restore', async (req, res) => {
  const trip = parseTrip(req.body?.trip);
  const days = req.body?.days;
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!trip || !Array.isArray(days) || days.length !== trip.days ||
      !days.every((day) => Array.isArray(day?.stops) && day.stops.length >= 1 && day.stops.length <= 12 &&
        day.stops.every((stop) => stop && typeof stop.name === 'string' && stop.name.trim() && stop.name.length <= 200 &&
          typeof stop.description === 'string' && stop.description.length <= 1200 &&
          time.test(stop.time) && time.test(stop.endTime ?? stop.time)))) {
    return res.status(400).json({ error: '저장한 일정 형식을 확인해 주세요.' });
  }

  const costs = {};
  for (const category of ['food', 'lodging', 'transport', 'activities']) {
    const amount = req.body?.costs?.[category];
    if (inRange(amount, 0, 100_000_000)) costs[category] = { amount, status: 'estimated' };
  }
  const plan = {
    days: days.map(({ stops }) => ({
      stops: stops.map(({ name, description, time, endTime }) => ({
        name, description, time, endTime: endTime ?? time,
      })),
    })),
    budget: Object.keys(costs).length ? calculate_budget(trip.budget, costs) : null,
    sources: [],
  };
  return res.json({ planId: (await savePlan(trip, plan)).planId });
});

planRouter.post('/revise', async (req, res) => {
  const { planId, request } = req.body ?? {};
  if (typeof planId !== 'string' || typeof request !== 'string' || !request.trim() || request.length > 500) {
    return res.status(400).json({ error: '수정 요청을 500자 이내로 입력해 주세요.' });
  }
  const snapshot = await loadPlan(planId);
  if (!snapshot || snapshot.expires <= Date.now()) {
    return res.status(410).json({ error: '수정할 일정이 만료되었습니다. 새 일정을 만들어 주세요.' });
  }
  return respondWithPlan(res, snapshot.trip, { plan: snapshot.plan, request: request.trim() });
});

planRouter.post('/lodging', async (req, res) => {
  const { planId, researchIndex } = req.body ?? {};
  const snapshot = await loadPlan(planId);
  if (!snapshot || snapshot.expires <= Date.now()) {
    return res.status(410).json({ error: '숙소를 비교할 일정이 만료되었습니다. 새 일정을 만들어 주세요.' });
  }
  try {
    snapshot.lodging ??= recommendLodging(snapshot.trip, snapshot.plan).catch((error) => {
      snapshot.lodging = null;
      throw error;
    });
    const comparison = await snapshot.lodging;
    if (researchIndex === undefined) return res.json(comparison);
    const candidate = comparison.candidates[researchIndex];
    if (!Number.isInteger(researchIndex) || !candidate) {
      return res.status(400).json({ error: '숙소 후보를 다시 선택해 주세요.' });
    }
    return res.json(await researchLodging(snapshot.trip, candidate));
  } catch {
    return res.status(502).json({ error: '숙소 정보를 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
});

function respondWithError(res, error) {
    if (error.code === 'STORE_UNAVAILABLE') return res.status(503).json({ error: '일정 저장소에 연결하지 못했습니다.' });
    if (error.code === 'OPENAI_CONFIG') {
      return res.status(503).json({ error: '서버의 OpenAI 설정을 확인해 주세요.' });
    }
    if (error.status === 429) {
      return res.status(503).json({ error: 'OpenAI 사용 한도에 도달했습니다. 잠시 후 다시 시도하거나 사용량을 확인해 주세요.' });
    }
    if (error.status === 401 || error.status === 403 || error.status === 404) {
      return res.status(502).json({ error: '서버의 OpenAI 인증 및 모델 설정을 확인해 주세요.' });
    }
    if (error.code === 'AGENT_TIMEOUT' || error.name === 'APIConnectionTimeoutError') {
      return res.status(504).json({ error: 'AI 응답 시간이 초과되었습니다. 다시 시도해 주세요.' });
    }
    return res.status(502).json({ error: 'AI 일정을 가져오지 못했습니다. 다시 시도해 주세요.' });
}
planRouter.use((error, _req, res, next) => {
  if (error.status === 400 || error.status === 413) {
    return res.status(error.status).json({ error: '요청 형식이나 입력 길이를 확인해 주세요.' });
  }
  return next(error);
});
