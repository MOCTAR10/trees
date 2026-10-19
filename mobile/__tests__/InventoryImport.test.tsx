import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("../src/pdf");

const okPreview = {
  aac: { id: 400, label: "PILOTE-AAC 2026-2", status: "soumis", ufa_label: "UFA 1", title_reference: "CFAD-01" },
  file_name: "inventaire.csv",
  format: "csv",
  model_version: "proposition-2026-10",
  summary: { rows: 3, ok: 2, warnings: 1, errors: 0, to_fell: 2, kept: 1 },
  file_issues: [{ code: "ignored_column", label: "Colonne non reconnue, ignorée", detail: "couleur" }],
  can_confirm: true,
  rows: [
    { line: 2, numero_arbre: "412", reference_aac: "AAC 2026-2", essence: "Okoumé", scientific_name: "Aucoumea klaineana", diametre_cm: 96, dme_cm: null, destination: "abattre", level: "ok", issues: [] },
    { line: 3, numero_arbre: null, reference_aac: "AAC 2026-2", essence: "Padouk", scientific_name: "Pterocarpus soyauxii", diametre_cm: 88.5, dme_cm: null, destination: "abattre", level: "warning", issues: [{ code: "cites_listed", label: "Essence CITES", column: "essence", level: "warning" }] },
    { line: 4, numero_arbre: "414", reference_aac: "AAC 2026-2", essence: "Moabi", scientific_name: "Baillonella toxisperma", diametre_cm: 120, dme_cm: null, destination: "preserver", level: "ok", issues: [] },
  ],
};

jest.mock("../src/api/client", () => {
  class InventoryRefusal extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return {
    InventoryRefusal,
    listFellingAacOptions: jest.fn(async () => [
      { id: 400, label: "PILOTE-AAC 2026-2", status: "soumis", campaign_year: 2026, ufa_label: "UFA 1", title_id: 3, title_type: "CFAD", title_reference: "CFAD-01", blocker: "no_authorization" },
      { id: 401, label: "PILOTE-AAC 2025-1", status: "ferme", campaign_year: 2025, ufa_label: "UFA 1", title_id: 3, title_type: "CFAD", title_reference: "CFAD-01", blocker: "aac_closed" },
    ]),
    getInventoryModel: jest.fn(async () => ({
      version: "proposition-2026-10",
      max_rows: 5000,
      max_file_mb: 5,
      help: "Une ligne par tige.",
      columns: [
        { key: "essence", required: true, kind: "texte", example: "Okoumé", help: "Nom scientifique ou commercial.", legal: "Art. 31 et 61", values: [] },
        { key: "a_abattre", required: true, kind: "oui / non", example: "oui", help: "« non » : arbre à préserver.", legal: "Art. 122", values: ["oui", "non"] },
      ],
    })),
    listInventoryImports: jest.fn(async () => []),
    previewInventory: jest.fn(),
    confirmInventory: jest.fn(),
  };
});

import { confirmInventory, InventoryRefusal, listInventoryImports, previewInventory } from "../src/api/client";
import { exportInventoryPlatesPdf, exportInventoryTemplate, shareFile, sharePdf } from "../src/pdf";
import InventoryImportScreen from "../src/screens/InventoryImportScreen";

const file = { name: "inventaire.csv", blob: new Blob(["x"]) };

