"""Read PCD (binary/ASCII), reuse the exact SmartReview Waymo ground/fit measurements."""
import importlib.util
import json
import sys
from pathlib import Path
import numpy as np
spec = importlib.util.spec_from_file_location('waymo', Path(__file__).parents[1] / 'projects3d/export_waymo.py')
waymo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(waymo)

def read_pcd(path):
    with open(path,'rb') as f:
        header={}
        for _ in range(100):
            line=f.readline().decode('ascii').strip()
            if not line or line.startswith('#'):continue
            k,*v=line.split();header[k]=v
            if k=='DATA':break
        fields=header['FIELDS']; counts=list(map(int,header.get('COUNT',['1']*len(fields))))
        sizes=list(map(int,header['SIZE']));types=header['TYPE']
        n=int(header['POINTS'][0])
        if not 0<n<=5000000:raise ValueError('PCD point count outside limit')
        if header['DATA']==['binary']:
            kinds={'F':'f','I':'i','U':'u'}
            dtype=np.dtype([(name,'<'+kinds[t]+str(size),(count,)) if count>1 else (name,'<'+kinds[t]+str(size)) for name,t,size,count in zip(fields,types,sizes,counts)])
            data=np.frombuffer(f.read(),dtype=dtype,count=n)
            xyz=np.column_stack([data[k] for k in ('x','y','z')])
        elif header['DATA']==['ascii']:
            data=np.loadtxt(f,ndmin=2); offsets=np.cumsum([0]+counts[:-1])
            xyz=data[:,[offsets[fields.index(k)] for k in ('x','y','z')]]
            if len(xyz)!=n:raise ValueError('PCD truncated')
        else:raise ValueError('PCD compressed chưa hỗ trợ; dùng PCD binary hoặc ASCII')
        return xyz[np.isfinite(xyz).all(axis=1)]

if __name__=='__main__':
    root=Path(sys.argv[1]); scene=json.loads((root/'scene.json').read_text()); skipped=[]
    for frame in scene['frames']:
        if not frame['boxes']:continue
        try:
            points=read_pcd(root/f"{frame['timestamp']}.pcd")
            waymo.count_points(points,frame['boxes'])
        except Exception as exc:
            skipped.append({'object_id':'*','frame':frame['timestamp'],'reason':f'Không đo được point cloud: {type(exc).__name__}: {exc}'})
    (root/'measured.json').write_text(json.dumps({'scene':scene,'skipped':skipped}))
