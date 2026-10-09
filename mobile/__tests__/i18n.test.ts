import { fr } from "../src/i18n/fr";

describe("i18n (fr)", () => {
  it("exposes a label for every role", () => {
    expect(Object.keys(fr.roles).sort()).toEqual([
      "admin",
      "company",
      "cooperative",
      "operator",
    ]);
    expect(fr.roles.company).toBe("Entreprise");
    expect(fr.roles.cooperative).toBe("Coopérative");
  });

  it("formats dynamic strings", () => {
    expect(fr.company.biomass(125)).toBe("125 kg");
    expect(fr.company.allocatedTo("Coop A")).toContain("Coop A");
    expect(fr.cooperative.distance(1.23)).toBe("1.2 km");
    expect(fr.cooperative.relevant(300.4)).toBe("300 kg pertinents");
    expect(fr.cooperative.match(0.75)).toBe("Pertinence 75 %");
  });

  it("maps residue statuses to labels", () => {
    expect(fr.company.status.available).toBe("Disponible");
    expect(fr.company.status.allocated).toBe("Alloué");
    expect(fr.company.status.collected).toBe("Collecté");
  });
});
