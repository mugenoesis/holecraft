/** Designs are always stored in mm; units only affect display and input. */
export type Units = 'mm' | 'in';

const MM_PER_INCH = 25.4;

export function mmToUnits(mm: number, units: Units): number {
  return units === 'in' ? mm / MM_PER_INCH : mm;
}

export function unitsToMm(value: number, units: Units): number {
  return units === 'in' ? value * MM_PER_INCH : value;
}
