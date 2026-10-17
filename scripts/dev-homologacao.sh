#!/bin/sh
# Sobe o app em homologação: Next.js local (porta 3001, a 3000 já é usada
# pelo container projeto-conferencia-app no mesmo Docker) apontando pro
# Supabase LOCAL (.env.homologacao), não pro banco real (.env.local).
#
# Pré-requisito: Supabase local no ar (`supabase start`, uma vez só).
#
# Uso: npm run dev:homologacao

set -eu
cd "$(dirname "$0")/.."

if [ ! -f .env.homologacao ]; then
  echo "RECUSADO: .env.homologacao não existe. Rode 'supabase start' e gere o arquivo (ver README/CLAUDE.md)." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env.homologacao
set +a

# distDir próprio: sem isso, o Next recusa rodar um 2º dev server no mesmo
# diretório de projeto enquanto o main (porta 3000) já está de pé.
export NEXT_DIST_DIR=.next-homologacao

exec npx next dev -p 3001
