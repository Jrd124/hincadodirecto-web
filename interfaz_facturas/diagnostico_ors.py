"""Diagnóstico rápido: clave ORS y llamada a Directions."""
import json
import urllib.request
import urllib.error
import sys
sys.path.insert(0, ".")
from interfaz_facturas.config import OPENROUTESERVICE_API_KEY

k = OPENROUTESERVICE_API_KEY
print("Clave cargada:", "Sí" if k else "No")
print("Longitud:", len(k))
print("Termina en '=':", k.endswith("="))
print("Últimos 5 caracteres:", repr(k[-5:]))

url = "https://api.openrouteservice.org/v2/directions/driving-car"
body = json.dumps({
    "coordinates": [[-3.7038, 40.4168], [-5.9845, 37.3891]],
    "instructions": False,
}).encode("utf-8")
req = urllib.request.Request(
    url,
    data=body,
    headers={"Content-Type": "application/json", "Authorization": k},
    method="POST",
)
try:
    resp = urllib.request.urlopen(req, timeout=15)
    data = json.loads(resp.read().decode("utf-8"))
    dist = data.get("routes", [{}])[0].get("summary", {}).get("distance")
    print("ORS OK. Distancia (m):", dist)
    geom = data.get("routes", [{}])[0].get("geometry")
    print("Geometry presente:", geom is not None, type(geom).__name__)
except urllib.error.HTTPError as e:
    print("HTTP", e.code)
    print(e.read().decode("utf-8"))
except Exception as e:
    print(type(e).__name__, str(e))
