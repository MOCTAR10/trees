import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");

import OrgBackfill from "../src/components/OrgBackfill";

const mocked = client as jest.Mocked<typeof client>;

const orphan = {
  id: 2,
  email: "company@forestry.local",
  display_name: "Scierie Demo",
  role: "company" as const,
  created_at: "now",
};

const result = {
  created: [{ id: 20, org_type: "entreprise" as const, name: "Scierie Demo", legacy_user_id: 2 }],
  linked: [{ id: 2, email: "company@forestry.local", organization_id: 20 }],
  created_count: 1,
  linked_count: 1,
};

describe("OrgBackfill", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists legacy accounts and attaches them", async () => {
    mocked.listOrphanAccounts.mockResolvedValueOnce([orphan]).mockResolvedValueOnce([]);
    mocked.backfillAccounts.mockResolvedValue(result);

    const { getByTestId, getByText, queryByTestId } = render(<OrgBackfill />);
    await waitFor(() => expect(getByTestId("orphan-2")).toBeTruthy());

    fireEvent.press(getByTestId("backfill-accounts"));

    await waitFor(() => expect(mocked.backfillAccounts).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getByText(/organisation\(s\) créée\(s\)/)).toBeTruthy());
    // The list is refreshed: nothing left to attach.
    await waitFor(() => expect(queryByTestId("orphan-2")).toBeNull());
    expect(getByTestId("backfill-none")).toBeTruthy();
  });

  it("shows an all-clear when every account is already attached", async () => {
    mocked.listOrphanAccounts.mockResolvedValue([]);
    const { getByTestId } = render(<OrgBackfill />);
    await waitFor(() => expect(getByTestId("backfill-none")).toBeTruthy());
  });

  it("notifies the parent after a successful backfill", async () => {
    mocked.listOrphanAccounts.mockResolvedValue([orphan]);
    mocked.backfillAccounts.mockResolvedValue(result);
    const onBackfilled = jest.fn();

    const { getByTestId } = render(<OrgBackfill onBackfilled={onBackfilled} />);
    await waitFor(() => expect(getByTestId("backfill-accounts")).toBeTruthy());
    fireEvent.press(getByTestId("backfill-accounts"));

    await waitFor(() => expect(onBackfilled).toHaveBeenCalled());
  });
});
