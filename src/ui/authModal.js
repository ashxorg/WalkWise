// authModal.js — blocking auth overlay shown until the user signs in or logs in.

import { signup, login } from '../services/userService.js';
import { setCurrentUser } from '../state.js';
import { randomFantasyName } from '../utils/fantasyNames.js';

let modalEl;
let _resolve;

export function mountAuthModal(parent) {
  modalEl = document.createElement('div');
  modalEl.className = 'auth-modal';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-label', 'Sign in to WalkWise');
  modalEl.innerHTML = `
    <div class="auth-card">
      <div class="auth-header">
        <div class="modal-title">
          <span class="dp-diamond"></span>
          <span>WALKWISE / ADVENTURER</span>
        </div>
      </div>

      <div class="auth-tabs">
        <button class="auth-tab is-active" data-tab="signup" type="button">Create Character</button>
        <button class="auth-tab" data-tab="login" type="button">Return</button>
      </div>

      <div class="auth-body">
        <div data-panel="signup">
          <p class="auth-intro">The system has chosen a name for you. You may alter your fate.</p>
          <label class="field">
            <span class="field-label">Adventurer Name</span>
            <div class="field-row-inner">
              <input type="text" data-signup-name autocomplete="off" maxlength="64" />
              <button class="btn-reroll" type="button" title="Reroll name" aria-label="Reroll name">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="M17.65 6.35A7.96 7.96 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/>
                </svg>
              </button>
            </div>
          </label>
          <p class="auth-error" data-signup-error></p>
          <button class="btn btn-primary auth-submit" type="button" data-action="signup">Begin Quest</button>
        </div>

        <div data-panel="login" style="display:none">
          <p class="auth-intro">Speak your name, adventurer, and you shall be remembered.</p>
          <label class="field">
            <span class="field-label">Adventurer Name</span>
            <input type="text" data-login-name autocomplete="off" maxlength="64" />
          </label>
          <p class="auth-error" data-login-error></p>
          <button class="btn btn-primary auth-submit" type="button" data-action="login">Enter</button>
        </div>
      </div>
    </div>
  `;
  parent.appendChild(modalEl);

  const signupNameEl = modalEl.querySelector('[data-signup-name]');
  const loginNameEl  = modalEl.querySelector('[data-login-name]');
  const signupErr    = modalEl.querySelector('[data-signup-error]');
  const loginErr     = modalEl.querySelector('[data-login-error]');

  // Reroll button
  modalEl.querySelector('.btn-reroll').addEventListener('click', () => {
    signupNameEl.value = randomFantasyName();
  });

  // Tab switching
  for (const tab of modalEl.querySelectorAll('.auth-tab')) {
    tab.addEventListener('click', () => {
      const t = tab.dataset.tab;
      modalEl.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('is-active', b.dataset.tab === t));
      modalEl.querySelector('[data-panel="signup"]').style.display = t === 'signup' ? '' : 'none';
      modalEl.querySelector('[data-panel="login"]').style.display  = t === 'login'  ? '' : 'none';
      signupErr.textContent = '';
      loginErr.textContent  = '';
    });
  }

  // Submit buttons
  modalEl.querySelector('[data-action="signup"]').addEventListener('click', async () => {
    const name = signupNameEl.value.trim();
    if (!name) { signupErr.textContent = 'Enter a name, brave soul.'; return; }
    signupErr.textContent = '';
    try {
      const user = await signup(name);
      _finish(user);
    } catch (err) {
      signupErr.textContent = err.message;
    }
  });

  modalEl.querySelector('[data-action="login"]').addEventListener('click', async () => {
    const name = loginNameEl.value.trim();
    if (!name) { loginErr.textContent = 'Enter your name, adventurer.'; return; }
    loginErr.textContent = '';
    try {
      const user = await login(name);
      _finish(user);
    } catch (err) {
      loginErr.textContent = err.message;
    }
  });

  // Allow Enter key to submit
  signupNameEl.addEventListener('keydown', e => { if (e.key === 'Enter') modalEl.querySelector('[data-action="signup"]').click(); });
  loginNameEl.addEventListener('keydown',  e => { if (e.key === 'Enter') modalEl.querySelector('[data-action="login"]').click(); });
}

function _finish(user) {
  setCurrentUser(user);
  modalEl.classList.remove('is-open');
  _resolve?.(user);
}

export function showAuthModal() {
  const nameInput = modalEl.querySelector('[data-signup-name]');
  nameInput.value = randomFantasyName();
  modalEl.querySelector('[data-login-name]').value = '';
  modalEl.querySelector('[data-signup-error]').textContent = '';
  modalEl.querySelector('[data-login-error]').textContent  = '';
  // Reset to signup tab
  modalEl.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('is-active', b.dataset.tab === 'signup'));
  modalEl.querySelector('[data-panel="signup"]').style.display = '';
  modalEl.querySelector('[data-panel="login"]').style.display  = 'none';
  modalEl.classList.add('is-open');
  nameInput.focus();
  return new Promise(resolve => { _resolve = resolve; });
}
