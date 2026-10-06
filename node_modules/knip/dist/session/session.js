import { run } from '../run.js';
import { createPreprocessor, toReporterOptions } from '../util/preprocessor.js';
import { buildFileDescriptor } from './file-descriptor.js';
import { buildPackageJsonDescriptor } from './package-json-descriptor.js';
export const createSession = async (options) => {
    const { session, results } = await run(options);
    if (!session)
        throw new Error('Unable to initialize watch session');
    const adapter = {
        handleFileChanges: session.handleFileChanges,
        getIssues: session.getIssues,
        getResults: () => results,
        describeFile: (filePath, opts) => buildFileDescriptor(filePath, options.cwd, session.getGraph(), session.getEntryPaths(), opts),
        describePackageJson: () => buildPackageJsonDescriptor(session.getGraph(), session.getEntryPaths()),
    };
    if (options.preprocessor.length === 0)
        return adapter;
    const input = toReporterOptions(options, results);
    const preprocess = await createPreprocessor(options.preprocessor);
    const updateResults = async () => {
        const data = await preprocess({ ...input, ...structuredClone(session.getIssues()) });
        results.issues = data.issues;
        results.counters = data.counters;
        results.tagHints = data.tagHints;
        results.configurationHints = data.configurationHints;
    };
    await updateResults();
    adapter.handleFileChanges = async (changes) => {
        const update = await session.handleFileChanges(changes);
        if (update)
            await updateResults();
        return update;
    };
    adapter.getIssues = () => results;
    return adapter;
};
