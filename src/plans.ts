import type { Clinic, Plan } from './types.js';

/**
 * Gating por plan: qué funciones premium incluye cada plan.
 * basic ⊂ growth ⊂ scale (cada plan incluye todo lo del anterior).
 */

export type Feature =
  | 'reporte_semanal'
  | 'roi_dashboard'
  | 'resenas_google'
  | 'recordatorios_vacunas'
  | 'llamadas_perdidas';

/** Plan mínimo que incluye cada función premium. */
const PLAN_MINIMO: Record<Feature, Plan> = {
  reporte_semanal: 'growth',
  roi_dashboard: 'growth',
  resenas_google: 'growth',
  recordatorios_vacunas: 'growth',
  llamadas_perdidas: 'scale',
};

const NIVEL: Record<Plan, number> = { basic: 0, growth: 1, scale: 2 };

/** ¿El plan de la clínica incluye esta función premium? */
export function planIncluye(clinic: Clinic, feature: Feature): boolean {
  return NIVEL[clinic.plan] >= NIVEL[PLAN_MINIMO[feature]];
}
