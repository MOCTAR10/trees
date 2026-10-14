import React, { useState } from "react";
import { View } from "react-native";

import AdminAnomalies from "../../components/AdminAnomalies";
import AdminCertifications from "../../components/AdminCertifications";
import AdminDashboard from "../../components/AdminDashboard";
import AdminDeclarations from "../../components/AdminDeclarations";
import AdminDocuments from "../../components/AdminDocuments";
import AdminFiscal from "../../components/AdminFiscal";
import AdminTitles from "../../components/AdminTitles";
import AdminTraceability from "../../components/AdminTraceability";
import AdminUsers from "../../components/AdminUsers";
import OrgBackfill from "../../components/OrgBackfill";
import { makeStyles } from "../../design/ThemeProvider";
import { ScreenHeader } from "../../design/ui";
import { fr } from "../../i18n/fr";
import SpeciesDetailScreen from "../SpeciesDetailScreen";
import SpeciesScreen from "../SpeciesScreen";
import AuthoritiesScreen from "./AuthoritiesScreen";
import ControlsScreen from "./ControlsScreen";
import { DomainKey } from "./shared";

const t = fr.ministry;

interface Props {
  domain: DomainKey;
  onBack: () => void;
}

function Species() {
  const [selected, setSelected] = useState<string | null>(null);
  return selected ? (
    <SpeciesDetailScreen name={selected} onBack={() => setSelected(null)} />
  ) : (
    <SpeciesScreen onOpenSpecies={(sp) => setSelected(sp.scientific_name)} />
  );
}

function Accounts() {
  const s = useStyles();
  return (
    <View style={s.flex}>
      <OrgBackfill />
      <View style={s.flex}>
        <AdminUsers />
      </View>
    </View>
  );
}

/** A Ministry domain opened from the Menu, the Tableau de bord or À traiter. */
export default function DomainScreen({ domain, onBack }: Props) {
  const s = useStyles();
  const body = (() => {
    switch (domain) {
      case "stats":
        return <AdminDashboard />;
      case "titres":
      case "etudes":
        return <AdminTitles />;
      case "comptes":
        return <Accounts />;
      case "declarations":
        return <AdminDeclarations />;
      case "documents":
        return <AdminDocuments />;
      case "certifications":
        return <AdminCertifications />;
      case "anomalies":
        return <AdminAnomalies />;
      case "tracabilite":
        return <AdminTraceability />;
      case "fiscal":
        return <AdminFiscal />;
      case "especes":
        return <Species />;
      case "controles":
        return <ControlsScreen />;
      case "autorites":
        return <AuthoritiesScreen />;
      default:
        return null;
    }
  })();
  return (
    <View style={s.screen} testID={`domain-${domain}`}>
      <ScreenHeader eyebrow={t.menuTitle} title={t.domains[domain]} onBack={onBack} backLabel={fr.history.back} />
      <View style={s.flex}>{body}</View>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  flex: { flex: 1 },
}));
