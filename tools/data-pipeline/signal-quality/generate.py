#!/usr/bin/env python3
"""Generate deterministic, drive-test-like Signal Quality measurements.

The radio sites in this script are synthetic anchors, not claimed Tunisie Telecom
antenna locations. Replace them later with verified site coordinates if available.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


CRS = "urn:ogc:def:crs:OGC:1.3:CRS84"
DEFAULT_OUTPUT = "apps/frontend/public/data/signal-quality.json"
DEFAULT_POINTS = 30000
DEFAULT_SEED = 20260831

# Whole Tunisia.
METRO_BBOX = (7.45, 11.65, 30.15, 37.70)


# [longitude, latitude]
AREAS = [
    # ============================================================
    # GRAND TUNIS
    # ============================================================

    ("Tunis", "urban", 10.165863, 36.797450, 5200, 0.035, 0.025, 86, 5),
    ("Berges du Lac", "dense", 10.238863, 36.834981, 2800, 0.024, 0.018, 94, 3),
    ("Centre Urbain Nord", "dense", 10.198350, 36.847630, 2600, 0.022, 0.018, 94, 3),
    ("Montplaisir", "dense", 10.186370, 36.817030, 1700, 0.018, 0.014, 91, 4),
    ("El Menzah", "urban", 10.157300, 36.838400, 1800, 0.020, 0.016, 89, 4),
    ("Sijoumi", "suburban", 10.158200, 36.795600, 900, 0.025, 0.020, 67, 6),

    ("Ariana Ville", "dense", 10.193000, 36.866000, 2600, 0.025, 0.020, 88, 4),
    ("La Soukra", "urban", 10.243807, 36.867433, 2400, 0.030, 0.023, 84, 5),
    ("Mnihla", "suburban", 10.110800, 36.847700, 900, 0.028, 0.024, 68, 7),
    ("Raoued", "suburban", 10.191364, 36.954487, 800, 0.034, 0.026, 73, 7),
    ("Sidi Thabet", "rural", 10.049300, 36.914400, 420, 0.043, 0.034, 57, 9),

    ("Ben Arous", "urban", 10.210000, 36.740000, 2400, 0.027, 0.023, 83, 5),
    ("Megrine", "dense", 10.230100, 36.773100, 1900, 0.023, 0.018, 87, 5),
    ("Rades", "urban", 10.280000, 36.760000, 2200, 0.029, 0.023, 86, 5),
    ("El Mourouj", "urban", 10.210800, 36.717900, 2400, 0.032, 0.025, 78, 6),
    ("Boumhel El Bassatine", "suburban", 10.283500, 36.722900, 900, 0.030, 0.024, 72, 7),
    ("Fouchana", "suburban", 10.181300, 36.694900, 700, 0.034, 0.028, 66, 8),
    ("Hammam Lif", "urban", 10.341630, 36.728660, 1100, 0.030, 0.023, 80, 6),
    ("Mornag", "rural", 10.290200, 36.680700, 450, 0.048, 0.038, 57, 10),

    # ============================================================
    # NABEUL
    # ============================================================

    ("Nabeul", "dense", 10.733330, 36.450000, 3800, 0.030, 0.024, 89, 4),
    ("Hammamet", "dense", 10.616670, 36.400000, 3600, 0.035, 0.027, 89, 4),
    ("Dar Chaabane", "urban", 10.751000, 36.469000, 1700, 0.033, 0.026, 84, 5),
    ("Korba", "urban", 10.858000, 36.578000, 1900, 0.038, 0.030, 80, 6),
    ("Menzel Temime", "urban", 10.999000, 36.788000, 1700, 0.040, 0.032, 78, 7),
    ("Kelibia", "urban", 11.093000, 36.848000, 1900, 0.040, 0.032, 81, 6),
    ("Soliman", "urban", 10.488000, 36.699000, 1500, 0.037, 0.030, 77, 7),
    ("Grombalia", "urban", 10.500000, 36.578000, 1500, 0.040, 0.032, 75, 7),
    ("Menzel Bouzelfa", "suburban", 10.583000, 36.682000, 900, 0.045, 0.036, 69, 8),
    ("El Haouaria", "suburban", 11.014000, 37.051000, 700, 0.050, 0.040, 68, 9),

    # ============================================================
    # BIZERTE
    # ============================================================

    ("Bizerte", "dense", 9.870000, 37.290000, 4000, 0.033, 0.026, 87, 4),
    ("Zarzouna", "urban", 9.886000, 37.260000, 2300, 0.028, 0.023, 84, 5),
    ("Menzel Jemil", "urban", 9.914000, 37.236000, 2200, 0.030, 0.024, 83, 5),
    ("Menzel Bourguiba", "dense", 9.786000, 37.154000, 3000, 0.032, 0.026, 84, 5),
    ("Tinja", "suburban", 9.761000, 37.160000, 1500, 0.035, 0.029, 76, 6),
    ("Ras Jebel", "urban", 10.135000, 37.211000, 1700, 0.034, 0.027, 78, 6),
    ("Rafraf", "suburban", 10.184000, 37.190000, 900, 0.039, 0.032, 72, 7),
    ("Ghar El Melh", "suburban", 10.190000, 37.170000, 800, 0.042, 0.034, 71, 8),
    ("El Alia", "suburban", 9.996000, 37.158000, 1100, 0.040, 0.031, 73, 7),
    ("Mateur", "urban", 9.666000, 37.040000, 1900, 0.038, 0.031, 74, 7),
    ("Sejnane", "rural", 9.239000, 37.060000, 450, 0.060, 0.048, 56, 11),
    ("Joumine", "rural", 9.570000, 36.920000, 350, 0.065, 0.052, 52, 12),
    ("Ghezala", "rural", 9.550000, 36.950000, 400, 0.060, 0.048, 55, 11),
    ("Utique", "rural", 9.980000, 37.060000, 500, 0.052, 0.043, 61, 10),

    # ============================================================
    # BEJA
    # ============================================================

    ("Beja", "urban", 9.183330, 36.733330, 2100, 0.040, 0.032, 76, 7),
    ("Medjez El Bab", "urban", 9.610000, 36.650000, 1300, 0.042, 0.034, 72, 8),
    ("Testour", "suburban", 9.443000, 36.551000, 800, 0.048, 0.038, 65, 9),
    ("Nefza", "suburban", 9.500000, 36.970000, 700, 0.055, 0.044, 61, 10),
    ("Teboursouk", "suburban", 9.247000, 36.456000, 650, 0.052, 0.042, 63, 10),
    ("Amdoun", "rural", 9.121000, 36.833000, 450, 0.060, 0.048, 57, 11),

    # ============================================================
    # JENDOUBA
    # ============================================================

    ("Jendouba", "urban", 8.779440, 36.501110, 1900, 0.040, 0.032, 73, 8),
    ("Tabarka", "urban", 8.754000, 36.954000, 1500, 0.042, 0.034, 76, 7),
    ("Ain Draham", "suburban", 8.785000, 36.775000, 700, 0.050, 0.040, 67, 9),
    ("Bou Salem", "urban", 8.970000, 36.611000, 1300, 0.042, 0.034, 69, 8),
    ("Fernana", "suburban", 8.697000, 36.655000, 650, 0.053, 0.042, 61, 10),
    ("Ghardimaou", "suburban", 8.450000, 36.447000, 700, 0.052, 0.042, 60, 10),

    # ============================================================
    # KEF
    # ============================================================

    ("Le Kef", "urban", 8.710000, 36.190000, 1900, 0.042, 0.034, 70, 8),
    ("Tajerouine", "suburban", 8.553000, 35.891000, 850, 0.048, 0.039, 63, 10),
    ("Dahmani", "suburban", 8.830000, 35.940000, 750, 0.050, 0.040, 62, 10),
    ("Sers", "suburban", 9.025000, 36.050000, 700, 0.052, 0.042, 60, 10),
    ("Nebeur", "rural", 8.800000, 36.350000, 400, 0.062, 0.050, 54, 12),

    # ============================================================
    # SILiana
    # ============================================================

    ("Siliana", "urban", 9.366670, 36.083330, 1700, 0.044, 0.035, 69, 8),
    ("Makthar", "urban", 9.200000, 35.856000, 1000, 0.048, 0.039, 65, 10),
    ("Bou Arada", "suburban", 9.620000, 36.350000, 700, 0.052, 0.042, 62, 10),
    ("Gaafour", "suburban", 9.325000, 36.320000, 700, 0.051, 0.041, 61, 10),
    ("Kesra", "rural", 9.365000, 35.810000, 400, 0.062, 0.050, 56, 12),

    # ============================================================
    # ZAGHOUAN
    # ============================================================

    ("Zaghouan", "urban", 10.140000, 36.400000, 1600, 0.040, 0.032, 72, 8),
    ("El Fahs", "urban", 9.906000, 36.375000, 1300, 0.043, 0.035, 68, 9),
    ("Nadhour", "suburban", 10.120000, 36.250000, 650, 0.052, 0.042, 62, 10),
    ("Bir Mcherga", "suburban", 9.960000, 36.520000, 600, 0.051, 0.041, 63, 10),

    # ============================================================
    # SOUSSE
    # ============================================================

    ("Sousse", "dense", 10.641110, 35.825560, 5000, 0.033, 0.025, 90, 4),
    ("Sousse Riadh", "dense", 10.611000, 35.831000, 2800, 0.027, 0.022, 88, 4),
    ("Sousse Jawhara", "dense", 10.640000, 35.839000, 2600, 0.025, 0.020, 91, 4),
    ("Sousse Sidi Abdelhamid", "urban", 10.610000, 35.790000, 1900, 0.031, 0.025, 84, 5),
    ("Hammam Sousse", "dense", 10.592880, 35.858692, 3000, 0.028, 0.023, 89, 4),
    ("Akouda", "urban", 10.571200, 35.871200, 2300, 0.030, 0.024, 84, 5),
    ("Kalaa Kebira", "urban", 10.535202, 35.870969, 2200, 0.034, 0.027, 80, 6),
    ("Kalaâ Seghira", "suburban", 10.559000, 35.780000, 1400, 0.035, 0.028, 76, 7),
    ("Hergla", "suburban", 10.509000, 36.030000, 900, 0.042, 0.034, 76, 7),
    ("Sidi Bou Ali", "suburban", 10.476000, 35.955000, 850, 0.043, 0.035, 72, 8),
    ("M'saken", "dense", 10.578375, 35.730489, 3000, 0.034, 0.027, 84, 5),
    ("Zaouia Ksiba Thrayet", "suburban", 10.600000, 35.770000, 1000, 0.038, 0.030, 77, 7),
    ("Enfidha", "urban", 10.377445, 36.133958, 1500, 0.044, 0.036, 73, 8),
    ("Bouficha", "urban", 10.454865, 36.300000, 1100, 0.048, 0.038, 70, 9),
    ("Kondar", "rural", 10.270000, 35.920000, 450, 0.058, 0.046, 59, 11),
    ("Sidi El Heni", "rural", 10.380000, 35.720000, 500, 0.055, 0.044, 60, 11),

    # ============================================================
    # MONASTIR
    # ============================================================

    ("Monastir", "dense", 10.820000, 35.790000, 4000, 0.032, 0.025, 90, 4),
    ("Sahline", "urban", 10.700000, 35.750000, 1800, 0.035, 0.028, 84, 5),
    ("Ouerdanine", "urban", 10.672000, 35.694000, 1400, 0.038, 0.030, 77, 7),
    ("Ksibet El Mediouni", "dense", 10.813000, 35.649000, 2200, 0.030, 0.024, 84, 5),
    ("Sayada", "urban", 10.838000, 35.655000, 1900, 0.031, 0.025, 83, 5),
    ("Jammel", "dense", 10.760000, 35.640000, 2500, 0.036, 0.029, 80, 6),
    ("Bembla", "urban", 10.790000, 35.700000, 1600, 0.038, 0.030, 77, 7),
    ("Beni Hassen", "suburban", 10.758000, 35.519000, 900, 0.048, 0.039, 69, 9),
    ("Zeramdine", "suburban", 10.730000, 35.570000, 800, 0.049, 0.040, 67, 9),
    ("Ksar Helal", "dense", 10.862000, 35.641000, 3000, 0.029, 0.023, 86, 5),
    ("Moknine", "dense", 10.850000, 35.530000, 3200, 0.030, 0.024, 85, 5),
    ("Teboulba", "urban", 10.966000, 35.642000, 2400, 0.033, 0.026, 82, 6),
    ("Bekalta", "urban", 11.000000, 35.617000, 1500, 0.038, 0.031, 77, 7),

    # ============================================================
    # MAHDIA
    # ============================================================

    ("Mahdia", "dense", 11.070000, 35.520000, 3000, 0.033, 0.026, 86, 5),
    ("Ksour Essef", "urban", 10.995000, 35.417000, 1800, 0.037, 0.030, 79, 7),
    ("Chebba", "urban", 11.115000, 35.237000, 1400, 0.040, 0.032, 75, 8),
    ("Melloulech", "suburban", 11.035000, 35.183000, 900, 0.045, 0.036, 69, 9),
    ("El Jem", "urban", 10.705000, 35.300000, 1700, 0.042, 0.034, 72, 8),
    ("Hebira", "rural", 10.950000, 35.330000, 550, 0.055, 0.045, 58, 11),

    # ============================================================
    # KAIROUAN
    # ============================================================

    ("Kairouan", "urban", 10.100000, 35.680000, 2800, 0.042, 0.034, 72, 8),
    ("Haffouz", "suburban", 9.675000, 35.633000, 900, 0.050, 0.041, 62, 10),
    ("Oueslatia", "suburban", 9.650000, 35.860000, 850, 0.052, 0.042, 61, 10),
    ("Sbikha", "suburban", 10.020000, 35.930000, 900, 0.050, 0.040, 63, 10),
    ("Bou Hajla", "suburban", 10.116000, 35.363000, 750, 0.052, 0.042, 60, 10),
    ("Chebika", "rural", 9.866000, 35.614000, 450, 0.060, 0.048, 54, 12),

    # ============================================================
    # KASSERINE
    # ============================================================

    ("Kasserine", "urban", 8.830000, 35.180000, 2200, 0.045, 0.036, 66, 9),
    ("Foussana", "suburban", 8.550000, 35.080000, 750, 0.055, 0.044, 58, 11),
    ("Feriana", "suburban", 8.570000, 34.950000, 800, 0.055, 0.044, 59, 11),
    ("Sbeitla", "urban", 9.070000, 35.230000, 1400, 0.048, 0.039, 64, 10),
    ("Thala", "urban", 8.670000, 35.570000, 1000, 0.052, 0.042, 60, 11),
    ("Jediliane", "rural", 8.580000, 35.430000, 450, 0.062, 0.050, 54, 12),

    # ============================================================
    # SIDI BOUZID
    # ============================================================

    ("Sidi Bouzid", "urban", 9.493610, 35.040280, 2200, 0.045, 0.036, 67, 9),
    ("Regueb", "urban", 9.786000, 34.860000, 1100, 0.050, 0.041, 61, 10),
    ("Meknassy", "urban", 9.608000, 34.612000, 950, 0.052, 0.042, 59, 11),
    ("Jilma", "suburban", 9.430000, 35.270000, 750, 0.052, 0.042, 59, 11),
    ("Bir El Hafey", "suburban", 9.190000, 34.932000, 650, 0.055, 0.044, 57, 11),
    ("Ouled Haffouz", "rural", 9.330000, 35.045000, 450, 0.062, 0.050, 53, 12),

    # ============================================================
    # SFAX
    # ============================================================

    ("Sfax Ville", "dense", 10.762800, 34.744600, 5200, 0.035, 0.028, 88, 4),
    ("Sfax Ouest", "urban", 10.727000, 34.745000, 2600, 0.040, 0.032, 82, 5),
    ("Sfax Sud", "urban", 10.760000, 34.690000, 2300, 0.045, 0.035, 79, 6),
    ("Sakiet Ezzit", "dense", 10.764900, 34.802900, 3400, 0.030, 0.024, 86, 4),
    ("Chihia", "urban", 10.742700, 34.795100, 2500, 0.027, 0.022, 88, 4),
    ("Sakiet Eddaier", "urban", 10.785600, 34.793100, 2800, 0.030, 0.024, 84, 5),
    ("Gremda", "dense", 10.720600, 34.790800, 3000, 0.033, 0.026, 85, 5),
    ("Teniour", "suburban", 10.735500, 34.804700, 1500, 0.034, 0.028, 80, 6),
    ("El Ain", "urban", 10.693700, 34.766100, 2200, 0.036, 0.030, 80, 6),
    ("Thyna", "suburban", 10.678500, 34.689100, 1200, 0.040, 0.032, 76, 7),
    ("El Aouabed", "suburban", 10.646500, 34.846600, 1100, 0.045, 0.036, 70, 8),
    ("Agareb", "rural", 10.525300, 34.740600, 650, 0.055, 0.044, 62, 10),
    ("El Amra", "rural", 10.870200, 34.951900, 600, 0.050, 0.042, 61, 10),
    ("Jebiniana", "rural", 10.908100, 35.035000, 520, 0.055, 0.045, 58, 11),
    ("El Hencha", "rural", 10.741200, 35.119100, 520, 0.058, 0.046, 57, 11),
    ("Mahres", "urban", 10.500800, 34.527500, 900, 0.045, 0.036, 72, 8),
    ("Skhira", "rural", 10.033300, 34.300200, 450, 0.060, 0.050, 55, 12),
    ("Menzel Chaker", "rural", 10.402200, 34.995800, 420, 0.060, 0.050, 54, 12),

    # ============================================================
    # GAFSA
    # ============================================================

    ("Gafsa", "urban", 8.784170, 34.425000, 2200, 0.045, 0.036, 67, 9),
    ("Metlaoui", "urban", 8.401000, 34.320000, 1300, 0.050, 0.040, 61, 10),
    ("Redeyef", "urban", 8.386000, 34.382000, 950, 0.053, 0.043, 58, 11),
    ("Mdhilla", "suburban", 8.754000, 34.285000, 750, 0.055, 0.044, 60, 11),
    ("El Guettar", "suburban", 8.948000, 34.335000, 650, 0.056, 0.045, 58, 11),
    ("Sened", "rural", 9.055000, 34.350000, 450, 0.064, 0.051, 52, 12),

    # ============================================================
    # TOZEUR
    # ============================================================

    ("Tozeur", "urban", 8.130000, 33.930000, 1800, 0.045, 0.036, 68, 9),
    ("Nefta", "urban", 7.875000, 33.875000, 1000, 0.050, 0.040, 62, 10),
    ("Degueche", "suburban", 8.215000, 33.977000, 650, 0.053, 0.043, 59, 11),
    ("Hazoua", "rural", 7.730000, 33.710000, 350, 0.070, 0.055, 50, 13),

    # ============================================================
    # KEBILI
    # ============================================================

    ("Kebili", "urban", 8.973610, 33.701940, 1700, 0.050, 0.040, 61, 10),
    ("Douz", "urban", 9.020000, 33.466000, 1300, 0.052, 0.042, 60, 11),
    ("Souk Lahad", "suburban", 8.405000, 33.822000, 650, 0.058, 0.047, 55, 12),
    ("Faouar", "rural", 8.500000, 33.300000, 350, 0.070, 0.055, 49, 13),

    # ============================================================
    # GABES
    # ============================================================

    ("Gabes", "urban", 10.116670, 33.883330, 2300, 0.044, 0.035, 72, 8),
    ("Mareth", "urban", 10.292000, 33.627000, 1100, 0.050, 0.040, 65, 10),
    ("Matmata", "suburban", 10.007000, 33.545000, 700, 0.057, 0.046, 58, 11),
    ("El Hamma", "urban", 9.796000, 33.892000, 1200, 0.050, 0.041, 62, 10),
    ("Chenini Gabes", "rural", 10.050000, 33.540000, 450, 0.062, 0.050, 54, 12),
    ("Ghannouch", "suburban", 10.100000, 33.975000, 800, 0.048, 0.038, 67, 9),

    # ============================================================
    # MEDENINE
    # ============================================================

    ("Medenine", "urban", 10.490000, 33.350000, 1900, 0.045, 0.036, 67, 9),
    ("Djerba Houmt Souk", "dense", 10.857000, 33.875000, 2800, 0.037, 0.030, 83, 6),
    ("Midoun", "dense", 10.992000, 33.808000, 2300, 0.038, 0.030, 82, 6),
    ("Ajim", "suburban", 10.755000, 33.720000, 800, 0.045, 0.036, 71, 8),
    ("Zarzis", "urban", 11.112000, 33.504000, 1700, 0.044, 0.035, 76, 7),
    ("Ben Gardane", "urban", 11.219000, 33.137000, 1200, 0.050, 0.040, 65, 9),
    ("Beni Khedache", "rural", 10.196000, 33.252000, 450, 0.064, 0.051, 53, 12),

    # ============================================================
    # TATAOUINE
    # ============================================================

    ("Tataouine", "urban", 10.450000, 32.933330, 1800, 0.050, 0.040, 62, 10),
    ("Ghomrassen", "urban", 10.700000, 33.060000, 900, 0.055, 0.044, 57, 11),
    ("Remada", "rural", 10.390000, 32.325000, 450, 0.070, 0.055, 49, 13),
    ("Dehiba", "rural", 10.690000, 32.000000, 300, 0.075, 0.060, 46, 14),
    ("Bir Lahmar", "suburban", 10.450000, 32.850000, 550, 0.060, 0.048, 52, 12),

    # ============================================================
    # MANOUBA
    # ============================================================

    ("Manouba", "urban", 10.101110, 36.807780, 1800, 0.030, 0.024, 80, 6),
    ("Douar Hicher", "dense", 10.089000, 36.831000, 1900, 0.028, 0.022, 77, 6),
    ("Oued Ellil", "urban", 10.040000, 36.811000, 1600, 0.032, 0.026, 75, 7),
    ("Tebourba", "urban", 9.840000, 36.832000, 1100, 0.042, 0.034, 69, 8),
    ("Jedaida", "suburban", 9.980000, 36.880000, 800, 0.046, 0.037, 64, 9),

    # ============================================================
    # ADDITIONAL RURAL / NATIONAL COVERAGE
    # ============================================================

    ("Korbous", "rural", 10.567000, 36.817000, 350, 0.065, 0.052, 60, 11),
    ("Takelsa", "rural", 10.635000, 36.783000, 400, 0.060, 0.049, 61, 11),
    ("Ghardimaou South", "rural", 8.470000, 36.390000, 350, 0.064, 0.051, 54, 12),
    ("Ain Draham South", "rural", 8.730000, 36.700000, 300, 0.068, 0.054, 52, 13),
    ("Kesra South", "rural", 9.400000, 35.740000, 300, 0.068, 0.054, 53, 13),
    ("Djebel Oust", "rural", 10.000000, 36.540000, 350, 0.062, 0.050, 57, 12),
    ("Sidi Bou Rouis", "rural", 9.000000, 36.000000, 350, 0.065, 0.052, 54, 12),
    ("Oued Mliz", "rural", 8.560000, 36.470000, 300, 0.067, 0.053, 53, 13),
    ("Mezzouna", "rural", 9.840000, 34.580000, 350, 0.065, 0.052, 51, 13),
    ("Majel Bel Abbes", "rural", 8.770000, 34.750000, 350, 0.067, 0.054, 50, 13),
]


# ============================================================
# SYNTHETIC RADIO SITES
# ============================================================

SITES = [
    # Grand Tunis
    ("site-tunis-centre", 10.1659, 36.7975, 95, 3.8),
    ("site-lac", 10.2389, 36.8350, 98, 4.5),
    ("site-centre-urbain-nord", 10.1984, 36.8476, 98, 4.3),
    ("site-montplaisir", 10.1864, 36.8170, 96, 3.6),
    ("site-el-menzah", 10.1573, 36.8384, 94, 4.0),
    ("site-ariana", 10.1930, 36.8660, 94, 4.0),
    ("site-soukra", 10.2438, 36.8674, 92, 4.2),
    ("site-mnihla", 10.1108, 36.8477, 78, 4.6),
    ("site-raoued", 10.1914, 36.9545, 80, 5.0),
    ("site-sidi-thabet", 10.0493, 36.9144, 66, 5.7),
    ("site-ben-arous", 10.2100, 36.7400, 90, 4.2),
    ("site-megrine", 10.2301, 36.7731, 92, 4.0),
    ("site-rades", 10.2800, 36.7600, 92, 4.3),
    ("site-mourouj", 10.2108, 36.7179, 86, 4.6),
    ("site-boumhel", 10.2835, 36.7229, 80, 4.8),
    ("site-fouchana", 10.1813, 36.6949, 75, 5.4),
    ("site-hammam-lif", 10.3416, 36.7287, 88, 4.7),
    ("site-mornag", 10.2902, 36.6807, 65, 6.4),

    # Nabeul
    ("site-nabeul", 10.7333, 36.4500, 94, 4.0),
    ("site-hammamet", 10.6167, 36.4000, 96, 4.1),
    ("site-korba", 10.8580, 36.5780, 86, 4.7),
    ("site-kelibia", 11.0930, 36.8480, 87, 4.7),
    ("site-menztel-temime", 10.9990, 36.7880, 84, 4.9),
    ("site-soliman", 10.4880, 36.6990, 82, 5.0),
    ("site-grombalia", 10.5000, 36.5780, 80, 5.1),

    # Bizerte
    ("site-bizerte", 9.8700, 37.2900, 96, 4.1),
    ("site-zarzouna", 9.8860, 37.2600, 90, 4.5),
    ("site-menzel-jemil", 9.9140, 37.2360, 88, 4.6),
    ("site-menzel-bourguiba", 9.7860, 37.1540, 92, 4.3),
    ("site-tinja", 9.7610, 37.1600, 80, 5.0),
    ("site-ras-jebel", 10.1350, 37.2110, 82, 5.0),
    ("site-rafraf", 10.1840, 37.1900, 76, 5.5),
    ("site-el-alia", 9.9960, 37.1580, 77, 5.2),
    ("site-mateur", 9.6660, 37.0400, 76, 5.5),
    ("site-sejnane", 9.2390, 37.0600, 62, 6.8),

    # Beja / Jendouba / Kef / Siliana
    ("site-beja", 9.1833, 36.7333, 76, 5.2),
    ("site-medjez-el-bab", 9.6100, 36.6500, 74, 5.4),
    ("site-jendouba", 8.7794, 36.5011, 74, 5.4),
    ("site-tabarka", 8.7540, 36.9540, 78, 5.0),
    ("site-ain-draham", 8.7850, 36.7750, 67, 5.8),
    ("site-bou-salem", 8.9700, 36.6110, 70, 5.7),
    ("site-kef", 8.7100, 36.1900, 72, 5.6),
    ("site-tajerouine", 8.5530, 35.8910, 64, 6.2),
    ("site-dahmani", 8.8300, 35.9400, 62, 6.3),
    ("site-siliana", 9.3667, 36.0833, 70, 5.8),
    ("site-makthar", 9.2000, 35.8560, 64, 6.2),

    # Zaghouan
    ("site-zaghouan", 10.1400, 36.4000, 76, 5.2),
    ("site-el-fahs", 9.9060, 36.3750, 70, 5.6),

    # Sousse
    ("site-sousse", 10.6411, 35.8256, 98, 3.9),
    ("site-sousse-riadh", 10.6110, 35.8310, 94, 4.2),
    ("site-sousse-jawhara", 10.6400, 35.8390, 97, 4.0),
    ("site-sidi-abdelhamid", 10.6100, 35.7900, 88, 4.5),
    ("site-hammam-sousse", 10.5929, 35.8587, 94, 4.0),
    ("site-akouda", 10.5712, 35.8712, 90, 4.4),
    ("site-kalaa-kebira", 10.5352, 35.8710, 87, 4.6),
    ("site-hergla", 10.5090, 36.0300, 78, 5.1),
    ("site-msaken", 10.5784, 35.7305, 91, 4.3),
    ("site-enfidha", 10.3774, 36.1340, 76, 5.5),

    # Monastir
    ("site-monastir", 10.8200, 35.7900, 98, 4.0),
    ("site-sahline", 10.7000, 35.7500, 88, 4.5),
    ("site-ouerdanine", 10.6720, 35.6940, 80, 5.2),
    ("site-ksibet-mediouni", 10.8130, 35.6490, 88, 4.5),
    ("site-sayada", 10.8380, 35.6550, 86, 4.7),
    ("site-jammel", 10.7600, 35.6400, 90, 4.8),
    ("site-ksar-helal", 10.8620, 35.6410, 94, 4.4),
    ("site-moknine", 10.8500, 35.5300, 93, 4.4),
    ("site-teboulba", 10.9660, 35.6420, 88, 4.8),

    # Mahdia
    ("site-mahdia", 11.0700, 35.5200, 88, 4.5),
    ("site-ksour-essef", 10.9950, 35.4170, 78, 5.1),
    ("site-chebba", 11.1150, 35.2370, 75, 5.4),
    ("site-el-jem", 10.7050, 35.3000, 78, 5.2),

    # Kairouan
    ("site-kairouan", 10.1000, 35.6800, 82, 5.0),
    ("site-haffouz", 9.6750, 35.6330, 62, 6.2),
    ("site-oueslatia", 9.6500, 35.8600, 61, 6.4),
    ("site-sbikha", 10.0200, 35.9300, 64, 6.0),

    # Kasserine
    ("site-kasserine", 8.8300, 35.1800, 70, 5.8),
    ("site-sbeitla", 9.0700, 35.2300, 66, 6.1),
    ("site-thala", 8.6700, 35.5700, 61, 6.4),
    ("site-feriana", 8.5700, 34.9500, 58, 6.8),

    # Sidi Bouzid
    ("site-sidi-bouzid", 9.4936, 35.0403, 69, 5.8),
    ("site-regueb", 9.7860, 34.8600, 62, 6.4),
    ("site-meknassy", 9.6080, 34.6120, 60, 6.7),

    # Sfax
    ("site-sfax-centre", 10.7628, 34.7446, 96, 4.0),
    ("site-sfax-ouest", 10.7270, 34.7450, 88, 4.5),
    ("site-sfax-sud", 10.7600, 34.6900, 86, 4.8),
    ("site-sakiet-ezzit", 10.7649, 34.8029, 94, 4.0),
    ("site-chihia", 10.7427, 34.7951, 92, 4.2),
    ("site-sakiet-eddaier", 10.7856, 34.7931, 92, 4.3),
    ("site-gremda", 10.7206, 34.7908, 93, 4.2),
    ("site-teniour", 10.7355, 34.8047, 86, 4.8),
    ("site-el-ain", 10.6937, 34.7661, 86, 4.8),
    ("site-thyna", 10.6785, 34.6891, 82, 5.0),
    ("site-el-aouabed", 10.6465, 34.8466, 74, 5.5),
    ("site-agareb", 10.5253, 34.7406, 68, 6.2),
    ("site-mahres", 10.5008, 34.5275, 72, 6.0),
    ("site-skhira", 10.0333, 34.3002, 65, 6.8),
    ("site-el-hencha", 10.7412, 35.1191, 64, 6.8),
    ("site-el-amra", 10.8702, 34.9519, 65, 6.8),
    ("site-jebiniana", 10.9081, 35.0350, 62, 7.0),

    # Gafsa
    ("site-gafsa", 8.7842, 34.4250, 68, 5.9),
    ("site-metlaoui", 8.4010, 34.3200, 62, 6.4),
    ("site-redeyef", 8.3860, 34.3820, 59, 6.8),
    ("site-mdhilla", 8.7540, 34.2850, 59, 6.7),

    # Tozeur / Kebili
    ("site-tozeur", 8.1300, 33.9300, 72, 5.8),
    ("site-nefta", 7.8750, 33.8750, 65, 6.4),
    ("site-kebili", 8.9736, 33.7019, 65, 6.4),
    ("site-douz", 9.0200, 33.4660, 62, 6.7),

    # Gabes
    ("site-gabes", 10.1167, 33.8833, 78, 5.5),
    ("site-el-hamma", 9.7960, 33.8920, 67, 6.0),
    ("site-mareth", 10.2920, 33.6270, 65, 6.4),
    ("site-ghannouch", 10.1000, 33.9750, 69, 5.9),

    # Medenine / Djerba
    ("site-medenine", 10.4900, 33.3500, 70, 5.8),
    ("site-houmt-souk", 10.8570, 33.8750, 90, 4.6),
    ("site-midoun", 10.9920, 33.8080, 88, 4.7),
    ("site-ajim", 10.7550, 33.7200, 73, 5.6),
    ("site-zarzis", 11.1120, 33.5040, 80, 5.2),
    ("site-ben-gardane", 11.2190, 33.1370, 66, 6.2),

    # Tataouine
    ("site-tataouine", 10.4500, 32.9333, 64, 6.0),
    ("site-ghomrassen", 10.7000, 33.0600, 60, 6.6),
    ("site-remada", 10.3900, 32.3250, 52, 7.2),
    ("site-dehiba", 10.6900, 32.0000, 48, 7.6),

    # Manouba
    ("site-manouba", 10.1011, 36.8078, 84, 4.6),
    ("site-douar-hicher", 10.0890, 36.8310, 80, 4.8),
    ("site-oued-ellil", 10.0400, 36.8110, 78, 5.0),
    ("site-tebourba", 9.8400, 36.8320, 70, 5.6),
]


# ============================================================
# DRIVE-TEST CORRIDORS
# ============================================================

CORRIDORS = [
    # Grand Tunis
    ((10.1659, 36.7975), (10.2389, 36.8350), 0.45),
    ((10.1984, 36.8476), (10.2438, 36.8674), 0.42),
    ((10.1864, 36.8170), (10.1930, 36.8660), 0.30),
    ((10.1930, 36.8660), (10.1914, 36.9545), 0.30),
    ((10.2100, 36.7400), (10.2301, 36.7731), 0.35),
    ((10.2301, 36.7731), (10.2800, 36.7600), 0.42),
    ((10.2800, 36.7600), (10.3416, 36.7287), 0.28),
    ((10.2108, 36.7179), (10.2902, 36.6807), 0.20),

    # Tunis -> Cap Bon
    ((10.3416, 36.7287), (10.4880, 36.6990), 0.20),
    ((10.4880, 36.6990), (10.7333, 36.4500), 0.24),
    ((10.7333, 36.4500), (10.6167, 36.4000), 0.44),
    ((10.6167, 36.4000), (10.5000, 36.5780), 0.20),
    ((10.7333, 36.4500), (10.8580, 36.5780), 0.25),
    ((10.8580, 36.5780), (10.9990, 36.7880), 0.22),
    ((10.9990, 36.7880), (11.0930, 36.8480), 0.18),

    # Bizerte
    ((9.8700, 37.2900), (9.8860, 37.2600), 0.45),
    ((9.8700, 37.2900), (9.9140, 37.2360), 0.40),
    ((9.7860, 37.1540), (9.7610, 37.1600), 0.32),
    ((9.7860, 37.1540), (9.9960, 37.1580), 0.25),
    ((10.1350, 37.2110), (10.1840, 37.1900), 0.28),
    ((9.6660, 37.0400), (9.7860, 37.1540), 0.18),
    ((9.6660, 37.0400), (9.2390, 37.0600), 0.12),

    # North-west
    ((9.1833, 36.7333), (9.6100, 36.6500), 0.18),
    ((9.6100, 36.6500), (9.8400, 36.8320), 0.16),
    ((9.1833, 36.7333), (8.7794, 36.5011), 0.15),
    ((8.7794, 36.5011), (8.7540, 36.9540), 0.16),
    ((8.7794, 36.5011), (8.7100, 36.1900), 0.15),
    ((8.7100, 36.1900), (9.3667, 36.0833), 0.12),
    ((9.3667, 36.0833), (10.1400, 36.4000), 0.14),

    # Central / Sahel
    ((10.1400, 36.4000), (10.6411, 35.8256), 0.14),
    ((10.6411, 35.8256), (10.5929, 35.8587), 0.48),
    ((10.6411, 35.8256), (10.5352, 35.8710), 0.42),
    ((10.5929, 35.8587), (10.5712, 35.8712), 0.42),
    ((10.6411, 35.8256), (10.5784, 35.7305), 0.46),
    ((10.5784, 35.7305), (10.6000, 35.7700), 0.28),
    ((10.3774, 36.1340), (10.4549, 36.3000), 0.15),

    # Monastir
    ((10.6411, 35.8256), (10.8200, 35.7900), 0.26),
    ((10.8200, 35.7900), (10.7000, 35.7500), 0.40),
    ((10.8200, 35.7900), (10.8130, 35.6490), 0.45),
    ((10.8130, 35.6490), (10.8380, 35.6550), 0.42),
    ((10.8200, 35.7900), (10.8620, 35.6410), 0.30),
    ((10.8620, 35.6410), (10.8500, 35.5300), 0.40),
    ((10.8500, 35.5300), (11.0000, 35.6170), 0.23),

    # Mahdia
    ((10.8200, 35.7900), (11.0700, 35.5200), 0.18),
    ((11.0700, 35.5200), (10.9950, 35.4170), 0.30),
    ((10.9950, 35.4170), (11.1150, 35.2370), 0.16),
    ((10.9950, 35.4170), (10.7050, 35.3000), 0.18),

    # Kairouan
    ((10.6411, 35.8256), (10.1000, 35.6800), 0.16),
    ((10.1000, 35.6800), (9.6750, 35.6330), 0.16),
    ((10.1000, 35.6800), (10.0200, 35.9300), 0.15),
    ((10.1000, 35.6800), (10.1160, 35.3630), 0.13),

    # Kasserine / Sidi Bouzid
    ((10.1000, 35.6800), (9.4936, 35.0403), 0.13),
    ((9.4936, 35.0403), (9.7860, 34.8600), 0.16),
    ((9.4936, 35.0403), (9.6080, 34.6120), 0.14),
    ((9.4936, 35.0403), (8.8300, 35.1800), 0.11),
    ((8.8300, 35.1800), (9.0700, 35.2300), 0.16),
    ((8.8300, 35.1800), (8.5700, 34.9500), 0.12),

    # Sfax
    ((10.7628, 34.7446), (10.7649, 34.8029), 0.46),
    ((10.7628, 34.7446), (10.7206, 34.7908), 0.42),
    ((10.7628, 34.7446), (10.6937, 34.7661), 0.34),
    ((10.7649, 34.8029), (10.7856, 34.7931), 0.42),
    ((10.7649, 34.8029), (10.7427, 34.7951), 0.38),
    ((10.7427, 34.7951), (10.7355, 34.8047), 0.28),
    ((10.6937, 34.7661), (10.6785, 34.6891), 0.34),
    ((10.7206, 34.7908), (10.6465, 34.8466), 0.22),
    ((10.5253, 34.7406), (10.5008, 34.5275), 0.18),
    ((10.7628, 34.7446), (10.8702, 34.9519), 0.16),
    ((10.8702, 34.9519), (10.9081, 35.0350), 0.14),
    ((10.7628, 34.7446), (10.4022, 34.9958), 0.12),

    # Gafsa / south-west
    ((9.4936, 35.0403), (8.7842, 34.4250), 0.12),
    ((8.7842, 34.4250), (8.4010, 34.3200), 0.16),
    ((8.7842, 34.4250), (8.3860, 34.3820), 0.12),
    ((8.7842, 34.4250), (8.1300, 33.9300), 0.10),
    ((8.1300, 33.9300), (7.8750, 33.8750), 0.15),

    # Kebili / Gabes
    ((8.9736, 33.7019), (9.0200, 33.4660), 0.14),
    ((8.9736, 33.7019), (10.1167, 33.8833), 0.10),
    ((10.1167, 33.8833), (9.7960, 33.8920), 0.28),
    ((10.1167, 33.8833), (10.2920, 33.6270), 0.18),
    ((10.1167, 33.8833), (10.0500, 33.5400), 0.12),

    # Djerba / Medenine / Zarzis
    ((10.1167, 33.8833), (10.4900, 33.3500), 0.10),
    ((10.4900, 33.3500), (10.8570, 33.8750), 0.11),
    ((10.8570, 33.8750), (10.9920, 33.8080), 0.32),
    ((10.8570, 33.8750), (10.7550, 33.7200), 0.20),
    ((10.4920, 33.3500), (11.1120, 33.5040), 0.15),
    ((11.1120, 33.5040), (11.2190, 33.1370), 0.12),

    # Tataouine
    ((10.4900, 33.3500), (10.4500, 32.9333), 0.12),
    ((10.4500, 32.9333), (10.7000, 33.0600), 0.15),
    ((10.4500, 32.9333), (10.3900, 32.3250), 0.08),
    ((10.3900, 32.3250), (10.6900, 32.0000), 0.06),

    # National east-west links
    ((8.1300, 33.9300), (9.4936, 35.0403), 0.08),
    ((9.4936, 35.0403), (10.1000, 35.6800), 0.10),
    ((10.1000, 35.6800), (10.6411, 35.8256), 0.14),
    ((10.6411, 35.8256), (10.7628, 34.7446), 0.12),
]


@dataclass(frozen=True)
class Area:
    name: str
    kind: str
    lon: float
    lat: float
    count: int
    lon_sigma: float
    lat_sigma: float
    baseline: float
    roughness: float


@dataclass(frozen=True)
class Site:
    name: str
    lon: float
    lat: float
    strength: float
    decay_km: float


AREAS_DATA = [Area(*row) for row in AREAS]
SITES_DATA = [Site(*row) for row in SITES]


def km_distance(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    lat = math.radians((lat1 + lat2) * 0.5)
    dx = (lon2 - lon1) * 111.32 * math.cos(lat)
    dy = (lat2 - lat1) * 111.32
    return math.hypot(dx, dy)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def gauss(rng: random.Random, sigma: float) -> float:
    return rng.gauss(0.0, sigma)


def site_signal(lon: float, lat: float) -> float:
    """Coherent synthetic radio field based on nearby radio sites."""
    contributions: list[float] = []
    for site in SITES_DATA:
        d = km_distance(lon, lat, site.lon, site.lat)
        contribution = site.strength * math.exp(-d / site.decay_km)
        contributions.append(contribution)

    strongest = max(contributions)
    second = sorted(contributions, reverse=True)[1]
    # Serving site dominates; a smaller second-site contribution gives handover-like smoothness.
    return strongest * 0.78 + second * 0.16


def urban_modifier(kind: str, lon: float, lat: float) -> float:
    if kind == "dense":
        return 4.0
    if kind == "urban":
        return 2.0
    if kind == "suburban":
        return -2.0
    return -6.0


def corridor_point(
    rng: random.Random,
    start: tuple[float, float],
    end: tuple[float, float],
) -> tuple[float, float]:
    t = rng.random()
    lon = start[0] + (end[0] - start[0]) * t
    lat = start[1] + (end[1] - start[1]) * t

    # Perpendicular jitter in kilometres, preserving a drive-like line shape.
    dx = (end[0] - start[0]) * 111.32 * math.cos(math.radians(lat))
    dy = (end[1] - start[1]) * 111.32
    length = max(math.hypot(dx, dy), 0.001)
    px = -dy / length
    py = dx / length
    offset_km = rng.gauss(0.0, 0.35)
    lon += (px * offset_km) / (111.32 * math.cos(math.radians(lat)))
    lat += (py * offset_km) / 111.32
    return lon, lat


def weighted_area(rng: random.Random) -> Area:
    weights = []
    for area in AREAS_DATA:
        kind_factor = {"dense": 1.35, "urban": 1.15, "suburban": 0.8, "rural": 0.55}[area.kind]
        weights.append(area.count * kind_factor)
    return rng.choices(AREAS_DATA, weights=weights, k=1)[0]


def generate_points(seed: int, requested_points: int) -> list[dict[str, object]]:
    rng = random.Random(seed)
    generated: list[dict[str, object]] = []

    # Preserve the intended density differences while hitting the requested total exactly.
    total_area_counts = sum(a.count for a in AREAS_DATA)
    scale = requested_points / total_area_counts
    raw_counts = [a.count * scale for a in AREAS_DATA]
    counts = [max(1, math.floor(v)) for v in raw_counts]
    remaining = requested_points - sum(counts)
    order = sorted(range(len(AREAS_DATA)), key=lambda i: raw_counts[i] - counts[i], reverse=True)
    for i in order[:remaining]:
        counts[i] += 1

    for area, count in zip(AREAS_DATA, counts):
        corridor_share = {
            "dense": 0.58,
            "urban": 0.48,
            "suburban": 0.34,
            "rural": 0.18,
        }[area.kind]

        for _ in range(count):
            use_corridor = rng.random() < corridor_share
            if use_corridor:
                candidates = [c for c in CORRIDORS if near_segment(area.lon, area.lat, c)]
                if candidates:
                    start, end, _ = rng.choice(candidates)
                    lon, lat = corridor_point(rng, start, end)
                    lon += gauss(rng, area.lon_sigma * 0.20)
                    lat += gauss(rng, area.lat_sigma * 0.20)
                else:
                    lon = rng.gauss(area.lon, area.lon_sigma)
                    lat = rng.gauss(area.lat, area.lat_sigma)
            else:
                lon = rng.gauss(area.lon, area.lon_sigma)
                lat = rng.gauss(area.lat, area.lat_sigma)

            if not inside_bbox(lon, lat, METRO_BBOX):
                # Keep retries local to the intended Greater Tunis study area.
                retries = 0
                while retries < 20 and not inside_bbox(lon, lat, METRO_BBOX):
                    lon = rng.gauss(area.lon, area.lon_sigma)
                    lat = rng.gauss(area.lat, area.lat_sigma)
                    retries += 1
                if not inside_bbox(lon, lat, METRO_BBOX):
                    lon = clamp(lon, METRO_BBOX[0], METRO_BBOX[1])
                    lat = clamp(lat, METRO_BBOX[2], METRO_BBOX[3])

            value = synthetic_measurement(rng, area, lon, lat)
            generated.append(
                {
                    "id": f"sq-{len(generated) + 1:06d}",
                    "coordinates": [round(lon, 6), round(lat, 6)],
                    "value": round(value, 2),
                }
            )

    rng.shuffle(generated)
    for i, measurement in enumerate(generated, start=1):
        measurement["id"] = f"sq-{i:06d}"
    return generated


def near_segment(lon: float, lat: float, corridor: tuple[tuple[float, float], tuple[float, float], float]) -> bool:
    start, end, reach_km = corridor
    # Cheap bounding-box prefilter for choosing relevant corridors.
    margin = reach_km / 80.0
    return (
        min(start[0], end[0]) - margin <= lon <= max(start[0], end[0]) + margin
        and min(start[1], end[1]) - margin <= lat <= max(start[1], end[1]) + margin
    )


def synthetic_measurement(rng: random.Random, area: Area, lon: float, lat: float) -> float:
    radio = site_signal(lon, lat)
    city_shape = urban_modifier(area.kind, lon, lat)

    # Smooth local variation: buildings/streets/terrain-like effects without pure random noise.
    wave = (
        2.8 * math.sin(lon * 90.0)
        + 2.0 * math.cos(lat * 65.0)
        + 1.6 * math.sin((lon + lat) * 52.0)
    )

    # Broad local shadow pockets deliberately placed in weaker areas.
    shadows = (
        7.0 * math.exp(-km_distance(lon, lat, 10.155, 36.790) / 2.2)
        + 6.0 * math.exp(-km_distance(lon, lat, 10.047, 36.920) / 2.8)
        + 5.0 * math.exp(-km_distance(lon, lat, 10.284, 36.676) / 3.0)
    )

    variability = gauss(rng, area.roughness)
    value = 0.40 * area.baseline + 0.60 * radio + city_shape + wave + variability - shadows

    # Keep the field believable and ensure bad places are still visible.
    if area.kind == "rural":
        value -= abs(gauss(rng, 2.0))

    return clamp(value, 22.0, 99.0)


def inside_bbox(lon: float, lat: float, bbox: tuple[float, float, float, float]) -> bool:
    min_lon, max_lon, min_lat, max_lat = bbox
    return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate drive-test-like Signal Quality data")
    parser.add_argument("-o", "--output", default=DEFAULT_OUTPUT)
    parser.add_argument("-n", "--points", type=int, default=DEFAULT_POINTS)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    args = parser.parse_args()

    if args.points < 100:
        raise SystemExit("--points must be at least 100")

    measurements = generate_points(args.seed, args.points)
    values = [float(p["value"]) for p in measurements]

    payload = {
        "metric": "Signal Quality",
        "crs": CRS,
        "min": 0,
        "max": 100,
        "measurements": measurements,
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"Generated {len(measurements):,} measurements")
    print(f"Range: {min(values):.2f} .. {max(values):.2f}")
    print(f"Mean:  {sum(values) / len(values):.2f}")
    print(f"Seed:  {args.seed}")
    print(f"File:  {output}")


if __name__ == "__main__":
    main()
