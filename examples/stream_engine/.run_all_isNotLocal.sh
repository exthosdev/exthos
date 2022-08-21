#!/bin/bash
# run all scriptes in this folder (not subfolders)

isLocal=false
for i in $(ls -p $(dirname $(realpath -s $0)) | grep -v /); do
    echo "START $i"
    node $(dirname $(realpath -s $0))/$i
    echo "FINISH $i"
done
