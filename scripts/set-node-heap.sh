#!/usr/bin/env bash
# Shared Node heap for SDK build/test/vendor scripts.
# Override total MB: CONTINUUM_NODE_HEAP_MB=12288
if [[ "${NODE_OPTIONS:-}" != *max-old-space-size* ]]; then
  export NODE_OPTIONS="--max-old-space-size=${CONTINUUM_NODE_HEAP_MB:-8192}${NODE_OPTIONS:+ $NODE_OPTIONS}"
fi
