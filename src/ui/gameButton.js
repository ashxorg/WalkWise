import { getState, setState, subscribe, showToast } from '../state.js';
import { speak } from '../services/elevenlabs.js';

let gameBtn;

const COLORS = ['red', 'blue', 'green', 'yellow'];

export function mountGameButton(parent) {
  gameBtn = document.createElement('button');
  gameBtn.className = 'gear-btn game-btn';
  gameBtn.type = 'button';
  gameBtn.setAttribute('aria-label', 'Mini Game');
  // Dice icon
  gameBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v14h14V6H5zm3.5 3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm7 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-7 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm7 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-3.5-3.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
    </svg>
  `;
  gameBtn.addEventListener('click', toggleGame);
  parent.appendChild(gameBtn);

  subscribe((s) => {
    if (s.gameActive) {
      gameBtn.classList.add('needs-attention');
    } else {
      gameBtn.classList.remove('needs-attention');
    }
  });
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
  } else {
    const targetColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    setState({ gameActive: true, targetColor });
    showToast('info', `Find something ${targetColor}!`);
    try {
      await speak({
        apiKey: s.settings.elevenKey,
        voiceId: s.settings.elevenVoiceId,
        text: `Let's play! Can you find something ${targetColor}?`,
      });
    } catch (e) {
      console.warn('Speech failed', e);
    }
  }
}
