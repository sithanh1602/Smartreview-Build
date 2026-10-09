"""Export local YOLO + ByteTrack predictions as an image/label tracking dataset."""
import argparse
import collections
import hashlib
import json
import os
from pathlib import Path
import time

os.environ.setdefault('YOLO_AUTOINSTALL', 'false')
os.environ.setdefault('YOLO_CONFIG_DIR', '/tmp/smartreview-yolo-config')
import cv2
import torch
import ultralytics
from ultralytics import YOLO


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--video', type=Path, required=True)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    assert args.video.is_file() and args.model.is_file()
    cap = cv2.VideoCapture(str(args.video))
    if not cap.isOpened():
        raise RuntimeError('Cannot open video')
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    expected, fps = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), cap.get(cv2.CAP_PROP_FPS)
    args.out.mkdir(exist_ok=False)
    for folder in ('images', 'labels'):
        (args.out / folder).mkdir()
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    model = YOLO(str(args.model.resolve()))
    source = {'kind':'model','name':'YOLO11n + ByteTrack prelabel','model':{'weights':args.model.name,'sha256':hashlib.sha256(args.model.read_bytes()).hexdigest(),'ultralytics':ultralytics.__version__,'device':'cpu','imgsz':640,'confidence_threshold':0.25,'tracker':'bytetrack.yaml'}}
    data={'schema_version':'1.0.0','dataset':{'id':args.out.name,'name':'Traffic Test — YOLO prelabel + ByteTrack','source':source,'metadata':{'prelabel_only':True,'human_reviewed':False,'video_sha256':hashlib.sha256(args.video.read_bytes()).hexdigest()}},'media':[{'id':'traffic','name':args.video.name,'type':'video','width':width,'height':height,'fps':fps,'frame_count':expected}],'frames':[],'annotations':[]}
    classes=collections.Counter()
    track_ids=set()
    untracked=0
    started=time.monotonic()
    mot=[]
    raw=[]
    frame_index=0
    try:
        while True:
            ok,frame=cap.read()
            if not ok: break
            result=model.track(frame,persist=True,tracker='bytetrack.yaml',conf=0.25,imgsz=640,device='cpu',verbose=False)[0]
            stem=f'frame_{frame_index:06d}'
            image_path=f'images/{stem}.jpg'
            if not cv2.imwrite(str(args.out/image_path),frame,[cv2.IMWRITE_JPEG_QUALITY,80]):
                raise RuntimeError('Image export failed')
            frame_id=f'traffic:{frame_index}'
            data['frames'].append({'id':frame_id,'media_id':'traffic','index':frame_index,'timestamp_ms':frame_index/fps*1000,'image':image_path})
            labels=[]
            objects=[]
            boxes=result.boxes
            if boxes is not None:
                for k,box in enumerate(boxes):
                    cls=int(box.cls[0]); confidence=float(box.conf[0]); name=model.names[cls]
                    x1,y1,x2,y2=map(float,box.xyxy[0].tolist())
                    bw,bh=x2-x1,y2-y1
                    if bw<=0 or bh<=0: raise RuntimeError('Model produced invalid box')
                    annotation={'id':f'f{frame_index}-a{k}','frame_id':frame_id,'label':name,'confidence':confidence,'geometry':{'type':'bbox','x':x1,'y':y1,'width':bw,'height':bh},'source':{'kind':'model','name':'YOLO11n + ByteTrack'}}
                    tid=int(box.id[0]) if box.id is not None else None
                    if tid is not None:
                        annotation['track_id']=str(tid)
                        annotation['object_id']=str(tid)
                        track_ids.add(tid)
                        mot.append(f'{frame_index+1},{tid},{x1:.4f},{y1:.4f},{bw:.4f},{bh:.4f},{confidence:.6f},-1,-1,-1')
                    else: untracked+=1
                    data['annotations'].append(annotation)
                    classes[name]+=1
                    labels.append(f'{cls} {(x1+x2)/2/width:.8f} {(y1+y2)/2/height:.8f} {bw/width:.8f} {bh/height:.8f}')
                    objects.append({'annotation_id':annotation['id'],'track_id':tid,'class_id':cls,'class_name':name,'confidence':confidence,'bbox_xyxy':[x1,y1,x2,y2]})
            (args.out/'labels'/f'{stem}.txt').write_text('\n'.join(labels)+ ('\n' if labels else ''))
            raw.append({'frame_id':frame_index,'objects':objects})
            frame_index+=1
            if frame_index%30==0:
                print(json.dumps({'frames':frame_index,'total':expected,'annotations':len(data['annotations']),'tracks':len(track_ids),'elapsed_seconds':round(time.monotonic()-started)}),flush=True)
    finally:
        cap.release()
    if frame_index!=expected: raise RuntimeError(f'Incomplete decoding: {frame_index}/{expected}')
    dump=lambda name,obj:(args.out/name).write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n')
    dump('dataset.json',data)
    dump('tracks.json',raw)
    (args.out/'tracks.mot.csv').write_text('\n'.join(mot)+'\n')
    (args.out/'classes.txt').write_text('\n'.join(model.names[i] for i in range(len(model.names)))+'\n')
    (args.out/'data.yaml').write_text('path: .\ntrain: images\nval: images\n# Same sequence: preview only, NOT an independent train/validation split.\nnames:\n'+''.join(f'  {i}: {json.dumps(name)}\n' for i,name in model.names.items()))
    summary={'video':str(args.video.resolve()),'model':source['model'],'frames':frame_index,'fps':fps,'width':width,'height':height,'annotations':len(data['annotations']),'unique_track_ids':len(track_ids),'untracked_detections':untracked,'classes':dict(classes),'image_bytes':sum(p.stat().st_size for p in (args.out/'images').iterdir()),'dataset_json_bytes':(args.out/'dataset.json').stat().st_size,'elapsed_seconds':round(time.monotonic()-started)}
    dump('summary.json',summary)
    (args.out/'README.md').write_text('''# Traffic Test — YOLO prelabel + ByteTrack

Nhãn tự động từ model local; chưa được con người kiểm duyệt. Track ID do ByteTrack sinh, có thể đổi ID hoặc mất track khi che khuất.

## Nhập SmartReview
Chọn SmartReview Schema 1.0.0 JSON, chọn dataset.json và tất cả ảnh trong images/. Các ảnh là frame của cùng một video; JSON giữ nguyên frame index, fps, confidence và track ID. Không chọn tracks.json làm canonical JSON. Không upload ZIP trực tiếp.

## Các định dạng
- images/: JPEG của mọi frame, tên đánh số từ 0; không đổi kích thước.
- labels/: YOLO detection TXT chuẩn: class_id center_x center_y width height, tọa độ chuẩn hóa 0–1. TXT không chứa track/confidence; thông tin này nằm trong dataset.json và tracks.json.
- classes.txt và data.yaml: ánh xạ lớp; train/val cùng images chỉ để xem thử, không phải split để đánh giá model.
- tracks.json: dữ liệu tracking theo frame, giữ class/confidence/track ID và bbox pixel.
- tracks.mot.csv: frame (bắt đầu 1), track_id, x, y, width, height, confidence, -1, -1, -1. Đây là prediction, không phải ground truth MOT.
- summary.json: số liệu và thông tin model/tham số thực chạy.

Không sửa annotation để tạo risk. Video gốc và kết quả tracking cũ giữ nguyên.
''')
    print(json.dumps(summary,ensure_ascii=False),flush=True)

if __name__=='__main__': main()
