import * as assert from 'assert';

import { values } from 'bitcode-builder';
import { Abbr, BitStream, BlockInfoMap } from '../bitstream';
import {
  BLOCK_ID, FIXED, FUNCTION_CODE, VALUE_SYMTAB_CODE, VBR,
} from '../constants';
import {
  encodeBinopType, encodeCastType, encodeICmpPredicate,
} from '../encoding';
import { Enumerator } from '../enumerator';
import { Block } from './base';
import { ConstantBlock } from './constant';
import { TypeBlock } from './type';

import constants = values.constants;
import instructions = values.instructions;
import BasicBlock = values.BasicBlock;

const FUNCTION_ABBR_ID_WIDTH = 6;
const VALUE_SYMTAB_ABBR_ID_WIDTH = 3;

export class FunctionBlock extends Block {
  public static buildInfo(info: BlockInfoMap): void {
    info.set(BLOCK_ID.FUNCTION, [
      new Abbr('declareblocks', [
        Abbr.literal(FUNCTION_CODE.DECLAREBLOCKS),
        Abbr.vbr(VBR.BLOCK_COUNT),
      ]),

      // Terminators

      new Abbr('ret_void', [
        Abbr.literal(FUNCTION_CODE.INST_RET),
      ]),
      new Abbr('ret', [
        Abbr.literal(FUNCTION_CODE.INST_RET),
        Abbr.vbr(VBR.VALUE_INDEX),
      ]),
      new Abbr('jump', [
        Abbr.literal(FUNCTION_CODE.INST_BR),
        Abbr.vbr(VBR.BLOCK_INDEX),  // target
      ]),
      new Abbr('branch', [
        Abbr.literal(FUNCTION_CODE.INST_BR),
        Abbr.vbr(VBR.BLOCK_INDEX),  // onTrue
        Abbr.vbr(VBR.BLOCK_INDEX),  // onFalse
        Abbr.vbr(VBR.VALUE_INDEX),  // condition
      ]),
      new Abbr('unreachable', [
        Abbr.literal(FUNCTION_CODE.INST_UNREACHABLE),
      ]),

      // Regular instructions

      new Abbr('cast', [
        Abbr.literal(FUNCTION_CODE.INST_CAST),
        Abbr.vbr(VBR.VALUE_INDEX),  // value
        Abbr.vbr(VBR.TYPE_INDEX),  // to type
        Abbr.fixed(FIXED.CAST_TYPE),
      ]),
      new Abbr('binop', [
        Abbr.literal(FUNCTION_CODE.INST_BINOP),
        Abbr.vbr(VBR.VALUE_INDEX),  // left
        Abbr.vbr(VBR.VALUE_INDEX),  // right
        Abbr.fixed(FIXED.BINOP_TYPE),
      ]),
      new Abbr('icmp', [
        Abbr.literal(FUNCTION_CODE.INST_CMP),
        Abbr.vbr(VBR.VALUE_INDEX),  // left
        Abbr.vbr(VBR.VALUE_INDEX),  // right
        Abbr.fixed(FIXED.PREDICATE),  // predicate
      ]),
    ]);

    info.set(BLOCK_ID.VALUE_SYMTAB, [
      new Abbr('bbentry', [
        Abbr.literal(VALUE_SYMTAB_CODE.BBENTRY),
        Abbr.vbr(VBR.BLOCK_INDEX),
        Abbr.array(Abbr.char6()),
      ]),
      new Abbr('entry', [
        Abbr.literal(VALUE_SYMTAB_CODE.ENTRY),
        Abbr.vbr(VBR.VALUE_INDEX),
        Abbr.array(Abbr.char6()),
      ]),
    ]);
  }

  constructor(private readonly enumerator: Enumerator,
              private readonly typeBlock: TypeBlock,
              private readonly fn: constants.Func) {
    super();
  }

  public build(writer: BitStream): void {
    super.build(writer);

    writer.enterBlock(BLOCK_ID.FUNCTION, FUNCTION_ABBR_ID_WIDTH);

    const fn = this.fn;
    const fnConstants = new ConstantBlock(this.enumerator, this.typeBlock,
      this.enumerator.getFunctionConstants(fn));
    fnConstants.build(writer);

    const blocks: ReadonlyArray<BasicBlock> = Array.from(fn);
    const blockIds: Map<BasicBlock, number> = new Map();
    blocks.forEach((bb, index) => blockIds.set(bb, index));

    writer.writeRecord('declareblocks', [ blocks.length ]);

    for (const bb of blocks) {
      for (const instr of bb) {
        this.buildInstruction(writer, instr, blockIds);
      }
    }

    this.buildSymtab(writer, blocks);

    writer.endBlock(BLOCK_ID.FUNCTION);
  }

  private buildInstruction(writer: BitStream,
                           instr: instructions.Instruction,
                           blockIds: Map<BasicBlock, number>): void {
    this.enumerator.checkValueOrder(instr);

    const instrId = this.enumerator.get(instr);
    const relativeId = (operand: values.Value): number => {
      return instrId - this.enumerator.get(operand);
    };

    // TODO(indutny): support forward references in non-Phi instructions

    // Terminators
    if (instr instanceof instructions.Ret) {
      if (instr.operand === undefined) {
        writer.writeRecord('ret_void', []);
      } else {
        writer.writeRecord('ret', [ relativeId(instr.operand) ]);
      }
    } else if (instr instanceof instructions.Jump) {
      assert(blockIds.has(instr.target), 'Unknown block');

      writer.writeRecord('jump', [
        blockIds.get(instr.target)!,
      ]);
    } else if (instr instanceof instructions.Branch) {
      assert(blockIds.has(instr.onTrue), 'Unknown block');
      assert(blockIds.has(instr.onFalse), 'Unknown block');

      writer.writeRecord('branch', [
        blockIds.get(instr.onTrue)!,
        blockIds.get(instr.onFalse)!,
        relativeId(instr.condition),
      ]);
    } else if (instr instanceof instructions.Unreachable) {
      writer.writeRecord('unreachable', []);

    // Regular instructions
    } else if (instr instanceof instructions.Cast) {
      writer.writeRecord('cast', [
        relativeId(instr.operand),
        this.typeBlock.get(instr.targetType),
        encodeCastType(instr.castType),
      ]);
    } else if (instr instanceof instructions.Binop) {
      writer.writeRecord('binop', [
        relativeId(instr.left),
        relativeId(instr.right),
        encodeBinopType(instr.binopType),
      ]);
    } else if (instr instanceof instructions.ICmp) {
      writer.writeRecord('icmp', [
        relativeId(instr.left)!,
        relativeId(instr.right)!,
        encodeICmpPredicate(instr.predicate),
      ]);
    } else {
      throw new Error(`Unsupported instruction: "${instr.opcode}"`);
    }
  }

  private buildSymtab(writer: BitStream, blocks: ReadonlyArray<BasicBlock>) {
    // Write block/param names
    writer.enterBlock(BLOCK_ID.VALUE_SYMTAB, VALUE_SYMTAB_ABBR_ID_WIDTH);

    blocks.forEach((bb, index) => {
      if (bb.name === undefined) {
        return;
      }

      writer.writeRecord('bbentry', [ index, bb.name ]);
    });

    this.fn.args.forEach((arg, index) => {
      writer.writeRecord('entry', [ this.enumerator.get(arg), arg.name ]);
    });

    writer.endBlock(BLOCK_ID.VALUE_SYMTAB);
  }
}