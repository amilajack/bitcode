import { Builder, values } from 'bitcode-builder';
import { Buffer } from 'buffer';

import { BitStream } from './bitstream';
import { Enumerator } from './enumerator';

export class Module {
  private readonly fns: values.Func[] = [];
  private readonly decls: values.Declaration[] = [];
  private readonly globals: values.Global[] = [];
  private readonly writer: BitStream = new BitStream();

  constructor(public readonly sourceName?: string) {
  }

  public addFunction(fn: values.Func): void {
    this.fns.push(fn);
  }

  public addDeclaration(decl: values.Declaration): void {
    this.decls.push(decl);
  }

  public addGlobal(g: values.Global): void {
    this.globals.push(g);
  }

  public build(): Buffer {
    // LLVM enumerates values in specific order, attach id to each before
    // emitting binary data
    const e = new Enumerator();
    e.enumerate({
      decls: this.decls,
      fns: this.fns,
      globals: this.globals,
    });

    return this.writer.end();
  }

  // Convenience methods

  public createBuilder() {
    return new Builder();
  }

  public add(value: values.Value): Module {
    if (value instanceof values.Func) {
      this.addFunction(value);
    } else if (value instanceof values.Declaration) {
      this.addDeclaration(value);
    } else if (value instanceof values.Global) {
      this.addGlobal(value);
    } else {
      throw new Error('Unexpected value type: ' + value.constructor.name);
    }
    return this;
  }
}
