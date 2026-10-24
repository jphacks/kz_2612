# Lambda（コンテナイメージ）用。依存が250MBを超えるため zip ではなくコンテナで載せる（PRD 9章）
FROM public.ecr.aws/lambda/python:3.12

# MediaPipe Tasks の libmediapipe.so は GPU 不使用でも libEGL / libGLESv2 をリンクしている
RUN dnf install -y mesa-libEGL mesa-libGLES && dnf clean all

COPY requirements.txt requirements-nodeps.txt ${LAMBDA_TASK_ROOT}/
# mediapipe が引き込む opencv は GUI 版で libGL を要求するので、headless 版に差し替える
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt \
 && pip install --no-cache-dir --no-deps -r ${LAMBDA_TASK_ROOT}/requirements-nodeps.txt \
 && pip uninstall -y opencv-contrib-python opencv-python \
 && pip install --no-cache-dir opencv-contrib-python-headless==5.0.0.93

# モデルはビルド時に焼き込む（コールドスタート時のダウンロードを避ける）。
# コードは /var/task/models を既定の置き場所として探す
COPY scripts/download_models.py /tmp/download_models.py
RUN python /tmp/download_models.py ${LAMBDA_TASK_ROOT}/models

COPY app ${LAMBDA_TASK_ROOT}/app

ENV EMO_BACKEND=aws \
    MPLCONFIGDIR=/tmp

CMD ["app.main.handler"]
