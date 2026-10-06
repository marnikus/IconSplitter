import parseArgs from '../util/parse-args.js';
import { compact } from '../util/array.js';
import { toDeferResolve, toEntry } from '../util/input.js';
import { isValidBinary } from '../util/modules.js';
import { isAbsolute } from '../util/path.js';
import { argsAfter, toCommandBinary } from './util.js';
export const spawningBinaries = ['cross-env', 'retry-cli'];
const endOfCommandBinaries = ['dotenvx', 'env-cmd', 'op'];
const positionals = new Set(['babel-node', 'esbuild', 'execa', 'jiti', 'oxnode', 'vite-node', 'zx']);
const positionalBinaries = new Set(['concurrently']);
export const isWrapper = (binary) => spawningBinaries.includes(binary) || endOfCommandBinaries.includes(binary) || positionalBinaries.has(binary);
export const resolve = (binary, words, options) => {
    const { fromArgs } = options;
    const parsed = parseArgs(words, { boolean: ['quiet', 'verbose'], '--': endOfCommandBinaries.includes(binary) });
    const bin = binary.startsWith('.') || (binary.includes('/') && !isAbsolute(binary))
        ? toEntry(binary)
        : isValidBinary(binary)
            ? toCommandBinary(binary, options)
            : undefined;
    const pos = positionals.has(binary) ? [toDeferResolve(parsed._[0])] : [];
    const newCommand = parsed['--'] && parsed['--'].length > 0 ? fromArgs(argsAfter(words, '--')) : [];
    const commands = positionalBinaries.has(binary) ? parsed._.flatMap(cmd => fromArgs([cmd])) : [];
    return compact([bin, ...pos, ...newCommand, ...commands]);
};
