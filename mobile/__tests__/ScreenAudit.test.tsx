/**
 * Screen audit — every Ministry, organisation and operator screen rendered with
 * REAL server data (the pilot dataset).
 *
 * AUDIT_RECORD=1 → requests go to the live API (AUDIT_API, default http://localhost:8000)
 * with the pilot accounts and the responses are saved to fixtures/screen-audit.json
 * (login tokens are never saved). Default → the saved responses are replayed, so CI
 * checks the screens against the real contract without a server.
 *
 * A screen fails the audit if it crashes, shows `undefined` / `null` / `NaN` /
 * `[object Object]` / `Invalid Date`, shows an error state, logs an unexpected
 * console error, or makes a request that has no recorded response.
 */
import { act, fireEvent, render } from "@testing-library/react-native";
import fs from "fs";
import http from "http";
import path from "path";
import React from "react";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3, High: 4 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: -0.77, longitude: 13.61, accuracy: 5 } })),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
}));
jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));
jest.mock("react-native-maps", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  const MapView = ReactLib.forwardRef((props: any, ref: any) => {
    ReactLib.useImperativeHandle(ref, () => ({ animateToRegion: jest.fn(), fitToCoordinates: jest.fn() }));
    return ReactLib.createElement(View, { testID: props.testID }, props.children);
  });
  const leaf = (name: string) => (props: any) =>
    ReactLib.createElement(View, { testID: props.testID ?? name }, props.children);
  return { __esModule: true, default: MapView, Marker: leaf("marker"), Polygon: leaf("polygon"),
    UrlTile: leaf("url-tile"), Callout: leaf("callout"), Polyline: leaf("polyline"), Circle: leaf("circle") };
});
jest.mock("expo-sensors", () => ({
  DeviceMotion: { isAvailableAsync: jest.fn(async () => false), addListener: jest.fn(() => ({ remove: jest.fn() })), setUpdateInterval: jest.fn() },
  Accelerometer: { isAvailableAsync: jest.fn(async () => false), addListener: jest.fn(() => ({ remove: jest.fn() })), setUpdateInterval: jest.fn() },
}));

process.env.EXPO_PUBLIC_API_URL = "http://audit.local";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const client = require("../src/api/client");

const RECORD = process.env.AUDIT_RECORD === "1";
const LIVE = process.env.AUDIT_API ?? "http://localhost:8000";
const FIXTURE = path.join(__dirname, "fixtures", "screen-audit.json");
const PASSWORD = "Pilote2026!";
const ACCOUNTS: Record<string, string> = {
  admin: "mef.dp2@pilote.ga",
  company: "hob.dg@pilote.ga",
  sawmill: "sdl.dg@pilote.ga",
  agent: "hob.agent1@pilote.ga",
  cooperative: "can.pres@pilote.ga",
};

type Recorded = { status: number; body: unknown };
const store: Record<string, Recorded> = RECORD || !fs.existsSync(FIXTURE) ? {} : JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const missing = new Set<string>();
let role = "admin";
let pending = 0;
const tokens: Record<string, string> = {};

