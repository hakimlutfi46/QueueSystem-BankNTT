'use strict';

/*
 * Keyboard lockdown for before-input-event.
 * Blocked: Alt+F4, Ctrl/Cmd+W, Ctrl/Cmd+Q, Ctrl/Cmd+R (+Shift), F1-F24 (F5 reload,
 * F11 fullscreen, F12 devtools, F7 caret browsing), Ctrl+Shift+I/J/C (devtools),
 * Escape (leave fullscreen), plus browser-ish shortcuts that make no sense on a
 * kiosk: Ctrl+N/T/O/P/S/U/L/F/G/H/J, zoom (Ctrl +/-/0), Alt+Left/Right and the
 * Browser* media keys. Ctrl+A/C/V/X/Z/Y stay usable for text fields.
 * Note: the Windows key, Ctrl+Alt+Del and Win+L cannot be blocked by any app;
 * use Windows Assigned Access (see README) for that.
 */
const BLOCKED_CTRL_KEYS = new Set(['w', 'q', 'r', 'n', 't', 'o', 'p', 's', 'u', 'l', 'f', 'g', 'h', 'j', 'm', '+', '-', '=', '_', '0']);
const BLOCKED_NAMED_KEYS = new Set([
  'Escape',
  'BrowserBack',
  'BrowserForward',
  'BrowserRefresh',
  'BrowserHome',
  'BrowserSearch',
  'BrowserFavorites',
  'BrowserStop',
  'ContextMenu',
]);

function isAdminShortcut(input) {
  return (
    input.type === 'keyDown' &&
    (input.control || input.meta) &&
    input.shift &&
    input.alt &&
    (input.code === 'KeyK' || String(input.key).toLowerCase() === 'k')
  );
}

function isBlocked(input, { allowEscape = false } = {}) {
  const key = String(input.key || '');
  const lower = key.toLowerCase();
  const code = String(input.code || '');
  const ctrl = Boolean(input.control || input.meta);

  if (/^F\d{1,2}$/.test(code) || /^F\d{1,2}$/.test(key)) return true;
  if (key === 'Escape' && allowEscape) return false;
  if (BLOCKED_NAMED_KEYS.has(key) || BLOCKED_NAMED_KEYS.has(code)) return true;
  if (input.alt && (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home')) return true;
  if (ctrl && input.shift && ['i', 'j', 'c', 'k', 'delete', 'r', 'n', 'w', 'q', 't'].includes(lower)) return true;
  if (ctrl && BLOCKED_CTRL_KEYS.has(lower)) return true;
  if (ctrl && (code === 'NumpadAdd' || code === 'NumpadSubtract' || code === 'Numpad0')) return true;
  return false;
}

function isQuitShortcut(input, platform = process.platform) {
  if (input.type !== 'keyDown') return false;
  if (input.alt && (input.key === 'F4' || input.code === 'F4')) return true;
  const mod = platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta;
  return (
    mod &&
    !input.shift &&
    !input.alt &&
    (input.code === 'KeyQ' || String(input.key).toLowerCase() === 'q')
  );
}

/** Attach to a webContents; `onAdmin` is called for Ctrl+Shift+Alt+K. */
function lockKeyboard(webContents, { onAdmin, onQuit, allowEscape = false } = {}) {
  webContents.on('before-input-event', (event, input) => {
    if (onAdmin && isAdminShortcut(input)) {
      event.preventDefault();
      onAdmin();
      return;
    }
    if (onQuit && isQuitShortcut(input)) {
      event.preventDefault();
      onQuit();
      return;
    }
    if (isBlocked(input, { allowEscape })) event.preventDefault();
  });
}

module.exports = { lockKeyboard, isBlocked, isAdminShortcut, isQuitShortcut };
