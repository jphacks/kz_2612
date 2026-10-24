"""姿勢推定モデルを backend/models/ にダウンロードする（ローカル開発と Docker ビルドの両方で使う）。

    python scripts/download_models.py [保存先]

- RTMPose（既定のエンジン）: YOLOX-m（人を見つける）＋ RTMPose-m（骨格を読む）。rtmlib の balanced と同じ
- MediaPipe Pose Landmarker（EMO_POSE_ENGINE=mediapipe のときだけ使う）
"""

import io
import sys
import urllib.request
import zipfile
from pathlib import Path

RTM = "https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/"
MODELS = {
    "rtm_det_yolox_m.onnx": RTM + "yolox_m_8xb8-300e_humanart-c2c7a14a.zip",
    "rtm_pose_rtmpose_m.onnx": RTM + "rtmpose-m_simcc-body7_pt-body7_420e-256x192-e48f03d0_20230504.zip",
    "pose_landmarker_full.task": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
                                 "pose_landmarker_full/float16/latest/pose_landmarker_full.task",
}


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "models"
    out.mkdir(parents=True, exist_ok=True)
    for name, url in MODELS.items():
        dest = out / name
        if dest.exists():
            print(f"skip {name}（もうある）")
            continue
        print(f"download {name}")
        data = urllib.request.urlopen(url, timeout=300).read()
        if url.endswith(".zip"):
            # zip の中の end2end.onnx を取り出す
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                onnx = next(n for n in z.namelist() if n.endswith(".onnx"))
                data = z.read(onnx)
        dest.write_bytes(data)


if __name__ == "__main__":
    main()
