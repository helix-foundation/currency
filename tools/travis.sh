#! /bin/bash

set -exuo pipefail

export NODE_OPTIONS=--max_old_space_size=3072

#build needed for generation typechain-types
npm run build

if [[ "${1}" == "primary" ]]; then
  npm run lint
  npm run test
elif [[ "${1}" == "secondary" ]]; then
  npm run coverage:sol
  npx coveralls < coverage/lcov.info
# elif [[ "${1}" == "tertiary" ]]; then
#   npm run build
#   npm run coverage:js
#   npx coveralls < coverage-nyc/lcov.info
elif [[ "${1}" == "docker" ]]; then
  docker build -t currency .
  docker run -it --rm currency --selftest
else
  exit 1
fi
