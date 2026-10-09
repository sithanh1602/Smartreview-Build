"""Export persisted GreenSM predictions to native CVAT tracks, preserving exact visible boxes."""
from pathlib import Path
from collections import defaultdict, Counter
from xml.etree import ElementTree as E
from zipfile import ZipFile, ZIP_STORED, ZIP_DEFLATED
import json,csv,io

project=Path('web/storage/projects/11724a8e-3ecd-4202-95ad-fb024f6c5000')
source=next(project.glob('*/dataset.json'))
data=json.loads(source.read_text())
output=Path('outputs/greensm-cvat-tracking-v2')
output.mkdir(exist_ok=False)
media={m['id']:m for m in data['media']}
by_frame=defaultdict(list)
for a in data['annotations']:by_frame[a['frame_id']].append(a)
frames=sorted(data['frames'],key=lambda f:Path(f['image']).name)
assert len(frames)==474
assert all(a['label']=='car' for a in data['annotations'])

def export(selected,name,file):
    root=E.Element('annotations');E.SubElement(root,'version').text='1.1'
    task=E.SubElement(E.SubElement(root,'meta'),'task')
    for k,v in [('name',name),('size',len(selected)),('mode','interpolation'),('overlap',0),('start_frame',0),('stop_frame',len(selected)-1),('frame_filter',''),('flipped','False')]:E.SubElement(task,k).text=str(v)
    original=E.SubElement(task,'original_size');m=media[selected[0]['media_id']]
    E.SubElement(original,'width').text=str(m['width']);E.SubElement(original,'height').text=str(m['height'])
    label=E.SubElement(E.SubElement(task,'labels'),'label');E.SubElement(label,'name').text='car';E.SubElement(label,'type').text='rectangle';E.SubElement(label,'attributes')
    tracks=defaultdict(list)
    for index,f in enumerate(selected):
        for a in by_frame[f['id']]:
            key=(f['media_id'],'tracked',a['track_id']) if 'track_id' in a else (f['media_id'],'single_detection',a['id'])
            tracks[key].append((index,a))
    mapping=[]
    for track_id,(key,observations) in enumerate(sorted(tracks.items())):
        track=E.SubElement(root,'track',id=str(track_id),label='car',source='auto')
        mapping.append({'cvat_track_id':track_id,'sequence':key[0],'type':key[1],'source_id':key[2],'annotation_ids':[a['id'] for _,a in observations]})
        visible={i:a for i,a in observations}
        events={i:(a,False) for i,a in observations}
        # Mark first absent retained image, including at sequence boundaries.
        for i,a in observations:
            if i+1<len(selected) and i+1 not in visible:events[i+1]=(a,True)
        for index,(a,outside) in sorted(events.items()):
            g=a['geometry']
            E.SubElement(track,'box',frame=str(index),xtl=str(g['x']),ytl=str(g['y']),xbr=str(g['x']+g['width']),ybr=str(g['y']+g['height']),outside=str(int(outside)),occluded='0',keyframe='1',z_order='0')
        # Verify all CVAT visible frames exactly match supplied observations; no phantom interpolation.
        parsed=list(track)
        for index in range(len(selected)):
            previous=[b for b in parsed if int(b.get('frame'))<=index]
            actual=bool(previous and previous[-1].get('outside')=='0')
            assert actual==(index in visible),(key,index)
            if actual:
                b=previous[-1];g=visible[index]['geometry']
                assert int(b.get('frame'))==index
                assert abs(float(b.get('xtl'))-g['x'])<1e-8
                assert abs(float(b.get('xbr'))-(g['x']+g['width']))<1e-8
    E.indent(root);E.ElementTree(root).write(file,encoding='utf-8',xml_declaration=True)
    parsed=E.parse(file).getroot()
    assert not parsed.findall('image')
    assert len(parsed.findall('./track/box[@outside="0"]'))==sum(len(by_frame[f['id']]) for f in selected)
    file.with_suffix('.track-map.json').write_text(json.dumps(mapping,indent=2))
    with file.with_suffix('.frame-order.csv').open('w') as handle:
        writer=csv.writer(handle);writer.writerow(['cvat_frame','image_name','sequence','source_index_at_5fps','timestamp_ms'])
        for index,f in enumerate(selected):writer.writerow([index,Path(f['image']).name,f['media_id'],f['index'],f.get('timestamp_ms','')])
    return {'frames':len(selected),'tracks':len(tracks),'linked_tracks':sum(k[1]=='tracked' for k in tracks),'single_detection_tracks':sum(k[1]=='single_detection' for k in tracks),'visible_boxes':sum(len(v) for v in tracks.values())}

