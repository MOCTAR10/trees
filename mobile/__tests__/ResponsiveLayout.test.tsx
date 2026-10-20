import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

let mockDesktop = false;
jest.mock("../src/web/DesktopFrame", () => ({
  ...jest.requireActual("../src/web/DesktopFrame"),
  useDesktop: () => mockDesktop,
}));

jest.mock("../src/api/client", () => ({
  getInboxItems: jest.fn(async () => [
    { id: 41, type: "declarations", label: "Déclaration n° 41 · CFAD 07", org_name: "SFD", created_at: "2026-10-04T08:00:00Z", authority: "Direction Provinciale", province_code: "GA-6", province_name: "Ogooué-Ivindo" },
    { id: 3, type: "studies", label: "EIE · CFAD-12", org_name: "CBG", created_at: "2026-10-13T08:00:00Z", authority: "DGFAP / DGE", province_code: "GA-7", province_name: "Ogooué-Lolo" },
  ]),
  getProvinces: jest.fn(async () => [
    { code: "GA-6", name: "Ogooué-Ivindo", organisations: 1, titles: 1, surface_ha: 64000 },
    { code: "GA-7", name: "Ogooué-Lolo", organisations: 1, titles: 1, surface_ha: 5000 },
  ]),
  getOrganisationDirectory: jest.fn(async () => [
    { id: 10, org_type: "entreprise", name: "Société Forestière Démo", profile_code: "integre", profile_label: "Exploitant intégré", is_active: true, tax_id: null, email: null, phone: null, titles: 2, surface_ha: 64000, provinces: ["GA-6"], accounts: 6, documents_missing: 0, documents_pending: 0, taxes_overdue: 0 },
    { id: 11, org_type: "communaute", name: "Communauté de Mikongo", profile_code: "foret_communautaire", profile_label: "Forêt communautaire", is_active: true, tax_id: null, email: null, phone: null, titles: 1, surface_ha: 5000, provinces: ["GA-7"], accounts: 0, documents_missing: 0, documents_pending: 0, taxes_overdue: 1 },
  ]),
  listOrgProfiles: jest.fn(async () => []),
  getInboxDetail: jest.fn(async () => ({
    type: "declarations",
    id: 41,
    title: "Déclaration n° 41",
    subtitle: "CFAD 07",
    org_name: "SFD",
    province_name: "Ogooué-Ivindo",
    authority: "Direction Provinciale",
    created_at: "2026-10-04T08:00:00Z",
    facts: [{ label: "Pieds déclarés", value: "2" }],
    checks: [{ level: "ok", label: "AAC ouverte" }],
    items: [],
    blocking: false,
    approve_label: "Approuver",
  })),
  decideInbox: jest.fn(async () => ({})),
}));

import * as client from "../src/api/client";
import { ColumnChart, Donut } from "../src/design/charts";
import { CardGrid, DataTable, SplitPane, useDialog } from "../src/design/layout";
import DecisionScreen from "../src/screens/ministry/DecisionScreen";
import InboxScreen from "../src/screens/ministry/InboxScreen";
import OrganisationsScreen from "../src/screens/ministry/OrganisationsScreen";

const mocked = client as jest.Mocked<typeof client>;
const NOW = new Date("2026-10-14T08:00:00Z");

function layout(node: { props: { onLayout?: (e: unknown) => void } }, width: number) {
  act(() => node.props.onLayout?.({ nativeEvent: { layout: { width, height: 400, x: 0, y: 0 } } }));
}

afterEach(() => {
  mockDesktop = false;
});

