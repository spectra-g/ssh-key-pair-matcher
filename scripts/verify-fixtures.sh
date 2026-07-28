#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixtures_directory="${repository_root}/tests/fixtures"
expected_file="${fixtures_directory}/expected.tsv"
temporary_directory="$(mktemp -d)"
trap 'rm -rf "${temporary_directory}"' EXIT

while IFS=$'\t' read -r fixture key_type bits sha256 md5 encrypted; do
  if [[ "${fixture}" == "fixture" ]]; then
    continue
  fi

  public_key="${fixtures_directory}/${fixture}.pub"
  private_key="${fixtures_directory}/${fixture}"
  actual_type="$(awk '{ print $1 }' "${public_key}")"
  actual_sha_line="$(ssh-keygen -lf "${public_key}" -E sha256)"
  actual_md5_line="$(ssh-keygen -lf "${public_key}" -E md5)"
  read -r actual_bits actual_sha256 _ <<<"${actual_sha_line}"
  read -r _ actual_md5 _ <<<"${actual_md5_line}"

  [[ "${actual_type}" == "${key_type}" ]]
  [[ "${actual_bits}" == "${bits}" ]]
  [[ "${actual_sha256}" == "${sha256}" ]]
  [[ "${actual_md5}" == "${md5}" ]]

  if [[ "${encrypted}" == "false" ]]; then
    derived_key="${temporary_directory}/${fixture}.pub"
    ssh-keygen -y -f "${private_key}" >"${derived_key}"
    expected_identity="$(awk '{ print $1, $2 }' "${public_key}")"
    derived_identity="$(awk '{ print $1, $2 }' "${derived_key}")"
    [[ "${derived_identity}" == "${expected_identity}" ]]
  fi
done <"${expected_file}"

echo "Verified 8 disposable SSH fixture pairs and their recorded metadata."
