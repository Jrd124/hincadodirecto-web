"""Geocoding for gas stations — improved with name cleaning, multi-query, manual overrides."""
from __future__ import annotations

import logging
import re
import time
import unicodedata

import requests

from core.db import get_conn

logger = logging.getLogger("erp")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "HincadoDirectoERP/1.0 (javier.romeroca@gmail.com)"

# ═══ Manual coordinates for stations Nominatim can't resolve ═════════════════

COORDS_MANUALES = {
    'RIAÑO BAÑARES': (42.4497, -2.8900, 'Bañares', 'La Rioja'),
    'AREA 77-II BELINCHON': (40.0544, -3.0697, 'Belinchón', 'Castilla-La Mancha'),
    'AREA 77-I BELINCHON': (40.0544, -3.0697, 'Belinchón', 'Castilla-La Mancha'),
    'E.S. AREA 77 I AUTOVIA LEVANTE A-3 PK. 77 MARG. DCHO.': (40.0544, -3.0697, 'Belinchón', 'Castilla-La Mancha'),
    'E.S. AREA 77 II AUTOVIA LEVANTE A-3 PK. 77 MARG.IZQ': (40.0544, -3.0697, 'Belinchón', 'Castilla-La Mancha'),
    'LA MAYA MONTEJO DE SALVATIERRA': (40.5292, -5.8678, 'Montejo de Salvatierra', 'Castilla y León'),
    'ERRASTI SUR MERIDA': (38.9191, -6.3746, 'Mérida', 'Extremadura'),
    'E.S. ERRASTI SUR CTRA DE CIRCUNVALACION PK 340': (38.9191, -6.3746, 'Mérida', 'Extremadura'),
    'VEGAS BAJAS LOBON': (38.8266, -6.6180, 'Lobón', 'Extremadura'),
    'CIENTO TRES-2 ALMADRONES': (40.8894, -2.7744, 'Almadrones', 'Castilla-La Mancha'),
    'CIENTO TRES ALMADRONES': (40.8894, -2.7744, 'Almadrones', 'Castilla-La Mancha'),
    'ESTACION DE SERVICIO CUE TORRECILLAS DE LA TIESA': (39.3567, -5.8667, 'Torrecillas de la Tiesa', 'Extremadura'),
    'AREA DE SERVICIO HARLEY  MERIDA': (38.9191, -6.3746, 'Mérida', 'Extremadura'),
    'VISTANIEVE SANTA OLALLA': (39.9500, -4.3667, 'Santa Olalla', 'Castilla-La Mancha'),
    'SAN JAVIER SORBAS': (37.0917, -2.1239, 'Sorbas', 'Andalucía'),
    'GASERNAV CASAS DE DON PEDRO': (39.1667, -5.3167, 'Casas de Don Pedro', 'Extremadura'),
    'GEMINA JUMILLA': (38.4739, -1.3281, 'Jumilla', 'Región de Murcia'),
    'E.S. CARMONA-AUTOVIA CTRA': (37.4714, -5.6417, 'Carmona', 'Andalucía'),
    'MANZANARES-TARANCON TARANCON': (40.0117, -2.9944, 'Tarancón', 'Castilla-La Mancha'),
    'E.S. MANZANARES-TARANCON CTRA. NAC. III, PK. 82': (40.0117, -2.9944, 'Tarancón', 'Castilla-La Mancha'),
    'ES MOLINA MEMBRILLA': (38.9167, -3.3333, 'Membrilla', 'Castilla-La Mancha'),
    'SAN CLEMENTE II SAN CLEMENTE': (39.4065, -2.4286, 'San Clemente', 'Castilla-La Mancha'),
    'SAN CLEMENTE I SAN CLEMENTE': (39.4065, -2.4286, 'San Clemente', 'Castilla-La Mancha'),
    'E.S. RIAÑO CTRA. N-120A, P.K. 43,2': (42.4497, -2.8900, 'Bañares', 'La Rioja'),
    'NUESTRA SEÑORA DE LAS NI ARCOS DE LA FRONTERA': (36.7500, -5.8100, 'Arcos de la Frontera', 'Andalucía'),
    'NUESTRA SEÑORA DE LOS RE LA RINCONADA': (37.4833, -5.9833, 'La Rinconada', 'Andalucía'),
    'SIETE IGLESIAS SIETE IGLESIAS DE TRABAN': (41.1500, -5.5833, 'Siete Iglesias de Trabancos', 'Castilla y León'),
    'EL VALLE DE TORIJA TORIJA': (40.7436, -3.0300, 'Torija', 'Castilla-La Mancha'),
    'MONTECARMELO ALCALA DE GUADAIRA': (37.3333, -5.8333, 'Alcalá de Guadaíra', 'Andalucía'),
    'PEDROSILLO II PEDROSILLO EL RALO': (40.9500, -5.5500, 'Pedrosillo el Ralo', 'Castilla y León'),
    'PEDROSILLO I PEDROSILLO EL RALO': (40.9500, -5.5500, 'Pedrosillo el Ralo', 'Castilla y León'),
    'FIERROIL VILLAFRANCA DE LOS BARRO': (38.5667, -6.3333, 'Villafranca de los Barros', 'Extremadura'),
    'LLANOS DE EXTREMADURA ALMENDRALEJO': (38.6833, -6.4078, 'Almendralejo', 'Extremadura'),
    'PEDRERO FERNANDEZ BADAJOZ': (38.8794, -6.9706, 'Badajoz', 'Extremadura'),
    'COMERCIAL HERPE LA ROCA DE LA SIERRA': (39.0167, -6.5833, 'La Roca de la Sierra', 'Extremadura'),
    'A2 ALMODOVAR (LIS/ALG) ALMODOVAR': (37.5100, -8.0600, 'Almodôvar', 'Beja'),
    'A2 ALMODOVAR (ALG/LIS) ALMODOVAR': (37.5100, -8.0600, 'Almodôvar', 'Beja'),
    'A22 OLHAO (OLH/VRA) OLHAO': (37.0256, -7.8411, 'Olhão', 'Faro'),
    'CARO DARRO': (37.3300, -3.3700, 'Darro', 'Andalucía'),
    'GEVORA GEVORA DEL CAUDILLO': (38.9333, -6.9333, 'Gévora', 'Extremadura'),
    'AFER CAMPO LUGAR': (39.1667, -5.7833, 'Campo Lugar', 'Extremadura'),
    'CRISTO DE LA ANTIGUA PIEDRABUENA': (39.0167, -4.1667, 'Piedrabuena', 'Castilla-La Mancha'),
    'EL OASIS CARCHEL': (37.6500, -3.6333, 'Cárchel', 'Andalucía'),
    'TERRIZA BOLLULLOS DEL CONDADO': (37.3333, -6.5333, 'Bollullos del Condado', 'Andalucía'),
    'PETROCAR COLMENAR VIEJO': (40.6583, -3.7644, 'Colmenar Viejo', 'Comunidad de Madrid'),
    'MARBEL TORRIJOS': (39.9833, -4.2833, 'Torrijos', 'Castilla-La Mancha'),
    'EL MARQUES AGUADULCE': (36.8167, -2.5500, 'Aguadulce', 'Andalucía'),
    'EL POTRO BLANCO LA CAROLINA': (38.2833, -3.6167, 'La Carolina', 'Andalucía'),
    'UNQUERA VAL DE SAN VICENTE': (43.3700, -4.4000, 'Val de San Vicente', 'Cantabria'),
    'TORRESBLANCAS VILLARROBLEDO': (39.2694, -2.6017, 'Villarrobledo', 'Castilla-La Mancha'),
    'HONRUBIA HONRUBIA': (39.6167, -2.2667, 'Honrubia', 'Castilla-La Mancha'),
    'VILLAR DE CHINCHILLA VILLAR DE CHINCHILLA': (38.8833, -1.7333, 'Villar de Chinchilla', 'Castilla-La Mancha'),
    'CORELLA CORELLA': (42.1128, -1.7839, 'Corella', 'Navarra'),
    'LA JUNQUERA LA JONQUERA': (42.4200, 2.8700, 'La Jonquera', 'Catalunya'),
    'GURB-II GURB': (41.9333, 2.2333, 'Gurb', 'Catalunya'),
    'LORENZO PARDO E HIJOS ALCALA DE HENARES': (40.4819, -3.3644, 'Alcalá de Henares', 'Comunidad de Madrid'),
    'LA ESTRELLA DE SEVILLA PUERTO REAL': (36.5300, -6.1900, 'Puerto Real', 'Andalucía'),
    'TOCALU ERRIBERA GOITIA': (43.0800, -2.6300, 'Erribera Goitia', 'Euskadi'),
    'MIRALBUENO ZARAGOZA': (41.6700, -0.9100, 'Zaragoza', 'Aragón'),
    'HERMANOS GONSALO ALMERIA': (36.8400, -2.4700, 'Almería', 'Andalucía'),
    'SERVICTORIA LA MUDARRA': (41.7300, -4.8800, 'La Mudarra', 'Castilla y León'),
    'OCAÑA OCAÑA': (39.9583, -3.5000, 'Ocaña', 'Castilla-La Mancha'),
    'OIARTZUN  II OIARTZUN': (43.2900, -1.8500, 'Oiartzun', 'Euskadi'),
    'OIARTZUN  I OIARTZUN': (43.2900, -1.8500, 'Oiartzun', 'Euskadi'),
    'ZAFRA ZAFRA': (38.4192, -6.4167, 'Zafra', 'Extremadura'),
    'LODOSA LODOSA': (42.5833, -2.0833, 'Lodosa', 'Navarra'),
    'MINATEDA HELLIN': (38.5333, -1.7833, 'Hellín', 'Castilla-La Mancha'),
    'SANDINO II VILLODRIGO': (42.2833, -4.1500, 'Villodrigo', 'Castilla y León'),
    'ALCADOZO ALCADOZO': (38.6667, -2.1333, 'Alcadozo', 'Castilla-La Mancha'),
    'E.S. SAN CAMILO CTRA NAC. 232, KM. 416,1': (42.4336, -2.5668, 'Navarrete', 'La Rioja'),
    'E.S. ALDEANUEVA CTRA. A-66 PK. 436.44': (40.2590, -5.9297, 'Aldeanueva del Camino', 'Extremadura'),
    'ROBLEGAS, S.A. CTRA. CM-3': (39.3900, -2.4300, 'San Clemente', 'Castilla-La Mancha'),
    'CTRA OLIVENZA CARRETERA D-BA': (38.6833, -7.1000, 'Olivenza', 'Extremadura'),
    'ARABAT .': (40.4168, -3.7038, 'Madrid', 'Comunidad de Madrid'),
    'E.S. LA INVENCIBLE, S.L.': (37.5000, -5.6400, 'Carmona', 'Andalucía'),
    'E.S. HERCA 1999, S.L. CTR': (37.4700, -5.6400, 'Carmona', 'Andalucía'),
    'LA CAROLINA I LA CAROLINA': (38.2833, -3.6167, 'La Carolina', 'Andalucía'),
    'MILAGROS MILAGROS': (41.5800, -3.7700, 'Milagros', 'Castilla y León'),
    'PARDILLA PARDILLA': (41.6800, -3.6900, 'Pardilla', 'Castilla y León'),
    'LASARTE LASARTE': (43.2700, -2.0200, 'Lasarte-Oria', 'Euskadi'),
    'LA PONDEROSA II SEVILLA': (37.3826, -5.9495, 'Sevilla', 'Andalucía'),
    '- -': None,  # generic entry, no coords
}

