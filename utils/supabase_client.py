"""
utils/supabase_client.py — Cliente Supabase para scripts Python.
Sigue el patrón de utils/storage.py del repo anterior.
Carga credenciales desde .env.local (SUPABASE_URL + SUPABASE_SERVICE_KEY).
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

# Buscar .env.local en la raíz del repo
_ROOT = Path(__file__).parent.parent
load_dotenv(_ROOT / ".env.local")


def get_client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise EnvironmentError(
            "SUPABASE_URL y SUPABASE_SERVICE_KEY deben estar en .env.local"
        )
    return create_client(url, key)
