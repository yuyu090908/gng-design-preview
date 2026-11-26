#!/usr/bin/env bash
# DB のテスト：素の PostgreSQL に Supabase の最小限の定義とマイグレーションを入れ、権限・不正防止を確認する
# 使い方：PGHOST=/tmp PGPORT=54329 PGUSER=postgres bash supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${TEST_DB:-gn_community_test}
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/00_supabase_stub.sql
for f in migrations/*.sql; do psql -q -At -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null; done
for f in tests/[1-9]*.sql; do psql -q -At -v ON_ERROR_STOP=1 -d "$DB" -f "$f" > /tmp/gn-sqltest.out; grep -E "passed" /tmp/gn-sqltest.out; done
