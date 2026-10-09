// risk_v3 is the 3.0.0 snapshot of the engine. It shares the result types of the current
// engine; its check context predates the per-frame box list and rule families.
import type * as current from '../risk/types.ts';

export type * from '../risk/types.ts';
export type CheckContext = Omit<current.CheckContext, 'frameBoxes'>;
export type TemporalContext = CheckContext & {
  previous: NonNullable<CheckContext['previous']>;
  next: NonNullable<CheckContext['next']>;
};
export interface Check {
  id: string;
  version: string;
  relational?: boolean;
  run(context: CheckContext): current.CheckResult;
}
