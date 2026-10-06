import { Visitor } from 'oxc-parser';
import { findProperty, getPropertyValues } from '../../typescript/ast-helpers.js';
import { getStringValue } from '../../typescript/ast-nodes.js';
import { isDirectory } from '../../util/fs.js';
import { toConfig, toDeferResolve, toProductionEntry } from '../../util/input.js';
import { join } from '../../util/path.js';
import { hasDependency } from '../../util/plugin.js';
const title = 'Next.js';
const enablers = ['next'];
const isEnabled = ({ dependencies }) => hasDependency(dependencies, enablers);
const config = ['next.config.{js,ts,cjs,mjs,mts}'];
const defaultPageExtensions = ['{js,jsx,ts,tsx}'];
const productionEntryFilePatterns = [
    'app/{,[(]*[)]/}{manifest,robots}.{js,ts}',
    'app/**/sitemap.{js,ts}',
    'app/**/{icon,apple-icon,opengraph-image,twitter-image}.{js,jsx,ts,tsx}',
];
const rootOrSrc = '{,src/}';
const getRouterDirPrefix = (cwd, name) => {
    if (!cwd)
        return rootOrSrc;
    if (isDirectory(cwd, name))
        return '';
    if (isDirectory(cwd, `src/${name}`))
        return 'src/';
    return rootOrSrc;
};
const getEntryFilePatterns = (pageExtensions = defaultPageExtensions, cwd) => {
    const ext = pageExtensions.length === 1 ? pageExtensions[0] : `{${pageExtensions.join(',')}}`;
    const appDirPrefix = getRouterDirPrefix(cwd, 'app');
    const pagesDirPrefix = getRouterDirPrefix(cwd, 'pages');
    return [
        ...productionEntryFilePatterns.map(pattern => `${appDirPrefix}${pattern}`),
        `${rootOrSrc}{instrumentation,instrumentation-client,middleware,proxy}.${ext}`,
        `${appDirPrefix}app/global-{error,not-found}.${ext}`,
        `${appDirPrefix}app/**/{default,error,forbidden,loading,not-found,unauthorized}.${ext}`,
        `${appDirPrefix}app/**/{layout,page,route,template}.${ext}`,
        `${pagesDirPrefix}pages/**/*.${ext}`,
    ];
};
const production = getEntryFilePatterns();
const resolveFromAST = (program, { configFileDir }) => {
    const pageExtensions = new Set();
    const loaders = new Set();
    const collectLoaders = (node) => {
        if (node?.type === 'ArrayExpression') {
            for (const element of node.elements)
                collectLoaders(element);
        }
        else {
            const loader = getStringValue(node) ?? getStringValue(findProperty(node, 'loader'));
            if (loader)
                loaders.add(loader);
            const nested = findProperty(node, 'loaders');
            if (nested?.type === 'ArrayExpression')
                collectLoaders(nested);
        }
    };
    const visitor = new Visitor({
        ObjectExpression(node) {
            for (const extension of getPropertyValues(node, 'pageExtensions'))
                pageExtensions.add(extension);
            const rules = findProperty(findProperty(node, 'turbopack'), 'rules');
            if (rules?.type !== 'ObjectExpression')
                return;
            for (const rule of rules.properties) {
                if (rule.type === 'Property')
                    collectLoaders(rule.value);
            }
        },
    });
    visitor.visit(program);
    const extensions = pageExtensions.size > 0 ? [...pageExtensions] : defaultPageExtensions;
    const patterns = [...getEntryFilePatterns(extensions, configFileDir), 'next-env.d.ts'];
    const inputs = patterns.map(id => toProductionEntry(join(configFileDir, id)));
    for (const loader of loaders)
        inputs.push(toDeferResolve(loader));
    return inputs;
};
const commands = new Set(['dev', 'build', 'start']);
const args = {
    boolean: ['turbo', 'turbopack'],
    resolveInputs: parsed => {
        const dir = commands.has(parsed._[0]) ? parsed._[1] : undefined;
        if (!dir)
            return [];
        return [toConfig('next', join(dir, 'next.config'))];
    },
};
const plugin = {
    title,
    enablers,
    isEnabled,
    config,
    production,
    resolveFromAST,
    args,
};
export default plugin;
