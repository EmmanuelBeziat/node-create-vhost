#!/bin/bash

exec > /usr/share/hooks/monsite-site/output.log 2>&1

git fetch --all
git checkout --force "origin/main"
