export async function signup(username) {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Signup failed (${res.status})`);
  }
  return res.json();
}

export async function login(username) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Login failed (${res.status})`);
  }
  return res.json();
}

export async function getUserQuests(userId) {
  const res = await fetch(`/api/users/${encodeURIComponent(userId)}/quests`);
  if (!res.ok) throw new Error('Failed to load quests');
  return res.json();
}

export async function getUser(userId) {
  const res = await fetch(`/api/users/${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error('Failed to load user');
  return res.json();
}

export async function generateQuests(count = 5, userId = null) {
  const res = await fetch('/api/quests/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count, userId }),
  });
  if (!res.ok) throw new Error('Failed to generate quests');
  return res.json();
}

export async function getObjectProperties(label) {
  const res = await fetch(`/api/objects/${encodeURIComponent(label)}/properties`);
  if (!res.ok) return {};
  return res.json();
}

export async function clearConversation(userId) {
  const res = await fetch(`/api/gemini/conversation/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Clear conversation failed (${res.status})`);
}

export async function verifyQuest({ userId, questId, imageBase64 }) {
  const res = await fetch('/api/quests/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, questId, imageBase64 }),
  });
  if (!res.ok) throw new Error(`Verify failed (${res.status})`);
  return res.json(); // { verified, message, expReward, leveled, newLevel }
}

export async function checkQuestFulfillment({ userId, visionResults }) {
  const res = await fetch('/api/quests/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, visionResults }),
  });
  if (!res.ok) return { completed: [] };
  return res.json();
}
