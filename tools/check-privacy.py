#!/usr/bin/env python3
"""Fail CI if public HTML loads GA before consent or lacks the shared consent files."""
from pathlib import Path
import re,sys
root=Path(__file__).resolve().parents[1]
errors=[]
for p in root.rglob('*.html'):
    rel=p.relative_to(root).as_posix()
    if rel.startswith(('editor/', '.github/')) or rel == 'write-for-the-journal.html':
        continue  # private editor is separately scoped; audit independently if tracking is added
    text=p.read_text(encoding='utf-8')
    if re.search(r'googletagmanager\.com/gtag/js|gtag\s*\(\s*[\"\']config[\"\']',text,re.I):
        errors.append(f'{rel}: direct GA loader found')
    if '/consent.js' not in text:
        errors.append(f'{rel}: missing /consent.js')
    if '/consent.css' not in text:
        errors.append(f'{rel}: missing /consent.css')
for x in errors:print('ERROR:',x)
print(f'Privacy check: {len(errors)} issue(s)')
sys.exit(bool(errors))
