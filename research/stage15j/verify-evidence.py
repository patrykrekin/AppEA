"""Verify retained Actions ZIP and independently reproduce the two-frame proof."""
import hashlib
import json
import subprocess
import tempfile
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
archive = HERE / 'evidence.zip'
meta = json.loads((HERE / 'artifact-metadata.json').read_text())
assert hashlib.sha256(archive.read_bytes()).hexdigest() == meta['sha256']
cycle_files = {'capture.json', 'data.json', 'frame.json', 'input-manifest.json',
               'output-manifest.json', 'navigation.json', 'result.json', 'shadow.json', 'state-commit.json'}
allowed = {f'cycle{n}/{name}' for n in (1, 2) for name in cycle_files}
allowed |= {'retry.json', 'wait.json', 'state-final.json', 'series-result.json'}
with tempfile.TemporaryDirectory(prefix='appea-15j-proof-') as folder:
    with zipfile.ZipFile(archive) as z:
        assert set(z.namelist()) == allowed
        assert len(z.namelist()) == len(allowed)
        assert sum(i.file_size for i in z.infolist()) <= 4194304
        assert all(i.file_size <= 1048576 for i in z.infolist())
        z.extractall(folder)
    subprocess.run(['node', str(HERE / 'check-evidence.mjs'), folder], check=True)
