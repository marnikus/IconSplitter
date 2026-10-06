import type { ScriptParserContext } from '../binaries/create-script-parser-context.ts';
import type { CatalogCounselor } from '../CatalogCounselor.ts';
import { type ConfigurationChief, type Workspace } from '../ConfigurationChief.ts';
import type { ConsoleStreamer } from '../ConsoleStreamer.ts';
import type { DependencyDeputy } from '../DependencyDeputy.ts';
import type { IssueCollector } from '../IssueCollector.ts';
import type { ProjectPrincipal } from '../ProjectPrincipal.ts';
import type { ModuleGraph } from '../types/module-graph.ts';
import type { MainOptions } from '../util/create-options.ts';
interface BuildOptions {
    chief: ConfigurationChief;
    collector: IssueCollector;
    counselor: CatalogCounselor;
    deputy: DependencyDeputy;
    principal: ProjectPrincipal;
    isGitIgnored: (path: string) => boolean;
    scriptParserContext: ScriptParserContext;
    streamer: ConsoleStreamer;
    workspaces: Workspace[];
    options: MainOptions;
}
export declare function build({ chief, collector, counselor, deputy, principal, isGitIgnored, scriptParserContext, streamer, workspaces, options, }: BuildOptions): Promise<{
    graph: ModuleGraph;
    entryPaths: Set<string>;
    analyzedFiles: Set<string>;
    unreferencedFiles: Set<string>;
    analyzeSourceFile: (filePath: string) => Promise<void>;
    enabledPluginsStore: Map<string, string[]>;
}>;
export {};
