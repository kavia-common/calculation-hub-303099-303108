#!/bin/bash
cd /home/kavia/workspace/code-generation/calculation-hub-303099-303108/calculator_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

