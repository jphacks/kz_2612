"""エモ認証のポーズ抽出と照合。

- angles:   関節座標 → 6関節の角度
- matcher:  鍵のポーズと撮影ポーズの照合（MediaPipe非依存。単体テスト可能）
- detector: MediaPipe Pose Landmarker で画像から人物ごとのポーズを抽出
"""

from app.pose.angles import JOINTS, PersonPose
from app.pose.matcher import MatchResult, match_poses

__all__ = ["JOINTS", "PersonPose", "MatchResult", "match_poses"]