function live(method: string, url: string, body?: string, token?: string): Promise<Recorded> {
  const target = new URL(url, LIVE);
  return new Promise((resolve, reject) => {
    const req = http.request(
      target,
      { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          const type = String(res.headers["content-type"] ?? "");
          let parsed: unknown = null;
          if (type.includes("application/json")) {
            try {
              parsed = JSON.parse(raw.toString("utf8"));
            } catch {
              parsed = null;
            }
          } else {
            parsed = { __binary: type, bytes: raw.length };
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function response(rec: Recorded): any {
  return {
    ok: rec.status >= 200 && rec.status < 300,
    status: rec.status,
    headers: { get: () => null },
    json: async () => rec.body,
    text: async () => JSON.stringify(rec.body),
    blob: async () => ({}),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

beforeAll(() => {
  (global as any).fetch = async (input: string, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const pathPart = String(input).replace("http://audit.local", "");
    const key = `${role} ${method} ${pathPart}`;
    if (RECORD) {
      pending += 1;
      try {
        if (!store[key]) store[key] = await live(method, pathPart, init.body as string | undefined, tokens[role]);
      } finally {
        pending -= 1;
      }
      return response(store[key]);
    }
    const rec = store[key];
    if (!rec) {
      missing.add(key);
      return response({ status: 599, body: { detail: "no recorded response" } });
    }
    return response(rec);
  };
});

afterAll(() => {
  if (RECORD) {
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    const sorted = Object.fromEntries(Object.keys(store).sort().map((k) => [k, store[k]]));
    fs.writeFileSync(FIXTURE, JSON.stringify(sorted, null, 1));
  }
});

async function signIn(as: string) {
  role = as;
  if (RECORD && !tokens[as]) {
    const res = await live("POST", "/api/auth/login", JSON.stringify({ email: ACCOUNTS[as], password: PASSWORD }));
    tokens[as] = (res.body as any).access_token ?? (res.body as any).token;
  }
  client.setAuthToken(RECORD ? tokens[as] : "replay");
}

const flush = async (rounds = 6) => {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  for (let guard = 0; pending > 0 && guard < 400; guard += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
  }
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
};

const BAD_TEXT = /(^|[^\p{L}])(undefined|NaN|null|\[object Object\]|Invalid Date)([^\p{L}]|$)/u;
const ERROR_TEXT = /(Erreur|Impossible de charger|Chargement impossible|Opération impossible|introuvable|no recorded response)/i;

const LEGIBILITY: [string, RegExp][] = [
  ["code interne affiché", /(^|[\s(·:])[a-z]{3,}_[a-z_]{3,}($|[\s),·:])/],
  ["horodatage brut", /\d{4}-\d{2}-\d{2}T\d{2}:/],
  ["date non formatée", /(^|[^\d/])\d{4}-\d{2}-\d{2}($|[^\d])/],
  ["séparateur décimal anglais", /\d\.\d+\s?(m³|m3|km|ha|cm|kg|t|%|FCFA)\b/],
  ["séparateur orphelin", /^\s*·\s*$|·\s*$|^\s*·/],
];

function joined(node: any): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(joined).join("");
  return node.children ? node.children.map(joined).join("") : "";
}

/** One string per outermost <Text> (nested styled fragments joined), as the user reads it. */
function lines(node: any, out: string[] = []): string[] {
  if (node == null || typeof node === "string") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => lines(n, out));
    return out;
  }
  if (node.type === "Text") {
    const value = joined(node);
    if (value.trim()) out.push(value);
    return out;
  }
  if (node.children) node.children.forEach((c: any) => lines(c, out));
  return out;
}

function texts(node: any, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => texts(n, out));
    return out;
  }
  if (node.children) texts(node.children, out);
  return out;
}

type Finding = { screen: string; kind: string; detail: string };
const findings: Finding[] = [];
const rendered: string[] = [];
let consoleErrors: string[] = [];

beforeEach(() => {
  consoleErrors = [];
  jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" ").slice(0, 300));
  });
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

async function audit(name: string, element: React.ReactElement, interact?: (view: ReturnType<typeof render>) => Promise<void>) {
  let view: ReturnType<typeof render> | null = null;
  try {
    view = render(element);
    await flush();
    if (interact) {
      await interact(view);
      await flush();
    }
  } catch (err) {
    findings.push({ screen: name, kind: "crash", detail: String(err).slice(0, 300) });
    return;
  }
  const all = lines(view.toJSON());
  const { ActivityIndicator } = require("react-native");
  const spinners = view.UNSAFE_queryAllByType(ActivityIndicator).length;
  if (spinners) findings.push({ screen: name, kind: "chargement sans fin", detail: `${spinners} indicateur(s)` });
  rendered.push(`${name} : ${all.length} textes — ${all.slice(0, 6).join(" | ").slice(0, 140)}`);
  for (const t of all) {
    if (BAD_TEXT.test(t)) findings.push({ screen: name, kind: "texte invalide", detail: t.slice(0, 160) });
    if (ERROR_TEXT.test(t)) findings.push({ screen: name, kind: "état d'erreur", detail: t.slice(0, 160) });
    for (const [kind, rx] of LEGIBILITY) {
      if (rx.test(t)) findings.push({ screen: name, kind, detail: t.slice(0, 160) });
    }
  }
  for (const e of consoleErrors) {
    if (!/not wrapped in act|ReactDOMTestUtils|useNativeDriver|VirtualizedLists/.test(e)) {
      findings.push({ screen: name, kind: "console.error", detail: e });
    }
  }
  view.unmount();
}

const noop = () => undefined;

describe("Audit des écrans avec données réelles", () => {
  it("Ministère, organisations et opérateurs : aucun défaut visible", async () => {
    const MinistryHome = require("../src/screens/ministry/MinistryHomeScreen").default;
    const Inbox = require("../src/screens/ministry/InboxScreen").default;
    const Decision = require("../src/screens/ministry/DecisionScreen").default;
    const Organisations = require("../src/screens/ministry/OrganisationsScreen").default;
    const Organisation = require("../src/screens/ministry/OrganisationScreen").default;
    const Menu = require("../src/screens/ministry/MenuScreen").default;
    const Domain = require("../src/screens/ministry/DomainScreen").default;
    const Company = require("../src/screens/CompanyScreen").default;
    const Cooperative = require("../src/screens/CooperativeScreen").default;
    const Home = require("../src/screens/HomeScreen").default;
    const Chantier = require("../src/screens/ChantierScreen").default;
    const Projets = require("../src/screens/ProjetsScreen").default;
    const ProjectDetail = require("../src/screens/ProjectDetailScreen").default;
    const Profile = require("../src/screens/ProfileScreen").default;
    const Custody = require("../src/screens/CustodyScreen").default;
    const Declare = require("../src/screens/DeclareScreen").default;
    const InventoryImport = require("../src/screens/InventoryImportScreen").default;
    const CreateProject = require("../src/screens/CreateProjectScreen").default;
    const Species = require("../src/screens/SpeciesScreen").default;
    const SpeciesDetail = require("../src/screens/SpeciesDetailScreen").default;
    const MapScreen = require("../src/screens/MapScreen").default;
    const MillRegister = require("../src/components/MillRegister").default;
    const { ThemeProvider } = require("../src/design/ThemeProvider");
    const { SafeAreaProvider } = require("react-native-safe-area-context");
    const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
    const wrap = (el: React.ReactElement, dark = false) => (
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider force={dark ? "dark" : undefined}>{el}</ThemeProvider>
      </SafeAreaProvider>
    );

    // ---- Ministère -------------------------------------------------------
    await signIn("admin");
    await audit("Ministère · Tableau de bord", wrap(<MinistryHome firstName="Paul" onOpenInbox={noop} onOpenOrgs={noop} onOpenDomain={noop} />));
    await audit("Ministère · À traiter", wrap(<Inbox onOpenDomain={noop} onOpenItem={noop} />));
    const items: any[] = await client.getInboxItems();
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.type)) continue;
      seen.add(item.type);
      await audit(`Ministère · Décision ${item.type}`, wrap(<Decision type={item.type} id={item.id} onBack={noop} onDecided={noop} />));
    }
    await audit("Ministère · Organisations", wrap(<Organisations onOpen={noop} />));
    const directory: any[] = await client.getOrganisationDirectory();
    for (const org of directory.filter((o) => /Haut-Ogooué|Lambaréné|Massaha|Ntoum/.test(o.name)).slice(0, 4)) {
      await audit(`Ministère · Fiche ${org.name}`, wrap(<Organisation id={org.id} onBack={noop} />));
      if (/Lambaréné/.test(org.name)) {
        await audit(`Ministère · Registre ${org.name}`, wrap(<MillRegister mode="admin" orgId={org.id} />));
      }
    }
    await audit("Ministère · Menu", wrap(<Menu onOpen={noop} onLogout={noop} />));
    for (const key of ["stats", "titres", "comptes", "declarations", "documents", "etudes", "certifications",
      "anomalies", "tracabilite", "controles", "autorites", "fiscal", "especes"]) {
      await audit(`Ministère · Domaine ${key}`, wrap(<Domain domain={key} onBack={noop} />));
    }
    await audit("Ministère · Carte", wrap(<MapScreen />));

    // ---- Entreprise intégrée et scierie ---------------------------------
    for (const who of ["company", "sawmill"]) {
      await signIn(who);
      const me = await client.getMe();
      const label = who === "company" ? "Entreprise" : "Scierie";
      const tabs = ["accueil", "equipe", "abattage", "grumes", "tracabilite", "usine", "documents", "titres", "cert", "taxes", "fiscal", "residues"];
      for (const tab of tabs) {
        await audit(`${label} · onglet ${tab}`, wrap(<Company user={me} onLogout={noop} showHeader={false} />, true), async (view) => {
          const groups: Record<string, string> = { equipe: "accueil", usine: "exploitation", abattage: "exploitation", grumes: "exploitation", tracabilite: "exploitation",
            documents: "conformite", titres: "conformite", cert: "conformite", taxes: "finances", fiscal: "finances", residues: "circulaire" };
          if (groups[tab]) fireEvent.press(view.getByTestId(`company-group-${groups[tab]}`));
          await flush();
          const sub = view.queryByTestId(`company-tab-${tab}`);
          if (sub) fireEvent.press(sub);
        });
      }
      if (who === "company") {
        await audit("Entreprise · Déclarer", wrap(<Declare onDone={noop} onBack={noop} />, true));
        await audit("Entreprise · Importer un inventaire", wrap(<InventoryImport onBack={noop} />, true));
        await audit("Entreprise · Projets", wrap(<Projets user={me} onOpenProject={noop} onCreateProject={noop} onBack={noop} />));
        await audit("Entreprise · Nouveau chantier", wrap(<CreateProject onDone={noop} onBack={noop} />));
      }
    }

    // ---- Coopérative -----------------------------------------------------
    await signIn("cooperative");
    const coop = await client.getMe();
    await audit("Coopérative · Espace", wrap(<Cooperative user={coop} onLogout={noop} showHeader={false} />, true));

    // ---- Agent de terrain ------------------------------------------------
    await signIn("agent");
    const agent = await client.getMe();
    const summary = await client.getHomeSummary();
    await audit("Agent · Accueil", wrap(<Home scanCount={0} pendingCount={0} syncing={false} onNew={noop} onHistory={noop}
      onSync={noop} firstName={agent.first_name} matricule={agent.matricule} summary={summary} onOpenScan={noop} />));
    const projects: any[] = await client.listProjects();
    const chantier = projects.find((p) => p.kind === "chantier");
    if (chantier) {
      await audit("Agent · Chantier", wrap(<Chantier id={chantier.id} onBack={noop} onScan={noop} />));
      await audit("Agent · Détail projet", wrap(<ProjectDetail id={chantier.id} user={agent} onBack={noop} />));
    }
    await audit("Agent · Projets", wrap(<Projets user={agent} onOpenProject={noop} onCreateProject={noop} onBack={noop} />));
    await audit("Agent · Profil", wrap(<Profile user={agent} onLogout={noop} onBack={noop} />));
    const trees: any[] = await client.listRegistryTrees();
    const felled = trees.find((t) => t.status === "abattu") ?? trees[0];
    await audit("Agent · Suivi des grumes", wrap(<Custody onBack={noop} />), async (view) => {
      if (!felled) return;
      fireEvent.changeText(view.getByTestId("custody-code"), felled.tree_code);
      fireEvent.press(view.getByTestId("custody-check"));
    });
    await audit("Agent · Espèces", wrap(<Species />));
    await audit("Agent · Fiche espèce", wrap(<SpeciesDetail name="Aucoumea klaineana" onBack={noop} />));
    await audit("Agent · Carte", wrap(<MapScreen />));

    if (missing.size) {
      findings.push(...[...missing].map((k) => ({ screen: "replay", kind: "réponse non enregistrée", detail: k })));
    }
    const report = findings.map((f) => `- [${f.kind}] ${f.screen} : ${f.detail}`).join("\n");
    if (process.env.AUDIT_REPORT) {
      fs.writeFileSync(process.env.AUDIT_REPORT, `${report || "Aucun défaut."}\n\n--- Écrans rendus ---\n${rendered.join("\n")}\n`);
    }
    expect(report).toBe("");
  }, 300000);
});
