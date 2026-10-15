"""Main benchmark chart, two panels on the same y scale (% of errors caught):
  left  - x = share of IMAGES reviewed (the plan's axis)
  right - x = share of reviewer HOURS spent
They tell different stories with YOLO11n, so neither is shown alone.

Colours follow the method, not the panel: the dataviz reference palette's first
three categorical slots (validated, light mode), random and oracle as grey
reference lines. Text stays in ink colours.
"""
import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402

SURFACE = '#fcfcfb'
INK, INK_2, INK_3 = '#0b0b0b', '#52514e', '#8a8984'
GRID = '#e7e6e2'
BUDGET = 0.2
# (label, colour, per-image scorer, per-hour scorer)
METHODS = [
    ('Risk model', '#2a78d6', 'risk_model', 'risk_model_per_hour'),
    ('Rule engine 2.2.0', '#1baf7a', 'engine_2.2.0', 'engine_2.2.0'),
    ('Chỉ confidence', '#eb6834', 'confidence_only', 'confidence_only'),
]
REFERENCES = [
    ('Trần (biết trước đáp án)', (0, (1, 2)), 'oracle', 'oracle_per_hour'),
    ('Ngẫu nhiên', (0, (5, 3)), 'random', 'random'),
]


def panel(ax, curves, scorers, metric, which, xlabel, subtitle):
    for label, style, by_image, by_hour in REFERENCES:
        c = curves[by_image if which == 0 else by_hour]
        ax.plot([x * 100 for x in c['x']], [y * 100 for y in c['y']], color=INK_3,
                linewidth=1.5, linestyle=style, label=label, zorder=2)
    for label, colour, by_image, by_hour in reversed(METHODS):
        c = curves[by_image if which == 0 else by_hour]
        ax.plot([x * 100 for x in c['x']], [y * 100 for y in c['y']], color=colour,
                linewidth=2.4 if label == 'Risk model' else 2, label=label, zorder=3,
                solid_capstyle='round')

    key = f'{int(BUDGET * 100)}%'
    points = [(scorers[m[2 + which]][metric][key] * 100, m[0], m[1]) for m in METHODS]
    points.append((scorers['random'][metric][key] * 100, 'Ngẫu nhiên', INK_3))
    oracle = scorers[REFERENCES[0][2 + which]][metric][key] * 100
    ax.axvline(BUDGET * 100, color=GRID, linewidth=1.5, zorder=1)
    for value, _, colour in points:
        ax.plot(BUDGET * 100, value, 'o', markersize=8, color=colour,
                markeredgecolor=SURFACE, markeredgewidth=2, zorder=4)
    groups = []                      # merge methods that land on the same value
    for value, label, _ in sorted(points, reverse=True):
        if groups and groups[-1][0] - value < 2.5:
            groups[-1][1].append(label)
        else:
            groups.append([value, [label]])
    for value, labels in groups:
        ax.annotate(f'{value:.0f}%  ' + ' · '.join(labels), (BUDGET * 100, value),
                    xytext=(12, 0), textcoords='offset points', ha='left', va='center',
                    color=INK, fontsize=9.5, zorder=5,
                    fontweight='bold' if 'Risk model' in labels else 'normal',
                    bbox=dict(boxstyle='round,pad=0.25', fc=SURFACE, ec='none'))
    ax.annotate(f'trần {oracle:.0f}%', (BUDGET * 100, oracle), xytext=(-10, 6),
                textcoords='offset points', ha='right', color=INK_2, fontsize=9)

    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.set_xlabel(xlabel, color=INK_2)
    ax.set_title(subtitle, loc='left', color=INK, fontsize=12, fontweight='bold', pad=10)
    ax.grid(axis='y', color=GRID, linewidth=1)
    ax.tick_params(colors=INK_2, length=0)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.spines['bottom'].set_visible(True)
    ax.spines['bottom'].set_color(INK_3)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    report = json.loads((args.work / 'benchmark.json').read_text(encoding='utf-8'))
    scorers = report['scorers']

    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 11})
    fig, (left, right) = plt.subplots(1, 2, figsize=(14, 6.4), dpi=160, sharey=True)
    fig.patch.set_facecolor(SURFACE)
    for ax in (left, right):
        ax.set_facecolor(SURFACE)
    panel(left, report['curves'], scorers, 'error_recall_at', 0,
          '% ảnh đưa cho người review', 'Theo số ảnh: xếp hạng bắt lỗi nhanh hơn')
    panel(right, report['curves_hours'], scorers, 'error_recall_at_hours', 1,
          '% giờ công review', 'Theo giờ công: trần chỉ nhỉnh hơn ngẫu nhiên')
    left.set_ylabel('% lỗi được bắt', color=INK_2)
    left.legend(loc='upper left', frameon=False, labelcolor=INK, fontsize=9.5)

    fig.text(0.055, 0.95, 'Xếp hạng theo rủi ro hoạt động — nhưng với YOLO11n, '
             'gần như ảnh nào cũng phải sửa', color=INK, fontsize=15, fontweight='bold')
    fig.text(0.055, 0.905,
             f"BDD100K val · {report['test_images']} ảnh test held-out · {report['test_errors']} lỗi · "
             f"97% ảnh có ít nhất 1 lỗi, nên thời gian review chủ yếu là sửa lỗi chứ không phải tìm lỗi",
             color=INK_2, fontsize=10.5)
    fig.subplots_adjust(left=0.055, right=0.98, top=0.83, bottom=0.1, wspace=0.08)
    fig.savefig(args.out, facecolor=SURFACE)
    print(f'saved {args.out}')


if __name__ == '__main__':
    main()
