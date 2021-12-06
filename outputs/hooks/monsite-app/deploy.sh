#!/bin/bash

exec > /usr/share/hooks/monsite-app/output.log 2>&1

git fetch --all
git checkout --force "origin/main"
