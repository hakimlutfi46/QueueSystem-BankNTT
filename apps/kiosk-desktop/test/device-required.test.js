'use strict';

process.env.KIOSK_QUIET = '1';
process.env.BANKNTT_QUIET = '1';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REPAIR_INTERVAL_MS,
  parseDeviceRequired,
  deviceRequiredAction,
  repairDelay,
  deviceRequiredUrl,
} = require('../src/device-required');

const SERVER = 'http://10.0.0.5:3000';
const page = (state) => `${SERVER}/device-required?kind=kiosk&state=${state}`;

test('device-required states map to repair / wait / none', () => {
  const opts = { server: SERVER, lastRepairAt: 0, now: 1_000_000 };
  assert.equal(deviceRequiredAction(page('pending'), opts), 'wait');
  assert.equal(deviceRequiredAction(page('limited'), opts), 'wait');
  assert.equal(deviceRequiredAction(page('revoked'), opts), 'none');
  assert.equal(deviceRequiredAction(page('unknown'), opts), 'repair');
  assert.equal(deviceRequiredAction(page('UNKNOWN'), opts), 'repair');
  assert.equal(deviceRequiredAction(`${SERVER}/device-required`, opts), 'none');
  assert.equal(deviceRequiredAction(page('weird'), opts), 'none');
  assert.equal(deviceRequiredAction(`${SERVER}/kiosk`, opts), 'none');
  assert.equal(deviceRequiredAction(`${SERVER}/kiosk?next=/device-required`, opts), 'none');
  assert.equal(deviceRequiredAction('http://other:3000/device-required?state=unknown', opts), 'none');
  assert.equal(deviceRequiredAction('not a url', opts), 'none');
});

test('unknown re-pairs at most once per 60 s, and never after DEVICE_REVOKED', () => {
  const now = 10_000_000;
  const at = (lastRepairAt, n = now) => deviceRequiredAction(page('unknown'), { server: SERVER, lastRepairAt, now: n });
  assert.equal(REPAIR_INTERVAL_MS, 60_000);
  assert.equal(at(0), 'repair');
  assert.equal(at(now - 1_000), 'wait');
  assert.equal(at(now - 59_999), 'wait');
  assert.equal(at(now - 60_000), 'repair');
  assert.equal(deviceRequiredAction(page('unknown'), { server: SERVER, now, blocked: true }), 'none');
  assert.equal(repairDelay(now - 15_000, now), 45_000);
  assert.equal(repairDelay(0, now), 0);
});

test('parse and build /device-required URLs', () => {
  assert.deepEqual(parseDeviceRequired(page('pending'), SERVER), { state: 'pending', kind: 'kiosk' });
  assert.deepEqual(parseDeviceRequired(`${SERVER}/device-required/`, SERVER), { state: '', kind: '' });
  assert.equal(parseDeviceRequired(`${SERVER}/admin`, SERVER), null);
  assert.equal(deviceRequiredUrl(SERVER, 'kiosk', 'revoked'), `${SERVER}/device-required?kind=kiosk&state=revoked`);
});
