import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  plans,
  places,
  connections,
  placeCaption,
  resolvePlace,
  suggestPlaces
} from '#modules/campus/campus-data.ts';
import { campusRoute } from '#modules/campus/campus-route.ts';
import { officialPlanHref, roomMapHref } from '#modules/campus/campus-links.ts';

test('Campus lookup points at the published floor and selected room', () => {
  assert.equal(plans.length, 31);
  assert.equal(
    plans.some((plan) => plan.id === 'a-4'),
    false
  );
  for (const plan of plans) {
    const url = new URL(officialPlanHref(plan));
    assert.equal(url.origin, 'https://mgimo.ru');
    assert.equal(url.pathname, '/territory/map/');
    assert.equal(url.searchParams.get('building'), plan.id.split('-')[0]);
    assert.equal(url.searchParams.get('floor'), plan.floor);
    for (const place of places.filter((place) => place.plan === plan.id && place.search)) {
      assert.equal(resolvePlace(placeCaption(place))?.id, place.id);
    }
  }
  const third = plans.find((plan) => plan.id === 'n-3');
  const fourth = plans.find((plan) => plan.id === 'n-4');
  assert.equal(
    officialPlanHref(third, resolvePlace('314')),
    'https://mgimo.ru/territory/map/?room=n314'
  );
  assert.equal(
    officialPlanHref(fourth, resolvePlace('404')),
    'https://mgimo.ru/territory/map/?room=n404'
  );
  assert.equal(officialPlanHref(third, resolvePlace('404')), officialPlanHref(third));
  assert.match(resolvePlace('308').label, /Кафедра/);
  assert.match(resolvePlace('402').label, /Кафедра/);
});

test('Plan changes use real portals, lift mode excludes stairs and disconnected facilities stay disconnected', () => {
  for (const edge of connections) {
    assert.ok(edge.a && edge.b);
    assert.notEqual(edge.a.plan, edge.b.plan);
  }
  const from = resolvePlace('314'),
    to = resolvePlace('404');
  const short = campusRoute(from, to, 'standard'),
    lift = campusRoute(from, to, 'lift');
  assert.deepEqual(
    short.map((s) => s.plan),
    ['n-3', 'n-4']
  );
  assert.equal(short[0].transfer, 'stairs');
  assert.equal(lift[0].transfer, 'lift');
  const same = campusRoute(resolvePlace('404'), resolvePlace('408'), 'standard');
  assert.equal(same.length, 1);
  assert.equal(same[0].transfer, null);
  const cross = campusRoute(resolvePlace('Главный вход'), to, 'lift');
  assert.ok(cross.some((s) => s.transfer === 'passage'));
  assert.ok(cross.every((s) => s.transfer !== 'stairs'));
  assert.equal(cross.at(-1).end.id, to.id);
  assert.equal(campusRoute(resolvePlace('Вход в библиотеку'), to, 'standard'), null);
});

test('Classroom search resolves official numbers and preserves grouped rooms and legacy bookmarks', () => {
  assert.equal(roomMapHref('Ауд. 310', 'Аудитория 402'), '/campus?from=n-4.n402&to=n-3.n310a');
  assert.equal(resolvePlace('310а').id, 'n-3.n310');
  assert.equal(resolvePlace('room-402').id, 'n-4.n402');
  assert.equal(resolvePlace('entrance').label, 'Главный вход');
  assert.equal(resolvePlace('Гардероб'), null);
  assert.ok(suggestPlaces('404')[0].startsWith('Аудитория 404 · Новый корпус'));
  assert.equal(roomMapHref('Медиалаборатория'), null);
  assert.equal(roomMapHref('constructor'), null);
});
