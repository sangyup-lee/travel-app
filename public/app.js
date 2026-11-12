const form = document.querySelector('#planner');
const get = (id) => document.getElementById(id);
const money = (value) => value.toLocaleString('ko-KR') + '원';
const dateLabel = new Intl.DateTimeFormat('ko-KR', {
  month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC',
});
form.elements.departure.value = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format();

function listItem(text) {
  const item = document.createElement('li');
  item.textContent = text;
  return item;
}

let map;
let mapLoad;
let overlays = [];
let mapVersion = 0;

async function loadMaps() {
  const response = await fetch('/api/map-config', { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('지도 설정을 불러오지 못했습니다.');
  const { clientId } = await response.json();
  if (!clientId) throw new Error('지도 설정을 확인해 주세요.');
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const url = new URL('https://oapi.map.naver.com/openapi/v3/maps.js');
    url.searchParams.set('ncpKeyId', clientId);
    const timer = setTimeout(() => finish(false), 12000);
    function finish(success) {
      clearTimeout(timer);
      if (success) resolve();
      else {
        script.remove();
        reject(new Error('NAVER 지도를 불러오지 못했습니다.'));
      }
    }
    window.navermap_authFailure = () => {
      get('map').hidden = true;
      get('map-status').textContent = 'NAVER Maps 콘솔에서 Web Dynamic Map과 현재 웹 서비스 URL을 확인해 주세요.';
    };
    script.onload = () => finish(Boolean(window.naver?.maps?.Map));
    script.onerror = () => finish(false);
    script.src = url.href;
    document.head.append(script);
  });
  return window.naver.maps;
}

async function drawMap(stops) {
  const version = ++mapVersion;
  const container = get('map');
  const status = get('map-status');
  get('map-route').textContent = stops.map((stop) => stop.name).join(' → ');
  const located = stops.filter(({ place }) =>
    Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude));
  overlays.forEach((overlay) => overlay.setMap(null));
  overlays = [];
  if (!located.length) {
    container.hidden = true;
    status.textContent = '검색 결과에서 확인된 장소 좌표가 없습니다.';
    return;
  }
  status.textContent = '지도를 불러오는 중…';
  try {
    mapLoad ??= loadMaps().catch((error) => {
      mapLoad = null;
      throw error;
    });
    const maps = await mapLoad;
    if (version !== mapVersion) return;
    const points = located.map(({ place }) => new maps.LatLng(place.latitude, place.longitude));
    container.hidden = false;
    map ??= new maps.Map(container, { center: points[0], zoom: 13 });
    map.setSize(new maps.Size(container.clientWidth, container.clientHeight));
    const bounds = new maps.LatLngBounds(points[0], points[0]);
    located.forEach((stop, index) => {
      bounds.extend(points[index]);
      overlays.push(new maps.Marker({ map, position: points[index], title: stop.name }));
    });
    for (const { route } of stops) {
      const path = (route?.path ?? []).filter((point) => Array.isArray(point) &&
        point.length === 2 && point.every(Number.isFinite))
        .map(([longitude, latitude]) => new maps.LatLng(latitude, longitude));
      if (path.length < 2) continue;
      path.forEach((point) => bounds.extend(point));
      overlays.push(new maps.Polyline({ map, path, strokeColor: '#247b57', strokeWeight: 5 }));
    }
    if (overlays.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(14);
    } else {
      map.fitBounds(bounds, { top: 28, right: 28, bottom: 28, left: 28 });
    }
    status.textContent = located.length < stops.length ? '좌표가 확인된 방문지만 표시합니다.' : '';
  } catch (error) {
    if (version !== mapVersion) return;
    container.hidden = true;
    status.textContent = error.message;
  }
}

