'use strict';

const assert = require('assert');

const bitcode = require('./');
const constants = bitcode.constants;

const RECORD = constants.RECORD;
const LINKAGE = constants.LINKAGE;

class Globals {
  constructor(strtab) {
    this.strtab = strtab;

    this.globals = [];
  }

  add(type, name, info = {}) {
    const entry = Object.assign({
      isConst: false,
      init: false,
      linkage: 'internal',
      align: false,
      unnamed: false,
      attributes: false
    }, info, {
      type,
      name: this.strtab.add(name)
    });
    this.globals.push(entry);
  }

  serializeTo(stream) {
    this.globals.forEach((entry) => {
      assert(LINKAGE.hasOwnProperty(entry.linkage),
        'Unknown linkage: ' + entry.linkage);
      const linkage = LINKAGE[entry.linkage];

      // TODO(indutny): use `defineAbbr`
      stream.writeUnabbrevRecord(RECORD.GLOBALVAR, [
        entry.name.offset,
        entry.name.size,

        entry.type,
        // TODO(indutny): explicitType
        entry.isConst ? 1 : 0,
        entry.init === false ? 0 : (entry.init + 1),
        linkage,
        entry.align === false ? 0 : (entry.align + 1),

        // TODO(indutny): support this
        0,  // section
        0,  // visibility
        0,  // threadlocal

        entry.unnamed === false ? 0 : entry.unnamed === 'local' ? 2 : 1,

        // TODO(indutny): support this
        0,  // externally_initialized
        0,  // dllstorageclass
        0,  // comdat
        entry.attributes === false ? 0 : (entry.attributes + 1),

        // TODO(indutny): support this
        0  // preemption specifier
      ]);
    });
  }
}
module.exports = Globals;