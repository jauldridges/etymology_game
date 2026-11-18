// The schedule file lists one puzzle per date:
//   { "days": [ { "date": "2026-11-18", "puzzle": "caput" }, ... ] }
// The puzzle number is the entry's position in the list, starting at 1.

export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function numberedDays(schedule) {
  return [...schedule.days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day, i) => ({ ...day, number: i + 1 }));
}

// Today's puzzle: the latest scheduled day on or before today. If the schedule
// has not started yet, the first day is used so the game is never empty.
export function puzzleForDate(schedule, today) {
  const days = numberedDays(schedule);
  if (!days.length) return null;
  let pick = null;
  for (const day of days) if (day.date <= today) pick = day;
  return pick ?? days[0];
}

// Past and present puzzles, newest first. Future puzzles stay hidden.
export function archive(schedule, today) {
  return numberedDays(schedule).filter((d) => d.date <= today).reverse();
}
