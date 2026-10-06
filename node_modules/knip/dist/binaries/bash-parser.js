import { parse } from 'unbash';
import { debugLogObject } from '../util/debug.js';
import { extractBinary, isValidBinary } from '../util/modules.js';
import { relative } from '../util/path.js';
import { substringBefore, truncate } from '../util/string.js';
import { walkCommands } from '../util/scripts.js';
import { getDependenciesFromCommand } from './command.js';
import { toScript } from './util.js';
const collectExpansionScripts = (word, out) => {
    if (!word.parts)
        return;
    for (const part of word.parts) {
        if ((part.type === 'CommandExpansion' || part.type === 'ProcessSubstitution') && part.script) {
            out.push(part.script);
        }
        else if (part.type === 'DoubleQuoted' || part.type === 'LocaleString') {
            for (const child of part.parts) {
                if (child.type === 'CommandExpansion' && child.script)
                    out.push(child.script);
            }
        }
    }
};
export const getDependenciesFromScript = (script, options) => {
    if (!script)
        return [];
    const fromArgs = (args, opts) => {
        if (args.length === 0)
            return [];
        const first = typeof args[0] === 'string' ? args[0] : args[0].value;
        if (!isValidBinary(substringBefore(first, ' ')))
            return [];
        return getDependenciesFromScript(toScript(args), {
            ...options,
            isForwardedArgs: false,
            ...opts,
        });
    };
    const fromWords = (words, opts) => {
        const script = words
            .filter(word => word.text !== '--')
            .map(word => word.text)
            .join(' ');
        return getDependenciesFromScript(script, opts);
    };
    const definedFunctions = new Set();
    const collectFunctionNames = (statements) => {
        for (const stmt of statements)
            if (stmt.command.type === 'Function')
                definedFunctions.add(stmt.command.name.text);
    };
    const processScript = (s) => {
        collectFunctionNames(s.commands);
        const pending = [];
        const mainDeps = [];
        for (const statement of s.commands) {
            for (const command of walkCommands(statement.command))
                mainDeps.push(...processCommand(command, pending));
        }
        const expansionDeps = pending.flatMap(inner => processScript(inner));
        return [...mainDeps, ...expansionDeps];
    };
    const processCommand = (node, pending) => {
        if (node.name)
            collectExpansionScripts(node.name, pending);
        for (const prefix of node.prefix)
            if (prefix.value)
                collectExpansionScripts(prefix.value, pending);
        for (const suffix of node.suffix)
            collectExpansionScripts(suffix, pending);
        if (definedFunctions.size && node.name && definedFunctions.has(extractBinary(node.name.value)))
            return [];
        return getDependenciesFromCommand(node, { ...options, fromArgs }, fromWords);
    };
    try {
        const parsed = parse(script);
        if (!parsed.commands)
            return [];
        return processScript(parsed);
    }
    catch (error) {
        const msg = `Warning: failed to parse and ignoring script in ${relative(options.cwd, options.containingFilePath)} (${truncate(script, 30)})`;
        debugLogObject('*', msg, error);
        return [];
    }
};
