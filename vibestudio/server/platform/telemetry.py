"""Tracing for the app: ADK's spans (each node, each model call, each tool
call) exported to Cloud Trace in the app's project.

On by default when a project is known. STUDIO_TRACING=0 turns it off. The
learning center does not do this; only the app does.
"""
from __future__ import annotations

import os

from ..agent.platform import config


def setup_tracing() -> str:
    """Install the Cloud Trace exporter on the global tracer provider. Returns
    one line saying what happened, for the startup log."""
    if os.environ.get("STUDIO_TRACING", "1").lower() in ("0", "false", "off"):
        return "tracing off (STUDIO_TRACING=0)"
    project = os.environ.get("STUDIO_GCP_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT") or getattr(config, "PROJECT", None)
    if not project:
        return "tracing off: no project (set GOOGLE_CLOUD_PROJECT)"
    os.environ.setdefault("OTEL_SERVICE_NAME", "vibestudio")
    try:
        from google.adk.telemetry.google_cloud import get_gcp_exporters, get_gcp_resource
        from google.adk.telemetry.setup import maybe_set_otel_providers
        maybe_set_otel_providers([get_gcp_exporters(enable_cloud_tracing=True)],
                                 otel_resource=get_gcp_resource(project))
    except Exception as e:  # never keep the app from starting over telemetry
        return f"tracing off: {type(e).__name__}: {str(e)[:120]}"
    return f"tracing on: Cloud Trace, project {project}, service vibestudio"
