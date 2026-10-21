import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("react-native-maps", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  const leaf = (name: string) => (props: any) => ReactLib.createElement(View, { testID: props.testID ?? name }, props.children);
  return { __esModule: true, default: leaf("map"), Marker: leaf("marker"), Circle: leaf("circle") };
});

jest.mock("../src/api/client", () => {
  class ProjectRefusal extends Error {}
  return {
    ProjectRefusal,
    listProjects: jest.fn(),
    getProject: jest.fn(),
    joinProject: jest.fn(async () => ({ id: 1, joined: true })),
    leaveProject: jest.fn(async () => ({ id: 1, joined: false })),
    acceptProjectInvitation: jest.fn(async () => ({ id: 2, status: "active" })),
    declineProjectInvitation: jest.fn(async () => ({ id: 2, status: "declined" })),
    inviteToProject: jest.fn(async () => ({ id: 1, invited: [] })),
  };
});

import * as client from "../src/api/client";
import { AuthUser, Project, ProjectDetail } from "../src/api/client";
import ProjectDetailScreen from "../src/screens/ProjectDetailScreen";
import ProjetsScreen from "../src/screens/ProjetsScreen";

const mocked = client as jest.Mocked<typeof client>;

const agent = { id: 9, email: "a@x", role: "operator", display_name: "Agent" } as AuthUser;

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 1,
    title: "Cartographie du Moabi",
    description: "",
    target_type: "species",
    target_value: "Baillonella toxisperma",
    objective: "cartographie",
    latitude: null,
    longitude: null,
    radius_km: null,
    status: "open",
    created_by: 1,
    created_at: "2026-10-01T00:00:00Z",
    participant_count: 4,
    scan_count: 12,
    kind: "participatif",
    participation: "open",
    my_status: null,
    ...overrides,
  };
}

function detail(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    ...project(),
    species_count: 1,
    contributor_count: 3,
    is_participant: false,
    my_scan_count: 0,
    contributions: [],
    ...overrides,
  };
}

const chantier = project({
  id: 2,
  title: "Chantier AAC 2026-1",
  kind: "chantier",
  participation: "invitation",
  my_status: "invited",
  aac_id: 25,
  aac_label: "HOB-AAC-1",
  company_name: "Hévéa Ogooué Bois",
  registry_trees: 10,
  registry_scanned: 3,
});
const joined = project({ id: 3, title: "Santé de l'Okoumé", objective: "sante", my_status: "active" });

