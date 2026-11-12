import assert from 'node:assert/strict';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:3000');
if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) {
  throw new Error('배포 사이트는 HTTPS 주소를 사용하세요.');
}

async function request(path, payload) {
  const response = await fetch(new URL(path, base), {
    ...(payload && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    signal: AbortSignal.timeout(150_000),
  });
  assert.ok(response.ok, path + ' HTTP ' + response.status);
  return response;
}

assert.match(await (await request('/')).text(), /여행결/);
assert.equal((await (await request('/api/health')).json()).status, 'ok');
const privateFile = await fetch(new URL('/.env', base));
assert.ok([403, 404].includes(privateFile.status), '.env must be blocked');
const map = await (await request('/api/map-config')).json();
assert.deepEqual(Object.keys(map), ['clientId']);
assert.ok(map.clientId, 'NAVER Maps Client ID missing');

const { places } = await (await request('/api/places?region=부산&keyword=광안리해수욕장')).json();
assert.ok(places.some((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude)));
console.log('NAVER API HUB place lookup OK');

const departure = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const trip = {
  region: '부산', departure, days: 1, people: 2, budget: 200000,
  transport: '자동차', tastes: ['관광'], stopsPerDay: 2,
  notes: '광안리해수욕장과 해운대해수욕장을 이 순서로 연달아 방문해 줘.',
};
const plan = await (await request('/api/plan', trip)).json();
assert.ok(plan.planId && plan.days.length === 1);
assert.ok(plan.days[0].stops.some((stop) => stop.route?.status === 'available' && stop.route.path?.length > 1));
console.log('OpenAI plan and NAVER Directions 5 route OK');

const revision = await (await request('/api/plan/revise', {
  planId: plan.planId, request: '첫 방문 시간을 10:00부터 11:00까지로 옮겨 줘.',
})).json();
assert.ok(revision.planId && revision.planId !== plan.planId);
assert.ok(Array.isArray(revision.validation?.issues));
console.log('Plan storage, revision, and validation OK');
