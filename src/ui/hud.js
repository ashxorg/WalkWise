// hud.js — subscribes to global state and updates the status bar, hero screen,
// toast banner, and canvas overlay. No business logic lives here.

import { subscribe } from '../state.js';

/**
 * @param {{
 *   stateEl:  HTMLElement,
 *   objCount: HTMLElement,
 *   toastEl:  HTMLElement,
 *   heroEl:   HTMLElement,
 *   overlay:  import('../ui/overlay.js').Overlay,
 * }} refs
 */
export function mountHud({ stateEl, objCount, toastEl, heroEl, overlay }) {
  subscribe((s) => {
    // ── Toast ──────────────────────────────────────────────────────────────
    if (s.toast) {
      toastEl.textContent = s.toast.message;
      toastEl.classList.remove('toast-error', 'toast-info');
      toastEl.classList.add(s.toast.kind === 'error' ? 'toast-error' : 'toast-info');
      toastEl.classList.add('is-visible');
    } else {
      toastEl.classList.remove('is-visible');
    }

    // ── Status label ───────────────────────────────────────────────────────
    let label = 'standby';
    if (s.loading)        label = 'loading';
    else if (s.recording) label = 'listening';
    else if (s.thinking)  label = 'thinking';
    else if (s.speaking)  label = 'speaking';
    else if (s.running)   label = 'online';
    stateEl.textContent  = label;
    stateEl.dataset.kind = label;

    // ── Object count ───────────────────────────────────────────────────────
    objCount.textContent = `${s.objects.length} object${s.objects.length === 1 ? '' : 's'}`;

    // ── Hero screen (shown before Start) ───────────────────────────────────
    heroEl.classList.toggle('is-hidden', s.running || s.loading);

    // ── Canvas overlay ─────────────────────────────────────────────────────
    overlay.setObjects(s.objects);
  });
}