function renderSchedule(schedule, departure, weather) {
  const buttons = schedule.map((stops, day) => {
    const date = new Date(departure + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + day);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = dateLabel.format(date);
    button.addEventListener('click', () => {
      buttons.forEach((entry) => entry.setAttribute('aria-pressed', String(entry === button)));
      get('itinerary').replaceChildren(...stops.map((stop, index) => {
        const item = listItem('');
        const time = document.createElement('time');
        time.dateTime = stop.time;
        time.textContent = stop.endTime ? stop.time + '–' + stop.endTime : stop.time;
        const name = document.createElement('strong');
        name.textContent = stop.name;
        const details = document.createElement('small');
        details.textContent = '추천 이유 · ' + stop.description;
        item.append(time, name, details);
        if (stop.place) item.append(placeSource(stop.place));
        if (index > 0) {
          const route = document.createElement('small');
          route.textContent = stop.route?.status === 'available'
            ? '이전 장소에서 자동차 ' + (stop.route.distanceMeters / 1000).toFixed(1) +
              ' km · 약 ' + Math.ceil(stop.route.durationMs / 60000) + '분'
            : '이동시간 미확인';
          item.append(route);
        }
        return item;
      }));
      const forecast = weather?.forecast.find((entry) => entry.date === date.toISOString().slice(0, 10));
      const weatherLabel = get('day-weather');
      weatherLabel.hidden = !forecast;
      weatherLabel.replaceChildren();
      if (forecast) {
        const detail = forecast.status !== 'available' ? '미확인 · ' + forecast.reason
          : forecast.rainExpected ? '비 예보 · ' + forecast.rainyHours.join(', ') : '비 예보 없음';
        const source = document.createElement('a');
        source.href = weather.source;
        source.textContent = '기상청';
        source.target = '_blank';
        source.rel = 'noopener noreferrer';
        weatherLabel.append(weather.area + ' · ' + detail + ' · ', source);
      }
      drawMap(stops);
    });
    return button;
  });
  get('days').replaceChildren(...buttons);
  buttons[0].click();
}

function renderBudget(limit, budget) {
  const labels = { food: '식비', lodging: '숙박', transport: '현지 교통', activities: '관광·체험' };
  get('budget-total').textContent = budget?.items.some((item) => item.amount !== null)
    ? money(budget.total) + ' 합산' : '비용 미확인';
  get('budget-balance').textContent = '총예산 ' + money(limit);
  if (budget?.items.some((item) => item.amount !== null)) {
    const balance = budget.remaining >= 0 ? '잔액 ' + money(budget.remaining) : '초과 ' + money(-budget.remaining);
    get('budget-balance').textContent += ' · ' + (budget.status === 'confirmed' ? '' : '잠정 ') + balance;
  }
  const rows = Object.entries(labels).map(([category, label]) => {
    const cost = budget?.items.find((item) => item.category === category);
    const item = document.createElement('tr');
    const heading = document.createElement('th');
    heading.scope = 'row';
    heading.textContent = label;
    const amount = document.createElement('td');
    amount.textContent = cost?.amount == null ? '미확인' :
      money(cost.amount) + (cost.status === 'estimated' ? ' (추정)' : '');
    item.append(heading, amount);
    return item;
  });
  const balanceRow = document.createElement('tr');
  const balanceLabel = document.createElement('th');
  balanceLabel.scope = 'row';
  balanceLabel.textContent = '잔여 예산';
  const balanceCell = document.createElement('td');
  balanceCell.textContent = budget?.items.some((item) => item.amount !== null)
    ? money(budget.remaining) + (budget.status === 'confirmed' ? '' : ' (잠정)')
    : '미확인';
  balanceRow.append(balanceLabel, balanceCell);
  get('costs').replaceChildren(...rows, balanceRow);
}

function renderTrace(trace = [], sources = []) {
  get('logs').replaceChildren(...(trace.length
    ? trace.map(({ name, summary }) => listItem(name + ' · ' + summary))
    : [listItem('호출된 도구가 없습니다.')]));
  get('plan-sources').replaceChildren(...sources.map(({ url, title }) => {
    const item = listItem('');
    const link = document.createElement('a');
    link.href = url;
    link.textContent = title || url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    item.append(link);
    return item;
  }));
  get('source-heading').hidden = !sources.length;
}

