# Sandbox image: compilers plus the harness that compiles once and runs every test.
# The runner starts one throwaway container per submission (see ../README.md).
FROM debian:bookworm-slim
RUN mkdir -p /usr/share/man/man1 \
 && apt-get update \
 && apt-get install -y --no-install-recommends gcc g++ libc6-dev openjdk-17-jdk-headless python3 \
 && rm -rf /var/lib/apt/lists/* /usr/share/doc /usr/share/man
COPY harness.py /harness.py
RUN chmod 0444 /harness.py
ENV LANG=C.UTF-8 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /box
USER 65534:65534
ENTRYPOINT ["python3", "-I", "/harness.py"]
