FROM rust:latest

# Install dependencies
# clang is required by zstd-sys (cc-rs) for compiling C code to wasm32
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake \
    pkg-config \
    libssl-dev \
    git \
    curl \
    clang \
    && rm -rf /var/lib/apt/lists/*

# Install Rust nightly + rust-src (build-std with panic_abort requires nightly)
RUN rustup toolchain install nightly && \
    rustup default nightly && \
    rustup component add rust-src --toolchain nightly

# Install wasm-pack
RUN cargo install wasm-pack

WORKDIR /workspace