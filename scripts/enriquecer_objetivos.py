#!/usr/bin/env python3
"""
Cruza los teléfonos de las campañas (resultados/llamadas.csv) con todas las
listas de outreach/prospectos del repo (que sí tienen nombre de negocio) para
autocompletar nombres. Genera dos CSV en <proyecto>/output/:
  - leads_autocompletados.csv  -> listo para: npm run boceto -- --csv <ruta>
  - objetivos_sin_nombre.csv   -> teléfonos sin match, para enriquecer a mano

Uso (desde donde sea, usa rutas absolutas):
  python3 resultados/agente-clinicas/scripts/enriquecer_objetivos.py
"""
import csv, json, re, glob, os
from collections import Counter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(SCRIPT_DIR)                 # .../agente-clinicas
OUT_DIR = os.path.join(PROJECT, 'output')
os.makedirs(OUT_DIR, exist_ok=True)

# DATA_ROOT = carpeta raíz de datos (la que contiene 'all' y 'resultados')
DATA_ROOT = PROJECT
for _ in range(6):
    if os.path.isdir(os.path.join(DATA_ROOT, 'resultados')) and os.path.isdir(os.path.join(DATA_ROOT, 'all')):
        break
    DATA_ROOT = os.path.dirname(DATA_ROOT)
LLAMADAS = os.path.join(DATA_ROOT, 'resultados', 'llamadas.csv')

NAME_KEYS = {'negocio', 'nombre', 'name', 'business', 'razon_social'}
PHONE_KEYS = {'telefono', 'phone', 'telefono1', 'celular', 'whatsapp', 'tel'}
VERT = {'Veterinaria': 'veterinaria', 'Dental': 'dental', 'Estetica': 'estetica'}
HUMANO = {'user_hangup', 'agent_hangup', 'inactivity', 'max_duration_reached'}

norm = lambda p: re.sub(r'\D', '', str(p or ''))
last10 = lambda d: d[-10:] if len(d) >= 10 else d

CIUDADES = ['Bogotá', 'Medellín', 'Cali', 'Pereira', 'Dosquebradas', 'La Virginia',
            'Santa Rosa', 'Barranquilla', 'Bucaramanga', 'Cartagena', 'Manizales']

def clean_name(neg):
    return re.split(r'[,|]', str(neg))[0].strip()

def find_ciudad(*textos):
    blob = ' '.join(str(t or '') for t in textos).lower()
    for c in CIUDADES:
        if c.lower() in blob:
            return c
    return ''

# ---- 1. Indexar negocios con teléfono de todas las fuentes ----
book = {}
def add(neg, tel, ig='', dirn=''):
    d = norm(tel)
    if not neg or len(d) < 7:
        return
    info = {'negocio': str(neg).strip(), 'instagram': ig or '', 'direccion': dirn or ''}
    book.setdefault(d, info)
    book.setdefault(last10(d), info)

for f in glob.glob(os.path.join(DATA_ROOT, '**', '*.csv'), recursive=True):
    if 'agente-clinicas' in f or 'node_modules' in f:
        continue
    try:
        with open(f, encoding='utf-8-sig') as fh:
            rows = list(csv.DictReader(fh))
        if not rows:
            continue
        cols = {c.lower(): c for c in rows[0].keys()}
        nk = next((cols[k] for k in cols if k in NAME_KEYS), None)
        pk = next((cols[k] for k in cols if k in PHONE_KEYS), None)
        if nk and pk:
            for r in rows:
                add(r.get(nk), r.get(pk),
                    r.get(cols.get('instagram', ''), '') if 'instagram' in cols else '',
                    r.get(cols.get('direccion', ''), '') if 'direccion' in cols else '')
    except Exception:
        pass

def walk(o):
    if isinstance(o, dict):
        keys = {k.lower(): k for k in o.keys()}
        nk = next((keys[k] for k in keys if k in NAME_KEYS), None)
        pk = next((keys[k] for k in keys if k in PHONE_KEYS), None)
        if nk and pk:
            add(o.get(nk), o.get(pk),
                o.get(keys.get('instagram', ''), '') if 'instagram' in keys else '',
                o.get(keys.get('direccion', ''), '') if 'direccion' in keys else '')
        for v in o.values():
            walk(v)
    elif isinstance(o, list):
        for v in o:
            walk(v)

for f in glob.glob(os.path.join(DATA_ROOT, '**', '*.json'), recursive=True):
    if 'agente-clinicas' in f or 'node_modules' in f:
        continue
    try:
        with open(f, encoding='utf-8') as fh:
            walk(json.load(fh))
    except Exception:
        pass

# ---- 2. Construir objetivos (tier 1-3) desde las llamadas ----
with open(LLAMADAS, encoding='utf-8-sig') as f:
    rows = [r for r in csv.DictReader(f) if r['campana'] in VERT]
best = {}
for r in rows:
    tel = r['telefono']; dur = float(r['duracion_s'] or 0)
    exito = r['exitosa'] == 'true'
    humano = r['en_buzon'] == 'false' and r['resultado'] in HUMANO
    score = (2 if exito else 0) + (1 if humano else 0) + dur / 1000
    if tel not in best or score > best[tel]['score']:
        best[tel] = {'tel': tel, 'v': VERT[r['campana']], 'dur': dur, 'exito': exito, 'humano': humano, 'score': score}
def tier(b):
    if b['exito']: return 1
    if b['humano'] and b['dur'] >= 40: return 2
    if b['humano'] and b['dur'] >= 15: return 3
    return 4
obj = [dict(b, tier=tier(b)) for b in best.values() if tier(b) <= 3]

# ---- 3. Cruzar y escribir CSVs ----
def lookup(tel):
    d = norm(tel)
    return book.get(d) or book.get(last10(d))

con, sin = [], []
for b in sorted(obj, key=lambda x: (x['tier'], -x['dur'])):
    info = lookup(b['tel'])
    (con if info else sin).append({**b, **(info or {})})

with open(os.path.join(OUT_DIR, 'leads_autocompletados.csv'), 'w', encoding='utf-8', newline='') as f:
    w = csv.writer(f)
    w.writerow(['nombre', 'vertical', 'ciudad', 'servicios', 'color', 'telefono', 'tier', 'instagram', 'direccion'])
    for b in con:
        w.writerow([clean_name(b['negocio']), b['v'], find_ciudad(b['negocio'], b.get('direccion')),
                    '', '', b['tel'], b['tier'], b.get('instagram', ''), b.get('direccion', '')])

with open(os.path.join(OUT_DIR, 'objetivos_sin_nombre.csv'), 'w', encoding='utf-8', newline='') as f:
    w = csv.writer(f)
    w.writerow(['nombre', 'vertical', 'ciudad', 'servicios', 'color', 'telefono', 'tier'])
    for b in sin:
        w.writerow(['', b['v'], '', '', '', b['tel'], b['tier']])

print(f'DATA_ROOT: {DATA_ROOT}')
print(f'Indexados: {len(book)} claves | Objetivos tier1-3: {len(obj)} | con nombre: {len(con)} | sin: {len(sin)}')
print('con nombre por tier:', dict(Counter(b['tier'] for b in con)))
print('->', os.path.join(OUT_DIR, 'leads_autocompletados.csv'))
print('->', os.path.join(OUT_DIR, 'objetivos_sin_nombre.csv'))
