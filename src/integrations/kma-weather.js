const grids = {
  부산: { nx: 98, ny: 76, area: '부산시청 인근' },
  제주: { nx: 52, ny: 38, area: '제주시청 인근' },
  강릉: { nx: 92, ny: 131, area: '강릉시청 인근' },
  경주: { nx: 100, ny: 91, area: '경주시청 인근' },
};
const source = 'https://www.data.go.kr/data/15084084/openapi.do';
const dayMs = 86_400_000;

export async function get_weather(region, dates, { now = new Date(), signal } = {}) {
  const grid = grids[region];
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const today = kst.toISOString().slice(0, 10);
  const forecast = dates.map((date) => ({ date, status: 'unknown', reason: '단기예보 범위 밖' }));
  // Give each bulletin ten minutes to become available.
  const published = new Date(kst.getTime() - 10 * 60_000);
  const cycle = [23, 20, 17, 14, 11, 8, 5, 2].find((hour) => hour <= published.getUTCHours());
  if (cycle === undefined) published.setUTCDate(published.getUTCDate() - 1);
  const hour = cycle ?? 23;
  const bulletinDate = published.toISOString().slice(0, 10);
  const lastDate = new Date(Date.parse(bulletinDate) + (hour >= 17 ? 4 : 3) * dayMs).toISOString().slice(0, 10);
  const eligible = forecast.filter(({ date }) => date >= today && date <= lastDate);
  const result = { area: grid?.area ?? region, source, forecast };
  if (!eligible.length) return result;
  const key = process.env.KMA_SERVICE_KEY?.trim();
  if (!grid || !key) {
    eligible.forEach((entry) => { entry.reason = grid ? '기상청 API 키 미설정' : '예보 지역 미지원'; });
    return result;
  }
  try {
    const url = new URL('https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst');
    url.search = new URLSearchParams({
      serviceKey: /%[0-9a-f]{2}/i.test(key) ? decodeURIComponent(key) : key, dataType: 'JSON', pageNo: '1', numOfRows: '2000',
      base_date: bulletinDate.replaceAll('-', ''), base_time: String(hour).padStart(2, '0') + '00',
      nx: String(grid.nx), ny: String(grid.ny),
    });
    const timeout = AbortSignal.timeout(8000);
    const response = await fetch(url, { redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!response.ok) throw new Error('Forecast request failed');
    const { response: data } = await response.json();
    const items = data?.body?.items?.item;
    if (data?.header?.resultCode !== '00' || !Array.isArray(items)) throw new Error('Forecast data unavailable');
    for (const entry of eligible) {
      const rows = items.filter((item) => item.fcstDate === entry.date.replaceAll('-', '') &&
        item.fcstTime >= '0800' && item.fcstTime <= '2000' &&
        (entry.date !== today || item.fcstTime >= kst.toISOString().slice(11, 16).replace(':', '')));
      const precipitation = rows.filter((item) => item.category === 'PTY').map((item) => String(item.fcstValue));
      if (!precipitation.length) {
        entry.reason = '남은 활동 시간의 예보 없음';
        continue;
      }
      const rainyHours = rows.filter((item) => item.category === 'PTY' && ['1', '2', '4'].includes(String(item.fcstValue)))
        .map((item) => item.fcstTime.slice(0, 2) + ':' + item.fcstTime.slice(2));
      const temperatures = rows.filter((item) => item.category === 'TMP' && item.fcstValue !== '')
        .map((item) => Number(item.fcstValue)).filter(Number.isFinite);
      Object.assign(entry, {
        status: 'available', rainExpected: rainyHours.length > 0, rainyHours,
        minTemp: temperatures.length ? Math.min(...temperatures) : null,
        maxTemp: temperatures.length ? Math.max(...temperatures) : null,
      });
      delete entry.reason;
    }
  } catch {
    eligible.forEach((entry) => { if (entry.status === 'unknown') entry.reason = '기상청 예보 조회 실패'; });
  }
  return result;
}
