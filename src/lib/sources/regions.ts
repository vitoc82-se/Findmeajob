// The 21 Swedish regions (län) with their JobTech taxonomy concept ids.
// Source: https://taxonomy.api.jobtechdev.se (type=region), fetched 2026-08-24.
// The JobSearch API filters server-side via the `region` param (repeatable, OR).

export interface Region {
  id: string;
  label: string;
}

export const SWEDISH_REGIONS: Region[] = [
  { id: "DQZd_uYs_oKb", label: "Blekinge län" },
  { id: "oDpK_oZ2_WYt", label: "Dalarnas län" },
  { id: "K8iD_VQv_2BA", label: "Gotlands län" },
  { id: "zupA_8Nt_xcD", label: "Gävleborgs län" },
  { id: "wjee_qH2_yb6", label: "Hallands län" },
  { id: "65Ms_7r1_RTG", label: "Jämtlands län" },
  { id: "MtbE_xWT_eMi", label: "Jönköpings län" },
  { id: "9QUH_2bb_6Np", label: "Kalmar län" },
  { id: "tF3y_MF9_h5G", label: "Kronobergs län" },
  { id: "9hXe_F4g_eTG", label: "Norrbottens län" },
  { id: "CaRE_1nn_cSU", label: "Skåne län" },
  { id: "CifL_Rzy_Mku", label: "Stockholms län" },
  { id: "s93u_BEb_sx2", label: "Södermanlands län" },
  { id: "zBon_eET_fFU", label: "Uppsala län" },
  { id: "EVVp_h6U_GSZ", label: "Värmlands län" },
  { id: "g5Tt_CAV_zBd", label: "Västerbottens län" },
  { id: "NvUF_SP1_1zo", label: "Västernorrlands län" },
  { id: "G6DV_fKE_Viz", label: "Västmanlands län" },
  { id: "zdoY_6u5_Krt", label: "Västra Götalands län" },
  { id: "xTCk_nT5_Zjm", label: "Örebro län" },
  { id: "oLT3_Q9p_3nn", label: "Östergötlands län" },
];

const VALID_REGION_IDS = new Set(SWEDISH_REGIONS.map((r) => r.id));

// Guard against a client sending arbitrary strings into the JobTech query.
export function isValidRegionId(id: string): boolean {
  return VALID_REGION_IDS.has(id);
}

// Friendly picker labels: people think "Malmö", not "Skåne län". Big-city regions
// come first (that's where most searches are), then the rest alphabetically.
const REGION_PICKER: Array<[string, string]> = [
  ["CifL_Rzy_Mku", "Stockholm"],
  ["zdoY_6u5_Krt", "Göteborg / Västra Götaland"],
  ["CaRE_1nn_cSU", "Malmö / Skåne"],
  ["zBon_eET_fFU", "Uppsala"],
  ["oLT3_Q9p_3nn", "Linköping / Östergötland"],
  ["xTCk_nT5_Zjm", "Örebro"],
  ["G6DV_fKE_Viz", "Västerås / Västmanland"],
  ["MtbE_xWT_eMi", "Jönköping"],
  ["wjee_qH2_yb6", "Halmstad / Halland"],
  ["EVVp_h6U_GSZ", "Karlstad / Värmland"],
  ["g5Tt_CAV_zBd", "Umeå / Västerbotten"],
  ["NvUF_SP1_1zo", "Sundsvall / Västernorrland"],
  ["zupA_8Nt_xcD", "Gävle / Gävleborg"],
  ["9hXe_F4g_eTG", "Luleå / Norrbotten"],
  ["tF3y_MF9_h5G", "Växjö / Kronoberg"],
  ["9QUH_2bb_6Np", "Kalmar"],
  ["DQZd_uYs_oKb", "Blekinge"],
  ["oDpK_oZ2_WYt", "Dalarna"],
  ["s93u_BEb_sx2", "Södermanland"],
  ["65Ms_7r1_RTG", "Östersund / Jämtland"],
  ["K8iD_VQv_2BA", "Gotland"],
];

export const REGION_OPTIONS: Region[] = REGION_PICKER.map(([id, label]) => ({ id, label }));
