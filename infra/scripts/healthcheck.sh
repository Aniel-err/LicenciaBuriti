#!/bin/sh
set -eu

BASE_URL="${BASE_URL:-https://${DOMAIN}}"
curl --fail --silent --show-error "${BASE_URL}/api/health"
curl --fail --silent --show-error "${BASE_URL}/api/ready"
printf '\nServiços disponíveis em %s\n' "$BASE_URL"
