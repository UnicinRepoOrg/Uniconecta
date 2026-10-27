"""Subsegmentos do X-Ray sem o SDK (o runtime da Lambda não traz o aws-xray-sdk).

A AWS já abre o segmento de cada invocação (tracing ativo). Este módulo registra as
chamadas que a função faz -- DynamoDB, SSM e HTTP -- e as envia ao X-Ray com
PutTraceSegments no fim da invocação, como subsegmentos do segmento da função.

Uso (o import precisa vir antes de qualquer boto3.client/resource):

    import boto3
    import xray_lite
    ...
    with xray_lite.urlopen(req, timeout=10) as response: ...
    ...
    @xray_lite.traced
    def lambda_handler(event, context): ...

Cada chamada ao DynamoDB leva o nome da tabela, que é o que liga a linha do trace à
caixa da tabela no diagrama. Só envia quando a invocação foi amostrada (Sampled=1).
Falha ao enviar só é logada: nunca muda a resposta da função.
"""
import functools
import json
import logging
import os
import random
import time
import urllib.error
import urllib.parse
import urllib.request

import boto3

logger = logging.getLogger(__name__)

_CONTEXT_KEY = 'xray_lite'
_SKIPPED_SERVICES = ('xray',)  # o próprio envio não vira subsegmento
_BATCH = 50  # limite de documentos por PutTraceSegments

_pending = []
_xray_client = None


def _new_id():
    return '%016x' % random.getrandbits(64)


def _trace_header():
    """Root, Parent e Sampled de _X_AMZN_TRACE_ID, que a Lambda renova a cada invocação."""
    parts = {}
    for item in os.environ.get('_X_AMZN_TRACE_ID', '').split(';'):
        if '=' in item:
            key, value = item.split('=', 1)
            parts[key.strip()] = value.strip()
    return parts.get('Root'), parts.get('Parent'), parts.get('Sampled') == '1'


def _record(name, start, end, namespace='aws', aws=None, http=None, status=None, failed=False):
    doc = {
        'type': 'subsegment',
        'id': _new_id(),
        'name': str(name)[:200],
        'start_time': start,
        'end_time': end,
        'namespace': namespace,
    }
    if aws:
        doc['aws'] = aws
    if http or status:
        doc['http'] = dict(http or {})
        if status:
            doc['http']['response'] = {'status': status}
    if failed or (status and status >= 500):
        doc['fault'] = True
    elif status and status >= 400:
        doc['error'] = True
    _pending.append(doc)


# --- Chamadas à AWS (botocore) ---------------------------------------------------

def _before_call(params, model, context, **kwargs):
    service = model.service_model.endpoint_prefix
    if service in _SKIPPED_SERVICES:
        return
    resource = params.get('TableName') or params.get('Name')
    context[_CONTEXT_KEY] = {'start': time.time(), 'service': service,
                             'operation': model.name, 'resource': resource}


def _finish(context, status=None, failed=False):
    call = context.pop(_CONTEXT_KEY, None) if context is not None else None
    if not call:
        return
    aws = {'operation': call['operation']}
    if call['service'] == 'dynamodb':
        name = call['resource'] or 'DynamoDB'
        if call['resource']:
            aws['table_name'] = call['resource']
    else:
        name = call['resource'] or call['service'].upper()
    _record(name, call['start'], time.time(), aws=aws, status=status, failed=failed)


def _after_call(http_response, parsed, model, context, **kwargs):
    _finish(context, status=getattr(http_response, 'status_code', None))


def _after_call_error(context, exception, **kwargs):
    _finish(context, failed=True)


def _install():
    if boto3.DEFAULT_SESSION is None:
        boto3.setup_default_session()
    events = boto3.DEFAULT_SESSION.events
    events.register('before-parameter-build', _before_call, unique_id='xray_lite_before')
    events.register('after-call', _after_call, unique_id='xray_lite_after')
    events.register('after-call-error', _after_call_error, unique_id='xray_lite_error')


_install()


# --- Chamadas HTTP ------------------------------------------------------------------

def urlopen(req, timeout=None):
    """urllib.request.urlopen que registra a chamada. Grava host e caminho, nunca a query."""
    url = req.full_url if isinstance(req, urllib.request.Request) else str(req)
    parts = urllib.parse.urlsplit(url)
    method = req.get_method() if isinstance(req, urllib.request.Request) else 'GET'
    http = {'request': {'method': method, 'url': f"{parts.scheme}://{parts.netloc}{parts.path}"}}
    start = time.time()
    try:
        response = urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        _record(parts.hostname, start, time.time(), namespace='remote', http=http, status=e.code)
        raise
    except Exception:
        _record(parts.hostname, start, time.time(), namespace='remote', http=http, failed=True)
        raise
    _record(parts.hostname, start, time.time(), namespace='remote', http=http, status=response.status)
    return response


# --- Envio no fim da invocação ----------------------------------------------------------

def flush():
    docs = list(_pending)
    del _pending[:]
    root, parent, sampled = _trace_header()
    if not (docs and root and parent and sampled):
        return
    for doc in docs:
        doc['trace_id'] = root
        doc['parent_id'] = parent
    global _xray_client
    try:
        if _xray_client is None:
            _xray_client = boto3.client('xray')
        for i in range(0, len(docs), _BATCH):
            result = _xray_client.put_trace_segments(
                TraceSegmentDocuments=[json.dumps(d) for d in docs[i:i + _BATCH]])
            if result.get('UnprocessedTraceSegments'):
                logger.warning(f"X-Ray recusou subsegmentos: {result['UnprocessedTraceSegments']}")
    except Exception as e:
        logger.warning(f"Falha ao enviar subsegmentos ao X-Ray: {e}")


def traced(handler):
    """Envia os subsegmentos da invocação antes de a função devolver a resposta."""
    @functools.wraps(handler)
    def wrapper(event, context):
        try:
            return handler(event, context)
        finally:
            flush()
    return wrapper
