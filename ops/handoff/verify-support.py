"""Offline authenticated bundle inspection. Does not extract, execute, connect or start services."""
import hashlib, json, posixpath, re, stat, sys, tarfile
from pathlib import Path
def need(v,reason):
    if not v: raise RuntimeError(reason)
def safe(name):return bool(name) and not name.startswith('/') and '\\' not in name and all(x not in ('..','') for x in name.split('/'))
def hstream(f):
    h=hashlib.sha256();n=0
    for x in iter(lambda:f.read(1024*1024),b''):h.update(x);n+=len(x)
    return h.hexdigest(),n

def inspect(path):
    need(Path(path).is_file() and Path(path).stat().st_size <= 16 * 1024**3, "input-bound")
    actual={};directories=set();manifest=None;image_blobs=[];image_identity=None
    with tarfile.open(path,'r|gz') as tar:
        expanded = 0
        count = 0
        for m in tar:
            count += 1; expanded += m.size
            need(count <= 200000 and expanded <= 8 * 1024**3, "archive-bound")
            need(safe(m.name) and m.name not in actual and m.name not in directories,'unsafe-or-duplicate-member')
            if m.name=='RECOVERY-MANIFEST.json':
                need(manifest is None and m.isfile() and m.size<32*1024**2,'manifest-contract');manifest=json.load(tar.extractfile(m));continue
            if m.isdir():directories.add(m.name);continue
            info={'path':m.name,'mode':m.mode,'uid':m.uid,'gid':m.gid}
            if m.issym():
                target=posixpath.normpath(posixpath.join(posixpath.dirname(m.name),m.linkname))
                need(not m.linkname.startswith('/') and safe(target),'symlink-escape')
                info.update(type='symlink',target=m.linkname)
            else:
                need(m.isfile(),'special-member')
                f=tar.extractfile(m)
                if m.name=='identity.json' and m.size<65536:
                    raw=f.read();image_identity=json.loads(raw);sha=hashlib.sha256(raw).hexdigest();size=len(raw)
                else:sha,size=hstream(f)
                need(size==m.size,'member-size');info.update(type='file',sha256=sha,bytes=size)
            actual[m.name]=info
    need(manifest and manifest['version']==1 and manifest['kind']=='tuat-recovery-support-part','manifest-format')
    expected={}
    for entry in manifest['members']:
        x=dict(entry)
        need(stat.S_IFMT(x['mode'])==({'file':stat.S_IFREG,'symlink':stat.S_IFLNK}.get(x['type'])),'manifest-mode-type')
        x['mode']=stat.S_IMODE(x['mode']);expected[x['path']]=x
    need(len(expected)==len(manifest['members']) and actual==expected,'manifest-mismatch')
    for name in actual:
        parent=posixpath.dirname(name)
        while parent:
            need(parent not in actual or actual[parent]['type']!='symlink','member-beneath-symlink');parent=posixpath.dirname(parent)
    if manifest['part'].startswith('image-'):
        need(image_identity is not None,'image-identity-missing')
        with tarfile.open(path,'r|gz') as outer:
            for m in outer:
                if m.name!='image.tar':continue
                with tarfile.open(fileobj=outer.extractfile(m),mode='r|') as inner:
                    names=set()
                    for entry in inner:
                        name=entry.name.rstrip('/');need(safe(name) and name not in names,'unsafe-image-member');names.add(name)
                        if entry.isdir():continue
                        need(entry.isfile(),'image-special-member')
                        sha,size=hstream(inner.extractfile(entry));need(size==entry.size,'image-size')
                        if re.fullmatch('blobs/sha256/[a-f0-9]{64}',name):
                            need(sha==name.rsplit('/',1)[1],'image-blob-mismatch');image_blobs.append('sha256:'+sha)
                break
        need(image_identity['id'] in image_blobs and all(x.rsplit('@',1)[1] in image_blobs for x in image_identity['digests']),'pinned-image-not-exported')
    return {'part':manifest['part'],'membersVerified':len(actual),'imageBlobsVerified':len(image_blobs),'extracted':False,'servicesStarted':False,'fullHostRestoreVerified':False}

if __name__ == "__main__":
    try:
        need(len(sys.argv) == 2, "usage")
        print(json.dumps(inspect(sys.argv[1])))
    except Exception:
        print(json.dumps({"verified": False, "reason": "invalid-or-mismatched-support-part"}))
        sys.exit(1)
