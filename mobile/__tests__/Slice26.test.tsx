import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

jest.mock("../src/pdf", () => ({
  exportControlPdf: jest.fn(async () => "file://pv.pdf"),
  exportMillRegisterPdf: jest.fn(async () => "file://registre.pdf"),
  sharePdf: jest.fn(async () => undefined),
}));

const followup = {
  id: 7,
  control_id: 2,
  action_type: "amende",
  label: "Amende",
  amount_fcfa: 500000,
  reference: "AM-1",
  due_at: "2026-11-30",
  status: "notifie",
  display_status: "notifie",
  status_label: "Notifiée",
  notes: null,
  reply: null,
  decision_motif: null,
  close_motif: null,
  org_id: 10,
  org_name: "SFD",
  pv_reference: "PV-2",
};

jest.mock("../src/api/client", () => ({
  listMyAgents: jest.fn(async () => [
    { id: 30, email: "nze@x", display_name: "Nzé Obiang", first_name: "Nzé", last_name: "Obiang", matricule: "AGT-1", is_active: true, created_at: "2026-10-01", last_scan_at: "2026-10-14T09:00:00Z" },
    { id: 31, email: "old@x", display_name: "Ancien Agent", first_name: null, last_name: null, matricule: null, is_active: false, created_at: "2026-01-01", last_scan_at: null },
  ]),
  createMyAgent: jest.fn(async (input: { first_name: string; last_name: string; email: string }) => ({
    id: 32, email: input.email, display_name: `${input.first_name} ${input.last_name}`, is_active: true,
  })),
  setMyAgentActive: jest.fn(async (id: number, active: boolean) => ({ id, is_active: active })),
  getMillRegister: jest.fn(async () => ({
    org_id: 20,
    year: 2026,
    inputs: [{ id: 4, reference: "BR-4", received_at: "2026-10-02T10:00:00Z", volume_m3: 24.5, tree_codes: ["L-1", "L-2"], logs: 2, from_org: "HOB" }],
    outputs: [{ id: 1, produced_on: "2026-10-10", product_type: "sciage", product_label: "Sciages", species_scientific_name: null, volume_m3: 21.2, tree_codes: ["L-2"], lot_reference: "LOT-1", destination: "local", notes: null }],
    stock: [{ tree_code: "L-1", species_scientific_name: "Aucoumea klaineana" }],
    totals: { input_m3: 24.5, output_m3: 21.2, yield_pct: 86.5, max_yield_pct: 80, alert: true, logs_received: 2, logs_in_stock: 1 },
  })),
  recordMillOutput: jest.fn(async () => ({ id: 2, transformed: ["L-1"] })),
  addControlFollowup: jest.fn(async () => followup),
  setFollowupStatus: jest.fn(async () => ({ ...followup, status: "execute" })),
  contestFollowup: jest.fn(async () => ({ ...followup, status: "conteste" })),
  getCompanySpace: jest.fn(async () => ({
    organization: { id: 10, name: "SFD", org_type: "entreprise", profile_code: "integre" },
    todo: [
      { kind: "control_followup", level: "risk", label: "Amende de 500 000 FCFA avant le 30/11/2026", target: "accueil", followup_id: 7, can_contest: true },
    ],
    decisions: [],
    anomalies: [],
    controls: [],
  })),
  fileAnnualStatement: jest.fn(),
}));

