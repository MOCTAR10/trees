import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");

import AdminDocuments from "../src/components/AdminDocuments";

const mocked = client as jest.Mocked<typeof client>;

describe("AdminDocuments", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists submitted documents and validates one", async () => {
    mocked.listDocuments.mockResolvedValue([
      {
        id: 100,
        scope_type: "company",
        scope_id: 10,
        doc_type: "agrement_exploitation",
        authority: "DGF",
        reference: "AGR-1",
        issued_at: null,
        expires_at: null,
        status: "soumis",
        created_at: "now",
      },
    ]);
    mocked.listOrganizations.mockResolvedValue([
      {
        id: 10,
        org_type: "entreprise",
        name: "Bois SA",
        legal_form: null,
        registration_no: null,
        tax_id: null,
        email: null,
        phone: null,
        address: null,
        profile_code: "exploitant_forestier",
        is_active: true,
        created_at: "now",
      },
    ]);
    mocked.listDocumentTypes.mockResolvedValue([
      {
        code: "agrement_exploitation",
        label: "Agrément exploitation",
        scope_type: "company",
        authority: null,
        validity_months: null,
        default_blocking: true,
        legal_ref: null,
      },
    ]);
    mocked.verifyDocument.mockResolvedValue({
      id: 100,
      scope_type: "company",
      scope_id: 10,
      doc_type: "agrement_exploitation",
      authority: "DGF",
      reference: "AGR-1",
      issued_at: null,
      expires_at: null,
      status: "valide",
      created_at: "now",
    });

    const { getByText, getByTestId } = render(<AdminDocuments />);
    await waitFor(() => expect(getByText("Agrément exploitation")).toBeTruthy());
    expect(getByText("Bois SA")).toBeTruthy();

    fireEvent.press(getByTestId("doc-approve-100"));
    await waitFor(() => expect(mocked.verifyDocument).toHaveBeenCalledWith(100, "valide", null));
  });
});
