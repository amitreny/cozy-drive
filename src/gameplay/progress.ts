import { START_ACORNS } from './economy';

/** Everything the player has earned. Plain data so it saves as-is. */
export interface ProgressData { acorns: number; owned: string[]; found: string[]; creative: boolean; postcards: { id: string; name: string; img: string }[] }

export class Progress {
  acorns: number; creative: boolean;
  readonly owned: Set<string>; readonly found: Set<string>;
  postcards: ProgressData['postcards'];
  onChange: () => void = () => {};

  constructor(d?: Partial<ProgressData>) {
    this.acorns = d?.acorns ?? START_ACORNS;
    this.owned = new Set(d?.owned ?? []);
    this.found = new Set(d?.found ?? []);
    this.creative = d?.creative ?? false;
    this.postcards = d?.postcards ?? [];
  }

  earn(n: number): void { this.acorns += n; this.onChange(); }
  buy(keys: string[], cost: number): boolean {
    if (this.creative) return true;
    if (cost > this.acorns) return false;
    this.acorns -= cost; keys.forEach((k) => this.owned.add(k)); this.onChange();
    return true;
  }
  toJSON(): ProgressData { return { acorns: this.acorns, owned: [...this.owned], found: [...this.found], creative: this.creative, postcards: this.postcards }; }
}
