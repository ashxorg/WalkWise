// gameButton.js — floating dice button that starts/stops the color-finding minigame.

import { getState, setState, subscribe, showToast } from '../state.js';
import { speak } from '../services/elevenlabs.js';

const COLORS = ['red', 'blue', 'green', 'yellow'];

export function mountGameButton(parent) {
  const btn = document.createElement('button');
  btn.className = 'gear-btn game-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Mini Game');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v14h14V6H5zm3.5 3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm7 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-7 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm7 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-3.5-3.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
    </svg>
  `;
  btn.addEventListener('click', () => toggleGame());
  parent.appendChild(btn);

  subscribe(s => btn.classList.toggle('needs-attention', s.gameActive));
}

async function toggleGame() {
  const s = getState();
  if (!s.running) {
    showToast('error', 'Start the camera first to play!');
    return;
  }
  if (s.gameActive) {
    setState({ gameActive: false, targetColor: null });
    showToast('info', 'Game stopped.');
    return;
  }
  const targetColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  setState({ gameActive: true, targetColor });
  showToast('info', `Find something ${targetColor}!`);
  try {
    await speak({
      voiceId: s.settings.elevenVoiceId,
      text: `Let's play! Can you find something ${targetColor}?`,
    });
  } catch (e) {
    console.warn('Speech failed', e);
  }
}
