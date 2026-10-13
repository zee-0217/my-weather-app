const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('./server');

async function requestWeather(mock, city) {
  const server = createServer(mock);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/weather?city=${encodeURIComponent(city)}`);
    assert.equal(response.status, 200);
    return response.json();
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

const ok = data => ({ ok: true, json: async () => data });
const place = { name: 'New York', latitude: 40.71, longitude: -74, population: 8800000 };
const photo = { source: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/City.jpg' };

function mockApi(mode) {
  return async input => {
    const url = new URL(input);
    if (url.hostname === 'geocoding-api.open-meteo.com') {
      assert.equal(url.searchParams.get('name'), 'New York');
      assert.equal(url.searchParams.get('language'), 'en');
      return ok({ results: [{ name: 'York', latitude: 41, longitude: -97 }, place] });
    }
    if (url.hostname === 'api.open-meteo.com') {
      assert.equal(url.searchParams.get('longitude'), '-74');
      return ok({ timezone: 'America/New_York', current: { temperature_2m: 20, time: '2026-10-13T10:00' } });
    }
    if (url.pathname.includes('/summary/')) {
      assert.equal(decodeURIComponent(url.pathname.split('/').pop()), 'New York City');
      if (mode === 'outage') throw new Error('Photo service offline');
      return ok({ title: 'New York City', coordinates: mode === 'fallback' ? { lat: 0, lon: 0 } : { lat: 40.71, lon: -74 }, originalimage: photo });
    }
    assert.equal(url.searchParams.get('generator'), 'geosearch');
    assert.equal(url.searchParams.get('ggscoord'), '40.71|-74');
    if (mode === 'outage') throw new Error('Photo service offline');
    return ok({ query: { pages: [{ title: 'Local landmark', coordinates: [{ lat: 40.711, lon: -74 }], thumbnail: photo }] } });
  };
}

test('Search keeps the complete name and prefers New York over York', async () => {
  const result = await requestWeather(mockApi('direct'), '  New   York  ');
  assert.equal(result.location, 'New York');
  assert.match(result.background.title, /New York City/);
});

test('A wrong-region city document falls back to nearby landmark photos', async () => {
  const result = await requestWeather(mockApi('fallback'), 'New York');
  assert.match(result.background.title, /Local landmark/);
  assert.match(result.background.sourceUrl, /File:City.jpg/);
});

test('Photo service failure preserves the weather result', async () => {
  const result = await requestWeather(mockApi('outage'), 'New York');
  assert.equal(result.temperature, 20);
  assert.equal(result.background, null);
});
