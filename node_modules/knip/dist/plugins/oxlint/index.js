import { Visitor } from 'oxc-parser';
import { findProperty, getPropertyValues } from '../../typescript/ast-helpers.js';
import { toConfig, toDependency, toEntry } from '../../util/input.js';
import { dirname, isInternal, toAbsolute } from '../../util/path.js';
import { hasDependency } from '../../util/plugin.js';
import { getInputsFromSettings } from '../eslint/helpers.js';
import { getInputsFromSettingsAST } from '../eslint/resolveFromAST.js';
const title = 'Oxlint';
const enablers = ['oxlint', 'vite-plus'];
const isEnabled = ({ dependencies }) => hasDependency(dependencies, enablers);
const config = ['.oxlintrc.{json,jsonc}', 'oxlint.config.{ts,mts}', 'vite.config.{js,mjs,ts,cjs,mts,cts}'];
const isViteConfig = (configFileName) => configFileName.startsWith('vite.config.');
const args = {
    config: true,
};
const resolveJsPlugins = (jsPlugins, configFilePath) => {
    const inputs = [];
    const dir = dirname(configFilePath);
    for (const plugin of jsPlugins ?? []) {
        const specifier = typeof plugin === 'string' ? plugin : plugin.specifier;
        if (!isInternal(specifier))
            inputs.push(toDependency(specifier));
        else
            inputs.push(toEntry(toAbsolute(specifier, dir)));
    }
    return inputs;
};
const isLoadConfig = ({ configFileName }) => !isViteConfig(configFileName);
const resolveExtendedConfig = (config, configFilePath) => {
    const inputs = [];
    for (const entry of config.extends ?? []) {
        if (typeof entry === 'string') {
            const filePath = toAbsolute(entry, dirname(configFilePath));
            inputs.push(toConfig('oxlint', filePath, { containingFilePath: configFilePath }));
        }
        else {
            for (const input of resolveExtendedConfig(entry, configFilePath))
                inputs.push(input);
        }
    }
    for (const input of resolveJsPlugins(config.jsPlugins, configFilePath))
        inputs.push(input);
    for (const override of config.overrides ?? []) {
        for (const input of resolveJsPlugins(override.jsPlugins, configFilePath))
            inputs.push(input);
    }
    for (const input of getInputsFromSettings(config.settings))
        inputs.push(input);
    return inputs;
};
const resolveConfig = (config, options) => resolveExtendedConfig(config, options.configFilePath);
const resolveFromAST = (program, options) => {
    if (!isViteConfig(options.configFileName))
        return [];
    const jsPlugins = new Set();
    const visitor = new Visitor({
        ObjectExpression(node) {
            const lint = findProperty(node, 'lint');
            if (lint?.type !== 'ObjectExpression')
                return;
            for (const specifier of getPropertyValues(lint, 'jsPlugins'))
                jsPlugins.add(specifier);
            for (const plugin of findProperty(lint, 'jsPlugins')?.elements ?? []) {
                if (plugin?.type !== 'ObjectExpression')
                    continue;
                for (const specifier of getPropertyValues(plugin, 'specifier'))
                    jsPlugins.add(specifier);
            }
        },
    });
    visitor.visit(program);
    return [...resolveJsPlugins([...jsPlugins], options.configFilePath), ...getInputsFromSettingsAST(program)];
};
const isFilterTransitiveDependencies = true;
const plugin = {
    title,
    enablers,
    isEnabled,
    config,
    isLoadConfig,
    resolveConfig,
    resolveFromAST,
    isFilterTransitiveDependencies,
    args,
};
export default plugin;
