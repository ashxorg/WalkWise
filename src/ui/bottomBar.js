// bottomBar.js — three pill buttons: Start/Stop, Look (describe scene), Ask (mic).

import { getState, subscribe } from '../state.js';

export function mountBottomBar(parent, { onStartToggle, onMicToggle, onDescribe }) {
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
      <button class="pill pill-look" type="button" aria-label="Look" disabled>
        <span class="pill-glyph">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/>
          </svg>
        </span>
        <span class="pill-label">Look</span>
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
  const lookBtn  = bar.querySelector('.pill-look');
  const micBtn   = bar.querySelector('.pill-mic');

  startBtn.addEventListener('click', () => onStartToggle?.());
  lookBtn.addEventListener('click',  () => onDescribe?.());
  micBtn.addEventListener('click',   () => onMicToggle?.());

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

    const busy = s.thinking || s.speaking || s.recording;

    // Look button — disabled while anything is happening
    lookBtn.disabled = !s.running || s.loading || busy;
    lookBtn.classList.toggle('is-thinking', s.thinking && !s.recording);
    lookBtn.querySelector('.pill-label').textContent = (s.thinking && !s.recording) ? 'Scanning' : 'Look';

    // Mic button — stays enabled while recording so tapping again stops it
    micBtn.disabled = !s.running || s.loading || s.thinking || s.speaking;
    micBtn.classList.toggle('is-recording', s.recording);
    micBtn.classList.toggle('is-thinking', s.thinking && !s.recording);
    if (s.recording)                        micBtn.querySelector('.pill-label').textContent = 'Listening';
    else if (s.thinking && !s.recording)    micBtn.querySelector('.pill-label').textContent = 'Thinking';
    else if (s.speaking)                    micBtn.querySelector('.pill-label').textContent = 'Speaking';
    else                                    micBtn.querySelector('.pill-label').textContent = 'Ask';
  }

  render(getState());
  subscribe(render);
  return bar;
}
