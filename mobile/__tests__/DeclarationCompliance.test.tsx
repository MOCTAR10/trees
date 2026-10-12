import { render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");

import DeclarationCompliance from "../src/components/DeclarationCompliance";

const mocked = client as jest.Mocked<typeof client>;

describe("DeclarationCompliance", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders blockers and warnings with human labels", async () => {
    mocked.assessFellingCompliance.mockResolvedValue({
      declaration_id: 50,
      blockers: [{ tree_code: "GA-DME", code: "below_dme" }],
      warnings: [
        { kind: "document", doc_type: "quittance_taxe_superficie", status: "manquant" },
        { code: "cites_listed", tree_code: "GA-CITES" },
      ],
      compliant: false,
    });
    mocked.listDocumentTypes.mockResolvedValue([
      {
        code: "quittance_taxe_superficie",
        label: "Quittance taxe de superficie",
        scope_type: "company",
        authority: null,
        validity_months: null,
        default_blocking: true,
        legal_ref: null,
      },
    ]);

    const { getByText } = render(<DeclarationCompliance declarationId={50} />);

    await waitFor(() => expect(getByText("1 point bloquant")).toBeTruthy());
    expect(getByText("GA-DME · Sous DME")).toBeTruthy();
    expect(getByText("Document non validé : Quittance taxe de superficie")).toBeTruthy();
    expect(getByText("GA-CITES · CITES")).toBeTruthy();
  });

  it("reports compliance when nothing is flagged", async () => {
    mocked.assessFellingCompliance.mockResolvedValue({
      declaration_id: 51,
      blockers: [],
      warnings: [],
      compliant: true,
    });
    mocked.listDocumentTypes.mockResolvedValue([]);

    const { getByText } = render(<DeclarationCompliance declarationId={51} />);
    await waitFor(() => expect(getByText("Conforme")).toBeTruthy());
  });
});
