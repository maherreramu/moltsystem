"""
utils/clickup_client.py — Cliente REST paginado para ClickUp API v2.
Lee CLICKUP_API_TOKEN (o CLICKUP_TOKEN como alias) desde .env.local.
Usa httpx (disponible como dependencia transitiva de supabase-py).

Resiliencia: usa un httpx.Client persistente (resuelve DNS y abre la conexión
una vez, reutilizándola entre páginas vía keep-alive) y reintenta con backoff
ante fallos transitorios de transporte (getaddrinfo intermitente en Windows,
timeouts de conexión) además del manejo de rate-limit (429).
"""

import os
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

_ROOT = Path(__file__).parent.parent
load_dotenv(_ROOT / ".env.local")

API_BASE = "https://api.clickup.com/api/v2"
MAX_ATTEMPTS = 5


class ClickUpClient:
    def __init__(self):
        token = os.environ.get("CLICKUP_API_TOKEN") or os.environ.get("CLICKUP_TOKEN")
        if not token:
            raise EnvironmentError(
                "CLICKUP_API_TOKEN (o CLICKUP_TOKEN como alias) debe estar en .env.local"
            )
        # trust_env=False: ignora proxies/netrc del entorno (API directa).
        # Cliente persistente => resuelve DNS y abre conexión una vez.
        self._client = httpx.Client(
            base_url=API_BASE,
            headers={"Authorization": token},
            timeout=30,
            trust_env=False,
        )

    def get_list_tasks(self, list_id: str) -> list[dict]:
        """Retorna todas las tareas de una lista (paginado, incluye subtareas).

        Usa include_closed=true y subtasks=true para capturar todas las OP-Ds
        y sus subtareas fase-plan en una sola secuencia de páginas.
        Las subtareas vienen con campo 'parent' != null.
        """
        tasks: list[dict] = []
        page = 0
        while True:
            data = self._get(f"/list/{list_id}/task", params={
                "include_closed": "true",
                "subtasks": "true",
                "page": str(page),
            })
            batch = data.get("tasks", [])
            if not batch:
                break
            tasks.extend(batch)
            if data.get("last_page", True):
                break
            page += 1
        return tasks

    def _get(self, path: str, params: dict | None = None) -> dict:
        for attempt in range(MAX_ATTEMPTS):
            try:
                r = self._client.get(path, params=params)
            except httpx.TransportError as exc:
                # getaddrinfo failed / connect timeout / reset → transitorio
                if attempt == MAX_ATTEMPTS - 1:
                    raise
                wait = 2 ** attempt
                print(
                    f"  Error de red ({type(exc).__name__}: {exc}); "
                    f"reintentando en {wait}s…",
                    flush=True,
                )
                time.sleep(wait)
                continue
            if r.status_code == 429:
                wait = 2 ** attempt
                print(f"  Rate limit hit, esperando {wait}s…", flush=True)
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        raise RuntimeError(f"ClickUp API: fallo persistente en {path}")
