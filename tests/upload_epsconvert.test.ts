// RULE 8 — the EPS converter catalog is the dropdown's one list (D1): two
// real converters, junk ids become builtin, the row line names the choice.
import { describe, expect, it } from "vitest";
import { EPS_CONVERTERS, converterOf, epsSettingLine, writerOf } from "../src/lib/upload/epsconvert/catalog";
import { readConverter } from "../src/lib/upload/epsconvert/id";

describe("catalog", () => {
  it("lists builtin and inkscape with the dropdown labels", () => {
    expect(EPS_CONVERTERS.map((c) => c.id)).toEqual(["builtin", "inkscape"]);
    expect(converterOf("builtin").label).toBe("Built-in (EPS 10 subset)");
    expect(converterOf("inkscape").label).toBe("Inkscape CLI");
    expect(writerOf("builtin")).toBe("builtin-subset-1");
    expect(writerOf("inkscape")).toBe("inkscape-cli");
    expect(converterOf("inkscape").needsHost).toBe(true);
    expect(converterOf("builtin").verifyProfile).toBe("eps10");
    expect(converterOf("inkscape").verifyProfile).toBe("generic");
  });

  it("readConverter maps stored values; junk and missing become builtin (RULE 13)", () => {
    expect(readConverter("inkscape")).toBe("inkscape");
    expect(readConverter("builtin")).toBe("builtin");
    expect(readConverter("ghostscript")).toBe("builtin");
    expect(readConverter(undefined)).toBe("builtin");
    expect(readConverter(1)).toBe("builtin");
  });

  it("the row line names whether EPS is on and which converter", () => {
    expect(epsSettingLine(false, "inkscape")).toBe("eps off");
    expect(epsSettingLine(true, "builtin")).toBe("eps on · builtin");
    expect(epsSettingLine(true, "inkscape")).toBe("eps on · inkscape");
  });
});
