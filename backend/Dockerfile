# Lambda（コンテナイメージ）用。依存が250MBを超えるため zip ではなくコンテナで載せる（PRD 9章）
FROM public.ecr.aws/lambda/python:3.12

# MediaPipe Tasks の libmediapipe.so は GPU 不使用でも libEGL / libGLESv2 をリンクしている
RUN dnf install -y mesa-libEGL mesa-libGLES && dnf clean all

COPY requirements.txt ${LAMBDA_TASK_ROOT}/
# mediapipe が引き込む opencv は GUI 版で libGL を要求するので、headless 版に差し替える
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt \
 && pip uninstall -y opencv-contrib-python opencv-python \
 && pip install --no-cache-dir opencv-contrib-python-headless==5.0.0.93

# モデルはビルド時に焼き込む（コールドスタート時のダウンロードを避ける）
RUN python -c "import urllib.request; urllib.request.urlretrieve('https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task', '${LAMBDA_TASK_ROOT}/pose_landmarker_full.task')"

COPY app ${LAMBDA_TASK_ROOT}/app

ENV EMO_BACKEND=aws \
    EMO_POSE_MODEL_PATH=${LAMBDA_TASK_ROOT}/pose_landmarker_full.task \
    MPLCONFIGDIR=/tmp

CMD ["app.main.handler"]