import * as client from "../src/api/client";
import CompanyAgents from "../src/components/CompanyAgents";
import MillRegister from "../src/components/MillRegister";
import * as pdf from "../src/pdf";
import CompanyHomeScreen from "../src/screens/CompanyHomeScreen";
import ControlFollowups from "../src/screens/ministry/ControlFollowups";

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("Slice 26 — team, transformation register, control follow-ups", () => {
  it("the company opens and suspends its own agents", async () => {
    const view = render(<CompanyAgents />);
    await flush();
    expect(view.getByTestId("agent-row-30")).toHaveTextContent(/Nzé Obiang/);
    expect(view.getByTestId("agent-row-30")).toHaveTextContent(/Dernier scan le 14\/10\/2026/);
    expect(view.getByTestId("agent-row-31")).toHaveTextContent(/Suspendu/);
    fireEvent.press(view.getByTestId("agent-add"));
    fireEvent.changeText(view.getByTestId("agent-first_name"), "Awa");
    fireEvent.changeText(view.getByTestId("agent-last_name"), "Mba");
    fireEvent.changeText(view.getByTestId("agent-email"), "awa@x");
    fireEvent.changeText(view.getByTestId("agent-password"), "court");
    fireEvent.press(view.getByTestId("agent-create"));
    expect(view.getByTestId("agents-notice")).toHaveTextContent(/au moins 8 caractères/);
    fireEvent.changeText(view.getByTestId("agent-password"), "Secret123");
    fireEvent.press(view.getByTestId("agent-create"));
    await flush();
    expect(client.createMyAgent).toHaveBeenCalledWith({
      first_name: "Awa", last_name: "Mba", email: "awa@x", password: "Secret123", matricule: null,
    });
    expect(view.getByTestId("agents-notice")).toHaveTextContent("Compte créé pour Awa Mba — connexion : awa@x");
    fireEvent.press(view.getByTestId("agent-toggle-30"));
    await flush();
    expect(client.setMyAgentActive).toHaveBeenCalledWith(30, false);
  });

  it("the mill records a lot from its received logs and sees its yield alert", async () => {
    const view = render(<MillRegister mode="company" />);
    await flush();
    expect(view.getByTestId("mill-yield")).toHaveTextContent(/86,5/);
    expect(view.getByTestId("mill-alert")).toHaveTextContent(/80 %/);
    expect(view.getByTestId("mill-outputs")).toHaveTextContent(/LOT-1 · Sciages/);
    expect(view.getByTestId("mill-inputs")).toHaveTextContent(/BR-4/);
    fireEvent.press(view.getByTestId("mill-submit"));
    expect(view.getByTestId("mill-notice")).toHaveTextContent(/Choisissez les grumes/);
    fireEvent.press(view.getByTestId("mill-log-L-1"));
    fireEvent.press(view.getByTestId("mill-product-placage"));
    fireEvent.changeText(view.getByTestId("mill-volume"), "3,5");
    fireEvent.press(view.getByTestId("mill-submit"));
    await flush();
    expect(client.recordMillOutput).toHaveBeenCalledWith(
      expect.objectContaining({ product_type: "placage", volume_m3: 3.5, tree_codes: ["L-1"] }),
    );
    expect(view.getByTestId("mill-notice")).toHaveTextContent(/1 grume passée « Transformé »/);
    fireEvent.press(view.getByTestId("mill-pdf"));
    await flush();
    expect(pdf.exportMillRegisterPdf).toHaveBeenCalledWith(null, 2026);
  });

  it("the Ministry reads an organisation's register without the lot form", async () => {
    const view = render(<MillRegister mode="admin" orgId={20} />);
    await flush();
    expect(client.getMillRegister).toHaveBeenLastCalledWith(20);
    expect(view.queryByTestId("mill-form")).toBeNull();
  });

  it("the Ministry notifies a follow-up, then marks it executed", async () => {
    const onChanged = jest.fn();
    const view = render(<ControlFollowups controlId={2} followups={[]} onChanged={onChanged} />);
    fireEvent.press(view.getByTestId("followup-add-2"));
    fireEvent.press(view.getByTestId("followup-type-amende"));
    fireEvent.changeText(view.getByTestId("followup-amount"), "500 000");
    fireEvent.changeText(view.getByTestId("followup-due"), "2026-11-30");
    fireEvent.press(view.getByTestId("followup-save-2"));
    await flush();
    expect(client.addControlFollowup).toHaveBeenCalledWith(2, {
      action_type: "amende", amount_fcfa: 500000, due_at: "2026-11-30", reference: null, notes: null,
    });
    expect(onChanged).toHaveBeenCalled();
    view.rerender(<ControlFollowups controlId={2} followups={[followup as never]} onChanged={onChanged} />);
    expect(view.getByTestId("followup-7")).toHaveTextContent(/échéance 30\/11\/2026/);
    fireEvent.press(view.getByTestId("followup-execute-7"));
    await flush();
    expect(client.setFollowupStatus).toHaveBeenCalledWith(7, "execute");
  });

  it("the organisation contests a follow-up from its to-do list", async () => {
    const view = render(<CompanyHomeScreen onOpen={jest.fn()} />);
    await flush();
    fireEvent.press(view.getByTestId("contest-7"));
    fireEvent.press(view.getByTestId("contest-send-7"));
    expect(view.getByTestId("company-notice")).toHaveTextContent(/Indiquez le motif/);
    fireEvent.changeText(view.getByTestId("contest-reply-7"), "Bordereau BR-12 présenté");
    fireEvent.press(view.getByTestId("contest-send-7"));
    await flush();
    expect(client.contestFollowup).toHaveBeenCalledWith(7, "Bordereau BR-12 présenté");
    expect(view.getByTestId("company-notice")).toHaveTextContent(/le Ministère statuera/);
  });
});
