#!/bin/bash

exec > /usr/share/hooks/mywebsite-site/output.log 2>&1

git fetch --all
git checkout --force "origin/main"