# Stations that are toll/motorway operators, not gas stations
PEAJES_OPERADORES = [
    'VASCO-ARAGONESA .', 'BIDEGI .', 'AULESA .', 'TUNEL ARTXANDA .',
    'AUCALSA .', 'CASTELLANA DE AUTOPISTAS SAN RAFAEL', 'ARABAT .',
]

# False positives to reset before re-geocoding
RESETEAR_NOMBRES = [
    'LA CAROLINA I LA CAROLINA', 'MILAGROS MILAGROS', 'PARDILLA PARDILLA',
    'LASARTE LASARTE', 'LA PONDEROSA II SEVILLA', '- -',
]


# ═══ Name cleaning ═══════════════════════════════════════════════════════════

def limpiar_para_nominatim(nombre, pais='ES'):
    """Clean station name for max Nominatim match probability."""
    n = str(nombre or '').strip()
    upper = n.upper()

    # Skip toll operators
    if any(x in upper for x in ['SEITT', 'BIDEGI', 'AULESA', 'AUCALSA', 'VASCO-ARAGONESA', 'TUNEL ARTXANDA']):
        return None

    # Remove prefixes
    for prefijo in ['E.S.', 'E.S', 'ES ', 'ESTACION DE SERVICIO', 'AREA DE SERVICIO',
                     'TJ CEPSA STAR', 'TJ CEPSA', 'CEPSA ']:
        if n.upper().startswith(prefijo.upper()):
            n = n[len(prefijo):].strip()

    # Remove road info
    n = re.sub(r'\s+CTRA\.?.*$', '', n, flags=re.IGNORECASE).strip()
    n = re.sub(r'\s+AUTOVIA\s+.*$', '', n, flags=re.IGNORECASE).strip()
    n = re.sub(r'\s+P\.?K\.?\s*.*$', '', n, flags=re.IGNORECASE).strip()
    n = re.sub(r'\s+KM\.?\s*.*$', '', n, flags=re.IGNORECASE).strip()
    n = re.sub(r'\s+NAC\.?\s*.*$', '', n, flags=re.IGNORECASE).strip()
    n = re.sub(r'\s+MARG\.?.*$', '', n, flags=re.IGNORECASE).strip()
    n = re.sub(r'\s+CARRETERA\s+.*$', '', n, flags=re.IGNORECASE).strip()
    n = re.sub(r'\s+CIRCUNVALACION\s+.*$', '', n, flags=re.IGNORECASE).strip()

    # Remove Portuguese motorway prefixes
    n = re.sub(r'^A\d+\s+', '', n).strip()
    # Remove parenthesized codes
    n = re.sub(r'\([^)]*\)', '', n).strip()
    # Remove commercial suffixes
    n = re.sub(r',?\s*S\.?[AL]\.?.*$', '', n, flags=re.IGNORECASE).strip()
    n = re.sub(r'\s+CTR$', '', n, flags=re.IGNORECASE).strip()
    # Remove trailing roman numerals
    n = re.sub(r'\s+(I{1,3}|IV|V)$', '', n).strip()
    # Remove dashes with numbers/roman
    n = re.sub(r'-\d+', '', n).strip()
    n = re.sub(r'-[IVX]+', '', n).strip()
    # Remove standalone numbers
    n = re.sub(r'\b\d+\b', '', n).strip()
    # Clean whitespace
    n = re.sub(r'\s+', ' ', n).strip().rstrip('.')

    return n if n else None


