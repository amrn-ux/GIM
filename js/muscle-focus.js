export const FOCUS_MUSCLES = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'];

// Each logged set contributes once to each of its recorded muscle groups.
export function muscleCounts(sets) {
  const counts = Object.fromEntries(FOCUS_MUSCLES.map(c => [c, 0]));
  for (const set of sets) {
    const groups = set.muscleCategories?.length ? set.muscleCategories : [set.muscleCategory];
    for (const group of new Set(groups)) if (group in counts) counts[group]++;
  }
  return counts;
}

