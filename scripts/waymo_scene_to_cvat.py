"""Package an exported Waymo scene as CVAT Sly Point Cloud Format 1.0.
Usage: python scripts/waymo_scene_to_cvat.py SCENE_DIRECTORY OUTPUT_DIRECTORY
"""
import json
import shutil
import sys
import uuid
import zipfile
from pathlib import Path
import numpy as np

source, dest = map(Path, sys.argv[1:])
scene = json.loads((source / 'scene.json').read_text())
dest.mkdir(parents=True, exist_ok=False)
sly = dest / 'sly'
base = sly / 'ds0'
for name in ('ann', 'pointcloud', 'related_images'):
    (base / name).mkdir(parents=True)
labels = sorted({b['type'] for f in scene['frames'] for b in f['boxes']})
tracks = {name: i + 1 for i, name in enumerate(sorted({b['id'] for f in scene['frames'] for b in f['boxes']}))}
key = lambda name: uuid.uuid5(uuid.NAMESPACE_URL, 'smartreview-waymo:' + name).hex
write = lambda path, data: path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
write(sly / 'meta.json', {'classes': [{'id': i, 'title': label, 'shape': 'cuboid_3d', 'color': '#33AAFF', 'geometry_config': {}} for i, label in enumerate(labels)], 'tags': [], 'projectType': 'point_clouds'})
ids = {'tags': {}, 'objects': {key(t): n for t, n in tracks.items()}, 'figures': {}, 'videos': {}}
manifest = []
count = 0
for index, frame in enumerate(scene['frames']):
    name = f'{index:06d}'
    n = sum(frame['laserCounts'])
    raw = (source / frame['file']).read_bytes()
    assert len(raw) in (n * 16, n * 22), (index, len(raw), n)
    points = np.frombuffer(raw, dtype='<f4', count=n * 4).reshape(n, 4)
    assert np.isfinite(points).all()
    header = f'# .PCD v0.7\nVERSION 0.7\nFIELDS x y z intensity\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\nWIDTH {n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {n}\nDATA binary\n'
    (base / 'pointcloud' / (name + '.pcd')).write_bytes(header.encode() + points.tobytes())
    cameras = sorted((source / 'cameras').glob(f'*/{frame["timestamp"]}.jpg'))
    for image in cameras:
        folder = base / 'related_images' / (name + '_pcd')
        folder.mkdir(exist_ok=True)
        shutil.copyfile(image, folder / (image.parent.name + '.jpg'))
    framekey = key('frame:' + str(frame['timestamp']))
    ids['videos'][framekey] = index
    objects, figures = [], []
    for box in frame['boxes']:
        count += 1
        objectkey = key(box['id'])
        figurekey = key(f'{frame["timestamp"]}:{box["id"]}')
        ids['figures'][figurekey] = count
        objects.append({'key': objectkey, 'classTitle': box['type'], 'tags': []})
        xyz = lambda values: dict(zip(('x', 'y', 'z'), values))
        figures.append({'key': figurekey, 'objectKey': objectkey, 'geometryType': 'cuboid_3d', 'geometry': {'position': xyz(box['center']), 'rotation': xyz([0, 0, box['heading']]), 'dimensions': xyz(box['size'])}})
    write(base / 'ann' / (name + '.pcd.json'), {'key': framekey, 'description': f'Waymo timestamp {frame["timestamp"]}', 'tags': [], 'objects': objects, 'figures': figures})
    manifest.append({'frame': index, 'pcd': name + '.pcd', 'timestamp': frame['timestamp'], 'points': n, 'boxes': len(figures), 'pose': frame['pose']})
write(sly / 'key_id_map.json', ids)
write(dest / 'frame-track-mapping.json', {'segment': scene['segment'], 'coordinate_system': 'vehicle: x forward, y left, z up; metres; rotation radians', 'frames': manifest, 'track_ids': tracks})
write(dest / 'cvat-labels.json', [{'name': label, 'type': 'cuboid', 'attributes': []} for label in labels])
with zipfile.ZipFile(dest / 'waymo-10frames-cvat-sly.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for file in sorted(sly.rglob('*')):
        if file.is_file(): z.write(file, file.relative_to(sly))
with zipfile.ZipFile(dest / 'waymo-10frames-cvat-data.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for folder in ('pointcloud', 'related_images'):
        for file in sorted((base / folder).rglob('*')):
            if file.is_file(): z.write(file, file.relative_to(base))
print(json.dumps({'frames': len(manifest), 'cuboids': count, 'tracks': len(tracks), 'images': sum(1 for _ in (base / 'related_images').rglob('*.jpg'))}))
