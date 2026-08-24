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