describe("ProjetsScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("explains the two kinds and sorts mine from the projects open to join", async () => {
    mocked.listProjects.mockResolvedValue([project(), chantier, joined]);
    const view = render(<ProjetsScreen user={agent} onOpenProject={jest.fn()} onCreateProject={jest.fn()} onBack={jest.fn()} />);
    await waitFor(() => expect(view.getByTestId("projects-list")).toBeTruthy());
    expect(view.getByText("Chantiers & projets")).toBeTruthy();
    expect(view.getByTestId("projects-intro")).toHaveTextContent(/sur invitation/);
    expect(view.getByText("Mes chantiers & projets (2)")).toBeTruthy();
    expect(view.getByText("Ouverts à rejoindre (1)")).toBeTruthy();
    expect(view.getByTestId("project-kind-2")).toHaveTextContent("Chantier");
    expect(view.getByTestId("project-mine-2")).toHaveTextContent("Invité·e");
    expect(view.getByTestId("project-mine-3")).toHaveTextContent("Je participe");
    expect(view.getByTestId("project-card-2")).toHaveTextContent(/3\/10 arbres de l'AAC mesurés/);
    expect(view.getByTestId("project-action-2")).toHaveTextContent("Accepter");
    expect(view.getByTestId("project-action-3")).toHaveTextContent("Ouvrir");
    expect(view.queryByTestId("project-card-1")).toBeNull();
    expect(view.queryByTestId("projects-create")).toBeNull();
  });

  it("joins a project from its card, then shows it among mine", async () => {
    mocked.listProjects.mockResolvedValueOnce([project()]).mockResolvedValue([project({ my_status: "active" })]);
    const onScan = jest.fn();
    const view = render(
      <ProjetsScreen user={agent} onOpenProject={jest.fn()} onCreateProject={jest.fn()} onBack={jest.fn()} onScan={onScan} />,
    );
    await waitFor(() => expect(view.getByTestId("project-action-1")).toHaveTextContent("Rejoindre"));
    expect(view.getByTestId("project-mine-1")).toHaveTextContent("Non inscrit");
    await act(async () => fireEvent.press(view.getByTestId("project-action-1")));
    expect(mocked.joinProject).toHaveBeenCalledWith(1);
    await waitFor(() => expect(view.getByTestId("project-action-1")).toHaveTextContent("Scanner"));
    fireEvent.press(view.getByTestId("project-action-1"));
    expect(onScan).toHaveBeenCalledWith({ id: 1, title: "Cartographie du Moabi", kind: "participatif" });
  });

  it("shows the server's reason when an action is refused", async () => {
    mocked.listProjects.mockResolvedValue([project()]);
    mocked.joinProject.mockRejectedValueOnce(new client.ProjectRefusal("Projet clôturé"));
    const view = render(<ProjetsScreen user={agent} onOpenProject={jest.fn()} onCreateProject={jest.fn()} onBack={jest.fn()} />);
    await waitFor(() => expect(view.getByText("Ouverts à rejoindre (1)")).toBeTruthy());
    fireEvent.press(view.getByText("Ouverts à rejoindre (1)"));
    await act(async () => fireEvent.press(view.getByTestId("project-action-1")));
    expect(view.getByTestId("projects-error")).toHaveTextContent("Projet clôturé");
  });

  it("opens a card and offers creation to a company", async () => {
    mocked.listProjects.mockResolvedValue([joined, project({ id: 4, kind: "chantier", participation: "invitation", created_by: 9 })]);
    const onOpen = jest.fn();
    const onCreate = jest.fn();
    const company = { ...agent, role: "company" } as AuthUser;
    const view = render(<ProjetsScreen user={company} onOpenProject={onOpen} onCreateProject={onCreate} onBack={jest.fn()} />);
    await waitFor(() => expect(view.getByText("Mes chantiers & projets (2)")).toBeTruthy());
    fireEvent.press(view.getByText("Mes chantiers & projets (2)"));
    fireEvent.press(view.getByTestId("project-open-3"));
    expect(onOpen).toHaveBeenCalledWith(joined);
    expect(view.getByTestId("project-mine-4")).toHaveTextContent("Je gère");
    fireEvent.press(view.getByTestId("projects-create"));
    expect(onCreate).toHaveBeenCalled();
  });
});

