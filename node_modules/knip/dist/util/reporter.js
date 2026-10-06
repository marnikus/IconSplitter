import internalReporters from '../reporters/index.js';
import { _load } from './loader.js';
import { isAbsolute, isInternal, resolve } from './path.js';
export const runReporters = async (reporter, options) => {
    const reporters = await Promise.all(reporter.map(async (reporter) => {
        return reporter in internalReporters
            ? internalReporters[reporter]
            : await _load(isInternal(reporter) && !isAbsolute(reporter) ? resolve(reporter) : reporter);
    }));
    for (const reporter of reporters)
        await reporter(options);
};
