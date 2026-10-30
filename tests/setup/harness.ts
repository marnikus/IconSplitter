// Node tests need no React/DOM infrastructure. DOM setup still runs before app imports.
if (typeof document !== "undefined") await import("./dom");
export {};
