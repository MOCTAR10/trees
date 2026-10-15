import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppFonts } from './src/design/fonts';
import { useServerStatus } from './src/utils/useServerStatus';
import { ThemeProvider, useTheme } from './src/design/ThemeProvider';
import { EmptyState } from './src/design/ui';
import { fr } from './src/i18n/fr';
import { colors, spacing, type } from './src/theme';
import { sharePdf, exportPlanPdf, exportReportPdf } from './src/pdf';
import { acceptProjectInvitation, AuthUser, companyProfile, cooperativeProfile, declineProjectInvitation, getHomeSummary, getMe, HomeProject, HomeSummary, InboxQueueKey, joinProject, pingGateway, processScanV1, processScanV2, setUnauthorizedHandler, V1Report, V2Response } from './src/api/client';
import type { CaptureResult } from './src/screens/CaptureScreen';
import CompanyScreen from './src/screens/CompanyScreen';
import CooperativeScreen from './src/screens/CooperativeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import ReportScreen from './src/screens/ReportScreen';
import BottomNav from './src/components/BottomNav';
import DesktopFrame, { useDesktop } from './src/web/DesktopFrame';
import WebFieldNotice from './src/web/WebFieldNotice';
import ErrorBoundary from './src/components/ErrorBoundary';
import LoadingScreen from './src/components/LoadingScreen';
import RouteLoader from './src/components/RouteLoader';
import RoleHeader, { HeaderCoords } from './src/components/RoleHeader';
import SpeciesScreen from './src/screens/SpeciesScreen';
import SpeciesDetailScreen from './src/screens/SpeciesDetailScreen';

// Heavy native modules (camera, maps) load only when first opened,
// keeping cold start fast.
const CaptureScreen = React.lazy(() => import('./src/screens/CaptureScreen'));
const MapScreen = React.lazy(() => import('./src/screens/MapScreen'));
const ValorizationScreen = React.lazy(() => import('./src/screens/ValorizationScreen'));
const ProjectDetailScreen = React.lazy(() => import('./src/screens/ProjectDetailScreen'));
const ChantierScreen = React.lazy(() => import('./src/screens/ChantierScreen'));
import CreateProjectScreen from './src/screens/CreateProjectScreen';
import ProjetsScreen from './src/screens/ProjetsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import MinistryHomeScreen from './src/screens/ministry/MinistryHomeScreen';
import InboxScreen from './src/screens/ministry/InboxScreen';
import OrganisationsScreen from './src/screens/ministry/OrganisationsScreen';
import OrganisationScreen from './src/screens/ministry/OrganisationScreen';
import MenuScreen from './src/screens/ministry/MenuScreen';
import DomainScreen from './src/screens/ministry/DomainScreen';
import DecisionScreen from './src/screens/ministry/DecisionScreen';
import CustodyScreen from './src/screens/CustodyScreen';
import type { DomainKey } from './src/screens/ministry/shared';
import { applySession, clearSession, loadSession, saveSession, Session } from './src/storage/session';
import { clearScans, deleteScan, loadScans, newScanId, saveScan, StoredScan, updateScanValorization } from './src/storage/history';
import { copyToOutbox, enqueue, flushQueue, isNetworkError, loadQueue } from './src/storage/queue';
import { bindCatalogueLifecycle, ensureCatalogue } from './src/storage/catalogueStore';

type Phase =
  | 'home'
  | 'analyzing'
  | 'report'
  | 'valorizing'
  | 'valorization'
  | 'error'
  | 'history'
  | 'species'
  | 'speciesDetail'
  | 'map'
  | 'profile'
  | 'projects'
  | 'projectDetail'
  | 'projectCreate'
  | 'capture'
  | 'chantier'
  | 'inbox'
  | 'orgs'
  | 'menu'
  | 'domain'
  | 'decision'
  | 'custody'
  | 'organisation';

const TAB_PHASES: Phase[] = ['home', 'species', 'map', 'history', 'inbox', 'orgs', 'menu'];
const DESIGNED_PHASES: Phase[] = ['report', 'profile', 'valorization', 'analyzing', 'valorizing', 'error', 'capture', 'chantier', 'domain', 'decision', 'custody', 'organisation'];


