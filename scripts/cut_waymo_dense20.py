"""Select the 20 consecutive timestamps with most cuboids from a Waymo parquet ZIP."""
from pathlib import Path
import zipfile,io,json,collections
import pyarrow as pa
import pyarrow.parquet as pq
import pyarrow.compute as pc
z=zipfile.ZipFile('/home/thanh/data/waymo-test2.zip')
segkey='key.segment_context_name';tskey='key.frame_timestamp_micros'
files=[n for n in z.namelist() if n.endswith('.parquet')]
def read(c):return pq.read_table(io.BytesIO(z.read(next(n for n in files if '/'+c+'/' in n))),columns=[segkey,tskey])
poses=read('vehicle_pose');boxes=read('lidar_box');best=None
for segment in sorted(set(poses[segkey].to_pylist()) & set(boxes[segkey].to_pylist())):
 stamps=sorted(set(poses.filter(pc.equal(poses[segkey],segment))[tskey].to_pylist()))
 counts=collections.Counter(boxes.filter(pc.equal(boxes[segkey],segment))[tskey].to_pylist())
 for i in range(len(stamps)-19):
  window=stamps[i:i+20];score=sum(counts[t] for t in window)
  if best is None or score>best['cuboids']:best={'segment':segment,'start_index':i,'stop_index':i+19,'timestamps':window,'cuboids':score,'counts':[counts[t] for t in window]}
assert best
print('Selected:',json.dumps(best),flush=True)
out=Path('outputs/waymo-test2-dense20-parquet');out.mkdir(exist_ok=True)
for name in files:
 c=Path(name).parent.name
 target=out/c/Path(name).name;target.parent.mkdir(exist_ok=True)
 raw=io.BytesIO(z.read(name));parquet=pq.ParquetFile(raw);rows=0
 with pq.ParquetWriter(target,parquet.schema_arrow) as writer:
  for batch in parquet.iter_batches(batch_size=5):
   t=pa.Table.from_batches([batch])
   if segkey in t.column_names:t=t.filter(pc.equal(t[segkey],best['segment']))
   if tskey in t.column_names:t=t.filter(pc.is_in(t[tskey],value_set=pa.array(best['timestamps'],type=t[tskey].type)))
   if t.num_rows:writer.write_table(t);rows+=t.num_rows
 print(c,rows,flush=True)
 del raw,parquet
(out/'selection.json').write_text(json.dumps(best,indent=2))
