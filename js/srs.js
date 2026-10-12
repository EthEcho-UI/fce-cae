// SM-2-style spaced repetition scheduling. Dates are stored as ISO day strings (YYYY-MM-DD).

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

export function newCardState() {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: today(), lastReviewed: null };
}

/** rating: 'again' | 'hard' | 'good' | 'easy' (or 1-4). Returns a NEW state object. */
export function review(state, rating) {
  const s = Object.assign(newCardState(), state);
  const r = typeof rating === 'number'
    ? ['again', 'hard', 'good', 'easy'][rating - 1]
    : rating;
  let { ease, interval, reps } = s;
  switch (r) {
    case 'again':
      s.lapses += 1;
      reps = 0;
      interval = 1;
      ease = Math.max(1.3, ease - 0.2);
      break;
    case 'hard':
      reps += 1;
      interval = reps <= 1 ? 1 : Math.max(1, Math.round(interval * 1.2));
      ease = Math.max(1.3, ease - 0.15);
      break;
    case 'good':
      reps += 1;
      interval = reps === 1 ? 1 : (reps === 2 ? 6 : Math.round(interval * ease));
      break;
    case 'easy':
      reps += 1;
      interval = reps === 1 ? 4 : Math.round(Math.max(interval, 1) * ease * 1.3);
      ease = ease + 0.15;
      break;
    default:
      return s;
  }
  s.ease = Math.round(ease * 100) / 100;
  s.interval = interval;
  s.reps = reps;
  s.due = addDays(today(), interval);
  s.lastReviewed = new Date().toISOString();
  return s;
}

export function isDue(state) {
  if (!state) return true; // never-seen cards are always "due" (as new)
  return state.due <= today();
}

export function isNew(state) {
  return !state || state.reps === 0;
}
