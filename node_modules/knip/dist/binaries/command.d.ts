import type { Command, Word } from 'unbash';
import type { BinaryResolverOptions, GetInputsFromScriptsOptions } from '../types/config.ts';
import { type Input } from '../util/input.ts';
export declare const getInputsFromNodeOptions: (prefix: Command['prefix']) => Input[];
export declare const getDependenciesFromCommand: (node: Command, options: BinaryResolverOptions, fromWords?: (words: Word[], options: GetInputsFromScriptsOptions) => Input[]) => Input[];
