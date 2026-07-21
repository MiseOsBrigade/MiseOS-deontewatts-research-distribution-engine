#!/usr/bin/env python3
"""Benchmark calculator for the mirror-coupled dark-sector manuscripts.

This script is a scaling and regime-check tool, not a replacement for a
partial-wave Schrödinger solver or a cosmological Boltzmann code.
"""
from __future__ import annotations

import math

ALPHA = 1.0 / 137.035999177
HBARC_MEV_FM = 197.3269804
CM2_PER_G_TO_GEV3 = 4.578e3


def benchmark(m_chi_gev: float = 10.0, m_med_mev: float = 35.0) -> dict[str, float]:
    m_med_gev = m_med_mev / 1_000.0
    g_d = math.sqrt(4.0 * math.pi * ALPHA)
    force_range_fm = HBARC_MEV_FM / m_med_mev
    kappa = ALPHA * m_chi_gev / m_med_gev
    contact_sigma_over_m = 4.0 * math.pi * ALPHA**2 * m_chi_gev / m_med_gev**4
    contact_sigma_over_m_cm2g = contact_sigma_over_m / CM2_PER_G_TO_GEV3
    return {
        "alpha_D": ALPHA,
        "g_D": g_d,
        "force_range_fm": force_range_fm,
        "kappa": kappa,
        "contact_sigma_over_m_cm2g": contact_sigma_over_m_cm2g,
    }


def main() -> None:
    result = benchmark()
    for key, value in result.items():
        print(f"{key}: {value:.8g}")
    if result["kappa"] >= 0.1:
        print("WARNING: benchmark is not safely in the Born regime; use a partial-wave solver.")


if __name__ == "__main__":
    main()
