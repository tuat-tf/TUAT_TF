import hashlib
import importlib.util
import io
import json
from pathlib import Path
import stat
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('verify_support', Path(__file__).with_name('verify-support.py'))
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class SupportVerification(unittest.TestCase):
    def bundle(self, path, *, name='file', payload=b'private fixture', expected=None, link=None, hardlink=False, duplicate=False, image=None):
        records = []
        with tarfile.open(path, 'w:gz') as tar:
            def add(filename, data):
                info = tarfile.TarInfo(filename)
                info.mode = 0o600
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
                records.append({'path': filename, 'type': 'file', 'sha256': hashlib.sha256(data if expected is None else expected).hexdigest(), 'bytes': len(data), 'mode': stat.S_IFREG | 0o600, 'uid': 0, 'gid': 0})
            if link is not None:
                info = tarfile.TarInfo(name)
                info.type = tarfile.LNKTYPE if hardlink else tarfile.SYMTYPE
                info.linkname = link
                tar.addfile(info)
                records.append({'path': name, 'type': 'symlink', 'target': link, 'mode': stat.S_IFLNK | info.mode, 'uid': 0, 'gid': 0})
            elif image is not None:
                blob = b'image-content'
                digest = hashlib.sha256(blob).hexdigest()
                inner_bytes = io.BytesIO()
                with tarfile.open(fileobj=inner_bytes, mode='w') as inner:
                    item = tarfile.TarInfo('blobs/sha256/' + digest)
                    item.size = len(blob)
                    inner.addfile(item, io.BytesIO(blob))
                add('image.tar', inner_bytes.getvalue())
                pin = digest if image else '0' * 64
                add('identity.json', json.dumps({'id': 'sha256:' + pin, 'digests': ['fixture@sha256:' + pin]}).encode())
            else:
                add(name, payload)
                if duplicate:
                    add(name, payload)
            manifest = json.dumps({'version': 1, 'kind': 'tuat-recovery-support-part', 'part': 'image-fixture' if image is not None else 'fixture', 'members': records}).encode()
            info = tarfile.TarInfo('RECOVERY-MANIFEST.json')
            info.size = len(manifest)
            tar.addfile(info, io.BytesIO(manifest))

    def check(self, **options):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'part.tar.gz'
            self.bundle(path, **options)
            return verifier.inspect(path)

    def test_manifest_checks_bytes_and_never_claims_host_restore(self):
        result = self.check()
        self.assertEqual(result['membersVerified'], 1)
        self.assertFalse(result['fullHostRestoreVerified'])
        self.assertFalse(result['extracted'])
        with self.assertRaises(RuntimeError):
            self.check(expected=b'changed')

    def test_unsafe_paths_links_and_duplicate_members_rejected(self):
        for options in [{'name': '../escape'}, {'name': '/absolute'}, {'name': 'a', 'link': '../escape'}, {'link': 'file', 'hardlink': True}, {'duplicate': True}]:
            with self.subTest(options=options), self.assertRaises(RuntimeError):
                self.check(**options)

    def test_oci_blob_must_match_expected_image_identity(self):
        self.assertEqual(self.check(image=True)['imageBlobsVerified'], 1)
        with self.assertRaises(RuntimeError):
            self.check(image=False)


if __name__ == '__main__':
    unittest.main()
