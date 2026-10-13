// 백엔드: 화면 파일을 제공하고 Open-Meteo에 도시·날씨 정보를 요청합니다.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// 도시 검색 서비스에서 인식하지 못하는 대표적인 한국어 이름을 보완합니다.
const cityNames = { '서울': 'Seoul', '서울시': 'Seoul', '서울특별시': 'Seoul', '부산': 'Busan', '인천': 'Incheon', '대구': 'Daegu', '대전': 'Daejeon', '광주': 'Gwangju', '울산': 'Ulsan', '제주': 'Jeju', '수원': 'Suwon' };

const descriptions = {
  0: '맑음', 1: '대체로 맑음', 2: '부분적으로 흐림', 3: '흐림',
  45: '안개', 48: '착빙 안개', 51: '약한 이슬비', 53: '이슬비', 55: '강한 이슬비',
  56: '약한 어는 이슬비', 57: '강한 어는 이슬비',
  61: '약한 비', 63: '비', 65: '강한 비', 66: '약한 어는 비', 67: '강한 어는 비',
  71: '약한 눈', 73: '눈', 75: '강한 눈', 77: '싸락눈',
  80: '약한 소나기', 81: '소나기', 82: '강한 소나기',
  85: '약한 눈 소나기', 86: '강한 눈 소나기',
  95: '뇌우', 96: '우박을 동반한 뇌우', 99: '강한 우박을 동반한 뇌우',
};

async function fetchJson(url, fetchApi) {
  const response = await fetchApi(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('외부 날씨 API 응답 오류');
  return response.json();
}

function createServer(fetchApi = fetch) {
  const files = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/index.html': ['index.html', 'text/html; charset=utf-8'],
    '/style.css': ['style.css', 'text/css; charset=utf-8'],
    '/script.js': ['script.js', 'text/javascript; charset=utf-8'],
  };
  const json = (res, code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/weather') {
        if (req.method !== 'GET') {
          res.setHeader('Allow', 'GET');
          return json(res, 405, { error: 'GET 요청만 지원합니다.' });
        }
        const city = (url.searchParams.get('city') || '').trim();
        if (city.length < 2 || city.length > 100) return json(res, 400, { error: '도시 이름을 2~100자로 입력해 주세요.' });
        try {
          const search = new URL('https://geocoding-api.open-meteo.com/v1/search');
          const searchName = Object.hasOwn(cityNames, city) ? cityNames[city] : city;
          search.search = new URLSearchParams({ name: searchName, count: '1', language: 'ko', format: 'json' });
          const places = await fetchJson(search, fetchApi);
          const place = places.results?.[0];
          if (!place) return json(res, 404, { error: '도시를 찾지 못했습니다. 영문 이름이나 다른 도시 이름으로 다시 검색해 주세요.' });
          if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) throw new Error('잘못된 도시 좌표');
          const forecast = new URL('https://api.open-meteo.com/v1/forecast');
          forecast.search = new URLSearchParams({
            latitude: String(place.latitude), longitude: String(place.longitude),
            current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation',
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',
            temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm', timezone: 'auto', forecast_days: '2',
          });
          const data = await fetchJson(forecast, fetchApi);
          const current = data.current;
          if (!current || !Number.isFinite(current.temperature_2m) || typeof current.time !== 'string' || typeof data.timezone !== 'string') throw new Error('날씨 데이터 누락');
          // 도시 문서의 좌표가 검색된 도시와 가까울 때만 대표 사진을 사용합니다.
          // 사진 서비스 오류가 나더라도 날씨 조회는 계속 제공합니다.
          let background = null;
          try {
            const imageSearch = new URL(search);
            imageSearch.searchParams.set('language', 'en');
            const imagePlaces = await fetchJson(imageSearch, fetchApi);
            const englishPlace = imagePlaces.results?.find(item => item.id === place.id);
            const imageName = englishPlace?.name || searchName;
            const article = await fetchApi(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(imageName)}`, {
              signal: AbortSignal.timeout(5000),
              headers: { 'User-Agent': 'LocalCityWeather/1.0 (personal educational weather app)' },
            });
            if (article.ok) {
              const page = await article.json();
              const coords = page.coordinates;
              const image = page.originalimage?.source || page.thumbnail?.source;
              if (coords && Math.abs(coords.lat - place.latitude) < 0.8 && Math.abs(coords.lon - place.longitude) < 0.8 && image) {
                const imageUrl = new URL(image);
                if (imageUrl.protocol === 'https:' && ['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(imageUrl.hostname)) {
                  const parts = imageUrl.pathname.split('/commons/')[1]?.split('/');
                  const filename = parts?.[parts[0] === 'thumb' ? 3 : 2];
                  if (filename) background = {
                    url: imageUrl.href,
                    sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(decodeURIComponent(filename))}`,
                    title: `${place.name} 대표 사진`,
                  };
                }
              }
            }
          } catch { /* 사진이 없으면 기본 배경을 사용합니다. */ }
          // UTC로 바꾸지 않고 해당 도시의 현재 날짜를 기준으로 다음 날을 찾습니다.
          const nextDate = new Date(`${current.time.slice(0, 10)}T00:00:00Z`);
          nextDate.setUTCDate(nextDate.getUTCDate() + 1);
          const tomorrowDate = nextDate.toISOString().slice(0, 10);
          const daily = data.daily;
          const index = daily?.time?.indexOf(tomorrowDate) ?? -1;
          const tomorrow = index < 0 ? null : {
            date: tomorrowDate,
            description: descriptions[daily.weather_code?.[index]] || '날씨 정보 없음',
            maxTemperature: daily.temperature_2m_max?.[index] ?? null,
            minTemperature: daily.temperature_2m_min?.[index] ?? null,
            precipitation: daily.precipitation_sum?.[index] ?? null,
            precipitationProbability: daily.precipitation_probability_max?.[index] ?? null,
          };
          return json(res, 200, {
            location: [...new Set([place.name, place.admin1, place.country].filter(Boolean))].join(', '),
            description: descriptions[current.weather_code] || '날씨 정보 없음',
            temperature: current.temperature_2m, feelsLike: current.apparent_temperature,
            humidity: current.relative_humidity_2m, windSpeed: current.wind_speed_10m,
            precipitation: current.precipitation ?? null,
            precipitationIntervalMinutes: Number.isFinite(current.interval) ? current.interval / 60 : null,
            tomorrow,
            background,
            time: current.time, timezone: data.timezone,
          });
        } catch (error) {
          console.error('날씨 조회 실패:', error.message);
          return json(res, 502, { error: '외부 날씨 서비스에 연결하지 못했습니다. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요.' });
        }
      }
      const file = Object.hasOwn(files, url.pathname) ? files[url.pathname] : null;
      if (file && (req.method === 'GET' || req.method === 'HEAD')) {
        const content = fs.readFileSync(path.join(__dirname, file[0]));
        res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' });
        return res.end(req.method === 'HEAD' ? undefined : content);
      }
      json(res, 404, { error: '찾을 수 없는 주소입니다.' });
    } catch (error) {
      console.error(error.message);
      json(res, 500, { error: '서버 오류가 발생했습니다.' });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT는 1~65535 사이의 정수여야 합니다.');
    process.exitCode = 1;
  } else {
    const server = createServer();
    server.on('error', error => {
      console.error(error.code === 'EADDRINUSE' ? `${port}번 포트를 사용 중입니다. 다른 서버를 종료하거나 PORT를 변경해 주세요.` : error.message);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => console.log(`날씨 앱: http://localhost:${port}\n종료: Ctrl+C`));
  }
}

module.exports = { createServer };
