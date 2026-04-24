#!/usr/bin/env python3
"""
live_track.py — BlurBall model loading, preprocessing, and detection utilities.

Stripped-down version containing only the functions needed by server.py:
  - load_model()        — Build BlurBall and load checkpoint weights
  - detect_ball()       — Connected-components postprocessor on heatmaps
  - get_affine_transform() — Heatmap ↔ original-image coordinate mapping
  - MODEL_CFG           — HRNet model configuration dict

Original source: BlurBall (Gossard et al., CVPR 2026 Workshops)
License: MIT — see blurball.py header
"""

import os

import cv2
import numpy as np
import torch

from .blurball import BlurBall


# ── Inlined affine helpers (from BlurBall src/utils/image.py) ──────────────

def _get_3rd_point(a, b):
    direct = a - b
    return b + np.array([-direct[1], direct[0]], dtype=np.float32)


def _get_dir(src_point, rot_rad):
    sn, cs = np.sin(rot_rad), np.cos(rot_rad)
    return [src_point[0] * cs - src_point[1] * sn,
            src_point[0] * sn + src_point[1] * cs]


def get_affine_transform(center, scale, rot, output_size,
                         shift=np.array([0, 0], dtype=np.float32), inv=0):
    """Compute affine transform between original image and model input coords."""
    if not isinstance(scale, np.ndarray) and not isinstance(scale, list):
        scale = np.array([scale, scale], dtype=np.float32)
    scale_tmp = scale
    src_w = scale_tmp[0]
    dst_w, dst_h = output_size[0], output_size[1]
    rot_rad = np.pi * rot / 180
    src_dir = _get_dir([0, src_w * -0.5], rot_rad)
    dst_dir = np.array([0, dst_w * -0.5], np.float32)
    src = np.zeros((3, 2), dtype=np.float32)
    dst = np.zeros((3, 2), dtype=np.float32)
    src[0, :] = center + scale_tmp * shift
    src[1, :] = center + src_dir + scale_tmp * shift
    dst[0, :] = [dst_w * 0.5, dst_h * 0.5]
    dst[1, :] = np.array([dst_w * 0.5, dst_h * 0.5], np.float32) + dst_dir
    src[2:, :] = _get_3rd_point(src[0, :], src[1, :])
    dst[2:, :] = _get_3rd_point(dst[0, :], dst[1, :])
    if inv:
        trans = cv2.getAffineTransform(np.float32(dst), np.float32(src))
    else:
        trans = cv2.getAffineTransform(np.float32(src), np.float32(dst))
    return trans


def affine_transform(pt, t):
    """Apply affine transform to a single point."""
    new_pt = np.array([pt[0], pt[1], 1.0], dtype=np.float32).T
    new_pt = np.dot(t, new_pt)
    return new_pt[:2]


# ── AttrDict (config helper) ──────────────────────────────────────────────

class AttrDict(dict):
    """Dict that supports both d['key'] and d.key access (recursive)."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for key, value in self.items():
            if isinstance(value, dict) and not isinstance(value, AttrDict):
                self[key] = AttrDict(value)
            elif isinstance(value, list):
                self[key] = [AttrDict(v) if isinstance(v, dict) else v for v in value]

    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError:
            raise AttributeError(f"'AttrDict' has no attribute '{key}'")

    def __setattr__(self, key, value):
        self[key] = value


# ── Model config matching blurball.yaml / wasb.yaml ───────────────────────

MODEL_CFG = AttrDict({
    "name": "blurball",
    "frames_in": 3,
    "frames_out": 3,
    "inp_height": 288,
    "inp_width": 512,
    "out_height": 288,
    "out_width": 512,
    "rgb_diff": False,
    "out_scales": [0],
    "MODEL": {
        "EXTRA": {
            "FINAL_CONV_KERNEL": 1,
            "PRETRAINED_LAYERS": ["*"],
            "STEM": {"INPLANES": 64, "STRIDES": [1, 1]},
            "STAGE1": {
                "NUM_MODULES": 1,
                "NUM_BRANCHES": 1,
                "BLOCK": "BOTTLENECK",
                "NUM_BLOCKS": [1],
                "NUM_CHANNELS": [32],
                "FUSE_METHOD": "SUM",
            },
            "STAGE2": {
                "NUM_MODULES": 1,
                "NUM_BRANCHES": 2,
                "BLOCK": "BASIC",
                "NUM_BLOCKS": [2, 2],
                "NUM_CHANNELS": [16, 32],
                "FUSE_METHOD": "SUM",
            },
            "STAGE3": {
                "NUM_MODULES": 1,
                "NUM_BRANCHES": 3,
                "BLOCK": "BASIC",
                "NUM_BLOCKS": [2, 2, 2],
                "NUM_CHANNELS": [16, 32, 64],
                "FUSE_METHOD": "SUM",
            },
            "STAGE4": {
                "NUM_MODULES": 1,
                "NUM_BRANCHES": 4,
                "BLOCK": "BASIC",
                "NUM_BLOCKS": [2, 2, 2, 2],
                "NUM_CHANNELS": [16, 32, 64, 128],
                "FUSE_METHOD": "SUM",
            },
            "DECONV": {
                "NUM_DECONVS": 0,
                "KERNEL_SIZE": [],
                "NUM_BASIC_BLOCKS": 2,
            },
        },
        "INIT_WEIGHTS": True,
    },
})


# ── Model loading ─────────────────────────────────────────────────────────

def load_model(model_path, device="cuda"):
    """Build the BlurBall model and load checkpoint weights."""
    model = BlurBall(MODEL_CFG)
    checkpoint = torch.load(model_path, map_location=device, weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    model = model.to(device)
    model.eval()
    print(f"✓ Model loaded from {model_path} (epoch {checkpoint.get('epoch', '?')})")
    print(f"  F1={checkpoint.get('video_inference_f1', 0):.3f}  "
          f"Prec={checkpoint.get('video_inference_prec', 0):.3f}  "
          f"Recall={checkpoint.get('video_inference_recall', 0):.3f}")
    return model


# ── Detection postprocessor ───────────────────────────────────────────────

def detect_ball(heatmap, score_threshold, affine_mat):
    """
    Connected-components postprocessor.
    Returns list of dicts with center, bbox corners, and score in original frame coords.
    """
    detections = []
    if np.max(heatmap) <= score_threshold:
        return detections

    _, hm_bin = cv2.threshold(heatmap, score_threshold, 1, cv2.THRESH_BINARY)
    n_labels, labels = cv2.connectedComponents(hm_bin.astype(np.uint8))

    for m in range(1, n_labels):
        ys, xs = np.where(labels == m)
        ws = heatmap[ys, xs]
        score = float(ws.sum())
        # Weighted center
        cx = float(np.sum(xs * ws) / np.sum(ws))
        cy = float(np.sum(ys * ws) / np.sum(ws))
        # Bounding box in heatmap coords (with a small padding)
        pad = 2
        x_min, x_max = float(xs.min()) - pad, float(xs.max()) + pad
        y_min, y_max = float(ys.min()) - pad, float(ys.max()) + pad
        # Transform to original image coordinates
        center_orig = affine_transform(np.array([cx, cy]), affine_mat)
        tl_orig = affine_transform(np.array([x_min, y_min]), affine_mat)
        br_orig = affine_transform(np.array([x_max, y_max]), affine_mat)
        detections.append({
            "cx": center_orig[0], "cy": center_orig[1],
            "x1": tl_orig[0], "y1": tl_orig[1],
            "x2": br_orig[0], "y2": br_orig[1],
            "score": score,
        })

    detections.sort(key=lambda d: d["score"], reverse=True)
    return detections
