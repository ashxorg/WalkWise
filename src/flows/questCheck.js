// questCheck.js — fire-and-forget: checks if vision results fulfill any active quest.
// Call after every Vision API response. Never throws — quest check must never break a flow.

import { getState, showToast, setCurrentUser } from '../state.js';
import { checkQuestFulfillment, getUser } from '../services/userService.js';

export async function runQuestCheck({ visionResults }) {
  try {
    const { currentUser } = getState();
    if (!currentUser) return;

    const { completed } = await checkQuestFulfillment({ userId: currentUser.id, visionResults });
    if (!completed?.length) return;

    // Refresh user so exp/level in state stays current
    try {
      const updated = await getUser(currentUser.id);
      setCurrentUser(updated);
    } catch {}

    for (const q of completed) {
      const msg = q.leveled
        ? `Quest complete! "${q.description}" +${q.expReward} EXP — LEVEL UP to Level ${q.newLevel}!`
        : `Quest complete! "${q.description}" +${q.expReward} EXP`;
      showToast('info', msg, 7000);
    }
  } catch {}
}
