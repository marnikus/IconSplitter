// Deliberately mutable: separate test files must never see each other's module state.
export const isolatedCounter = { value: 0 };
