FROM mcr.microsoft.com/dotnet/sdk:10.0

ENV DEBIAN_FRONTEND=noninteractive

RUN dpkg --add-architecture amd64 \
  && rm -f /etc/apt/sources.list.d/ubuntu.sources \
  && printf '%s\n' \
    'deb [arch=arm64] http://ports.ubuntu.com/ubuntu-ports noble main restricted universe multiverse' \
    'deb [arch=arm64] http://ports.ubuntu.com/ubuntu-ports noble-updates main restricted universe multiverse' \
    'deb [arch=arm64] http://ports.ubuntu.com/ubuntu-ports noble-backports main restricted universe multiverse' \
    'deb [arch=arm64] http://ports.ubuntu.com/ubuntu-ports noble-security main restricted universe multiverse' \
    > /etc/apt/sources.list.d/arm64.list \
  && printf '%s\n' \
    'deb [arch=amd64] http://archive.ubuntu.com/ubuntu noble main restricted universe multiverse' \
    'deb [arch=amd64] http://archive.ubuntu.com/ubuntu noble-updates main restricted universe multiverse' \
    'deb [arch=amd64] http://archive.ubuntu.com/ubuntu noble-backports main restricted universe multiverse' \
    'deb [arch=amd64] http://security.ubuntu.com/ubuntu noble-security main restricted universe multiverse' \
    > /etc/apt/sources.list.d/amd64.list \
  && apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    libc6:amd64 \
    libatomic1:amd64 \
    libgcc-s1:amd64 \
    libstdc++6:amd64 \
    zlib1g:amd64 \
    make \
    mono-devel \
    python3 \
    rsync \
    unzip \
    wget \
    gnupg \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get update && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN mkdir -p /lib64 \
  && if [ ! -e /lib64/ld-linux-x86-64.so.2 ]; then \
       if [ -e /lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 ]; then \
         ln -s /lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2; \
       elif [ -e /usr/x86_64-linux-gnu/lib64/ld-linux-x86-64.so.2 ]; then \
         ln -s /usr/x86_64-linux-gnu/lib64/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2; \
       fi; \
     fi

WORKDIR /workspace
ENTRYPOINT ["/bin/bash", "-lc"]
