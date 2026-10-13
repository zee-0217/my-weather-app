// 프론트엔드: 우리 Node.js 서버에 요청하고 결과를 화면에 표시합니다.
const form = document.querySelector('#weather-form');
const cityInput = document.querySelector('#city');
const button = form.querySelector('button');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
const cityBackground = document.querySelector('#city-background');
const photoCredit = document.querySelector('#photo-credit');
const photoSource = document.querySelector('#photo-source');
let backgroundRequest = 0;

function resetBackground() {
  backgroundRequest += 1;
  cityBackground.hidden = true;
  cityBackground.removeAttribute('src');
  photoCredit.hidden = true;
  photoSource.removeAttribute('href');
}

async function showCityBackground(background) {
  if (!background) return;
  const request = backgroundRequest;
  const image = new Image();
  image.src = background.url;
  try {
    await image.decode();
    if (request !== backgroundRequest) return;
    cityBackground.src = background.url;
    cityBackground.hidden = false;
    photoSource.href = background.sourceUrl;
    photoSource.textContent = `${background.title} · 저작자 및 이용 조건`;
    photoCredit.hidden = false;
  } catch { /* 이미지 로딩 실패 시 기존 배경색을 유지합니다. */ }
}
const format = (value, unit) => Number.isFinite(value) ? `${value}${unit}` : '정보 없음';

// 날씨 설명에 따라 현재 날씨와 내일 예보의 이모티콘도 바뀝니다.
function weatherIcon(description = '') {
  if (description.includes('뇌우')) return '⛈️';
  if (description.includes('눈')) return '❄️';
  if (description.includes('안개')) return '🌫️';
  if (description.includes('비') || description.includes('소나기')) return '🌧️';
  if (description.includes('대체로 맑음')) return '🌤️';
  if (description.includes('부분적으로 흐림')) return '⛅';
  if (description.includes('흐림')) return '☁️';
  if (description.includes('맑음')) return '☀️';
  return '🌈';
}

// 외부 서비스 없이 기온 구간에 따라 옷차림을 추천합니다.
function outfitForTemperature(temperature) {
  if (!Number.isFinite(temperature)) return '기온 정보가 없어 옷차림을 추천하기 어려워요.';
  if (temperature >= 28) return '반팔과 반바지, 통기성 좋은 얇은 옷을 추천해요.';
  if (temperature >= 23) return '반팔이나 얇은 셔츠에 가벼운 바지를 입어 보세요.';
  if (temperature >= 20) return '얇은 긴팔이나 셔츠에 가벼운 가디건을 챙겨 보세요.';
  if (temperature >= 17) return '긴팔에 가디건이나 얇은 재킷을 걸쳐 보세요.';
  if (temperature >= 12) return '니트나 맨투맨에 재킷을 추천해요.';
  if (temperature >= 9) return '니트에 트렌치코트나 도톰한 재킷을 입어 보세요.';
  if (temperature >= 5) return '도톰한 코트나 경량 패딩을 챙겨 보세요.';
  return '따뜻한 패딩에 목도리와 장갑을 챙겨 보세요.';
}

function weatherClothingTips(description = '', precipitation, probability, windSpeed) {
  const tips = [];
  if (description.includes('눈')) {
    tips.push('❄️ 눈에 젖기 쉬우니 방수 겉옷과 미끄럼이 적은 신발을 챙겨요.');
  } else if (description.includes('비') || description.includes('소나기') || description.includes('뇌우') || precipitation > 0 || probability >= 50) {
    tips.push('☔ 우산과 물에 강한 신발을 챙겨요.');
  }
  if (Number.isFinite(windSpeed) && windSpeed >= 20) tips.push('🍃 바람을 막아 주는 겉옷을 챙겨요.');
  return tips;
}

function currentOutfit(weather) {
  const usesFeelsLike = Number.isFinite(weather.feelsLike);
  const temperature = usesFeelsLike ? weather.feelsLike : weather.temperature;
  const basis = Number.isFinite(temperature) ? `${usesFeelsLike ? '체감온도' : '기온'} ${temperature}°C 기준: ` : '';
  return [basis + outfitForTemperature(temperature), ...weatherClothingTips(weather.description, weather.precipitation, null, weather.windSpeed)].join(' ');
}