describe("ProjectDetailScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("guides a newcomer: join first, zone spelled out, no old-scan attachment", async () => {
    mocked.getProject.mockResolvedValue(detail({ latitude: 0.4, longitude: 12.7, radius_km: 25 }));
    const view = render(<ProjectDetailScreen id={1} user={agent} onBack={jest.fn()} onScan={jest.fn()} />);
    await waitFor(() => expect(view.getByTestId("project-how")).toBeTruthy());
    expect(view.getByTestId("project-step-0").props.accessibilityState).toEqual({ selected: true });
    expect(view.getByTestId("project-step-0")).toHaveTextContent(/Rejoindre le projet/);
    expect(view.getByTestId("project-zone-text")).toHaveTextContent("Un cercle de 25 km autour du point du projet.");
    expect(view.getByTestId("circle")).toBeTruthy();
    expect(view.getByTestId("project-count-scans")).toHaveTextContent(/12/);
    expect(view.queryByText(/Contribuer/)).toBeNull();
    expect(view.queryByTestId("project-scan")).toBeNull();
    await act(async () => fireEvent.press(view.getByTestId("project-join")));
    expect(mocked.joinProject).toHaveBeenCalledWith(1);
  });

  it("a participant scans for the project from the page", async () => {
    mocked.getProject.mockResolvedValue(detail({ my_status: "active", is_participant: true }));
    const onScan = jest.fn();
    const view = render(<ProjectDetailScreen id={1} user={agent} onBack={jest.fn()} onScan={onScan} />);
    await waitFor(() => expect(view.getByTestId("project-scan")).toBeTruthy());
    expect(view.getByTestId("project-step-1").props.accessibilityState).toEqual({ selected: true });
    expect(view.getByTestId("project-zone-text")).toHaveTextContent(/Pas de zone fixée/);
    fireEvent.press(view.getByTestId("project-scan"));
    expect(onScan).toHaveBeenCalledWith({ id: 1, title: "Cartographie du Moabi", kind: "participatif" });
    expect(view.getByTestId("project-leave")).toBeTruthy();
  });

  it("on the web a participant is sent to the Android app to scan", async () => {
    mocked.getProject.mockResolvedValue(detail({ my_status: "active", is_participant: true, my_scan_count: 2 }));
    const view = render(<ProjectDetailScreen id={1} user={agent} onBack={jest.fn()} />);
    await waitFor(() => expect(view.getByTestId("project-scan-phone")).toBeTruthy());
    expect(view.getByTestId("project-step-2").props.accessibilityState).toEqual({ selected: true });
    expect(view.getByTestId("project-count-mine")).toHaveTextContent(/2/);
  });

  it("an invitation is accepted or declined; the AAC is the zone of a chantier", async () => {
    mocked.getProject.mockResolvedValue(detail({ ...chantier, is_participant: false, species_count: 0, contributor_count: 0, contributions: [] }));
    const view = render(<ProjectDetailScreen id={2} user={agent} onBack={jest.fn()} />);
    await waitFor(() => expect(view.getByTestId("project-accept")).toBeTruthy());
    expect(view.getByTestId("project-step-0")).toHaveTextContent(/Accepter l'invitation/);
    expect(view.getByTestId("project-zone-text")).toHaveTextContent(/L'AAC HOB-AAC-1/);
    await act(async () => fireEvent.press(view.getByTestId("project-accept")));
    expect(mocked.acceptProjectInvitation).toHaveBeenCalledWith(2);
  });

  it("an invitation-only project is not joinable, a closed one says so, refusals are shown", async () => {
    mocked.getProject.mockResolvedValueOnce(detail({ participation: "invitation" }));
    const view = render(<ProjectDetailScreen id={1} user={agent} onBack={jest.fn()} />);
    await waitFor(() => expect(view.getByTestId("project-invitation-only")).toBeTruthy());
    view.unmount();

    mocked.getProject.mockResolvedValueOnce(detail({ status: "closed" }));
    const closed = render(<ProjectDetailScreen id={1} user={agent} onBack={jest.fn()} />);
    await waitFor(() => expect(closed.getByTestId("project-closed")).toBeTruthy());
    closed.unmount();

    mocked.getProject.mockResolvedValue(detail());
    mocked.joinProject.mockRejectedValueOnce(new client.ProjectRefusal("Projet clôturé"));
    const refused = render(<ProjectDetailScreen id={1} user={agent} onBack={jest.fn()} />);
    await waitFor(() => expect(refused.getByTestId("project-join")).toBeTruthy());
    await act(async () => fireEvent.press(refused.getByTestId("project-join")));
    expect(refused.getByTestId("project-error")).toHaveTextContent("Projet clôturé");
  });

  it("the creator of a chantier is told they run it, not asked to join", async () => {
    mocked.getProject.mockResolvedValue(detail({ ...chantier, my_status: null, created_by: 9, participants: [] }));
    const view = render(<ProjectDetailScreen id={2} user={agent} onBack={jest.fn()} />);
    await waitFor(() => expect(view.getByTestId("project-owner")).toBeTruthy());
    expect(view.getByTestId("project-mine")).toHaveTextContent("Je gère");
    expect(view.queryByTestId("project-join")).toBeNull();
  });

  it("goes back where it was opened from", async () => {
    mocked.getProject.mockResolvedValue(detail());
    const onBack = jest.fn();
    const view = render(<ProjectDetailScreen id={1} user={agent} onBack={onBack} />);
    await waitFor(() => expect(view.getByTestId("project-how")).toBeTruthy());
    fireEvent.press(view.getByLabelText(/Retour/));
    expect(onBack).toHaveBeenCalled();
  });
});
