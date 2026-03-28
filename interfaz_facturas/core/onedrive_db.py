import os
import requests
import logging
from pathlib import Path

logger = logging.getLogger("erp")


class SharePointClient:
    """Cliente para acceder a SharePoint/OneDrive via Microsoft Graph API."""

    def __init__(self):
        self.client_id = os.environ.get("MICROSOFT_CLIENT_ID", "")
        self.tenant_id = os.environ.get("MICROSOFT_TENANT_ID", "")
        self.client_secret = os.environ.get("MICROSOFT_CLIENT_SECRET", "")
        self.site_path = os.environ.get("SHAREPOINT_SITE", "")
        self.doc_library = os.environ.get("SHAREPOINT_DOC_LIBRARY", "Shared Documents")
        self.root_folder = os.environ.get("SHAREPOINT_ROOT_FOLDER", "ERP Hincado Directo")
        self._token = None
        self._site_id = None
        self._drive_id = None

    def _get_token(self) -> str:
        """Obtiene token de acceso via client credentials flow."""
        if self._token:
            return self._token

        url = f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token"
        data = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "scope": "https://graph.microsoft.com/.default",
        }

        resp = requests.post(url, data=data)
        if resp.status_code != 200:
            logger.error(f"Error obteniendo token: {resp.status_code} {resp.text}")
            raise Exception(f"Error de autenticación con Microsoft: {resp.status_code}")

        self._token = resp.json()["access_token"]
        return self._token

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._get_token()}"}

    def _get_site_id(self) -> str:
        """Obtiene el ID del sitio SharePoint."""
        if self._site_id:
            return self._site_id

        url = f"https://graph.microsoft.com/v1.0/sites/{self.site_path}"
        resp = requests.get(url, headers=self._headers())
        if resp.status_code != 200:
            logger.error(f"Error obteniendo site: {resp.status_code} {resp.text}")
            raise Exception(f"No se pudo acceder al sitio SharePoint: {resp.status_code}")

        self._site_id = resp.json()["id"]
        return self._site_id

    def _get_drive_id(self) -> str:
        """Obtiene el ID del drive (biblioteca de documentos)."""
        if self._drive_id:
            return self._drive_id

        site_id = self._get_site_id()
        url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives"
        resp = requests.get(url, headers=self._headers())
        if resp.status_code != 200:
            raise Exception(f"Error obteniendo drives: {resp.status_code}")

        drives = resp.json().get("value", [])
        for d in drives:
            if d.get("name") == self.doc_library or d.get("name") == "Documents":
                self._drive_id = d["id"]
                return self._drive_id

        if drives:
            self._drive_id = drives[0]["id"]
            return self._drive_id

        raise Exception("No se encontró biblioteca de documentos")

    def _graph_path(self, folder_path: str) -> str:
        """Construye la ruta de la API Graph para una carpeta."""
        drive_id = self._get_drive_id()
        full_path = f"{self.root_folder}/{folder_path}".strip("/")
        return f"https://graph.microsoft.com/v1.0/drives/{drive_id}/root:/{full_path}"

    def listar_archivos(self, folder_path: str) -> list:
        """Lista archivos en una carpeta de SharePoint."""
        url = f"{self._graph_path(folder_path)}:/children"
        resp = requests.get(url, headers=self._headers())
        if resp.status_code != 200:
            logger.warning(f"Error listando {folder_path}: {resp.status_code}")
            return []

        items = resp.json().get("value", [])
        return [
            {
                "name": i["name"],
                "size": i.get("size", 0),
                "modified": i.get("lastModifiedDateTime", ""),
                "id": i["id"],
                "download_url": i.get("@microsoft.graph.downloadUrl", ""),
                "web_url": i.get("webUrl", ""),
                "is_folder": "folder" in i,
            }
            for i in items
        ]

    def obtener_url_descarga(self, file_path: str) -> str | None:
        """Obtiene URL de descarga temporal para un archivo."""
        url = self._graph_path(file_path)
        resp = requests.get(url, headers=self._headers())
        if resp.status_code != 200:
            logger.warning(f"Error obteniendo URL de {file_path}: {resp.status_code}")
            return None

        return resp.json().get("@microsoft.graph.downloadUrl")

    def descargar_archivo(self, file_path: str) -> bytes | None:
        """Descarga el contenido de un archivo."""
        download_url = self.obtener_url_descarga(file_path)
        if not download_url:
            return None

        resp = requests.get(download_url)
        if resp.status_code == 200:
            return resp.content
        return None

    def subir_archivo(
        self, file_path: str, contenido: bytes, content_type: str = "application/pdf"
    ) -> dict | None:
        """Sube un archivo a SharePoint. Crea carpetas intermedias si no existen."""
        drive_id = self._get_drive_id()
        full_path = f"{self.root_folder}/{file_path}".strip("/")

        # Para archivos < 4MB, upload simple
        if len(contenido) < 4 * 1024 * 1024:
            url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/root:/{full_path}:/content"
            headers = self._headers()
            headers["Content-Type"] = content_type
            resp = requests.put(url, headers=headers, data=contenido)

            if resp.status_code in (200, 201):
                logger.info(f"Archivo subido a SharePoint: {full_path}")
                return resp.json()
            else:
                logger.error(f"Error subiendo {full_path}: {resp.status_code} {resp.text}")
                return None

        logger.warning(
            f"Archivo demasiado grande para upload simple: {full_path} ({len(contenido)} bytes)"
        )
        return None

    def verificar_conexion(self) -> dict:
        """Verifica que la conexión con SharePoint funciona."""
        try:
            site_id = self._get_site_id()
            drive_id = self._get_drive_id()
            archivos = self.listar_archivos("")
            return {
                "ok": True,
                "site_id": site_id,
                "drive_id": drive_id,
                "root_items": len(archivos),
                "root_folders": [a["name"] for a in archivos if a["is_folder"]],
            }
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # === METODOS DELTA SYNC (CAE) === #

    def delta_sync(self, drive_id: str, folder_id: str, delta_token: str | None = None) -> tuple[list, str | None]:
        """Sincronizacion incremental de una carpeta via delta query.

        Si delta_token es None, hace full sync.
        Devuelve (lista_items, nuevo_delta_token).
        """
        if delta_token:
            url = delta_token  # El delta token ES la URL completa de la siguiente pagina
        else:
            url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{folder_id}/delta"

        all_items = []
        new_token = None

        while url:
            resp = requests.get(url, headers=self._headers())
            if resp.status_code != 200:
                logger.error(f"Error delta sync: {resp.status_code} {resp.text}")
                break

            data = resp.json()
            items = data.get("value", [])
            all_items.extend(items)

            # Paginar si hay @odata.nextLink
            url = data.get("@odata.nextLink")

            # El delta link final para la proxima sincronizacion
            if "@odata.deltaLink" in data:
                new_token = data["@odata.deltaLink"]

        return all_items, new_token

    def obtener_carpetas_drive(self, drive_id: str, folder_id: str | None = None) -> list:
        """Lista subcarpetas de un drive/folder (para explorador de carpetas CAE).

        Si folder_id es None, lista la raiz del drive.
        """
        if folder_id:
            url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{folder_id}/children"
        else:
            url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/root/children"

        resp = requests.get(url, headers=self._headers())
        if resp.status_code != 200:
            logger.warning(f"Error listando carpetas: {resp.status_code}")
            return []

        items = resp.json().get("value", [])
        return [
            {
                "id": i["id"],
                "name": i["name"],
                "is_folder": "folder" in i,
                "child_count": i.get("folder", {}).get("childCount", 0) if "folder" in i else 0,
                "path": i.get("parentReference", {}).get("path", "") + "/" + i["name"],
                "size": i.get("size", 0),
                "modified": i.get("lastModifiedDateTime", ""),
            }
            for i in items
        ]

    def resolve_folder_path(self, drive_id: str, folder_id: str) -> str:
        """Obtiene la ruta completa de un folder."""
        url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{folder_id}"
        resp = requests.get(url, headers=self._headers())
        if resp.status_code != 200:
            return ""
        data = resp.json()
        parent_path = data.get("parentReference", {}).get("path", "")
        return f"{parent_path}/{data.get('name', '')}"

    def obtener_drives(self) -> list:
        """Lista todos los drives disponibles (para seleccionar en config CAE)."""
        site_id = self._get_site_id()
        url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives"
        resp = requests.get(url, headers=self._headers())
        if resp.status_code != 200:
            return []
        return [
            {"id": d["id"], "name": d.get("name", ""), "web_url": d.get("webUrl", "")}
            for d in resp.json().get("value", [])
        ]


_client = None


def get_sharepoint_client() -> SharePointClient:
    global _client
    if _client is None:
        _client = SharePointClient()
    return _client