def extraer_municipios_probables(nombre_limpio):
    """Extract probable municipality candidates from cleaned name."""
    if not nombre_limpio:
        return []
    partes = nombre_limpio.split()
    if len(partes) <= 1:
        return [nombre_limpio]

    # Duplicated name: "CORELLA CORELLA" → "CORELLA"
    mid = len(partes) // 2
    if len(partes) % 2 == 0 and ' '.join(partes[:mid]).upper() == ' '.join(partes[mid:]).upper():
        return [' '.join(partes[mid:])]

    candidatos = []
    if len(partes) >= 3:
        candidatos.append(' '.join(partes[-3:]))
    if len(partes) >= 2:
        candidatos.append(' '.join(partes[-2:]))
    candidatos.append(partes[-1])
    candidatos.append(' '.join(partes[1:]))
    return candidatos


# ═══ Core geocoding function (improved) ═════════════════════════════════════

def _nominatim_query(q, country_code):
    """Single Nominatim search. Returns (lat, lon, muni, prov) or None."""
    try:
        resp = requests.get(NOMINATIM_URL, params={
            'q': q, 'format': 'json', 'countrycodes': country_code,
            'limit': 1, 'addressdetails': 1,
        }, headers={'User-Agent': USER_AGENT}, timeout=10)

        if resp.ok:
            data = resp.json()
            if data:
                r = data[0]
                addr = r.get('address', {})
                lat = float(r['lat'])
                lon = float(r['lon'])
                muni = addr.get('city') or addr.get('town') or addr.get('village') or addr.get('municipality')
                prov = addr.get('state') or addr.get('province')
                return lat, lon, muni, prov
        elif resp.status_code == 429:
            logger.warning("Nominatim 429, sleeping 5s")
            time.sleep(5)
    except Exception as e:
        logger.warning("Nominatim error for '%s': %s", q, e)
        time.sleep(2)
    return None


