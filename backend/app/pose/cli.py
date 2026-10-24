"""2枚の写真のポーズ一致を手元で確かめる（マイルストーン1・許容値の調整用）。

    python -m app.pose.cli 当時.jpg 今.jpg [--tolerance 20] [--overlay-dir out/]
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from pathlib import Path

from app.pose.config import MatchConfig
from app.pose.detector import PoseDetector, PoseExtractionError, draw_overlay, load_image
from app.pose.matcher import match_poses


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="エモ認証: 2枚の写真のポーズを照合する")
    parser.add_argument("key", type=Path, help="鍵にする思い出の写真")
    parser.add_argument("attempt", type=Path, help="今撮った写真")
    parser.add_argument("--tolerance", type=float, help="平均角度差の許容値（度）")
    parser.add_argument("--max-joint", type=float, help="1関節あたりのずれの上限（度）")
    parser.add_argument("--detection-confidence", type=float, help="人物検出のしきい値（既定0.2）")
    parser.add_argument("--mirror",action="store_true", help="鏡像も一致とみなす")
    parser.add_argument("--overlay-dir", type=Path, help="骨格を重ねたプレビュー画像の出力先")
    args = parser.parse_args(argv)
    # Windows のコンソール（cp932）でも日本語の JSON が化けないように
    sys.stdout.reconfigure(encoding="utf-8")

    config = MatchConfig.from_env()
    if args.tolerance is not None:
        config = replace(config, tolerance_deg=args.tolerance)
    if args.max_joint is not None:
        config = replace(config, max_joint_diff_deg=args.max_joint)
    if args.mirror:
        config = replace(config, allow_mirror=True)

    detector = PoseDetector(min_visibility=config.min_visibility, detection_confidence=args.detection_confidence)
    key_image = load_image(args.key)
    attempt_image = load_image(args.attempt)

    try:
        key_people = detector.extract_key(key_image)
    except PoseExtractionError as e:
        print(json.dumps({"error": e.code, "message": e.message, "detected_people": e.detected_people},
                         ensure_ascii=False, indent=2))
        return 2
    attempt_people = detector.detect(attempt_image)

    if args.overlay_dir:
        args.overlay_dir.mkdir(parents=True, exist_ok=True)
        draw_overlay(key_image, key_people).save(args.overlay_dir / f"{args.key.stem}_key.png")
        draw_overlay(attempt_image, attempt_people).save(args.overlay_dir / f"{args.attempt.stem}_attempt.png")

    result = match_poses(key_people, attempt_people, config)
    print(json.dumps({
        "key": [p.to_dict() for p in key_people],
        "attempt": [p.to_dict() for p in attempt_people],
        "result": result.to_dict(),
    }, ensure_ascii=False, indent=2))
    return 0 if result.ok else 1


if __name__ == "__main__":
    sys.exit(main())
