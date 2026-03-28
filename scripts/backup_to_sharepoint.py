#!/usr/bin/env python3
"""Sube un archivo de backup a SharePoint/OneDrive via Microsoft Graph API."""
import sys
import os
import requests


def main():
    if len(sys.argv) < 2:
        print("Uso: backup_to_sharepoint.py <archivo>")
        sys.exit(1)

    filepath = sys.argv[1]
    if not os.path.exists(filepath):
        print(f"Archivo no encontrado: {filepath}")
        sys.exit(1)

    # Credenciales desde variables de entorno
    client_id = os.environ.get('MICROSOFT_CLIENT_ID', '')
    tenant_id = os.environ.get('MICROSOFT_TENANT_ID', '')
    client_secret = os.environ.get('MICROSOFT_CLIENT_SECRET', '')
    site_path = os.environ.get('SHAREPOINT_SITE', '')

    if not client_id or not tenant_id or not client_secret:
        print("Variables de Microsoft no configuradas, skip subida a OneDrive")
        sys.exit(0)

    # Obtener token
    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    token_resp = requests.post(token_url, data={
        'grant_type': 'client_credentials',
        'client_id': client_id,
        'client_secret': client_secret,
        'scope': 'https://graph.microsoft.com/.default'
    })
    if token_resp.status_code != 200:
        print(f"Error obteniendo token: {token_resp.status_code}")
        sys.exit(1)

    token = token_resp.json()['access_token']
    headers = {'Authorization': f'Bearer {token}'}

    # Obtener site ID
    site_resp = requests.get(
        f"https://graph.microsoft.com/v1.0/sites/{site_path}", headers=headers
    )
    if site_resp.status_code != 200:
        print(f"Error accediendo al sitio: {site_resp.status_code}")
        sys.exit(1)
    site_id = site_resp.json()['id']

    # Obtener drive ID
    drives_resp = requests.get(
        f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives", headers=headers
    )
    drives = drives_resp.json().get('value', [])
    drive_id = drives[0]['id'] if drives else None
    if not drive_id:
        print("No se encontro drive en el sitio de SharePoint")
        sys.exit(1)

    # Subir archivo
    filename = os.path.basename(filepath)
    root_folder = os.environ.get('SHAREPOINT_ROOT_FOLDER', 'ERP Hincado Directo')
    upload_path = f"{root_folder}/Backups/{filename}"
    upload_url = (
        f"https://graph.microsoft.com/v1.0/drives/{drive_id}"
        f"/root:/{upload_path}:/content"
    )

    with open(filepath, 'rb') as f:
        content = f.read()

    headers['Content-Type'] = 'application/octet-stream'
    resp = requests.put(upload_url, headers=headers, data=content)

    if resp.status_code in (200, 201):
        print(f"Backup subido a OneDrive: {upload_path}")
    else:
        print(f"Error subiendo backup: {resp.status_code} {resp.text[:200]}")
        sys.exit(1)


if __name__ == '__main__':
    main()