def geocodificar_estacion_mejorado(est):
    """Geocode a station using cleaned name + multiple query strategies."""
    nombre = est['nombre'] if isinstance(est, dict) else est[1]
    pais = (est.get('pais') if isinstance(est, dict) else 'ES') or 'ES'
    country_code = 'pt' if pais == 'PT' else 'es'

    # Check manual overrides first
    if nombre in COORDS_MANUALES:
        val = COORDS_MANUALES[nombre]
        if val is None:
            return None  # explicitly no coords
        return val

    nombre_limpio = limpiar_para_nominatim(nombre, pais)
    if not nombre_limpio:
        return None

    candidatos = extraer_municipios_probables(nombre_limpio)

    queries = []
    prefix = 'gasolinera' if country_code == 'es' else 'posto combustivel'
    queries.append(f"{prefix} {nombre_limpio}")
    queries.append(nombre_limpio)
    for cm in candidatos:
        if cm.upper() != nombre_limpio.upper():
            queries.append(cm)

    for q in queries:
        result = _nominatim_query(q, country_code)
        if result:
            logger.info("Geocoded '%s' via query '%s' → %s,%s", nombre, q, result[0], result[1])
            return result
        time.sleep(1.1)

    return None


# ═══ Legacy compatible single-station function ═══════════════════════════════

