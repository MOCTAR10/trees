import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

jest.mock("../src/pdf", () => ({
  exportControlPdf: jest.fn(async () => "file://pv.pdf"),
  sharePdf: jest.fn(async () => undefined),
}));

jest.mock("../src/api/client", () => ({
  fileAnnualStatement: jest.fn(async (year: number) => ({
    id: 1, period_year: year, stems_felled: 12, volume_m3: 96.5, reference: `EA-${year}-0010`,
    filed_at: "2026-10-14T10:00:00Z", due: `${year + 1}-03-31`, late: true,
  })),
  getCompanySpace: jest.fn(async () => ({
    organization: { id: 10, name: "Société Forestière Démo", org_type: "entreprise", profile_code: "integre" },
    todo: [
      { kind: "document", level: "risk", label: "Agrément professionnel : manquant", target: "documents" },
      { kind: "to_fell", level: "info", label: "1 arbre(s) autorisé(s) à abattre", target: "grumes", count: 1 },
      { kind: "statement", level: "risk", label: "État annuel 2025 à transmettre", target: "tracabilite", year: 2025 },
    ],
    decisions: [
      {
        kind: "declarations",
        id: 41,
        label: "Déclaration n° 41 · CFAD-01",
        status: "rejetee",
        outcome: "rejet",
        motif: "Tiges sous le DME",
        decided_at: "2026-10-10T08:00:00Z",
        acting_authority: "Ministère des Eaux et Forêts",
        competent_codes: ["DP"],
        competent_names: ["Directions Provinciales des Eaux et Forêts"],
        competence_note: "…",
      },
      {
        kind: "studies",
        id: 3,
        label: "EIE · CFAD-01",
        status: "valide",
        outcome: "accord",
        motif: null,
        decided_at: null,
        acting_authority: "Ministère des Eaux et Forêts",
        competent_codes: ["DGFAP", "DGE"],
        competent_names: [],
        competence_note: "…",
      },
    ],
    anomalies: [
      { type: "below_dme", severity: "hard", label: "Arbre abattu sous le diamètre minimum (DME)", subject: "GA-DEMO-001", detail: "55 cm < 70 cm", aac_label: null, detected_at: null },
    ],
    controls: [
      { id: 2, control_type: "route", result: "non_conforme", tree_code: "GA-DEMO-009", transport_document_id: null, aac_id: 29, aac_label: null, org_id: 10, org_name: "SFD", notes: "Grume sans bordereau", pv_reference: "PV-DEMO-002", controlled_by_name: "Admin", controlled_at: "2026-10-13T08:00:00Z" },
    ],
  })),
  getAuthorityCompass: jest.fn(async () => ({
    acting_authority: "Ministère des Eaux et Forêts",
    authorities: [
      { code: "DGF", name: "Direction Générale des Forêts", mission: "Titres", actions: ["Instruire les titres"], controls: ["route"], pending: 2, interface: "a_venir", acting_authority: "Ministère des Eaux et Forêts" },
      { code: "ANPN", name: "Agence Nationale des Parcs Nationaux", mission: "Parcs", actions: ["Avis"], controls: [], pending: 0, interface: "a_venir", acting_authority: "Ministère des Eaux et Forêts" },
    ],
  })),
}));

import * as client from "../src/api/client";
import CompanyNav, { groupOf } from "../src/components/CompanyNav";
import * as pdf from "../src/pdf";
import CompanyHomeScreen from "../src/screens/CompanyHomeScreen";
import AuthoritiesScreen from "../src/screens/ministry/AuthoritiesScreen";

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("Company space and authority compass", () => {
  it("lists actions due, decisions with their reason, anomalies and controls", async () => {
    const onOpen = jest.fn();
    const view = render(<CompanyHomeScreen onOpen={onOpen} />);
    await flush();
    expect(view.getByText("Société Forestière Démo")).toBeTruthy();
    fireEvent.press(view.getByTestId("todo-to_fell-1"));
    expect(onOpen).toHaveBeenCalledWith("grumes");
    expect(view.getByTestId("decision-declarations-41")).toHaveTextContent(/Motif : Tiges sous le DME/);
    expect(view.getByTestId("decision-declarations-41")).toHaveTextContent(/Réalisé par le Ministère des Eaux et Forêts · DP/);
    expect(view.getByTestId("decision-declarations-41")).toHaveTextContent(/Refusé/);
    expect(view.getByTestId("decision-studies-3")).toHaveTextContent(/Accordé/);
    expect(view.getByTestId("company-anomalies")).toHaveTextContent(/GA-DEMO-001/);
    expect(view.getByTestId("company-control-2")).toHaveTextContent(/PV PV-DEMO-002/);
    fireEvent.press(view.getByTestId("company-control-pdf-2"));
    await flush();
    expect(pdf.exportControlPdf).toHaveBeenCalledWith(2, "PV-DEMO-002");
    expect(pdf.sharePdf).toHaveBeenCalledWith("file://pv.pdf");
  });

  it("transmits the annual statement from the to-do list", async () => {
    const view = render(<CompanyHomeScreen onOpen={jest.fn()} />);
    await flush();
    fireEvent.press(view.getByTestId("file-statement-2025"));
    await flush();
    expect(client.fileAnnualStatement).toHaveBeenCalledWith(2025);
    expect(view.getByTestId("company-notice")).toHaveTextContent("État annuel transmis hors délai · EA-2025-0010");
  });

  it("groups the company screens into work areas", () => {
    expect(groupOf("grumes")).toBe("exploitation");
    expect(groupOf("cert")).toBe("conformite");
    const onChange = jest.fn();
    const labels = {
      accueil: "Accueil", abattage: "Abattage", grumes: "Grumes", tracabilite: "Traçabilité", documents: "Pièces",
      titres: "Titres", cert: "Certifications", taxes: "Taxes", fiscal: "Fiscalité", residues: "Résidus",
      equipe: "Équipe", usine: "Usine",
    };
    const view = render(<CompanyNav tab="grumes" labels={labels} onChange={onChange} />);
    expect(view.getByTestId("company-tab-tracabilite")).toBeTruthy();
    expect(view.queryByTestId("company-tab-documents")).toBeNull();
    fireEvent.press(view.getByTestId("company-group-conformite"));
    expect(onChange).toHaveBeenCalledWith("documents");
  });

  it("shows every stakeholder the Ministry acts for, with its future interface", async () => {
    const view = render(<AuthoritiesScreen />);
    await flush();
    expect(view.getByTestId("authorities-screen")).toHaveTextContent(/Ministère des Eaux et Forêts réalise toutes les actions/);
    expect(view.getByTestId("authority-DGF")).toHaveTextContent(/2 dossier\(s\) en attente/);
    expect(view.getByTestId("authority-DGF")).toHaveTextContent(/Contrôle en route/);
    expect(view.getByTestId("authority-ANPN")).toHaveTextContent(/Interface dédiée à venir/);
  });
});
