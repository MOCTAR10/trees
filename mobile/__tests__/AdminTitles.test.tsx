import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");
jest.mock("../src/pdf");

import AdminTitles from "../src/components/AdminTitles";

const mocked = client as jest.Mocked<typeof client>;

const title = {
  id: 30,
  title_type: "CFAD" as const,
  reference: "T-1",
  holder_org_id: 10,
  surface_ha: 5000,
  status: "demande" as const,
  created_at: "now",
};

const organizations = [
  {
    id: 10,
    org_type: "entreprise" as const,
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
];

describe("AdminTitles", () => {
  beforeEach(() => jest.clearAllMocks());

  it("records a title decision", async () => {
    mocked.listTitles.mockResolvedValue([title]);
    mocked.listOrganizations.mockResolvedValue(organizations);
    mocked.decideTitle.mockResolvedValue({
      id: 30,
      title_type: "CFAD",
      reference: "T-1",
      status: "exploration",
    });

    const { getByText, getByTestId } = render(<AdminTitles />);
    await waitFor(() => expect(getByText("Bois SA", { exact: false })).toBeTruthy());

    fireEvent.press(getByTestId("decide-30-exploration"));
    await waitFor(() => expect(mocked.decideTitle).toHaveBeenCalledWith(30, "exploration", null));
  });

  it("requires a motif before rejecting", async () => {
    mocked.listTitles.mockResolvedValue([title]);
    mocked.listOrganizations.mockResolvedValue(organizations);
    mocked.decideTitle.mockResolvedValue({
      id: 30,
      title_type: "CFAD",
      reference: "T-1",
      status: "rejete",
    });

    const { getByText, getByTestId, getByPlaceholderText } = render(<AdminTitles />);
    await waitFor(() => expect(getByText("Bois SA", { exact: false })).toBeTruthy());

    fireEvent.press(getByTestId("decide-30-rejete"));
    fireEvent.press(getByTestId("motif-submit"));
    expect(mocked.decideTitle).not.toHaveBeenCalled();
    expect(getByText("Motif requis pour un rejet.")).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText("Motif (requis pour un rejet)"), "Dossier incomplet");
    fireEvent.press(getByTestId("motif-submit"));

    await waitFor(() =>
      expect(mocked.decideTitle).toHaveBeenCalledWith(30, "rejete", "Dossier incomplet"),
    );
  });
});
