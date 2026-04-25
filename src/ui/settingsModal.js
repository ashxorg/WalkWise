// settingsModal.js — preferences modal.
// API keys come from build-time env vars; this modal is for tweakable
// preferences (FPS, voice override, speak-on-tap). Key fields are shown
// only as a fallback when the env vars aren't set.

import { getState, setState, subscribe, hasAllKeys, KEYS_FROM_ENV, ENV_KEYS } from '../state.js';
import { ELEVENLABS_DEFAULT_VOICE_ID } from '../services/elevenlabs.js';

let modalEl, gearBtn;

export function mountSettings(parent) {
  // Floating gear button (top-right)
  gearBtn = document.createElement('button');
  gearBtn.className = 'gear-btn';
  gearBtn.type = 'button';
  gearBtn.setAttribute('aria-label', 'Settings');
  gearBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M19.14 12.94a7.93 7.93 0 0 0 .05-.94 7.93 7.93 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.6 7.6 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.5.42l-.36 2.54a7.6 7.6 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.7 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.93 7.93 0 0 0 0 1.88L2.82 14.16a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.8a.5.5 0 0 0 .5-.42l.36-2.54c.58-.24 1.12-.56 1.62-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z" fill="currentColor"/>
    </svg>
  `;
  gearBtn.addEventListener('click', () => open());
  parent.appendChild(gearBtn);

  modalEl = document.createElement('div');
  modalEl.className = 'modal';
  modalEl.setAttribute('aria-hidden', 'true');

  const keysSection = KEYS_FROM_ENV ? envKeysBlock() : userKeysBlock();

  modalEl.innerHTML = `
    <div class="modal-scrim"></div>
    <div class="modal-card" role="dialog" aria-label="Settings">
      <div class="modal-header">
        <div class="modal-title">
          <span class="dp-diamond"></span>
          <span>WALKWISE / SETTINGS</span>
        </div>
        <button class="modal-close" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="modal-body">
        ${keysSection}

        <div class="section-divider"></div>

        <label class="field">
          <span class="field-label">ElevenLabs voice ID</span>
          <input type="text" autocomplete="off" data-key="elevenVoiceId" placeholder="${ELEVENLABS_DEFAULT_VOICE_ID}" />
          <span class="field-hint">Optional override. Default is "Sarah". Find more in your ElevenLabs voice library.</span>
        </label>

        <div class="field-row">
          <label class="field field-inline">
            <span class="field-label">Detection FPS</span>
            <input type="number" min="1" max="10" step="1" data-key="detectionFps" />
          </label>
          <label class="field field-inline checkbox">
            <input type="checkbox" data-key="speakOnTap" />
            <span>Speak description when I tap an object</span>
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" type="button" data-action="cancel">Close</button>
        <button class="btn btn-primary" type="button" data-action="save">Save</button>
      </div>
    </div>
  `;
  parent.appendChild(modalEl);

  modalEl.querySelector('.modal-scrim').addEventListener('click', () => close());
  modalEl.querySelector('.modal-close').addEventListener('click', () => close());
  modalEl.querySelector('[data-action="cancel"]').addEventListener('click', () => close());
  modalEl.querySelector('[data-action="save"]').addEventListener('click', () => save());

  hydrate();
  subscribe(() => {
    const missing = !KEYS_FROM_ENV && !hasAllKeys();
    gearBtn.classList.toggle('needs-attention', missing);
  });

  if (!KEYS_FROM_ENV && !hasAllKeys()) {
    requestAnimationFrame(() => open());
  }
}

function envKeysBlock() {
  return `
    <div class="status-card">
      <div class="status-card-title">
        <span class="dp-diamond"></span>
        <span>READY</span>
      </div>
      <p class="status-card-text">
        API keys are configured in the deployment. Just press <span class="kbd">Start</span> on the main screen.
      </p>
    </div>
  `;
}

function userKeysBlock() {
  return `
    <p class="modal-intro">
      WalkWise needs three keys to work. They're stored only on this device (localStorage)
      and sent directly to each service from your browser.
    </p>

    <label class="field">
      <span class="field-label">Google Vision API key</span>
      <input type="password" autocomplete="off" data-key="visionKey" placeholder="AIza…" />
      <span class="field-hint">From Google Cloud Console — enable the <em>Cloud Vision API</em>.</span>
    </label>

    <label class="field">
      <span class="field-label">Gemini API key</span>
      <input type="password" autocomplete="off" data-key="geminiKey" placeholder="AIza…" />
      <span class="field-hint">From <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">aistudio.google.com</a> — free tier works.</span>
    </label>

    <label class="field">
      <span class="field-label">ElevenLabs API key</span>
      <input type="password" autocomplete="off" data-key="elevenKey" placeholder="sk_…" />
      <span class="field-hint">From elevenlabs.io → Profile → API Keys.</span>
    </label>
  `;
}

function hydrate() {
  const s = getState().settings;
  for (const input of modalEl.querySelectorAll('[data-key]')) {
    const k = input.dataset.key;
    if (input.type === 'checkbox') input.checked = !!s[k];
    else input.value = s[k] ?? '';
  }
}

export function open() {
  hydrate();
  modalEl.classList.add('is-open');
  modalEl.setAttribute('aria-hidden', 'false');
}

export function close() {
  modalEl.classList.remove('is-open');
  modalEl.setAttribute('aria-hidden', 'true');
}

function save() {
  const s = { ...getState().settings };
  for (const input of modalEl.querySelectorAll('[data-key]')) {
    const k = input.dataset.key;
    if (input.type === 'checkbox') s[k] = input.checked;
    else if (input.type === 'number') s[k] = Math.max(1, Math.min(10, Number(input.value) || 3));
    else s[k] = input.value.trim();
  }
  if (!s.elevenVoiceId) s.elevenVoiceId = ENV_KEYS.elevenVoiceId || ELEVENLABS_DEFAULT_VOICE_ID;
  setState({ settings: s });
  close();
}