function renderValidation(plan) {
  const { issues = [], checks = [] } = plan.validation ?? {};
  const revisions = plan.revisions ?? [];
  const describe = ({ day, message }) => (day ? day + '일차 · ' : '') + message;
  get('validation-status').textContent = (revisions.length ? '재계획 ' + revisions.length + '회 · ' : '') +
    (issues.length ? '해결되지 않은 문제 ' + issues.length + '건' : '확인 가능한 조건에서 충돌을 발견하지 않았습니다.') +
    (checks.length ? ' · 확인 필요 ' + checks.length + '건' : '');
  get('validation-issues').replaceChildren(...issues.map((issue) => listItem(describe(issue))));
  get('check-list').replaceChildren(...checks.map((check) => listItem(describe(check))));
  get('validation-checks').hidden = !checks.length;
  get('validation-revisions').hidden = !revisions.length;
  const timeline = (stops) => stops.map(({ name, time, endTime }) => time + '–' + endTime + ' ' + name).join(' → ');
  get('revision-list').replaceChildren(...revisions.map(({ issues: reasons, before }, index) => {
    const item = listItem((index + 1) + '차 재계획 이유 · ' + reasons.map(describe).join(' / '));
    before.forEach((stops, day) => {
      const original = timeline(stops);
      const revised = timeline(plan.days[day].stops);
      if (original === revised) return;
      const detail = document.createElement('p');
      detail.className = 'hint';
      detail.textContent = (day + 1) + '일차 · ' + original + ' → 최종 일정: ' + revised;
      item.append(detail);
    });
    return item;
  }));
}

function renderTrip(trip, plan) {
  const { region, departure, days, people, budget, transport, tastes } = trip;
  const duration = days === 1 ? '당일치기' : (days - 1) + '박 ' + days + '일';
  get('trip-title').textContent = region + ' ' + duration;
  get('trip-summary').textContent = [
    dateLabel.format(new Date(departure + 'T00:00:00Z')) + ' 출발',
    people + '명', transport, ...tastes,
  ].join(' · ');
  get('trip-dashboard').hidden = false;
  renderValidation(plan);
  resetLodging();
  renderSchedule(plan.days.map((day) => day.stops), departure, plan.weather);
  renderBudget(budget, plan.budget);
  renderTrace(plan.trace, plan.sources);

}

let activeSavedId;
let currentTrip;
let currentPlan;
let undoPlan;
let planBusy = false;
const revisionForm = get('revision-form');

function setPlanBusy(busy) {
  planBusy = busy;
  form.querySelector('button[type=submit]').disabled = busy;
  revisionForm.querySelector('button[type=submit]').disabled = busy;
  get('undo-revision').disabled = busy || !undoPlan;
}

function appendRevision(text) {
  get('revision-chat').append(listItem(text));
}

function describeChanges(previous, revised) {
  const schedule = (day) => day.stops.map(({ name, time, endTime }) => time + '–' + endTime + ' ' + name);
  const changes = [];
  revised.days.forEach((day, index) => {
    const before = schedule(previous.days[index]);
    const after = schedule(day);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push((index + 1) + '일차 · ' + before.join(' → ') + ' / 변경 후 · ' + after.join(' → '));
    }
  });
  if (JSON.stringify(previous.budget) !== JSON.stringify(revised.budget)) changes.push('예산을 갱신했습니다.');
  if (JSON.stringify(previous.weather) !== JSON.stringify(revised.weather)) changes.push('날씨 정보를 갱신했습니다.');
  return changes;
}

revisionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (planBusy || !currentPlan) return;
  const field = revisionForm.elements.request;
  const request = field.value.trim();
  if (!request) return;
  const error = get('revision-error');
  const status = get('revision-status');
  error.textContent = '';
  status.textContent = '변경 요청을 반영하고 일정을 검증하는 중…';
  setPlanBusy(true);
  try {
    const planId = await ensurePlanId();
    const response = await fetch('/api/plan/revise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, request }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '일정 수정에 실패했습니다.');

    const changes = describeChanges(currentPlan, result);
    undoPlan = currentPlan;
    currentPlan = result;
    renderTrip(currentTrip, result);
    appendRevision('요청 · ' + request);
    appendRevision('수정 이유 · ' + (result.changeReason || '변경 요청을 바탕으로 일정을 다시 검증했습니다.'));
    for (const change of changes) appendRevision(change);
    if (!changes.length) appendRevision('방문 일정, 예산, 날씨에 변경된 내용이 없습니다.');
    field.value = '';
  } catch (failure) {
    error.textContent = failure.message || '일정을 수정하지 못했습니다.';
  } finally {
    status.textContent = '';
    setPlanBusy(false);
  }
});

