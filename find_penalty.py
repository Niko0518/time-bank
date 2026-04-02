#!/usr/bin/env python3
import sys
search = sys.argv[1].encode('utf-8')
filepath = 'android_project/app/src/main/assets/www/js/app-systems.js'
with open(filepath, 'rb') as f:
    content = f.read()

idx = content.find(search)
if idx >= 0:
    print(f'Found at {idx}')
    print(repr(content[idx:idx+150]))
else:
    print('Not found')