describe("Responsive layout", () => {
  it("keeps cards in one column on the phone", () => {
    const view = render(
      <CardGrid testID="grid">
        <Text>a</Text>
        <Text>b</Text>
        <Text>c</Text>
      </CardGrid>,
    );
    const grid = view.getByTestId("grid");
    expect(grid.props.onLayout).toBeUndefined();
    expect(grid.props.style).not.toEqual(expect.arrayContaining([expect.objectContaining({ flexDirection: "row" })]));
  });

  it("flows cards in columns on the desktop, as many as the width allows", () => {
    mockDesktop = true;
    const view = render(
      <CardGrid testID="grid" minColumnWidth={380}>
        <Text>a</Text>
        <Text>b</Text>
        <Text>c</Text>
        <Text>d</Text>
      </CardGrid>,
    );
    layout(view.getByTestId("grid"), 1200);
    const grid = view.getByTestId("grid");
    expect(grid.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ flexDirection: "row" })]));
    expect(grid.children).toHaveLength(3);
    layout(view.getByTestId("grid"), 500);
    expect(view.getByTestId("grid").children).toHaveLength(4);
  });

  it("puts the side pane beside the content on the desktop only", () => {
    const phone = render(<SplitPane testID="split" main={<Text>main</Text>} side={<Text>side</Text>} sideFirstOnPhone />);
    expect(phone.getByTestId("split").props.style).toEqual({ gap: 12 });
    expect(phone.toJSON()).toMatchObject({ children: [{ children: ["side"] }, { children: ["main"] }] });
    mockDesktop = true;
    const desk = render(<SplitPane testID="split" main={<Text>main</Text>} side={<Text>side</Text>} sideWidth={300} />);
    expect(desk.getByTestId("split").props.style).toMatchObject({ flexDirection: "row" });
  });

  it("sorts a table by its headers and opens a row", () => {
    const onRow = jest.fn();
    const rows = [
      { id: "1", name: "Bois", n: 3 },
      { id: "2", name: "Azobé", n: 10 },
      { id: "3", name: "Coop", n: 1 },
    ];
    const view = render(
      <DataTable
        testID="t"
        rows={rows}
        rowKey={(r) => r.id}
        rowTestID={(r) => `row-${r.id}`}
        onRowPress={onRow}
        columns={[
          { key: "name", title: "Nom", sortValue: (r) => r.name, render: (r) => <Text>{r.name}</Text> },
          { key: "n", title: "Nombre", sortValue: (r) => r.n, render: (r) => <Text>{String(r.n)}</Text> },
        ]}
      />,
    );
    const order = () => view.getAllByTestId(/^row-/).map((n) => n.props.testID);
    expect(order()).toEqual(["row-1", "row-2", "row-3"]);
    fireEvent.press(view.getByTestId("t-sort-name"));
    expect(order()).toEqual(["row-2", "row-1", "row-3"]);
    fireEvent.press(view.getByTestId("t-sort-n"));
    expect(order()).toEqual(["row-3", "row-1", "row-2"]);
    fireEvent.press(view.getByTestId("t-sort-n"));
    expect(order()).toEqual(["row-2", "row-1", "row-3"]);
    fireEvent.press(view.getByTestId("row-3"));
    expect(onRow).toHaveBeenCalledWith(rows[2]);
  });

  it("opens sheets as centred dialogs on the desktop", () => {
    let dialog: ReturnType<typeof useDialog> | null = null;
    function Probe() {
      dialog = useDialog();
      return null;
    }
    render(<Probe />);
    expect(dialog!.animation).toBe("slide");
    expect(dialog!.sheet).toBeNull();
    mockDesktop = true;
    render(<Probe />);
    expect(dialog!.animation).toBe("fade");
    expect(dialog!.backdrop).toMatchObject({ justifyContent: "center", alignItems: "center" });
    expect(dialog!.sheet).toMatchObject({ maxWidth: 640 });
  });

  it("draws a donut legend and column labels", () => {
    const view = render(
      <>
        <Donut testID="d" data={[{ label: "Valide", value: 8 }, { label: "Expirée", value: 2 }, { label: "Vide", value: 0 }]} centerLabel="pièces" />
        <ColumnChart testID="c" data={[{ label: "Okoumé", value: 600, text: "600 m³" }]} />
      </>,
    );
    expect(view.getByText("10")).toBeTruthy();
    expect(view.getByText("Valide")).toBeTruthy();
    expect(view.queryByText("Vide")).toBeNull();
    expect(view.getByText("Okoumé")).toBeTruthy();
  });
});

describe("Ministry screens on the desktop", () => {
  beforeEach(() => {
    mockDesktop = true;
  });

  it("lists the files to decide in a sortable table, oldest first", async () => {
    const onOpenItem = jest.fn();
    const view = render(<InboxScreen onOpenDomain={jest.fn()} onOpenItem={onOpenItem} now={NOW} />);
    await act(async () => {});
    expect(view.getByTestId("inbox-table")).toBeTruthy();
    expect(view.getAllByTestId(/^inbox-item-/).map((n) => n.props.testID)).toEqual(["inbox-item-declarations-41", "inbox-item-studies-3"]);
    expect(view.getByText("il y a 10 j")).toBeTruthy();
    fireEvent.press(view.getByTestId("inbox-item-studies-3"));
    expect(onOpenItem).toHaveBeenCalledWith("studies", 3);
  });

  it("shows the organisations directory as a table", async () => {
    const onOpen = jest.fn();
    const view = render(<OrganisationsScreen onOpen={onOpen} />);
    await act(async () => {});
    expect(view.getByTestId("org-table")).toBeTruthy();
    expect(view.getByText("1 taxe en retard")).toBeTruthy();
    expect(view.getByText("64 000 ha")).toBeTruthy();
    fireEvent.press(view.getByTestId("org-11"));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 11 }));
  });

  it("keeps the decision panel beside the file", async () => {
    const view = render(<DecisionScreen type="declarations" id={41} onBack={jest.fn()} onDecided={jest.fn()} now={NOW} />);
    await act(async () => {});
    expect(mocked.getInboxDetail).toHaveBeenCalledWith("declarations", 41);
    expect(view.getByTestId("decision-side")).toBeTruthy();
    expect(view.getByText("Décision")).toBeTruthy();
    expect(view.getByTestId("decision-approve")).toBeTruthy();
  });
});
