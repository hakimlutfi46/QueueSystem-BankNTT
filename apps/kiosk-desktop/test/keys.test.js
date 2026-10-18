'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { isLockdown, quitShortcutAction, isQuitShortcut, isBlocked, lockKeyboard } = require('../src/keys');

test('lockdown only in packaged non-simulation builds (or KIOSK_LOCKDOWN=1 in development)', () => {
  assert.equal(isLockdown({ packaged: true, simulation: false }), true);
  assert.equal(isLockdown({ packaged: true, simulation: true }), false);
  assert.equal(isLockdown({ packaged: false, simulation: false }), false);
  assert.equal(isLockdown({ packaged: false, simulation: false, lockdownEnv: '1' }), true);
  assert.equal(isLockdown({ packaged: false, simulation: true, lockdownEnv: '1' }), false);
});

test('quit shortcuts quit in simulation, are blocked in production', () => {
  assert.equal(quitShortcutAction(isLockdown({ packaged: true, simulation: true })), 'quit');
  assert.equal(quitShortcutAction(isLockdown({ packaged: true, simulation: false })), 'block');
  const altF4 = { type: 'keyDown', alt: true, key: 'F4', code: 'F4' };
  const ctrlQ = { type: 'keyDown', control: true, key: 'q', code: 'KeyQ' };
  const cmdQ = { type: 'keyDown', meta: true, key: 'q', code: 'KeyQ' };
  assert.equal(isQuitShortcut(altF4, 'win32'), true);
  assert.equal(isQuitShortcut(ctrlQ, 'win32'), true);
  assert.equal(isQuitShortcut(cmdQ, 'darwin'), true);
  assert.equal(isQuitShortcut({ ...ctrlQ, type: 'keyUp' }, 'win32'), false);
  // Without an onQuit handler these keys are still swallowed.
  assert.equal(isBlocked(altF4), true);
  assert.equal(isBlocked(ctrlQ), true);
});

test('lockKeyboard routes the quit shortcut to onQuit and the admin shortcut to onAdmin', () => {
  const wc = new EventEmitter();
  const calls = [];
  lockKeyboard(wc, { onAdmin: () => calls.push('admin'), onQuit: () => calls.push('quit') });
  const fire = (input) => {
    let prevented = false;
    wc.emit('before-input-event', { preventDefault: () => (prevented = true) }, input);
    return prevented;
  };
  assert.equal(fire({ type: 'keyDown', alt: true, key: 'F4', code: 'F4' }), true);
  assert.equal(fire({ type: 'keyDown', control: true, shift: true, alt: true, key: 'K', code: 'KeyK' }), true);
  assert.equal(fire({ type: 'keyDown', key: 'a', code: 'KeyA' }), false);
  assert.deepEqual(calls, ['quit', 'admin']);
});