summary={'combined':export(frames,'GreenSM car tracking — all sequences',output/'annotations_all_tracks.xml'),'sequences':{}}
for sequence in sorted(media):
    selected=[f for f in frames if f['media_id']==sequence]
    folder=output/'per_video'/sequence;folder.mkdir(parents=True)
    summary['sequences'][sequence]=export(selected,sequence,folder/'annotations_tracks.xml')
    with ZipFile(folder/'frames.zip','x',compression=ZIP_STORED) as z:
        for f in selected:z.write(source.parent/f['image'],Path(f['image']).name)
(output/'summary.json').write_text(json.dumps(summary,indent=2))
(output/'README.md').write_text('''# GreenSM — CVAT native tracking 1.1

Đây là bản xuất lại từ dữ liệu tracking được lưu trong SmartReview, không chạy lại YOLO và không tạo liên kết xe mới.

## Cách dùng khuyến nghị: mỗi video một task
Trong per_video/<video>/ có frames.zip và annotations_tracks.xml.
1. Tạo task CVAT với label car (Rectangle), upload frames.zip của video đó.
2. Chọn Sorting method = Lexicographical, không shuffle, không bỏ frame (frame step=1).
3. Import annotations, chọn CVAT for video 1.1, upload annotations_tracks.xml cùng thư mục.
4. Đối chiếu annotations_tracks.frame-order.csv: CVAT frame bắt đầu từ 0 là thứ tự các ảnh đã lọc, KHÔNG phải chỉ số frame nguồn trước khi lọc.

## Task đã chứa cả 474 ảnh
Dùng annotations_all_tracks.xml chỉ khi task chứa đúng 474 ảnh và thứ tự khớp annotations_all_tracks.frame-order.csv (sắp tên ảnh tăng dần). Nếu thứ tự khác, không import file này; dùng task mới theo từng video hoặc cần remap theo thứ tự task hiện tại.

## Tracking và giới hạn
Tất cả bbox nằm trong <track>, không có <image>/<box> dạng shape độc lập. 182 track từ ByteTrack giữ nguyên liên kết (gồm cả track có thể chỉ có một quan sát); 1486 detection chưa được tracker xác nhận được biểu diễn bằng track một frame riêng, không coi là theo dõi thành công qua nhiều frame. Tổng 1668 track XML, 2559 bbox car và 474 ảnh.

Mọi bbox quan sát là keyframe=1. outside=1 ở ảnh giữ lại đầu tiên mất dấu và sau lần xuất hiện cuối (nếu còn frame trong task), tránh CVAT nội suy vào ảnh không có detection hoặc qua video khác. Không dựng thêm bbox trong những frame đã bị loại khỏi nguồn.

Ảnh đã lọc thưa nên vẫn có thể đổi/đứt ID. Đây là prelabel, không bảo đảm danh tính xe đúng tuyệt đối. File track-map.json giữ ánh xạ ID CVAT → ID ByteTrack/detection gốc; confidence và timestamp nguồn vẫn ở dataset SmartReview. Không nhập lại định dạng CVAT image cũ.
''')
with ZipFile(output.with_suffix('.zip'),'x',compression=ZIP_DEFLATED,compresslevel=1) as z:
    for file in sorted(output.rglob('*')):
        if file.is_file():z.write(file,file.relative_to(output.parent))
with ZipFile(output.with_suffix('.zip')) as z:assert z.testzip() is None
print(json.dumps(summary))
print(output.resolve())
