import os
import re
import numpy as np

def read_pcd_or_bin(file_path: str) -> np.ndarray:
    """
    Reads a point cloud file (.pcd or .bin) into a (N, 4) float32 numpy array [x, y, z, intensity].
    """
    if file_path.endswith('.bin'):
        sz = os.path.getsize(file_path)
        if sz % 22 == 0:
            num_pts = sz // 22
            with open(file_path, 'rb') as fp:
                pts = np.frombuffer(fp.read(num_pts * 16), dtype=np.float32).reshape(num_pts, 4)
        else:
            pts = np.fromfile(file_path, dtype=np.float32).reshape(-1, 4)
        return pts[np.isfinite(pts).all(axis=1)]

    with open(file_path, 'rb') as f:
        header_lines = []
        while True:
            line = f.readline().decode('ascii', errors='ignore').strip()
            header_lines.append(line)
            if line.startswith('DATA'):
                break

    header = {}
    for line in header_lines:
        parts = line.split()
        if not parts:
            continue
        key = parts[0].upper()
        header[key] = parts[1:]

    data_type = header.get('DATA', ['ascii'])[0].lower()
    fields = [f.lower() for f in header.get('FIELDS', ['x', 'y', 'z', 'intensity'])]
    num_points = int(header.get('POINTS', [0])[0])

    # Find field offsets
    idx_x = fields.index('x') if 'x' in fields else 0
    idx_y = fields.index('y') if 'y' in fields else 1
    idx_z = fields.index('z') if 'z' in fields else 2
    idx_i = fields.index('intensity') if 'intensity' in fields else -1

    if data_type == 'ascii':
        # Re-open in text mode skipping header
        with open(file_path, 'r', encoding='ascii', errors='ignore') as f:
            for line in f:
                if line.strip().startswith('DATA'):
                    break
            raw_data = np.loadtxt(f, dtype=np.float32)
        if raw_data.ndim == 1:
            raw_data = raw_data.reshape(1, -1)
        x = raw_data[:, idx_x]
        y = raw_data[:, idx_y]
        z = raw_data[:, idx_z]
        if idx_i >= 0 and idx_i < raw_data.shape[1]:
            intensity = raw_data[:, idx_i]
        else:
            intensity = np.zeros_like(x)
        return np.column_stack([x, y, z, intensity]).astype(np.float32)

    elif data_type == 'binary':
        raw_all = open(file_path, 'rb').read()
        marker = raw_all.find(b'DATA binary')
        start = raw_all.find(b'\n', marker) + 1
        sizes = list(map(int, header.get('SIZE', ['4'] * len(fields))))
        types = header.get('TYPE', ['F'] * len(fields))
        counts = list(map(int, header.get('COUNT', ['1'] * len(fields))))
        kinds = {'F': 'f', 'I': 'i', 'U': 'u'}
        dt = np.dtype([
            (name, '<' + kinds[t] + str(s), (c,)) if c > 1 else (name, '<' + kinds[t] + str(s))
            for name, t, s, c in zip(fields, types, sizes, counts)
        ])
        data = np.frombuffer(raw_all, dtype=dt, count=num_points, offset=start)
        x = data['x'].astype(np.float32)
        y = data['y'].astype(np.float32)
        z = data['z'].astype(np.float32)
        if 'intensity' in fields:
            intensity = np.asarray(data['intensity']).reshape(len(x), -1)[:, 0].astype(np.float32)
        else:
            intensity = np.zeros_like(x)
        pts = np.column_stack([x, y, z, intensity]).astype(np.float32)
        return pts[np.isfinite(pts).all(axis=1)]

    else:
        raise ValueError(f"Unsupported PCD DATA type: {data_type}")
