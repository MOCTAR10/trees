import { sortByText } from "../src/utils/text";

describe("sortByText", () => {
  it("sorts like French readers expect, accents ignored, without Intl", () => {
    const names = ["Okoumé", "azobé", "Ébène", "Moabi", "acajou"];
    expect(sortByText(names, (n) => n)).toEqual(["acajou", "azobé", "Ébène", "Moabi", "Okoumé"]);
  });

  it("keeps the input untouched and handles 3 000 items quickly", () => {
    const items = Array.from({ length: 3000 }, (_, i) => ({ name: `Espèce ${(i * 7919) % 3000}` }));
    const started = Date.now();
    const sorted = sortByText(items, (x) => x.name);
    expect(Date.now() - started).toBeLessThan(500);
    expect(sorted).toHaveLength(3000);
    expect(items[0].name).toBe("Espèce 0");
  });
});