def geocodificar_estacion(nombre, pais="ES"):
    """Legacy wrapper — returns (lat, lon, municipio, provincia) tuple."""
    result = geocodificar_estacion_mejorado({'nombre': nombre, 'pais': pais})
    if result:
        return result
    return None, None, None, None


# ═══ Batch: pending stations ═════════════════════════════════════════════════

def geocodificar_pendientes(limit=10):
    """Process stations with geocoded=0. Uses improved geocoding."""
    conn = get_conn()
    try:
        pendientes = conn.execute(
            "SELECT id, nombre, pais FROM estaciones_servicio WHERE geocoded = 0 ORDER BY id LIMIT ?",
            (limit,),
        ).fetchall()

        stats = {"total": len(pendientes), "geocoded": 0, "fallidas": 0, "restantes": 0}

        for est in pendientes:
            try:
                logger.info("Geocoding station %d: %s", est["id"], est["nombre"])
                result = geocodificar_estacion_mejorado(dict(est))

                if result:
                    lat, lon, muni, prov = result
                    conn.execute(
                        "UPDATE estaciones_servicio SET latitud=?, longitud=?, municipio=?, provincia=?, geocoded=1 WHERE id=?",
                        (lat, lon, muni, prov, est["id"]),
                    )
                    stats["geocoded"] += 1
                else:
                    conn.execute("UPDATE estaciones_servicio SET geocoded=2 WHERE id=?", (est["id"],))
                    stats["fallidas"] += 1

                conn.commit()
            except Exception as e:
                logger.warning("Error geocoding station %d: %s", est["id"], e)
                stats["fallidas"] += 1

        stats["restantes"] = conn.execute(
            "SELECT COUNT(*) FROM estaciones_servicio WHERE geocoded = 0"
        ).fetchone()[0]
        return stats
    finally:
        conn.close()


# ═══ Full geocoding: fix false positives + clean + retry all ═════════════════

def geocodificar_completo():
    """One-shot full geocoding: reset FPs, mark tolls, manual coords, Nominatim retry."""
    conn = get_conn()
    try:
        stats = {'corregidos_fp': 0, 'peajes_marcados': 0, 'seitt': 0,
                 'manual': 0, 'nominatim': 0, 'fallidas': 0, 'ya_ok': 0}

        # ── FASE A: Reset false positives ──
        for nombre in RESETEAR_NOMBRES:
            cur = conn.execute(
                "UPDATE estaciones_servicio SET geocoded=0, latitud=NULL, longitud=NULL, municipio=NULL, provincia=NULL WHERE nombre=?",
                (nombre,),
            )
            if cur.rowcount > 0:
                stats['corregidos_fp'] += cur.rowcount

        # Mark toll operators
        for nombre in PEAJES_OPERADORES:
            cur = conn.execute("UPDATE estaciones_servicio SET marca='peaje' WHERE nombre=?", (nombre,))
            if cur.rowcount > 0:
                stats['peajes_marcados'] += cur.rowcount

        # ── FASE B: SEITT as tolls ──
        cur = conn.execute("""
            UPDATE estaciones_servicio
            SET marca='peaje', geocoded=1, latitud=40.4168, longitud=-3.7038,
                municipio='Madrid', provincia='Comunidad de Madrid'
            WHERE nombre LIKE '%SEITT%' AND geocoded != 1
        """)
        stats['seitt'] = cur.rowcount

        conn.commit()

        # ── FASE C: Process all pending (0 or 2) ──
        pendientes = conn.execute(
            "SELECT id, nombre, pais FROM estaciones_servicio WHERE geocoded IN (0, 2) ORDER BY id"
        ).fetchall()

        for est in pendientes:
            nombre = est['nombre']
            est_dict = dict(est)

            result = geocodificar_estacion_mejorado(est_dict)

            if result:
                lat, lon, muni, prov = result
                conn.execute(
                    "UPDATE estaciones_servicio SET latitud=?, longitud=?, municipio=?, provincia=?, geocoded=1 WHERE id=?",
                    (lat, lon, muni, prov, est['id']),
                )
                if nombre in COORDS_MANUALES:
                    stats['manual'] += 1
                else:
                    stats['nominatim'] += 1
            else:
                conn.execute("UPDATE estaciones_servicio SET geocoded=3 WHERE id=?", (est['id'],))
                stats['fallidas'] += 1

            conn.commit()

        # Final counts
        counts = conn.execute(
            "SELECT geocoded, COUNT(*) as n FROM estaciones_servicio GROUP BY geocoded"
        ).fetchall()
        stats['resumen'] = {str(r['geocoded']): r['n'] for r in counts}

        logger.info("Geocodificación completa: %s", stats)
        return stats
    finally:
        conn.close()
