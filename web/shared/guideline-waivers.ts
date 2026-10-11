import { canonicalLabel } from '../core/risk/policy.ts';

// Check id → labels the check stands down for ("*" for every label).
export type Waivers = Record<string, string[]>;

// One order for the same waivers, whatever order they arrive in. The dataset fingerprint is
// taken over them, and MySQL hands a stored JSON object back with its keys rearranged.
export const canonicalWaivers = (waivers: Waivers): Waivers =>
  Object.fromEntries(
    Object.keys(waivers)
      .filter((check) => waivers[check].length)
      .sort((a, b) => a.localeCompare(b))
      .map((check) => [
        check,
        waivers[check].includes('*') ? ['*'] : [...new Set(waivers[check])].sort(),
      ]),
  );

// What a person's choices on the guideline rules change in scoring. A choice changes the
// engine in one case only: the guideline permits something a policy check flags, and the
// person sided with the guideline. That check is then waived for the classes of the rule.
// Rules that are new or stricter describe checks in prose; nothing can run them, so choosing
// them is recorded with the project and leaves scoring as it is.
// The input is the rules.json a browser sent, so nothing in it is trusted beyond its shape.
export function waiversFrom(rules: unknown, checkIds: readonly string[]): Waivers {
  const { rules: drafts, choices } = (rules ?? {}) as { rules?: unknown; choices?: unknown };
  if (!Array.isArray(drafts) || !choices || typeof choices !== 'object') return {};
  const known = new Set(checkIds);
  const waived = new Map<string, Set<string>>();
  for (const draft of drafts) {
    const { id, kind, verdict, overrides, classes } = (draft ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || (choices as Record<string, unknown>)[id] !== 'guideline')
      continue;
    if (kind !== 'check' || verdict !== 'accept' || !Array.isArray(overrides)) continue;
    const labels = (Array.isArray(classes) ? classes : [])
      .filter((c): c is string => typeof c === 'string' && Boolean(c.trim()))
      .map((c) => (c.trim() === '*' ? '*' : canonicalLabel(c)));
    for (const check of overrides) {
      if (typeof check !== 'string' || !known.has(check)) continue;
      if (!waived.has(check)) waived.set(check, new Set());
      for (const label of labels) waived.get(check)!.add(label);
    }
  }
  return canonicalWaivers(
    Object.fromEntries([...waived].map(([check, labels]) => [check, [...labels]])),
  );
}