function Shell({ band, children }: { band: boolean; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.safe, { backgroundColor: band ? t.c.forest : colors.background }]}
    >
      <StatusBar style="light" />
      <View style={[styles.body, { backgroundColor: band ? t.c.bg : colors.background }]}>{children}</View>
    </SafeAreaView>
  );
}

function BottomInset({ kind }: { kind: 'nav' | 'page' | 'band' | 'legacy' }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const bg = kind === 'nav' ? t.c.surface : kind === 'page' ? t.c.bg : kind === 'band' ? t.c.forest : colors.background;
  return <View style={{ height: insets.bottom, backgroundColor: bg }} />;
}

export default function App() {
  const fontsReady = useAppFonts();
  const desktop = useDesktop();
  const [phase, setPhase] = useState<Phase>("home");
  const [valorization, setValorization] = useState<V2Response | null>(null);
  const [report, setReport] = useState<V1Report | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [busyProjectId, setBusyProjectId] = useState<number | null>(null);
  const [scanProject, setScanProject] = useState<Pick<HomeProject, "id" | "title" | "kind"> | null>(null);
  const [chantierReturn, setChantierReturn] = useState<Phase>("home");
  const [inboxType, setInboxType] = useState<InboxQueueKey | null>(null);
  const [decisionItem, setDecisionItem] = useState<{ type: InboxQueueKey; id: number } | null>(null);
  const [inboxKey, setInboxKey] = useState(0);
  const [orgProvince, setOrgProvince] = useState<string | null>(null);
  const [domainKey, setDomainKey] = useState<DomainKey>("stats");
  const [domainReturn, setDomainReturn] = useState<Phase>("menu");
  const [orgId, setOrgId] = useState<number | null>(null);
  const [historyReturn, setHistoryReturn] = useState(false);
  const [scans, setScans] = useState<StoredScan[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState<"report" | "plan" | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [headerCoords, setHeaderCoords] = useState<HeaderCoords | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [isPending, startTransition] = React.useTransition();

  const requestPhase = useCallback((next: Phase) => {
    startTransition(() => setPhase(next));
  }, []);

  const resolveOrg = useCallback(async (u: AuthUser) => {
    try {
      if (u.role === "company" || u.role === "operator") {
        const p = await companyProfile();
        setOrgName(p.organization);
      } else if (u.role === "cooperative") {
        const p = await cooperativeProfile();
        setOrgName(p.organization);
      } else {
        setOrgName(null);
      }
    } catch {
      setOrgName(null);
    }
  }, []);

  useEffect(() => {
    // When any authenticated call returns 401 the stored token is no longer
    // valid (expired/revoked). Drop the session so the user returns to login
    // rather than seeing stale cached data while every request silently fails.
    setUnauthorizedHandler(() => {
      applySession(null);
      void clearSession();
      setUser(null);
      setOrgName(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const failsafe = setTimeout(() => {
      if (!cancelled) setBootstrapping(false);
    }, 10000);
    const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
      ]);
    (async () => {
      const [online, session] = await Promise.all([
        withTimeout(pingGateway(), 4000, false),
        withTimeout(loadSession(), 2500, null),
      ]);
      if (cancelled) return;
      if (!session) {
        setBootstrapping(false);
        return;
      }
      applySession(session);
      if (!online) {
        setUser(session.user);
        setBootstrapping(false);
        return;
      }
      try {
        const me = await Promise.race([
          getMe(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("session timeout")), 4000),
          ),
        ]);
        if (cancelled) return;
        setUser(me);
        void resolveOrg(me);
      } catch {
        if (cancelled) return;
        applySession(null);
        await clearSession();
        setUser(null);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })().finally(() => clearTimeout(failsafe));
    return () => {
      cancelled = true;
      clearTimeout(failsafe);
    };
  }, [resolveOrg]);

  useEffect(() => {
    if (!user) return;
    const unbind = bindCatalogueLifecycle();
    void ensureCatalogue();
    const task = InteractionManager.runAfterInteractions(() => {
      void import('./src/screens/CaptureScreen');
      void import('./src/screens/MapScreen');
      void import('./src/screens/ValorizationScreen');
      void import('./src/screens/ProjectDetailScreen');
      void import('./src/screens/ChantierScreen');
    });
    return () => {
      task.cancel();
      unbind();
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setHeaderCoords(null);
      return;
    }
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== "granted") return;
        try {
          const last = await Location.getLastKnownPositionAsync();
          if (!cancelled && last) {
            setHeaderCoords({ latitude: last.coords.latitude, longitude: last.coords.longitude });
          }
        } catch {
          // Fall through to the live watcher.
        }
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 25 },
          (pos) => {
            setHeaderCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          },
        );
      } catch {
        // Row falls back to the "locating" label.
      }
    })();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [user]);

  const handleLogin = useCallback(async (session: Session) => {
    applySession(session);
    await saveSession(session);
    setUser(session.user);
    void resolveOrg(session.user);
  }, [resolveOrg]);

  const handleLogout = useCallback(async () => {
    applySession(null);
    await clearSession();
    setUser(null);
    setOrgName(null);
    setSummary(null);
    setPhase("home");
  }, []);

  const refreshSummary = useCallback(async () => {
    try {
      setSummary(await getHomeSummary());
    } catch {
      // Offline: the Accueil falls back to what the phone knows.
    }
  }, []);

  useEffect(() => {
    if (user?.role === "operator" && phase === "home") void refreshSummary();
  }, [user?.role, phase, refreshSummary]);

  const projectAction = useCallback(
    async (id: number, action: (projectId: number) => Promise<unknown>) => {
      setBusyProjectId(id);
      try {
        await action(id);
        await refreshSummary();
      } catch (err) {
        console.error("project action failed", err);
        Alert.alert(fr.appTitle, fr.home.joinError);
      } finally {
        setBusyProjectId(null);
      }
    },
    [refreshSummary],
  );

  const handleUserUpdate = useCallback(async (next: AuthUser) => {
    setUser(next);
    const session = await loadSession();
    if (session) await saveSession({ ...session, user: next });
  }, []);

  const refreshScans = useCallback(async () => {
    setScans(await loadScans());
  }, []);

  const refreshQueue = useCallback(async () => {
    setQueueCount((await loadQueue()).length);
  }, []);

  const mountedRef = useRef(false);

  useEffect(() => {
    if (user) {
      setPhase("home");
    }
  }, [user?.role]);

  const syncingRef = useRef(false);
  const syncQueue = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      // Fail fast offline instead of burning a timeout per queued item.
      if (!(await pingGateway())) {
        return;
      }
      const { synced } = await flushQueue({
        onV1Success: async (entry, report) => {
          await saveScan({
            id: entry.scan_id,
            created_at: entry.created_at,
            latitude: entry.latitude,
            longitude: entry.longitude,
            report,
            valorization: null,
          });
        },
        onV2Success: async (entry, v2) => {
          if (entry.scan_id) await updateScanValorization(entry.scan_id, v2);
        },
      });
      if (synced > 0) {
        Alert.alert(fr.home.syncDoneTitle, fr.home.syncDoneMsg(synced));
      }
    } catch (err) {
      console.error("queue sync failed", err);
    } finally {
      await refreshScans();
      await refreshQueue();
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [refreshScans, refreshQueue]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      syncQueue();
    }
  }, [syncQueue]);

  const { status: serverStatus } = useServerStatus(!!user, () => {
    void syncQueue();
    void refreshSummary();
  });

  const goHome = useCallback(() => {
    setScanProject(null);
    setReport(null);
    setValorization(null);
    setCoords(null);
    setActiveScanId(null);
    setHistoryReturn(false);
    setExporting(null);
    startTransition(() => setPhase("home"));
  }, []);

  const goHistory = useCallback(() => {
    refreshScans();
    startTransition(() => setPhase("history"));
  }, [refreshScans]);

  const handleCaptured = async (capture: CaptureResult) => {
    setPhase("analyzing");
    const scanId = newScanId();
    setActiveScanId(scanId);
    setCoords({ latitude: capture.latitude, longitude: capture.longitude });
    setHistoryReturn(false);
    try {
      const v1 = await processScanV1(capture);
      setReport(v1);
      await saveScan({
        id: scanId,
        created_at: new Date().toISOString(),
        latitude: capture.latitude,
        longitude: capture.longitude,
        report: v1,
        valorization: null,
      });
      refreshScans();
      setPhase("report");
    } catch (err) {
      console.error("V1 failed", err);
      if (isNetworkError(err)) {
        try {
          const shots = await Promise.all(
            capture.shots.map(async (shot) => ({
              ...shot,
              image: await copyToOutbox(shot.image.uri, shot.image.name),
            })),
          );
          await enqueue({
            kind: "v1",
            id: scanId,
            scan_id: scanId,
            created_at: new Date().toISOString(),
            latitude: capture.latitude,
            longitude: capture.longitude,
            ar_depth_m: capture.arDepthM,
            measurements: {
              circumferenceCm: capture.circumferenceCm,
              caliperDbhCm: capture.caliperDbhCm,
              measuredHeightM: capture.measuredHeightM,
              heightSource: capture.heightSource,
              treeCode: capture.treeCode,
              depthSource: capture.depthSource,
              edgeLeft: capture.edgeLeft,
              edgeRight: capture.edgeRight,
              projectId: capture.projectId,
            },
            shots,
          });
          refreshQueue();
        } catch (copyErr) {
          console.error("offline enqueue failed", copyErr);
        }
        Alert.alert(fr.appTitle, fr.report.offlineQueued);
        goHome();
        return;
      }
      setPhase("error");
    }
  };

  const handleValorize = async () => {
    if (!report?.species_scientific_name || !report.measured_dbh_cm || !coords) {
      setPhase("error");
      return;
    }
    setPhase("valorizing");
    try {
      const v2 = await processScanV2({
        species_scientific_name: report.species_scientific_name,
        measured_dbh_cm: report.measured_dbh_cm,
        latitude: coords.latitude,
        longitude: coords.longitude,
        canopy_density_fcd: report.canopy_density_fcd ?? undefined,
      });
      setValorization(v2);
      if (activeScanId) await updateScanValorization(activeScanId, v2);
      refreshScans();
      setPhase("valorization");
    } catch (err) {
      console.error("V2 failed", err);
      if (isNetworkError(err)) {
        try {
          await enqueue({
            kind: "v2",
            id: newScanId(),
            scan_id: activeScanId,
            created_at: new Date().toISOString(),
            payload: {
              species_scientific_name: report.species_scientific_name,
              measured_dbh_cm: report.measured_dbh_cm,
              latitude: coords.latitude,
              longitude: coords.longitude,
              canopy_density_fcd: report.canopy_density_fcd ?? undefined,
            },
          });
          refreshQueue();
        } catch (queueErr) {
          console.error("offline v2 enqueue failed", queueErr);
        }
        Alert.alert(fr.appTitle, fr.valorization.offlineQueued);
        return;
      }
      setPhase("error");
    }
  };

  const openScan = (scan: StoredScan) => {
    setReport(scan.report);
    setValorization(scan.valorization);
    setCoords({ latitude: scan.latitude, longitude: scan.longitude });
    setActiveScanId(null);
    setHistoryReturn(true);
    setPhase("report");
  };

  const handleDelete = async (id: string) => {
    await deleteScan(id);
    refreshScans();
  };

  const handleClear = async () => {
    await clearScans();
    refreshScans();
  };

  const exportReport = async () => {
    if (!report) return;
    setExporting("report");
    try {
      const uri = await exportReportPdf(report);
      await sharePdf(uri);
    } catch (err) {
      console.error("PDF report export failed", err);
      Alert.alert(fr.report.error);
    } finally {
      setExporting(null);
    }
  };

  const exportPlan = async () => {
    if (!valorization) return;
    setExporting("plan");
    try {
      const uri = await exportPlanPdf(valorization);
      await sharePdf(uri);
    } catch (err) {
      console.error("PDF plan export failed", err);
      Alert.alert(fr.valorization.error);
    } finally {
      setExporting(null);
    }
  };

  const returnTarget = () => (historyReturn ? goHistory() : goHome());

  const handleTabChange = useCallback((key: string) => {
    if (key === "identify") {
      startTransition(() => setPhase("capture"));
      return;
    }
    startTransition(() => setPhase(key as Phase));
  }, []);

  if (bootstrapping || !fontsReady) {
    return <LoadingScreen />;
  }

  if (!user) {
    return (
      <SafeAreaProvider>
        <ThemeProvider>
          <Shell band>
            <ErrorBoundary>
              <LoginScreen onLogin={handleLogin} />
            </ErrorBoundary>
          </Shell>
          <BottomInset kind="page" />
        </ThemeProvider>
      </SafeAreaProvider>
    );
  }

  if (Platform.OS === "web" && (user.role === "operator" || user.role === "cooperative")) {
    // Field work stays on the phone: live photo, GPS and time at the tree (decision 16).
    return <WebFieldNotice role={user.role} onLogout={handleLogout} />;
  }

  const roleLabel = fr.roles[user.role] ?? user.role;
  // Server-resolved company/cooperative name wins; while offline (or for
  // admins) fall back to the display name minus any role-word repeat.
  const headerOrg = orgName ?? (() => {
    const name = user.display_name?.trim();
    if (!name) return null;
    const lower = name.toLowerCase();
    const role = roleLabel.toLowerCase();
    if (lower === role) return null;
    if (lower.startsWith(role)) {
      const next = name.slice(roleLabel.length);
      if (/^[\s·\-–:,(]/.test(next)) {
        return next.replace(/^[\s·\-–:,(]+/, "").trim() || null;
      }
    }
    return name;
  })();
  const isTab = TAB_PHASES.includes(phase);
  const designed = isTab || DESIGNED_PHASES.includes(phase);
  // Desktop web: the side menu stays on sub-pages, with their parent area highlighted.
  const DESKTOP_PARENT: Partial<Record<Phase, Phase>> = { decision: 'inbox', organisation: 'orgs', domain: domainReturn, profile: 'menu' };
  const desktopFrame = desktop && (isTab || phase in DESKTOP_PARENT);
  const desktopActive = DESKTOP_PARENT[phase] ?? phase;

  const openDomain = (key: DomainKey, from: Phase) => {
    if (key === "profil") {
      requestPhase("profile");
      return;
    }
    setDomainKey(key);
    setDomainReturn(from);
    requestPhase("domain");
  };

  const renderHome = () => {
    switch (user.role) {
      case "operator":
        return (
          <HomeScreen
            scanCount={scans.length}
            pendingCount={queueCount}
            syncing={syncing}
            onNew={() => {
              setScanProject(null);
              requestPhase("capture");
            }}
            onHistory={goHistory}
            onSync={syncQueue}
            scans={scans}
            firstName={user.first_name}
            matricule={user.matricule}
            onOpenScan={openScan}
            summary={summary}
            busyProjectId={busyProjectId}
            onScanForProject={(p) => {
              setScanProject(p);
              requestPhase("capture");
            }}
            onJoinProject={(id) => void projectAction(id, joinProject)}
            onAcceptInvitation={(id) => void projectAction(id, acceptProjectInvitation)}
            onDeclineInvitation={(id) => void projectAction(id, declineProjectInvitation)}
            onOpenProjects={() => requestPhase("projects")}
            onOpenCustody={user.company_id != null || user.organization_id != null ? () => requestPhase("custody") : undefined}
            onOpenProfile={() => requestPhase("profile")}
            onOpenProject={(p) => {
              setSelectedProject(p.id);
              if (p.kind === "chantier") setChantierReturn("home");
              requestPhase(p.kind === "chantier" ? "chantier" : "projectDetail");
            }}
          />
        );
      case "company":
        return <CompanyScreen user={user} onLogout={handleLogout} showHeader={false} />;
      case "cooperative":
        return <CooperativeScreen user={user} onLogout={handleLogout} showHeader={false} />;
      default:
        return (
          <MinistryHomeScreen
            firstName={user.first_name}
            onOpenInbox={(type) => {
              setInboxType(type ?? null);
              requestPhase("inbox");
            }}
            onOpenOrgs={(province) => {
              setOrgProvince(province ?? null);
              requestPhase("orgs");
            }}
            onOpenDomain={(key) => openDomain(key, "home")}
          />
        );
    }
  };

  return (
    <SafeAreaProvider>
      <ThemeProvider force={user.role === 'operator' || user.role === 'admin' ? undefined : 'dark'}>
      <Shell band={designed}>
        <ErrorBoundary onHome={goHome}>
        <DesktopFrame
          enabled={desktopFrame}
          user={user}
          active={desktopActive}
          roleLabel={roleLabel}
          orgName={headerOrg}
          online={serverStatus !== "offline"}
          onChange={handleTabChange}
          onLogout={handleLogout}
        >
        {isTab && !desktop && (
          <RoleHeader
            title={fr.appTitle}
            roleLabel={roleLabel}
            role={user.role}
            orgName={headerOrg}
            coords={headerCoords}
            connection={serverStatus}
            pending={queueCount}
            onOpenProfile={() => requestPhase("profile")}
            onOpenProjects={() => requestPhase("projects")}
          />
        )}
        {isPending && (
          <View style={styles.pendingBar} accessibilityRole="progressbar" accessibilityLabel={fr.common.switchingTab}>
            <View style={styles.pendingFill} />
          </View>
        )}

      {/* Keep main tabs mounted so catalogue / home / history stay warm in memory. */}
      <View
        style={[styles.tabPage, phase !== "home" && styles.tabHidden]}
        pointerEvents={phase === "home" ? "auto" : "none"}
      >
        {renderHome()}
      </View>
      <View
        style={[
          styles.tabPage,
          phase !== "species" && phase !== "speciesDetail" && styles.tabHidden,
        ]}
        pointerEvents={phase === "species" || phase === "speciesDetail" ? "auto" : "none"}
      >
        <SpeciesScreen
          onOpenSpecies={(s) => {
            setSelectedSpecies(s.scientific_name);
            requestPhase("speciesDetail");
          }}
        />
        {phase === "speciesDetail" && selectedSpecies ? (
          <View style={styles.overlay}>
            <SpeciesDetailScreen name={selectedSpecies} onBack={() => requestPhase("species")} />
          </View>
        ) : null}
      </View>
      <View
        style={[styles.tabPage, phase !== "history" && styles.tabHidden]}
        pointerEvents={phase === "history" ? "auto" : "none"}
      >
        <HistoryScreen
          scans={scans}
          onOpen={openScan}
          onDelete={handleDelete}
          onClear={handleClear}
        />
      </View>
      {phase === "inbox" && (
        <InboxScreen
          key={inboxKey}
          initialType={inboxType}
          onOpenDomain={(key) => openDomain(key, "inbox")}
          onOpenItem={(type, id) => {
            setDecisionItem({ type, id });
            requestPhase("decision");
          }}
        />
      )}
      {phase === "orgs" && (
        <OrganisationsScreen
          initialProvince={orgProvince}
          onOpen={(org) => {
            setOrgId(org.id);
            requestPhase("organisation");
          }}
        />
      )}
      {phase === "menu" && <MenuScreen onOpen={(key) => openDomain(key, "menu")} onLogout={handleLogout} />}
      {phase === "custody" && <CustodyScreen onBack={goHome} />}
      {phase === "decision" && decisionItem && (
        <DecisionScreen
          type={decisionItem.type}
          id={decisionItem.id}
          onBack={() => requestPhase("inbox")}
          onDecided={() => {
            setInboxKey((k) => k + 1);
            requestPhase("inbox");
          }}
        />
      )}
      {phase === "domain" && <DomainScreen domain={domainKey} onBack={() => requestPhase(domainReturn)} />}
      {phase === "organisation" && orgId != null && (
        <OrganisationScreen id={orgId} onBack={() => requestPhase("orgs")} />
      )}
      {phase === "map" && (
        <Suspense fallback={<RouteLoader message={fr.common.openingMap} />}>
          <MapScreen />
        </Suspense>
      )}
      {phase === "projects" && user && (
        <ProjetsScreen
          user={user}
          onOpenProject={(p) => {
            setSelectedProject(p.id);
            if (p.kind === "chantier") setChantierReturn("projects");
            requestPhase(p.kind === "chantier" ? "chantier" : "projectDetail");
          }}
          onCreateProject={() => requestPhase("projectCreate")}
          onBack={goHome}
        />
      )}
      {phase === "projectDetail" && selectedProject && user && (
        <Suspense fallback={<RouteLoader message={fr.common.openingProject} />}>
          <ProjectDetailScreen id={selectedProject} user={user} onBack={() => requestPhase("projects")} />
        </Suspense>
      )}
      {phase === "chantier" && selectedProject && (
        <Suspense fallback={<RouteLoader message={fr.common.openingProject} />}>
          <ChantierScreen
            id={selectedProject}
            onBack={() => {
              if (chantierReturn === "home") void refreshSummary();
              requestPhase(chantierReturn);
            }}
            onScan={(project) => {
              setScanProject(project);
              requestPhase("capture");
            }}
          />
        </Suspense>
      )}
      {phase === "projectCreate" && (
        <CreateProjectScreen onDone={() => requestPhase("projects")} onBack={() => requestPhase("projects")} />
      )}
      {phase === "profile" && (
        <ProfileScreen user={user} onLogout={handleLogout} onBack={goHome} onUserUpdate={handleUserUpdate} />
      )}
      {phase === "capture" && (
        <Suspense fallback={<RouteLoader message={fr.common.openingCamera} />}>
          <ThemeProvider force="dark">
            <CaptureScreen onCaptured={handleCaptured} onBack={goHome} project={scanProject} />
          </ThemeProvider>
        </Suspense>
      )}
      {phase === "report" && report && (
        <ReportScreen
          report={report}
          exporting={exporting === "report"}
          onValorize={historyReturn ? null : handleValorize}
          onOpenPlan={historyReturn && valorization ? () => requestPhase("valorization") : undefined}
          onExportPdf={exportReport}
          onBack={historyReturn ? goHistory : undefined}
        />
      )}
      {phase === "valorization" && valorization && (
        <Suspense fallback={<RouteLoader message={fr.common.openingPlan} />}>
          <ValorizationScreen
            data={valorization}
            origin={coords}
            exporting={exporting === "plan"}
            onExportPdf={exportPlan}
            onBack={returnTarget}
          />
        </Suspense>
      )}
      {(phase === "analyzing" || phase === "valorizing") && (
        <LoadingScreen message={phase === "analyzing" ? fr.capture.waiting : fr.common.loading} />
      )}
      {phase === "error" && (
        <EmptyState message={fr.report.error} tone="risk" action={{ label: fr.report.startOver, onPress: goHome }} />
      )}
      {exporting && (
        <View style={styles.exporting}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.exportingText}>{fr.common.exporting}</Text>
        </View>
      )}
      {isTab && !desktop && <BottomNav user={user} active={phase} onChange={handleTabChange} />}
        </DesktopFrame>
        </ErrorBoundary>
      </Shell>
      <BottomInset
        kind={
          isTab
            ? 'nav'
            : phase === 'analyzing' || phase === 'valorizing'
              ? 'band'
              : designed && phase !== 'capture'
                ? 'page'
                : 'legacy'
        }
      />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, position: "relative" },
  body: { flex: 1, position: "relative" },
  tabPage: { flex: 1 },
  tabHidden: { display: "none" },
  pendingBar: { height: 2, backgroundColor: colors.surface },
  pendingFill: { flex: 1, backgroundColor: colors.accent },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.background,
    zIndex: 2,
  },
  exporting: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(14,21,18,0.8)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  exportingText: { color: colors.text, fontSize: type.body, fontWeight: "700" },
});