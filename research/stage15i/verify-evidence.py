"""Verify exact retained Actions ZIP, safely extract, and run independent JS proof."""
import hashlib
import subprocess
import tempfile
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
archive = HERE/'evidence.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest() == '4e42915da5d6d7176326a9f4f11323ae7fbe11a5f1f2bc41f298c186940389c3'
with tempfile.TemporaryDirectory(prefix='appea-15i-proof-') as folder:
    with zipfile.ZipFile(archive) as z:
        allowed = {'capture.json','data.json','frame.json','input-manifest.json','navigation.json','result.json','shadow.json'}
        assert set(z.namelist()) == allowed
        assert sum(i.file_size for i in z.infolist()) <= 2097152
        assert all(i.file_size <= 1048576 for i in z.infolist())
        z.extractall(folder)
    subprocess.run(['node',str(HERE/'check-evidence.mjs'),folder],check=True)
