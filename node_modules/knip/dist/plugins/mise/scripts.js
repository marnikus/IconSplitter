import { parse } from 'unbash';
import { getDependenciesFromCommand, getInputsFromNodeOptions } from '../../binaries/command.js';
import { spawningBinaries } from '../../binaries/fallback.js';
import { isWrapper } from '../../binaries/plugins.js';
import { isPackageManager } from '../../binaries/resolvers/index.js';
import { toScript } from '../../binaries/util.js';
import { SCRIPT_INTERPOLATION } from '../../constants.js';
import { isBinary } from '../../util/input.js';
import { extractBinary, isRelativeNodeModulesBin } from '../../util/modules.js';
import { walkCommands } from '../../util/scripts.js';
export const getInputsFromMiseScript = (script, options, hasLocalBinPath) => {
    const inputs = [];
    const definedFunctions = new Set();
    const readParts = (parts) => {
        let text = '';
        let value = '';
        let hasExpansion = false;
        for (const part of parts) {
            if (part.type === 'CommandExpansion' || part.type === 'ProcessSubstitution') {
                if (part.script)
                    readScript(part.script);
                text += SCRIPT_INTERPOLATION;
                value += SCRIPT_INTERPOLATION;
                hasExpansion = true;
            }
            else if (part.type === 'DoubleQuoted' || part.type === 'LocaleString') {
                const inner = readParts(part.parts);
                text += `${part.type === 'LocaleString' ? '$"' : '"'}${inner.text}"`;
                value += inner.value;
                if (inner.hasExpansion)
                    hasExpansion = true;
            }
            else {
                text += part.text;
                value += 'value' in part ? part.value : part.text;
            }
        }
        return { text, value, hasExpansion };
    };
    const readWord = (word) => {
        if (!word.parts)
            return word;
        const { text, value, hasExpansion } = readParts(word.parts);
        return hasExpansion ? { ...word, text, value } : word;
    };
    const readScript = (parsed) => {
        for (const statement of parsed.commands) {
            if (statement.command.type === 'Function')
                definedFunctions.add(statement.command.name.value);
        }
        for (const statement of parsed.commands) {
            for (const command of walkCommands(statement.command)) {
                const name = command.name?.value;
                const word = command.name && readWord(command.name);
                const prefix = command.prefix.map(assignment => {
                    const value = assignment.value && readWord(assignment.value);
                    return value && value !== assignment.value
                        ? { ...assignment, value, text: `${assignment.name}=${value.text}` }
                        : assignment;
                });
                const words = command.suffix.map(readWord);
                if (!name || !word || definedFunctions.has(name))
                    continue;
                const binary = extractBinary(name);
                const isPackageCommand = isPackageManager(binary);
                const isExplicit = isPackageCommand || name.startsWith('./') || isRelativeNodeModulesBin(name);
                const isLocal = hasLocalBinPath && !command.prefix.some(assignment => assignment.name === 'PATH');
                const isWrapperCommand = !isPackageCommand && isWrapper(binary);
                if (!isExplicit && !isLocal && !isWrapperCommand && binary !== 'node' && binary !== 'find')
                    continue;
                let commandInputs;
                if (isWrapperCommand || binary === 'find') {
                    const fromScript = (script) => {
                        inputs.push(...getInputsFromMiseScript(script, options, isLocal));
                        return [];
                    };
                    const fromArgs = args => fromScript(toScript(args));
                    commandInputs = getDependenciesFromCommand({ ...command, name: word, prefix, suffix: words }, { ...options, fromArgs });
                }
                else {
                    commandInputs = options.getInputsFromScripts([...prefix.map(assignment => assignment.text), word.text, ...words.map(word => word.text)].join(' '), { cwd: options.cwd, manifest: options.manifest });
                }
                if (!isExplicit && !isLocal && binary !== 'node' && binary !== 'find')
                    continue;
                if (isWrapperCommand && spawningBinaries.includes(binary)) {
                    commandInputs.push(...getInputsFromNodeOptions(prefix));
                }
                const binaryInput = commandInputs.find(input => isBinary(input) && input.specifier === binary);
                if (!isExplicit && isLocal && binaryInput)
                    binaryInput.optional = true;
                for (const input of commandInputs) {
                    if (!input.specifier || input.specifier.includes(SCRIPT_INTERPOLATION))
                        continue;
                    if (!isExplicit && !isLocal && input === binaryInput)
                        continue;
                    inputs.push(input);
                }
            }
        }
    };
    try {
        readScript(parse(script));
    }
    catch {
        return [];
    }
    return inputs;
};
