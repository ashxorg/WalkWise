// profilePanel.js — bottom-sheet panel showing user info and quest list.

import QRCode from 'qrcode';
import { getState } from '../state.js';
import { getUserQuests, generateQuests, clearConversation } from '../services/userService.js';
import { openQuestScan } from './questVerifyModal.js';

let panelEl, qrOverlayEl;

export function mountProfilePanel(parent) {
  panelEl = document.createElement('div');
  panelEl.className = 'profile-panel';
  panelEl.innerHTML = `
    <div class="dp-scrim"></div>
    <div class="dp-card profile-card">
      <div class="dp-handle"></div>
      <div class="dp-header">
        <div class="dp-title">
          <span class="dp-diamond"></span>
          <span class="dp-label">ADVENTURER PROFILE</span>
        </div>
        <button class="dp-close profile-close" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>

      <div class="dp-body profile-body">
        <div class="profile-identity">
          <div class="profile-avatar" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="48" height="48">
              <circle cx="24" cy="24" r="22" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.5"/>
              <path d="M24 6 L28 24 L24 42 L20 24 Z" fill="var(--accent)" opacity="0.8"/>
            </svg>
          </div>
          <div class="profile-info">
            <div class="profile-name" data-profile-name>—</div>
            <div class="profile-level" data-profile-level>Level 1</div>
          </div>
          <button class="btn-qr" type="button" aria-label="Show QR code">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/>
              <rect x="14" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/>
              <rect x="3" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/>
              <rect x="5" y="5" width="3" height="3" fill="currentColor"/>
              <rect x="16" y="5" width="3" height="3" fill="currentColor"/>
              <rect x="5" y="16" width="3" height="3" fill="currentColor"/>
              <path d="M14 14h2v2h-2zM16 16h2v2h-2zM18 14h3v2h-3zM14 18h3v3h-3z" fill="currentColor"/>
            </svg>
            <span>My QR</span>
          </button>
        </div>

        <div class="profile-exp-bar">
          <div class="profile-exp-track">
            <div class="profile-exp-fill" data-exp-fill style="width:0%"></div>
          </div>
          <span class="profile-exp-label" data-exp-label>0 / 100 EXP</span>
        </div>

        <div class="section-divider"></div>

        <div class="adventure-reset-row">
          <button class="btn-new-adventure" type="button" data-new-adventure-btn>
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V15a1 1 0 0 0-2 0v1.93A8 8 0 0 1 4.07 11H6a1 1 0 0 0 0-2H4.07A8 8 0 0 1 11 4.07V6a1 1 0 0 0 2 0V4.07A8 8 0 0 1 19.93 11H18a1 1 0 0 0 0 2h1.93A8 8 0 0 1 13 16.93z" fill="currentColor"/>
            </svg>
            Begin New Adventure
          </button>
        </div>

        <div class="section-divider"></div>

        <div class="quest-section-header">
          <div class="dp-section-title" style="margin-bottom:0">ACTIVE QUESTS</div>
          <button class="btn-generate-quests" type="button" data-gen-btn>
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/>
            </svg>
            Generate
          </button>
        </div>
        <ul class="quest-list" data-active-quests></ul>

        <div class="dp-section-title" style="margin-top:14px">COMPLETED QUESTS</div>
        <ul class="quest-list quest-list-done" data-done-quests></ul>
      </div>
    </div>
  `;
  parent.appendChild(panelEl);

  panelEl.querySelector('.dp-scrim').addEventListener('click', () => closePanel());
  panelEl.querySelector('.profile-close').addEventListener('click', () => closePanel());
  panelEl.querySelector('.btn-qr').addEventListener('click', () => showQr());
  panelEl.querySelector('[data-gen-btn]').addEventListener('click', () => doGenerateQuests());
  panelEl.querySelector('[data-new-adventure-btn]').addEventListener('click', () => doNewAdventure());

  // Reload quest list when a quest-verify modal confirms completion
  document.addEventListener('quest-verified', async () => {
    const { currentUser } = getState();
    if (!currentUser || !panelEl.classList.contains('is-open')) return;
    // Update EXP bar with latest user data
    panelEl.querySelector('[data-profile-level]').textContent = `Level ${currentUser.level}`;
    const pct = Math.round((currentUser.exp / currentUser.expToNextLevel) * 100);
    panelEl.querySelector('[data-exp-fill]').style.width = `${pct}%`;
    panelEl.querySelector('[data-exp-label]').textContent = `${currentUser.exp} / ${currentUser.expToNextLevel} EXP`;
    try {
      const quests = await getUserQuests(currentUser.id);
      renderQuests(quests);
    } catch {}
  });

  // QR overlay
  qrOverlayEl = document.createElement('div');
  qrOverlayEl.className = 'qr-overlay';
  qrOverlayEl.innerHTML = `
    <div class="qr-card">
      <div class="qr-header">
        <div class="modal-title"><span class="dp-diamond"></span><span>PLAYER ID</span></div>
        <button class="modal-close qr-close" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="qr-body">
        <img class="qr-img" data-qr-img alt="Player QR code" />
        <p class="qr-hint">Let another adventurer scan this to view your profile.</p>
        <div class="qr-id" data-qr-id></div>
      </div>
    </div>
  `;
  parent.appendChild(qrOverlayEl);
  qrOverlayEl.addEventListener('click', e => { if (e.target === qrOverlayEl) closeQr(); });
  qrOverlayEl.querySelector('.qr-close').addEventListener('click', () => closeQr());
}