get('undo-revision').addEventListener('click', () => {
  if (planBusy || !undoPlan) return;
  currentPlan = undoPlan;
  undoPlan = null;
  renderTrip(currentTrip, currentPlan);
  appendRevision('직전 수정을 되돌렸습니다.');
  get('revision-error').textContent = '';
  setPlanBusy(false);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (planBusy) return;
  const data = new FormData(form);
  const trip = {
    region: data.get('region'),
    departure: data.get('departure'),
    days: Number(data.get('days')),
    people: Number(data.get('people')),
    budget: Number(data.get('budget')),
    transport: data.get('transport'),
    tastes: data.getAll('taste'),
    notes: data.get('notes'),
    confirmedHours: data.get('confirmedHours') ?? '',
    stopsPerDay: Number(data.get('stopsPerDay')),
    maxDriveMinutes: data.get('maxDriveMinutes') ? Number(data.get('maxDriveMinutes')) : null,
    weatherAware: data.has('weatherAware'),
  };
  const status = get('plan-status');
  const error = get('plan-error');
  setPlanBusy(true);
  form.setAttribute('aria-busy', 'true');
  error.textContent = '';
  status.textContent = 'AI가 여행 일정을 만들고 있어요…';
  try {
    const response = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trip),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) {
      error.textContent = result?.error || '여행 일정 요청에 실패했습니다. 서버를 확인하고 다시 시도해 주세요.';
      return;
    }
    activeSavedId = undefined;
    currentTrip = trip;
    currentPlan = result;
    undoPlan = null;
    revisionForm.reset();
    get('revision-chat').replaceChildren();
    get('revision-error').textContent = '';
    get('revision-panel').hidden = false;
    renderTrip(trip, result);
    showSaveForm();
    get('results').scrollIntoView({ block: 'start' });
  } catch {
    error.textContent = '여행 일정을 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
  } finally {
    status.textContent = '';
    setPlanBusy(false);
    form.removeAttribute('aria-busy');
  }
});

function placeSource(place) {
  const source = document.createElement('small');
  source.textContent = '출처 · NAVER 지역 검색';
  if (place.sourceUrl) {
    const link = document.createElement('a');
    link.href = place.sourceUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '상세 정보';
    source.append(' · ', link);
  }
  return source;
}

function renderPlace(place) {
  const item = document.createElement('li');
  const name = document.createElement('strong');
  name.textContent = place.name || '장소명 미제공';
  item.append(name);
  const coords = Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
    ? '위도 ' + place.latitude + ' · 경도 ' + place.longitude
    : '좌표 미제공';
  for (const value of [place.address || '주소 미제공', place.category || '카테고리 미제공', coords]) {
    const detail = document.createElement('p');
    detail.className = 'hint';
    detail.textContent = value;
    item.append(detail);
  }
  item.append(placeSource(place));
  return item;
}

get('place-search').addEventListener('submit', async (event) => {
  event.preventDefault();
  const searchForm = event.currentTarget;
  const button = searchForm.querySelector('button');
  if (button.disabled) return;
  const region = form.elements.region.value;
  const keyword = searchForm.elements.keyword.value.trim();
  const status = get('place-status');
  const error = get('place-error');
  const results = get('place-results');
  status.textContent = '';
  error.textContent = '';
  results.replaceChildren();
  if (!keyword) {
    error.textContent = '검색어를 입력해 주세요.';
    return;
  }
  button.disabled = true;
  status.textContent = region + '에서 장소를 찾고 있어요…';
  try {
    const query = new URLSearchParams({ region, keyword });
    const response = await fetch('/api/places?' + query);
    const data = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(data?.places)) {
      throw new Error(data?.error || '장소 검색에 실패했습니다. 다시 시도해 주세요.');
    }
    results.replaceChildren(...data.places.map(renderPlace));
    status.textContent = data.places.length
      ? region + ' · ' + keyword + ' 검색 결과 ' + data.places.length + '개'
      : region + '에서 “' + keyword + '” 검색 결과를 찾지 못했습니다.';
  } catch (failure) {
    status.textContent = '';
    error.textContent = failure instanceof TypeError ? '서버 연결을 확인하고 다시 시도해 주세요.' : failure.message;
  } finally {
    button.disabled = false;
  }
});









