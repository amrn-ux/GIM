import fs from 'node:fs';

// Source entries were extracted in document order from GIM Images.docx.
const source = JSON.parse(fs.readFileSync(new URL('./gym-source.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const aliases = {
  'Flat Bench Press': 'bench-press', 'Chest Fly Machine': 'pec-deck',
  'Lat Pulldown Machine': 'lat-pulldown', 'Seated Dumbbell Shoulder Press': 'dumbbell-shoulder-press',
  'Dumbbell Lateral Raise': 'lateral-raise', 'Dumbbell Front Raise': 'front-raise',
  'Standing Dumbbell Curl': 'dumbbell-curl', 'Cable Crossover — Cable Curl': 'cable-curl',
  'Cable Crossover — Triceps Pushdown': 'triceps-pushdown',
  'Dumbbell Overhead Extension': 'overhead-triceps-extension',
  'Squat Rack — Barbell Squat': 'barbell-squat', 'Dumbbell Lunges': 'walking-lunges',
  'Abdominal Crunch Machine': 'ab-crunch-machine', 'Cable Crossover — Cable Crunch': 'cable-crunch',
  'Dumbbell Wrist Curl': 'wrist-curl', 'Cable Crossover — Face Pull': 'face-pull',
};
const categories = { Chest: ['chest'], Back: ['back'], Shoulders: ['shoulders'], Biceps: ['arms'], Triceps: ['arms'], Legs: ['legs'], 'Abs & Core': ['core'], 'Forearms & Grip': ['arms'], 'Traps / Upper Back': ['back', 'shoulders'] };
const singleDumbbell = new Set(['One-Arm Dumbbell Row', 'Dumbbell Pullover', 'Dumbbell Squat', 'Dumbbell Overhead Extension', 'Concentration Curl', 'Dumbbell Crunch', 'Dumbbell Russian Twist']);
const rows = [];
for (const row of source) {
  // The Back entry is a separate cable movement, awaiting the user's naming clarification.
  const name = row.name;
  const id = row.section === 'Back' && name === 'Cable Crossover' ? 'straight-arm-pulldown'
    : aliases[name] || name.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (rows.some(x => x.id === id)) continue;
  const equip = /Dumbbell|Arnold Press|Hammer Curl|Concentration Curl|Reverse Wrist Curl/.test(name) ? 'dumbbell'
    : /Cable|Straight-Arm Pulldown|Seated Cable Row/.test(name) ? 'cable'
    : /Bench Press|Barbell Squat|Hip Thrust/.test(name) ? 'barbell'
    : /Captain/.test(name) ? 'bodyweight' : 'machine';
  const alternating = /Alternating/.test(name);
  const mult = equip === 'dumbbell' && !singleDumbbell.has(name) && !alternating ? 2 : 1;
  rows.push({ id, name, cats: categories[row.section], equip, gymImage: row.image, focus: row.section, mult });
}
fs.writeFileSync(new URL('../js/gym-library.js', import.meta.url), '// Extracted from the user-provided GIM Images.docx. Duplicate listings share one entry.\nexport const GYM_LIBRARY = ' + JSON.stringify(rows, null, 2) + ';\n');
console.log(`${rows.length} unique exercises; ${new Set(rows.map(x => x.gymImage)).size} image assets referenced.`);
