import { render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");
jest.mock("../src/pdf");

import AdminDashboard from "../src/components/AdminDashboard";

const mocked = client as jest.Mocked<typeof client>;

const overview: client.DashboardOverview = {
  generated_at: "2026-01-01T00:00:00+00:00",
  harvest: {
    registry_stems: 4,
    stems_felled: 3,
    estimated_volume_m3: 12.5,
    by_species: [{ species: "Aucoumea klaineana", stems: 2, volume_m3: 9.1 }],
    by_status: { abattu: 1, transporte: 1, transforme: 1 },
    transformation_rate: 0.3333,
  },
  titles: { total: 3, by_status: {}, surface_ha: 10000 },
  aac: { total: 1, by_status: {}, possibility_m3: 15000 },
  documents: { total: 6, by_status: {}, expired: 1, expiring_soon: 2 },
  taxes: {
    dues_total: 4,
    overdue: 2,
    settled: 1,
    overdue_amount_fcfa: 900000,
    receipts: 1,
    receipts_amount_fcfa: 300000,
  },
  community: {
    agreements: 2,
    active: 1,
    contribution_fcfa: 4000000,
    annual_volume_m3: 5000,
    avg_fdl_rate: 800,
  },
  transport: { documents: 3, volume_m3: 250.5 },
  certifications: {
    total: 2,
    by_status: {},
    by_scheme: [{ scheme: "FSC", count: 1, surface_ha: 10000 }],
  },
};

describe("AdminDashboard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders harvest volumes and governance rollups", async () => {
    mocked.dashboardOverview.mockResolvedValue(overview);

    const { getByTestId, getByText } = render(<AdminDashboard />);
    await waitFor(() => expect(getByTestId("admin-dashboard")).toBeTruthy());

    expect(getByTestId("dashboard-card-transform")).toBeTruthy();
    expect(getByText("33.3 %")).toBeTruthy();
    expect(getByText("Aucoumea klaineana")).toBeTruthy();
    expect(getByText("900 000 FCFA")).toBeTruthy();
    expect(getByText("FSC")).toBeTruthy();
  });
});