export function mountProfileButton(parent, onOpen) {
  const btn = document.createElement('button');
  btn.className = 'profile-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Profile');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" fill="currentColor"/>
    </svg>
  `;
  btn.addEventListener('click', () => onOpen());
  parent.appendChild(btn);
  return btn;
}

export async function openProfile() {
  const { currentUser } = getState();
  if (!currentUser) return;

  panelEl.querySelector('[data-profile-name]').textContent  = currentUser.username;
  panelEl.querySelector('[data-profile-level]').textContent = `Level ${currentUser.level}`;

  const pct = Math.round((currentUser.exp / currentUser.expToNextLevel) * 100);
  panelEl.querySelector('[data-exp-fill]').style.width = `${pct}%`;
  panelEl.querySelector('[data-exp-label]').textContent = `${currentUser.exp} / ${currentUser.expToNextLevel} EXP`;

  panelEl.querySelector('[data-active-quests]').innerHTML = '<li class="quest-empty">Loading…</li>';
  panelEl.querySelector('[data-done-quests]').innerHTML   = '';

  panelEl.classList.add('is-open');

  try {
    const quests = await getUserQuests(currentUser.id);
    renderQuests(quests);
  } catch {
    panelEl.querySelector('[data-active-quests]').innerHTML = '<li class="quest-empty">Could not load quests.</li>';
  }
}

async function doGenerateQuests() {
  const genBtn = panelEl.querySelector('[data-gen-btn]');
  genBtn.disabled = true;
  genBtn.textContent = 'Generating…';

  try {
    const { currentUser } = getState();
    await generateQuests(5, currentUser?.id ?? null);
    if (currentUser) {
      const quests = await getUserQuests(currentUser.id);
      renderQuests(quests);
    }
  } catch {
    // silent fail — quests remain as-is
  } finally {
    genBtn.disabled = false;
    genBtn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/></svg> Generate`;
  }
}

async function doNewAdventure() {
  const { currentUser } = getState();
  if (!currentUser) return;

  const confirmed = window.confirm(
    'Begin a new adventure?\n\nThis will clear your conversation history so your guide starts fresh. Your completed quests and EXP are kept.'
  );
  if (!confirmed) return;

  const btn = panelEl.querySelector('[data-new-adventure-btn]');
  btn.disabled = true;
  btn.textContent = 'Resetting…';

  try {
    await clearConversation(currentUser.id);
  } catch {
    // silent fail — not critical
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V15a1 1 0 0 0-2 0v1.93A8 8 0 0 1 4.07 11H6a1 1 0 0 0 0-2H4.07A8 8 0 0 1 11 4.07V6a1 1 0 0 0 2 0V4.07A8 8 0 0 1 19.93 11H18a1 1 0 0 0 0 2h1.93A8 8 0 0 1 13 16.93z" fill="currentColor"/></svg> Begin New Adventure`;
  }
}

async function showQr() {
  const { currentUser } = getState();
  if (!currentUser) return;

  qrOverlayEl.querySelector('[data-qr-id]').textContent = currentUser.id;

  try {
    const dataUrl = await QRCode.toDataURL(currentUser.id, {
      width: 240,
      margin: 2,
      color: { dark: '#8BCE51', light: '#0b0e0c' },
    });
    qrOverlayEl.querySelector('[data-qr-img]').src = dataUrl;
  } catch {
    qrOverlayEl.querySelector('[data-qr-img]').alt = 'Could not generate QR code.';
  }

  qrOverlayEl.classList.add('is-open');
}

function renderQuests(quests) {
  const active = quests.filter(q => !q.isFinished);
  const done   = quests.filter(q =>  q.isFinished);

  const activeEl = panelEl.querySelector('[data-active-quests]');
  const doneEl   = panelEl.querySelector('[data-done-quests]');

  if (active.length) {
    activeEl.innerHTML = active.map(q => `
      <li class="quest-item quest-item-active" data-quest-id="${q.questId}" role="button" tabindex="0" title="Tap to prove completion">
        <span class="quest-dot"></span>
        <span class="quest-desc">${escHtml(q.description)}</span>
        <span class="quest-exp">+${q.expReward} EXP</span>
        <svg class="quest-arrow" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>
        </svg>
      </li>`).join('');

    // Bind click handlers after render
    for (const li of activeEl.querySelectorAll('.quest-item-active')) {
      const questId = Number(li.dataset.questId);
      const quest   = active.find(q => q.questId === questId);
      const handler = () => { closePanel(); openQuestScan(quest); };
      li.addEventListener('click', handler);
      li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
    }
  } else {
    activeEl.innerHTML = '<li class="quest-empty">No active quests. Hit Generate to add some!</li>';
  }

  doneEl.innerHTML = done.length
    ? done.map(q => `
        <li class="quest-item quest-item-done">
          <svg class="quest-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
          </svg>
          <span class="quest-desc">${escHtml(q.description)}</span>
          <span class="quest-exp">+${q.expReward} EXP</span>
        </li>`).join('')
    : '<li class="quest-empty">None yet.</li>';
}

function closePanel() { panelEl.classList.remove('is-open'); }
function closeQr()    { qrOverlayEl.classList.remove('is-open'); }

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
