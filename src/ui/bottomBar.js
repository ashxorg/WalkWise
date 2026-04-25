// bottomBar.js — two pill buttons (Start/Stop and Mic) in a frosted bottom bar.

import { getState, subscribe } from '../state.js';

export function mountBottomBar(parent, { onStartToggle, onMicToggle }) {
  const bar = document.createElement('div');
  bar.className = 'bottom-bar';
  bar.innerHTML = `
    <div class="bb-inner">
      <button class="pill pill-start" type="button" aria-label="Start">
        <span class="pill-glyph">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M8 5v14l11-7z" fill="currentColor"/>
          </svg>
        </span>
        <span class="pill-label">Start</span>
      </button>
      <button class="pill pill-mic" type="button" aria-label="Ask" disabled>
        <span class="pill-glyph">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" fill="currentColor"/>
            <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.08A7 7 0 0 0 19 11z" fill="currentColor"/>
          </svg>
        </span>
        <span class="pill-label">Ask</span>
      </button>
    </div>
  `;
  parent.appendChild(bar);

  const startBtn = bar.querySelector('.pill-start');
  const micBtn = bar.querySelector('.pill-mic');
  startBtn.addEventListener('click', () => onStartToggle?.());
  micBtn.addEventListener('click', () => onMicToggle?.());

  function render(s) {
    // Start button
    if (s.loading) {
      startBtn.classList.add('is-loading');
      startBtn.querySelector('.pill-label').textContent = s.loadingMessage || 'Loading…';
    } else {
      startBtn.classList.remove('is-loading');
      startBtn.querySelector('.pill-label').textContent = s.running ? 'Stop' : 'Start';
    }
    startBtn.classList.toggle('is-on', s.running);

    // Mic button
    micBtn.disabled = !s.running || s.loading;
    micBtn.classList.toggle('is-recording', s.recording);
    micBtn.classList.toggle('is-thinking', s.thinking && !s.recording);
    if (s.recording) micBtn.querySelector('.pill-label').textContent = 'Listening';
    else if (s.thinking) micBtn.querySelector('.pill-label').textContent = 'Thinking';
    else if (s.speaking) micBtn.querySelector('.pill-label').textContent = 'Speaking';
    else micBtn.querySelector('.pill-label').textContent = 'Ask';
  }

  render(getState());
  subscribe(render);
  return bar;
}