function resetLodging() {
  get('lodging-panel').hidden = false;
  get('lodging-status').textContent = '';
  get('lodging-results').replaceChildren();
  get('find-lodging').disabled = false;
}

async function lodgingRequest(planId, researchIndex) {
  const response = await fetch('/api/plan/lodging', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, researchIndex }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function lodgingCard(candidate, planId, index) {
  const item = listItem('');
  const name = document.createElement('strong');
  name.textContent = candidate.name;
  const info = document.createElement('p');
  info.className = 'hint';
  info.textContent = candidate.address + ' · ' + candidate.category + ' · 출처 NAVER 지역 검색';
  const routes = document.createElement('p');
  routes.className = 'hint';
  routes.textContent = candidate.routes.length
    ? candidate.routes.map(({ destination, durationMs }) => destination + '까지 ' +
      (durationMs === null ? '자동차 이동시간 미확인' : '자동차 약 ' + Math.ceil(durationMs / 60_000) + '분')).join(' · ')
    : '비교할 방문지 좌표 미확인';
  const price = document.createElement('p');
  price.className = 'hint';
  price.textContent = '숙박 요금 미확인 · 예약 가능 여부 미확인';
  const research = document.createElement('button');
  research.type = 'button';
  research.textContent = '공개 정보 출처 확인';
  const sources = document.createElement('div');
  sources.setAttribute('role', 'status');
  research.addEventListener('click', async () => {
    research.disabled = true;
    sources.textContent = '공개 자료를 찾는 중…';
    try {
      const result = await lodgingRequest(planId, index);
      sources.textContent = result.sources.length ? '공개 자료: ' : '확인된 공개 자료가 없습니다.';
      for (const { title, url } of result.sources) {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = title || url;
        sources.append(link, ' ');
      }
    } catch (error) {
      sources.textContent = error.message;
    } finally {
      research.disabled = false;
    }
  });
  item.append(name, info, routes, price, research, sources);
  return item;
}

get('find-lodging').addEventListener('click', async () => {
  if (!currentPlan) return;
  const selectedPlan = currentPlan;
  const button = get('find-lodging');
  const status = get('lodging-status');
  button.disabled = true;
  status.textContent = '숙소를 찾고 일정과의 자동차 이동시간을 비교하는 중…';
  try {
    const planId = await ensurePlanId();
    const result = await lodgingRequest(planId);
    if (currentPlan !== selectedPlan) return;
    const remaining = Math.max(0, result.budget - result.knownNonLodging);
    status.textContent = result.candidates.length
      ? '검색 유형 ' + result.searchTerms.join('·') + ' · 총예산 ' + money(result.budget) +
        ' · 입력된 비숙박 비용을 뺀 잠정 한도 ' + money(remaining) + ' · 실제 요금 확인 필요' +
        (result.partial ? ' · 일부 유형 검색 실패' : '')
      : '숙박업소 후보를 찾지 못했습니다.';
    get('lodging-results').replaceChildren(...result.candidates.map((candidate, index) =>
      lodgingCard(candidate, planId, index)));
  } catch (error) {
    if (currentPlan === selectedPlan) status.textContent = error.message;
  } finally {
    if (currentPlan === selectedPlan) button.disabled = false;
  }
});


const savedKey = 'travel-app.saved-plans.v1';
const saveForm = get('save-plan-form');

function readSavedPlans() {
  const value = JSON.parse(localStorage.getItem(savedKey) ?? '[]');
  if (!Array.isArray(value)) throw new Error('저장 목록을 읽을 수 없습니다.');
  return value;
}

function writeSavedPlans(plans) {
  localStorage.setItem(savedKey, JSON.stringify(plans));
}

function portablePlan(name, id = crypto.randomUUID()) {
  const { region, departure, days, people, budget, transport, tastes, stopsPerDay,
    maxDriveMinutes, weatherAware, confirmedHours } = currentTrip;
  const { days: itinerary, budget: costs, trace, weather, validation, revisions, sources, changeReason } = currentPlan;
  return {
    id, name, savedAt: new Date().toISOString(),
    trip: { region, departure, days, people, budget, transport, tastes, stopsPerDay,
      maxDriveMinutes, weatherAware, confirmedHours },
    plan: { days: itinerary, budget: costs, trace, weather, validation, revisions, sources, changeReason },
  };
}

const restoredPlans = new WeakMap();

async function ensurePlanId() {
  const plan = currentPlan;
  if (plan.planId) return plan.planId;
  if (!restoredPlans.has(plan)) {
    const days = plan.days.map(({ stops }) => ({
      stops: stops.map(({ name, description, time, endTime }) => ({ name, description, time, endTime })),
    }));
    const costs = Object.fromEntries((plan.budget?.items ?? []).map(({ category, amount }) => [category, amount]));
    const request = fetch('/api/plan/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trip: { ...currentTrip, notes: '' }, days, costs }),
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      return result.planId;
    }).catch((error) => {
      restoredPlans.delete(plan);
      throw error;
    });
    restoredPlans.set(plan, request);
  }
  return restoredPlans.get(plan);
}

