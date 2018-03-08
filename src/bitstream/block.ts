import * as assert from 'assert';

import { Abbr } from './abbr';

const MIN_ABBR_ID_WIDTH = 2;

export class Block {
  protected abbrList: Abbr[] = [];

  // abbr.name => index in `abbrList`
  protected abbrMap: Map<string, number> = new Map();

  constructor(public readonly id: number, public readonly abbrIDWidth: number,
              globalAbbrs: ReadonlyArray<Abbr>) {
    assert(MIN_ABBR_ID_WIDTH <= abbrIDWidth, 'AbbrID width is too small');

    globalAbbrs.forEach((abbr) => this.addAbbr(abbr));
  }

  public addAbbr(abbr: Abbr): number {
    assert(!this.abbrMap.has(abbr.name),
      `Duplicate abbreviation with name: "${abbr.name}"`);

    const index = this.abbrList.length;

    this.abbrList.push(abbr);
    this.abbrMap.set(abbr.name, index);

    return index;
  }
}