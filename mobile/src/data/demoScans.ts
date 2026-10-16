import { StoredScan } from "../storage/history";

const NOW = Date.UTC(2026, 9, 15, 15, 40);

function scan(
  n: number,
  hoursAgo: number,
  code: string,
  latin: string,
  common: string,
  dbh: number,
  height: number,
  co2e: number,
  lat: number,
  lon: number,
  verdict: "conforme" | "a_verifier" | "risque",
): StoredScan {
  return {
    id: `demo_${n}`,
    created_at: new Date(NOW - hoursAgo * 3600 * 1000).toISOString(),
    latitude: lat,
    longitude: lon,
    valorization: null,
    report: {
      species_scientific_name: latin,
      species_common_name_fr: common,
      species_confidence: 0.86,
      measured_dbh_cm: dbh,
      dbh_method: "operator_edges",
      dbh_confidence: 0.9,
      estimated_height_m: height,
      estimated_age_years: Math.round(dbh * 1.9),
      age_model_used: "allometric_v2",
      health_status: "bon",
      soil_type: "ferralsol",
      canopy_density_fcd: 78,
      narrative_fr: `${common} de ${dbh} cm de diamètre, relevé sur l'AAC du chantier pilote. Exemple de démonstration : le rapport complet, le suivi de la grume et le carnet DF10 s'ouvrent comme pour un vrai scan.`,
      aboveground_biomass_kg: Math.round(co2e * 0.5),
      carbon_stock_kg: Math.round(co2e * 0.27),
      co2e_kg: co2e,
      distance_m: 2.4,
      distance_source: "qr",
      tree_code: code,
      species_candidates: [],
      forest_checks: { verdict, flags: verdict === "conforme" ? [] : ["aire_protegee"] } as never,
      project_id: null,
      project_title: null,
      project_note: null,
    } as StoredScan["report"],
  };
}

export const DEMO_SCANS: StoredScan[] = [
  scan(1, 2, "GA-PILOTE-0004", "Milicia excelsa", "Iroko", 95, 38, 21400, -0.776667, 13.613333, "conforme"),
  scan(2, 20, "GA-PILOTE-0006", "Terminalia superba", "Fraké", 88, 41, 17900, -0.78145, 13.60902, "conforme"),
  scan(3, 44, "GA-PILOTE-0016", "Aucoumea klaineana", "Okoumé", 97, 45, 24600, -0.77031, 13.62255, "a_verifier"),
];

export const isDemoScan = (id: string) => id.startsWith("demo_");
