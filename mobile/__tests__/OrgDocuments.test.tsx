import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");

import OrgDocuments from "../src/components/OrgDocuments";

const mocked = client as jest.Mocked<typeof client>;

const org = {
  id: 10,
  org_type: "entreprise" as const,
  name: "Bois SA",
  legal_form: null,
  registration_no: "RCCM-1",
  tax_id: null,
  email: null,
  phone: null,
  address: null,
  profile_code: "exploitant_forestier",
  profile_label: "Exploitant forestier",
  is_active: true,
  created_at: "now",
};

describe("OrgDocuments", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders the checklist and submits a document", async () => {
    mocked.myOrganization.mockResolvedValue({
      organization: org,
      checklist: [
        { doc_type: "agrement_exploitation", label: "Agrément exploitation", status: "manquant" },
      ],
    });
    mocked.uploadDocument.mockResolvedValue({
      id: 1,
      scope_type: "company",
      scope_id: 10,
      doc_type: "agrement_exploitation",
      authority: null,
      reference: "AGR-1",
      issued_at: null,
      expires_at: null,
      status: "soumis",
      created_at: "now",
    });

    const { getByText, getByTestId, getByPlaceholderText } = render(<OrgDocuments />);
    await waitFor(() => expect(getByText("Bois SA")).toBeTruthy());

    expect(getByText("Agrément exploitation")).toBeTruthy();
    expect(getByText("Manquant")).toBeTruthy();

    fireEvent.press(getByTestId("doc-update-agrement_exploitation"));
    fireEvent.changeText(getByPlaceholderText("Référence"), "AGR-1");
    fireEvent.press(getByTestId("doc-submit"));

    await waitFor(() => expect(mocked.uploadDocument).toHaveBeenCalledTimes(1));
    expect(mocked.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        scope_type: "company",
        scope_id: 10,
        doc_type: "agrement_exploitation",
        reference: "AGR-1",
      }),
    );
    await waitFor(() => expect(getByText("Document transmis au Ministère.")).toBeTruthy());
  });

  it("shows a friendly message when no organization is linked", async () => {
    mocked.myOrganization.mockRejectedValue(new Error("Organization 409"));
    const { getByText } = render(<OrgDocuments />);
    await waitFor(() =>
      expect(getByText(/Aucune organisation liée à ce compte/)).toBeTruthy(),
    );
  });
});
