import type { Input } from '../../util/input.ts';
type ResolveContentMapperOptions = (options: Record<string, unknown>) => Input[];
export declare const contentMapperResolvers: Map<string, ResolveContentMapperOptions>;
export {};
