"""CVAT 2.74.x settings for the SmartReview HTTPS proxy.
Mounted as /opt/cvat/cvat/settings/smartreview.py by docker-compose.cvat-domain.yml.
"""
from .production import *  # noqa: F401,F403
import os as _os
from urllib.parse import urlsplit as _urlsplit

_public = _os.environ.get('CVAT_BASE_URL', 'https://cvat.mixi-t028.cloud').rstrip('/')
_origins = _os.environ.get('SMARTREVIEW_CVAT_TRUSTED_ORIGINS', _public)
CSRF_TRUSTED_ORIGINS = list(globals().get('CSRF_TRUSTED_ORIGINS', []))
for _value in _origins.split(','):
    _value = _value.strip().rstrip('/')
    if not _value:
        continue
    _url = _urlsplit(_value)
    if (_url.scheme not in ('http', 'https') or not _url.netloc or _url.path
            or _url.query or _url.fragment or _url.username or '*' in _url.netloc):
        raise ValueError('SMARTREVIEW_CVAT_TRUSTED_ORIGINS must contain exact HTTP(S) origins')
    if _value not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(_value)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True
