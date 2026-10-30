/** Context Fold plugin: model-driven, reversible context compression. */

export { planFold, appendFold, deriveFoldRecords, FoldError } from './fold.ts'
export type { FoldPlan, FoldRecord } from './fold.ts'
export { registerFoldTools } from './tools.ts'
export type { ResolvedFoldConfig, CompressValue } from './tools.ts'
export { COMPRESS_DESCRIPTION, COMPRESS_PHILOSOPHY, FOLD_SECTION } from './prompts.ts'
export { registerFoldSection } from './section.ts'
