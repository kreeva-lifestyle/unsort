// The master sheet's INCLUDES on a costing sheet (owner: a costing's main
// components are the pieces the sheet says the design includes). A sheet
// nobody has typed on yet takes them as its components; a sheet with its own
// is offered the ones it lacks. Names come in the spelling the library
// already uses ("lehanga" for LEHENGA, PANT for the sheet's BOTTOM), so
// garment templates, the common lines and the purchase plan keep matching.
// Pure — no React, no Supabase.
import { coversComponent } from '../../../lib/componentNames';
import { blankSub, type CostingComponent, type CostingSub, type CostingLibrary } from './costingModel';

export const libSpelling = (lib: CostingLibrary, name: string): string =>
  lib.mains.find(m => coversComponent(m, name)) ?? name;

const blankLine = (s: CostingSub) => !s.name.trim() && !String(s.qty).trim() && s.suppliers.every(x => !x.name.trim() && !String(x.rate).trim());
/** A component as "+ Add main component" leaves it: no name, one empty line. */
export const untouched = (c: CostingComponent): boolean => !c.name.trim() && c.subs.every(blankLine);
/** Named, nothing else typed — what the master prefill writes. */
export const nameOnly = (c: CostingComponent): boolean => !!c.name.trim() && c.subs.every(blankLine);

export const missingFromMaster = (components: CostingComponent[], master: string[]): string[] =>
  master.filter(n => !components.some(c => coversComponent(c.name, n)));

export const componentFor = (lib: CostingLibrary, name: string): CostingComponent =>
  ({ name: libSpelling(lib, name), subs: [blankSub()] });