function tomorrowOutfit(tomorrow) {
  if (!tomorrow) return '내일 예보가 없어 옷차림을 추천하기 어려워요.';
  const tips = [];
  if (Number.isFinite(tomorrow.maxTemperature)) tips.push(`낮 최고 ${tomorrow.maxTemperature}°C 기준: ${outfitForTemperature(tomorrow.maxTemperature)}`);
  if (Number.isFinite(tomorrow.minTemperature)) tips.push(`하루 최저 ${tomorrow.minTemperature}°C 기준: ${outfitForTemperature(tomorrow.minTemperature)}`);
  if (!tips.length) tips.push('기온 정보가 없어 옷차림을 추천하기 어려워요.');
  if (Number.isFinite(tomorrow.maxTemperature) && Number.isFinite(tomorrow.minTemperature) && tomorrow.maxTemperature - tomorrow.minTemperature >= 8) {
    tips.push('🧥 일교차가 크니 벗고 입기 쉬운 겉옷을 챙겨요.');
  }
  return [...tips, ...weatherClothingTips(tomorrow.description, tomorrow.precipitation, tomorrow.precipitationProbability)].join(' ');
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const city = cityInput.value.trim();
  result.hidden = true;
  resetBackground();
  if (city.length < 2) {
    status.textContent = '도시 이름을 2자 이상 입력해 주세요.';
    cityInput.focus();
    return;
  }
  button.disabled = true;
  result.setAttribute('aria-busy', 'true');
  status.textContent = '현재 날씨를 불러오는 중입니다…';
  try {
    const response = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
    const weather = await response.json();
    if (!response.ok) throw new Error(weather.error || '날씨 조회에 실패했습니다.');
    showCityBackground(weather.background);
    document.querySelector('#location').textContent = weather.location;
    document.querySelector('#condition').textContent = weather.description;
    document.querySelector('#condition-icon').textContent = weatherIcon(weather.description);
    document.querySelector('#temperature').textContent = format(weather.temperature, ' °C');
    document.querySelector('#feels-like').textContent = format(weather.feelsLike, ' °C');
    document.querySelector('#humidity').textContent = format(weather.humidity, '%');
    document.querySelector('#wind').textContent = format(weather.windSpeed, ' km/h');
    document.querySelector('#precipitation-label').textContent = Number.isFinite(weather.precipitationIntervalMinutes)
      ? `강수량 (직전 ${weather.precipitationIntervalMinutes}분)` : '현재 강수량';
    document.querySelector('#precipitation').textContent = format(weather.precipitation, ' mm');
    const tomorrow = weather.tomorrow;
    document.querySelector('#outfit-current').textContent = currentOutfit(weather);
    document.querySelector('#outfit-tomorrow').textContent = tomorrowOutfit(tomorrow);
    document.querySelector('#tomorrow-date').textContent = tomorrow ? `${tomorrow.date} (${weather.timezone})` : '';
    document.querySelector('#tomorrow-condition').textContent = tomorrow?.description || '내일 예보를 제공하지 않습니다.';
    document.querySelector('#tomorrow-icon').textContent = tomorrow ? weatherIcon(tomorrow.description) : '🔎';
    document.querySelector('#tomorrow-max').textContent = format(tomorrow?.maxTemperature, ' °C');
    document.querySelector('#tomorrow-min').textContent = format(tomorrow?.minTemperature, ' °C');
    document.querySelector('#tomorrow-precipitation').textContent = format(tomorrow?.precipitation, ' mm');
    document.querySelector('#tomorrow-probability').textContent = format(tomorrow?.precipitationProbability, '%');
    document.querySelector('#updated').textContent = `날씨 기준 시각: ${weather.time.replace('T', ' ')} (${weather.timezone}, 해당 도시 시간)`;
    result.hidden = false;
    status.textContent = '날씨를 불러왔습니다.';
  } catch (error) {
    status.textContent = error instanceof TypeError || error instanceof SyntaxError
      ? '서버에 연결할 수 없습니다. node server.js로 실행한 뒤 서버 주소로 접속해 주세요.'
      : error.message;
  } finally {
    button.disabled = false;
    result.setAttribute('aria-busy', 'false');
  }
});
