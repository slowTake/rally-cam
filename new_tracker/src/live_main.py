import hydra
from omegaconf import DictConfig, OmegaConf
import cv2
import torch
import numpy as np
import torchvision.transforms as T

from detectors import build_detector
from trackers import build_tracker
from utils.image import get_affine_transform
from utils import draw_frame, Center

@hydra.main(version_base=None, config_name='inference_blurball', config_path='configs')
def main(cfg: DictConfig):
    detector = build_detector(cfg)
    tracker = build_tracker(cfg)
    
    cap = cv2.VideoCapture(0)
    ret, frame = cap.read()
    if not ret:
        print("Failed to grab initial frame.")
        return
    h, w = frame.shape[:2]

    c = np.array([w / 2.0, h / 2.0], dtype=np.float32)
    s = max(h, w) * 1.0
    trans = np.stack(
        [
            get_affine_transform(
                c,
                s,
                0,
                [cfg["model"]["inp_width"], cfg["model"]["inp_height"]],
                inv=1,
            )
            for _ in range(3)
        ],
        axis=0,
    )
    trans = torch.tensor(trans)[None, :]
    
    # trans_input maps from camera frame to network input
    trans_input = get_affine_transform(
        c,
        s,
        0,
        [cfg["model"]["inp_width"], cfg["model"]["inp_height"]],
        inv=0,
    )
    
    preprocess_frame = T.Compose(
        [
            T.ToTensor(),
            T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    
    frames_buffer = []
    step = cfg["detector"]["step"]
    tracker.refresh()
    
    print("Starting Live Inference... Press 'q' to quit.")
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed to grab frame.")
            break
            
        frames_buffer.append(frame)
        
        if len(frames_buffer) == cfg["model"]["frames_in"]:
            frames_processed = []
            for f in frames_buffer:
                f_rgb = cv2.cvtColor(f, cv2.COLOR_BGR2RGB)
                f_warped = cv2.warpAffine(
                    f_rgb,
                    trans_input,
                    (cfg["model"]["inp_width"], cfg["model"]["inp_height"]),
                    flags=cv2.INTER_LINEAR
                )
                frames_processed.append(preprocess_frame(f_warped))
                
            input_tensor = torch.cat(frames_processed, dim=0).unsqueeze(0)
            
            with torch.no_grad():
                batch_results, hms_vis = detector.run_tensor(input_tensor, trans)
            
            # In live inference, we only track the latest frame to keep latency minimal.
            # batch_results[0] contains keys for the frames in the buffer window.
            ie = max(batch_results[0].keys())
            preds = batch_results[0][ie]
            
            # Update tracker exactly once per actual frame
            track_res = tracker.update(preds)
            
            vis_frame = frames_buffer[-1].copy()
            x_pred = track_res["x"]
            y_pred = track_res["y"]
            visi_pred = track_res["visi"]
            angle_pred = track_res.get("angle", 0) if cfg["model"]["name"] == "blurball" else 0
            length_pred = track_res.get("length", 0) if cfg["model"]["name"] == "blurball" else 0
            
            color_pred = (255, 0, 0) # Blue
            
            vis_frame = draw_frame(
                vis_frame,
                center=Center(is_visible=visi_pred, x=x_pred, y=y_pred),
                color=color_pred,
                radius=3,
                angle=angle_pred,
                l=length_pred,
            )
            
            cv2.imshow("Live Inference (BlurBall)", vis_frame)
            
            if step == 1:
                frames_buffer.pop(0)
            elif step == 3:
                frames_buffer = []
        else:
            cv2.imshow("Live Inference (BlurBall)", frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
