"""Turn label_error_benchmark.py (`# %%` cells) into a Kaggle-ready .ipynb.

The .py is the source of truth: it runs locally as a plain script, so it is tested
before every build. Usage: python build_notebook.py
"""
import json
from pathlib import Path

HERE = Path(__file__).parent
SOURCE = HERE / 'label_error_benchmark.py'
TARGET = HERE / 'label_error_benchmark.ipynb'


def cells(text):
    blocks, current, kind = [], [], None
    for line in text.splitlines():
        if line.startswith('# %%'):
            if kind:
                blocks.append((kind, current))
            kind, current = ('markdown' if '[markdown]' in line else 'code'), []
        else:
            current.append(line)
    blocks.append((kind, current))
    out = []
    for kind, lines in blocks:
        while lines and not lines[-1].strip():
            lines.pop()
        while lines and not lines[0].strip():
            lines.pop(0)
        if kind == 'markdown':
            lines = [line[2:] if line.startswith('# ') else line.lstrip('#') for line in lines]
        source = [line + '\n' for line in lines]
        if source:
            source[-1] = source[-1].rstrip('\n')
        cell = {'cell_type': kind, 'metadata': {}, 'source': source}
        if kind == 'code':
            cell.update(execution_count=None, outputs=[])
        out.append(cell)
    return out


notebook = {
    'cells': cells(SOURCE.read_text(encoding='utf-8')),
    'metadata': {
        'kernelspec': {'display_name': 'Python 3', 'language': 'python', 'name': 'python3'},
        'language_info': {'name': 'python'},
        'kaggle': {'accelerator': 'gpu', 'isInternetEnabled': True},
    },
    'nbformat': 4, 'nbformat_minor': 5,
}
TARGET.write_text(json.dumps(notebook, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'{TARGET.name}: {len(notebook["cells"])} cells')
