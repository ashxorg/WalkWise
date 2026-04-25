// questVerifyModal.js — fullscreen scanner overlay for quest verification.
// Uses the live camera (same as the main app) — no file upload.

import { getState, setCurrentUser } from '../state.js';
import { verifyQuest, getUser } from '../services/userService.js';
import { speak, stopSpeaking } from '../services/elevenlabs.js';
import { stripDataUrl } from '../utils.js';

let overlayEl, _camera, _currentQuest;

export function mountQuestVerifyModal(parent, camera) {
  _camera = camera;

  overlayEl = document.createElement('div');
  overlayEl.className = 'qso-overlay';
  overlayEl.innerHTML = `
    <div class="qso-border-top"></div>
    <div class="qso-border-bottom"></div>
    <div class="qso-border-left"></div>
    <div class="qso-border-right"></div>

    <div class="qso-corner qso-tl"></div>
    <div class="qso-corner qso-tr"></div>
    <div class="qso-corner qso-bl"></div>
    <div class="qso-corner qso-br"></div>

    <div class="qso-scan-line"></div>

    <div class="qso-header">
      <div class="qso-badge">
        <span class="dp-diamond"></span>
        <span>QUEST SCAN</span>
      </div>
      <p class="qso-desc" data-qso-desc></p>
    </div>

    <div class="qso-result" data-qso-result>
      <div class="qso-wave" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span>
      </div>
      <p class="qso-result-text" data-qso-result-text></p>
    </div>

    <div class="qso-footer">
      <button class="pill qso-cancel-btn" type="button">
        <span class="pill-label">Cancel</span>
      </button>
      <button class="pill qso-scan-btn" type="button" data-scan-btn>
        <span class="pill-glyph">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
            <path d="M6.3 6.3A8 8 0 1 0 17.7 17.7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </span>
        <span class="pill-label" data-scan-label>Scan & Judge</span>
      </button>
    </div>
  `;
  parent.appendChild(overlayEl);

  overlayEl.querySelector('.qso-cancel-btn').addEventListener('click', () => close());
  overlayEl.querySelector('[data-scan-btn]').addEventListener('click', () => scan());
}

export function openQuestScan(quest) {
  _currentQuest = quest;
  overlayEl.querySelector('[data-qso-desc]').textContent = quest.description;

  // Reset state
  const resultEl = overlayEl.querySelector('[data-qso-result]');
  resultEl.className     = 'qso-result';
  resultEl.style.display = 'none';
  overlayEl.querySelector('[data-qso-result-text]').textContent = '';
  const scanBtn = overlayEl.querySelector('[data-scan-btn]');
  scanBtn.disabled = false;
  scanBtn.classList.remove('is-on');
  scanBtn.onclick  = null;
  overlayEl.querySelector('[data-scan-label]').textContent = 'Scan & Judge';

  overlayEl.classList.add('is-open');
}

async function scan() {
  const { currentUser, settings } = getState();
  if (!currentUser || !_currentQuest) return;

  if (!_camera.isRunning()) {
    showResult(false, 'The scrying lens is not active — start the camera first, brave adventurer.');
    return;
  }

  const scanBtn = overlayEl.querySelector('[data-scan-btn]');
  const labelEl = overlayEl.querySelector('[data-scan-label]');
  scanBtn.disabled    = true;
  labelEl.textContent = 'Judging…';
  stopSpeaking();

  const snapshot    = _camera.snapshot(1024, 0.88);
  const imageBase64 = stripDataUrl(snapshot);

  try {
    const result = await verifyQuest({
      userId:     currentUser.id,
      questId:    _currentQuest.questId,
      imageBase64,
    });

    // Build full spoken text (level-up appended if applicable)
    const spokenText = result.leveled
      ? `${result.message} Level up! You are now level ${result.newLevel}!`
      : result.message;

    // Display result card
    showResult(result.verified, spokenText);

    if (result.verified) {
      scanBtn.classList.add('is-on');
      labelEl.textContent = 'Done!';
      scanBtn.disabled    = false;
      scanBtn.onclick     = () => { close(true); scanBtn.onclick = null; };

      try {
        const updated = await getUser(currentUser.id);
        setCurrentUser(updated);
      } catch {}
    } else {
      labelEl.textContent = 'Try Again';
      scanBtn.disabled    = false;
    }

    // Speak the verdict — show wave while audio plays
    await speakResult(spokenText, settings.elevenVoiceId);

  } catch {
    showResult(false, 'The oracle could not be reached. Try again.');
    labelEl.textContent = 'Try Again';
    scanBtn.disabled    = false;
  }
}

async function speakResult(text, voiceId) {
  const resultEl = overlayEl.querySelector('[data-qso-result]');
  resultEl.classList.add('is-speaking');
  try {
    await speak({ voiceId, text });
  } finally {
    resultEl.classList.remove('is-speaking');
  }
}

function showResult(success, text) {
  const resultEl = overlayEl.querySelector('[data-qso-result]');
  resultEl.style.display = 'block';
  resultEl.classList.toggle('qso-result-success',  success);
  resultEl.classList.toggle('qso-result-fail',     !success);
  overlayEl.querySelector('[data-qso-result-text]').textContent = text;
}

function close(verified = false) {
  stopSpeaking();
  overlayEl.classList.remove('is-open');
  if (verified) overlayEl.dispatchEvent(new CustomEvent('quest-verified', { bubbles: true }));
}
