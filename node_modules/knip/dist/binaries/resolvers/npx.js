import parseArgs from '../../util/parse-args.js';
import { toBinary, toDependency } from '../../util/input.js';
import { stripVersionFromSpecifier } from '../../util/modules.js';
import { isInternal } from '../../util/path.js';
import { argsFrom } from '../util.js';
const noInstallFlags = new Set(['--no', '--no-install', '--yes=false', '--no-yes']);
export const resolve = (_binary, words, options) => {
    const { fromArgs } = options;
    const parsed = parseArgs(words, {
        isStorePositions: true,
        boolean: ['yes', 'no', 'quiet'],
        alias: { yes: 'y', package: 'p', call: 'c' },
    });
    const packageSpecifier = parsed._[0];
    const specifier = packageSpecifier ? stripVersionFromSpecifier(packageSpecifier) : '';
    const packages = parsed.package ? [parsed.package].flat().map(stripVersionFromSpecifier) : [];
    const command = parsed.call ? fromArgs([parsed.call]) : [];
    const isBinary = specifier && !packageSpecifier.includes('@') && !isInternal(specifier);
    const commandIndex = parsed.positionalIndices[0] ?? words.length;
    const noInstall = words.slice(0, commandIndex).some(word => noInstallFlags.has(word.value));
    const opts = noInstall ? undefined : { optional: true };
    const dependency = isBinary ? toBinary(specifier, opts) : toDependency(specifier, opts);
    const specifiers = dependency ? [dependency] : [];
    return [
        ...specifiers,
        ...packages.map(id => toDependency(id, { optional: true })),
        ...command,
        ...fromArgs(argsFrom(words, packageSpecifier)).slice(1),
    ];
};