function downloadPlan(entry) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(entry, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = entry.name.replace(/[<>:"/\\|?*]/g, '_') + '.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showSaveForm(name = currentTrip.region + ' ' + currentTrip.departure) {
  saveForm.hidden = false;
  saveForm.elements.name.value = name;
  get('save-plan-status').textContent = '';
  saveForm.querySelector('button[type=submit]').textContent = activeSavedId ? '저장한 계획 업데이트' : '여행 계획 저장';
}

function openSavedPlan(entry) {
  if (planBusy) return;
  activeSavedId = entry.id;
  currentTrip = entry.trip;
  currentPlan = entry.plan;
  undoPlan = null;
  revisionForm.reset();
  get('revision-chat').replaceChildren();
  get('revision-error').textContent = '';
  get('revision-panel').hidden = false;
  renderTrip(currentTrip, currentPlan);
  setPlanBusy(false);
  showSaveForm(entry.name);
  get('results').scrollIntoView({ block: 'start' });
}

function renderSavedPlans() {
  const list = get('saved-list');
  try {
    const entries = readSavedPlans();
    list.replaceChildren(...entries.map((entry) => {
      const row = listItem('');
      const name = document.createElement('strong');
      name.textContent = entry.name + ' · ' + entry.trip.departure;
      row.append(name);
      const actions = [
        ['열기', () => openSavedPlan(entry)],
        ['JSON 내보내기', () => downloadPlan(entry)],
        ['삭제', () => {
          if (!window.confirm('“' + entry.name + '”을 저장 목록에서 삭제할까요?')) return;
          try {
            writeSavedPlans(readSavedPlans().filter(({ id }) => id !== entry.id));
            if (activeSavedId === entry.id) {
              activeSavedId = undefined;
              showSaveForm();
            }
            get('saved-status').textContent = '저장한 계획을 삭제했습니다.';
            renderSavedPlans();
          } catch {
            get('saved-status').textContent = '저장한 계획을 삭제하지 못했습니다.';
          }
        }],
      ];
      for (const [label, action] of actions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', action);
        row.append(button);
      }
      return row;
    }));
    if (!entries.length) list.append(listItem('저장한 여행 계획이 없습니다.'));
  } catch {
    get('saved-status').textContent = '브라우저 저장소를 읽을 수 없습니다.';
  }
}

saveForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = saveForm.elements.name.value.trim();
  if (!currentPlan || !name) return;
  try {
    const entry = portablePlan(name, activeSavedId);
    writeSavedPlans([entry, ...readSavedPlans().filter(({ id }) => id !== entry.id)]);
    activeSavedId = entry.id;
    showSaveForm(entry.name);
    get('save-plan-status').textContent = '이 브라우저에 저장했습니다.';
    renderSavedPlans();
  } catch {
    get('save-plan-status').textContent = '저장하지 못했습니다. 브라우저 저장소를 확인해 주세요.';
  }
});

get('export-current-plan').addEventListener('click', () => {
  if (currentPlan) downloadPlan(portablePlan(saveForm.elements.name.value.trim() || '여행 계획', activeSavedId));
});
window.addEventListener('storage', (event) => {
  if (event.key === savedKey || event.key === null) renderSavedPlans();
});
renderSavedPlans();