describe("InventoryImportScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("previews a file, shows rows to review, confirms and prints the plates", async () => {
    (previewInventory as jest.Mock).mockResolvedValue(okPreview);
    (confirmInventory as jest.Mock).mockResolvedValue({
      ...okPreview,
      import: { id: 9, created_at: "2026-10-19T10:00:00Z", stems_created: 3, tree_codes: ["GA-1", "GA-I9-00002", "GA-3"] },
    });
    (exportInventoryPlatesPdf as jest.Mock).mockResolvedValue("file://plaques.pdf");
    const { getByTestId, getByText, queryByTestId } = render(
      <InventoryImportScreen onBack={jest.fn()} initialAacId={400} pickFile={async () => file} />,
    );
    await waitFor(() => expect(getByTestId("inventory-aac-400")).toBeTruthy());
    expect(getByText("Import possible")).toBeTruthy();
    expect(getByText("Import impossible")).toBeTruthy();

    fireEvent.press(getByTestId("inventory-pick"));
    await waitFor(() => expect(getByTestId("inventory-preview")).toBeTruthy());
    expect(previewInventory).toHaveBeenCalledWith(400, file);
    expect(getByText("Colonne non reconnue, ignorée : couleur")).toBeTruthy();
    expect(getByTestId("inventory-row-3")).toBeTruthy();
    expect(queryByTestId("inventory-row-2")).toBeNull();
    expect(getByText(/sans numéro/)).toBeTruthy();
    expect(getByText(/Diamètre 88,5 cm/)).toBeTruthy();

    fireEvent.press(getByTestId("inventory-confirm"));
    await waitFor(() => expect(getByTestId("inventory-done")).toBeTruthy());
    expect(confirmInventory).toHaveBeenCalledWith(400, file);
    expect(getByText("3 tiges inscrites au registre")).toBeTruthy();
    expect(listInventoryImports).toHaveBeenCalledTimes(2);

    fireEvent.press(getByTestId("inventory-plates"));
    await waitFor(() => expect(sharePdf).toHaveBeenCalledWith("file://plaques.pdf"));
    expect(exportInventoryPlatesPdf).toHaveBeenCalledWith(9);
  });

  it("blocks the confirmation while a row is in error", async () => {
    (previewInventory as jest.Mock).mockResolvedValue({
      ...okPreview,
      summary: { ...okPreview.summary, errors: 1 },
      can_confirm: false,
      rows: [
        { ...okPreview.rows[0], level: "error", issues: [{ code: "below_dme", label: "Sous le DME de l'UFA (art. 124)", column: "diametre_cm", level: "error" }] },
      ],
    });
    const { getByTestId, getByText, queryByTestId } = render(
      <InventoryImportScreen onBack={jest.fn()} initialAacId={400} pickFile={async () => file} />,
    );
    await waitFor(() => expect(getByTestId("inventory-aac-400")).toBeTruthy());
    fireEvent.press(getByTestId("inventory-pick"));
    await waitFor(() => expect(getByTestId("inventory-blocked")).toBeTruthy());
    expect(queryByTestId("inventory-confirm")).toBeNull();
    expect(getByText("Sous le DME de l'UFA (art. 124)")).toBeTruthy();
  });

  it("shows the server's refusal and disables upload on a closed AAC", async () => {
    (previewInventory as jest.Mock).mockRejectedValue(new InventoryRefusal("Colonne(s) obligatoire(s) absente(s) : a_abattre", 422));
    const { getByTestId, getByText } = render(
      <InventoryImportScreen onBack={jest.fn()} initialAacId={400} pickFile={async () => file} />,
    );
    await waitFor(() => expect(getByTestId("inventory-aac-400")).toBeTruthy());
    fireEvent.press(getByTestId("inventory-pick"));
    await waitFor(() => expect(getByTestId("inventory-error")).toBeTruthy());
    expect(getByText("Colonne(s) obligatoire(s) absente(s) : a_abattre")).toBeTruthy();
    fireEvent.press(getByTestId("inventory-aac-401"));
    expect(getByTestId("inventory-pick").props.accessibilityState?.disabled).toBe(true);
  });

  it("explains the columns and downloads the templates; phones send the file from the web", async () => {
    (exportInventoryTemplate as jest.Mock).mockResolvedValue("file://modele.xlsx");
    const { getByTestId, getByText } = render(<InventoryImportScreen onBack={jest.fn()} />);
    await waitFor(() => expect(getByTestId("inventory-guide-toggle")).toBeTruthy());
    expect(getByTestId("inventory-web-only")).toBeTruthy();
    fireEvent.press(getByTestId("inventory-guide-toggle"));
    expect(getByTestId("inventory-column-a_abattre")).toBeTruthy();
    expect(getByText(/Valeurs : oui, non/)).toBeTruthy();
    fireEvent.press(getByTestId("inventory-template-xlsx"));
    await waitFor(() => expect(shareFile).toHaveBeenCalledWith("file://modele.xlsx", expect.stringContaining("spreadsheetml")));
  });
});
