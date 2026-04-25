// detailPanel.js — sliding panel that shows a cropped snapshot + AI description.

import { getState, setState, subscribe } from '../state.js';

export function mountDetailPanel(parent) {
  const panel = document.createElement('div');
  panel.className = 'detail-panel';
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <div class="dp-scrim"></div>
    <div class="dp-card" role="dialog" aria-label="Object details">
      <div class="dp-handle"></div>
      <div class="dp-header">
        <div class="dp-title">
          <span class="dp-diamond"></span>
          <span class="dp-label">—</span>
        </div>
        <button class="dp-close" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="dp-image-wrap">
        <div class="dp-image-frame">
          <img class="dp-image" alt="" />
          <div class="dp-image-empty">No capture</div>
          <span class="dp-corner tl"></span><span class="dp-corner tr"></span>
          <span class="dp-corner bl"></span><span class="dp-corner br"></span>
        </div>
      </div>
      <div class="dp-body">
        <div class="dp-section-title">DESCRIPTION</div>
        <div class="dp-text"></div>
        <div class="dp-tags"></div>
      </div>
    </div>
  `;
  parent.appendChild(panel);

  const scrim = panel.querySelector('.dp-scrim');
  const closeBtn = panel.querySelector('.dp-close');
  const labelEl = panel.querySelector('.dp-label');
  const imgEl = panel.querySelector('.dp-image');
  const emptyEl = panel.querySelector('.dp-image-empty');
  const textEl = panel.querySelector('.dp-text');
  const tagsEl = panel.querySelector('.dp-tags');

  const close = () => setState({ detail: null });
  scrim.addEventListener('click', close);
  closeBtn.addEventListener('click', close);

  function render(s) {
    const d = s.detail;
    if (!d) {
      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');
      return;
    }
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    labelEl.textContent = (d.label || 'Object').toUpperCase();
    if (d.image) { imgEl.src = d.image; imgEl.style.display = 'block'; emptyEl.style.display = 'none'; }
    else        { imgEl.removeAttribute('src'); imgEl.style.display = 'none'; emptyEl.style.display = 'flex'; }

    if (d.loading) {
      textEl.innerHTML = `<span class="dp-loading"><span class="dp-dot"></span><span class="dp-dot"></span><span class="dp-dot"></span></span>`;
    } else {
      textEl.textContent = d.text || '';
    }

    tagsEl.innerHTML = '';
    if (d.tags?.length) {
      for (const t of d.tags.slice(0, 8)) {
        const el = document.createElement('span');
        el.className = 'dp-tag';
        el.textContent = t;
        tagsEl.appendChild(el);
      }
    }
  }

  render(getState());
  subscribe(render);
  return panel;
}
