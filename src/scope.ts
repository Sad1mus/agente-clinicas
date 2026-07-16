import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

/**
 * Frontera de tenant — capa de repositorio (opción B).
 *
 * POR QUÉ EXISTE
 * --------------
 * Este proyecto habla con Supabase vía PostgREST usando `service_role`, y
 * `service_role` **bypassea RLS por diseño**. Es decir: aunque el schema tuviera
 * policies de Row Level Security, no harían nada mientras la app entre con esta
 * llave. La consecuencia es dura y conviene decirla sin adornos:
 *
 *   >> No hay frontera de tenant a nivel de base de datos. La única que existe
 *   >> es esta, y vive en TypeScript.
 *
 * Por eso el cliente crudo NO se exporta. Si se exportara, cualquier módulo
 * podría hacer `supabase.from('messages').select('*')` sin filtrar por clínica y
 * nada — ni el compilador ni la base — lo detendría. Al no exportarlo, el único
 * camino a las tablas de una clínica es `forClinic(id)`, que aplica el filtro por
 * dentro. Olvidar el tenant deja de ser posible: pasa a ser un error de compilación.
 *
 * QUÉ NO ES
 * ---------
 * Esto es defensa en la APLICACIÓN, no en la base. Quien tenga la `service_role`
 * la salta entera. No sustituye a RLS: lo aplaza con el riesgo medido.
 * La vía a RLS real sería un JWT por clínica + `anon key` + policies sobre
 * `auth.jwt() ->> 'clinic_id'` (opción A). Ver `xe-mind` → CLAUDE.md §9.6, Decisión 7.
 */

/** Cliente con `service_role`. Deliberadamente NO exportado — ver cabecera. */
const raw = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false },
});

/**
 * Tablas que pertenecen a una clínica: toda fila tiene `clinic_id`.
 * `clinics` NO está aquí a propósito — no tiene `clinic_id` porque ES el tenant.
 */
export type TenantTable = 'contacts' | 'messages' | 'appointments' | 'ciclos' | 'leads';

/**
 * Puerta explícita al registro de clínicas (la tabla que ES el tenant).
 * Es la única vía legítima de saltarse el scope, y está aislada aquí para que
 * `grep clinicsTable src/` liste de un vistazo quién la toca.
 */
export function clinicsTable() {
  return raw.from('clinics');
}

/**
 * Acceso a las tablas de UNA clínica. El `clinic_id` se aplica por dentro:
 * el llamador no puede omitirlo porque nunca ve el cliente crudo.
 *
 * Los builders se devuelven ya filtrados, así que el encadenado habitual sigue
 * funcionando y se puede afinar más:
 *
 *   forClinic(id).select('appointments', '*').eq('fecha', hoy)
 *   forClinic(id).update('appointments', { estado }).eq('id', apptId)
 *
 * Nótese el segundo: antes era `.update(...).eq('id', apptId)` a secas — se
 * actualizaba por clave primaria sin comprobar de quién era la fila. Ahora el
 * `clinic_id` viaja siempre, así que un id de otra clínica no coincide con nada.
 */
export function forClinic(clinicId: string) {
  return {
    // `Q` genérico preserva el literal de `columns` ('*', 'role, content', ...).
    // Sin él, TS lo ensancha a `string` y supabase-js pierde la inferencia de fila.
    select<Q extends string>(
      table: TenantTable,
      columns: Q,
      opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean },
    ) {
      return raw.from(table).select<Q>(columns, opts).eq('clinic_id', clinicId);
    },

    /** El `clinic_id` se inyecta: no se puede insertar una fila huérfana ni ajena. */
    insert(table: TenantTable, row: Record<string, unknown>) {
      return raw.from(table).insert({ ...row, clinic_id: clinicId });
    },

    upsert(table: TenantTable, row: Record<string, unknown>, opts?: { onConflict?: string }) {
      return raw.from(table).upsert({ ...row, clinic_id: clinicId }, opts);
    },

    update(table: TenantTable, patch: Record<string, unknown>) {
      return raw.from(table).update(patch).eq('clinic_id', clinicId);
    },

    delete(table: TenantTable) {
      return raw.from(table).delete().eq('clinic_id', clinicId);
    },
  };
}
