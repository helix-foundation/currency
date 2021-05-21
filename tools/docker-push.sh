#! /bin/bash

set -exuo pipefail

echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
docker push eco/currency:$(git describe --always)
