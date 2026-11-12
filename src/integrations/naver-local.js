const endpoint = 'https://naverapihub.apigw.ntruss.com/search/v1/local';

function coordinate(value, limit) {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  // API HUB returns WGS84 coordinates scaled by 10^7 as integer strings.
  const degrees = Math.abs(number) > limit && Number.isInteger(number) ? number / 10_000_000 : number;
  return Math.abs(degrees) <= limit && degrees !== 0 ? degrees : null;
}

export async function search_places(region, keyword) {
  if ([region, keyword].some((value) => typeof value !== 'string' || !value.trim() || value.length > 80)) {
    throw Object.assign(new Error('Invalid search terms'), { code: 'INVALID_QUERY' });
  }

  const id = process.env.NAVER_API_HUB_CLIENT_ID?.trim();
  const secret = process.env.NAVER_API_HUB_CLIENT_SECRET?.trim();
  if (!id || !secret) {
    throw Object.assign(new Error('Missing NAVER API HUB credentials'), { code: 'NAVER_CONFIG' });
  }

  const url = new URL(endpoint);
  url.search = new URLSearchParams({ query: region.trim() + ' ' + keyword.trim(), display: '5', format: 'json' });
  const response = await fetch(url, {
    headers: { 'X-NCP-APIGW-API-KEY-ID': id, 'X-NCP-APIGW-API-KEY': secret },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw Object.assign(new Error('NAVER API HUB request failed'), { status: response.status });
  }

  const { items } = await response.json();
  if (!Array.isArray(items)) throw new Error('Invalid NAVER API HUB response');

  return items.map((item) => ({
    name: item.title?.replace(/<\/?b>/gi, '').trim() || null,
    address: item.roadAddress?.trim() || item.address?.trim() || null,
    category: item.category?.trim() || null,
    sourceUrl: typeof item.link === 'string' && /^https?:\//i.test(item.link) ? item.link : null,
    longitude: coordinate(item.mapx, 180),
    latitude: coordinate(item.mapy, 90),
  }));
}
