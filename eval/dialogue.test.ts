/**
 * Deterministic dialect + dialogue-state tests (Notion 10, Section 6).
 * No API — pure unit tests of the normalize/intent/slot layer + engine outcome.
 * Run: npx tsx eval/dialogue.test.ts
 */
import { parseYesNo, parseGender, parseResignIntent, extractNumber } from '../engine/normalize.js';
import { classifyIntent } from '../engine/intent.js';
import { interpretReply, applyGenderSelfCorrection, emptyState, QUESTIONS } from '../engine/slots.js';
import { calculate } from '../engine/calc.js';

let pass = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else fails.push(label);
}

// --- Normalizer / dialect ---
ok(parseYesNo('هي') === 'yes', 'هي → yes');
ok(parseYesNo('أيوه') === 'yes', 'أيوه → yes');
ok(parseYesNo('زين') === 'yes', 'زين → yes');
ok(parseYesNo('مب') === 'no', 'مب → no');
ok(parseYesNo('لأ') === 'no', 'لأ → no');
ok(parseGender('هي') === null, 'هي is NOT a gender');
ok(parseGender('هو') === null, 'هو is NOT a gender');
ok(parseGender('ريال') === 'male', 'ريال → male');
ok(parseGender('حرمة') === 'female', 'حرمة → female');
ok(parseGender('ضكر') === 'male', 'ضكر (typo) → male');
ok(parseGender('37') === null, 'number is NOT a gender');
ok(extractNumber('٣٧') === 37, '٣٧ → 37');
ok(extractNumber('عمري ٧ سنوات') === 7, 'arabic-indic in phrase → 7');
ok(parseResignIntent('ابا أستقيل') === true, 'ابا أستقيل → resign');
ok(parseResignIntent('أبغى استقالة') === true, 'أبغى استقالة → resign');

// --- Intent classification ---
ok(classifyIntent('ابا أستقيل').intent === 'resign', 'intent: ابا أستقيل → resign');
ok(classifyIntent('متى يحق لي معاش؟').intent === 'policy_question', 'intent: policy question');
ok(classifyIntent('أبغى شهادة راتب').intent === 'certificate_request', 'intent: certificate');
ok(classifyIntent('أنت غبي ياحمار').intent === 'abuse', 'intent: abuse');
ok(classifyIntent('السلام عليكم').intent === 'greeting', 'intent: greeting');

// --- Slot interpretation against the pending question ---
// gender question pending + "هي" → re-ask, NOT female.
{
  const r = interpretReply(QUESTIONS.gender, 'هي');
  ok(r.action === 'reask', 'gender pending + هي → reask (not female)');
}
// gender question + "أنا ريال" → male.
{
  const r = interpretReply(QUESTIONS.gender, 'أنا ريال');
  ok(r.action === 'set' && r.value === 'male', 'gender pending + أنا ريال → male');
}
// gender=male sticky; later yes/no question + "هي" → yes; gender unchanged.
{
  const st = emptyState();
  st.gender = { value: 'male', confirmed: true };
  const r = interpretReply(QUESTIONS.children_under_18, 'هي'); // a yes/no question
  ok(r.action === 'set' && r.value === true, 'yes/no + هي → true');
  ok(st.gender.value === 'male', 'gender stays male after later هي (no flip)');
  // an ambiguous later "هي" must never change gender
  const changed = applyGenderSelfCorrection(st, 'هي');
  ok(changed === false && st.gender.value === 'male', 'هي never overwrites sticky gender');
}
// explicit self-correction flips gender.
{
  const st = emptyState();
  st.gender = { value: 'male', confirmed: true };
  applyGenderSelfCorrection(st, 'لا أنا أنثى'); // explicit
  ok(st.gender.value === 'female', 'explicit self-correction → female');
}
// "هي" to an either/or question → re-ask to choose A or B.
{
  const r = interpretReply(QUESTIONS.employment_status, 'هي');
  ok(r.action === 'reask', 'either/or + هي → reask (must choose)');
  const r2 = interpretReply(QUESTIONS.employment_status, 'مازلت على رأس العمل');
  ok(r2.action === 'set' && r2.value === 'still_working', 'either/or maps still-working');
}

// --- Profile 37/7/no, male → not pension-eligible (EoS), then proactive offer + "هي" computes ---
{
  const r = calculate({ caseType: 'resignation', gender: 'male', age: 37, yearsOfService: 7, contributionSalary: 20000 });
  ok(r.outcome === 'eos' && r.monthlyPension === 0 && r.endOfService > 0, 'M/37/7 → EoS, not pension');
  // the user's "هي" to the "compute gratuity?" offer is a yes:
  ok(parseYesNo('هي') === 'yes', 'هي to EoS offer → yes (compute)');
}

console.log(`Dialogue/dialect tests: ${pass} passed, ${fails.length} failed (of ${pass + fails.length}).`);
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
} else {
  console.log('All dialect + dialogue-state cases pass. ✓');
}
