import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");

import AdminUsers from "../src/components/AdminUsers";

const mocked = client as jest.Mocked<typeof client>;

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("AdminUsers", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists users and toggles their active state", async () => {
    mocked.listUsers.mockResolvedValue([
      {
        id: 4,
        email: "field@x",
        display_name: "Field",
        role: "operator",
        is_active: true,
        cooperative_id: null,
        company_id: 2,
      },
    ]);
    mocked.adminCooperatives.mockResolvedValue([]);
    mocked.setUserActive.mockResolvedValue({
      id: 4,
      email: "field@x",
      display_name: "Field",
      role: "operator",
      is_active: false,
      cooperative_id: null,
      company_id: 2,
    });

    const { getByText, getByRole } = render(<AdminUsers />);
    await flush();

    expect(getByText("field@x")).toBeTruthy();

    fireEvent(getByRole("switch"), "valueChange", false);
    await flush();

    expect(mocked.setUserActive).toHaveBeenCalledWith(4, false);
  });
});
