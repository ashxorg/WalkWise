// expBar.js — vertical EXP / level bar fixed to the left edge of the screen.

import { getState, subscribe } from '../state.js';

export function mountExpBar(parent) {
  const el = document.createElement('div');
  el.className = 'exp-bar-wrap';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="exp-bar-lv-label">LV</div>
    <div class="exp-bar-level" data-exp-level>1</div>
    <div class="exp-bar-track">
      <div class="exp-bar-fill" data-exp-fill style="height:0%"></div>
    </div>
    <div class="exp-bar-label">EXP</div>
  `;
  parent.appendChild(el);

  const levelEl = el.querySelector('[data-exp-level]');
  const fillEl  = el.querySelector('[data-exp-fill]');

  function render(s) {
    const user = s.currentUser;
    el.classList.toggle('is-visible', !!user);
    if (!user) return;
    levelEl.textContent = user.level;
    const pct = user.expToNextLevel > 0
      ? Math.min(100, Math.round((user.exp / user.expToNextLevel) * 100))
      : 0;
    fillEl.style.height = `${pct}%`;
  }

  render(getState());
  subscribe(render);
}
