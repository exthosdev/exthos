#!/bin/bash
# run all scriptes in this folder (not subfolders)

isLocal=true
for i in $(ls -p $(dirname $(realpath -s $0)) | grep -v / | grep -v README.md); do
    echo "START $i"
    node $(dirname $(realpath -s $0))/$i || exit 1
    echo "FINISH $i"
    echo ''
done