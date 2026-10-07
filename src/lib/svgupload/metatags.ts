// metatags.ts — the seven keywords every answer must contain (design §9, C1).
// Alone in a module because both the validator and the prompt quote them, and a
// cycle between those two would be the only reason to duplicate the list.

export const REQUIRED_TAGS: readonly string[] = ["icon", "pictogram", "vector", "stroke", "line", "editable", "web"];
